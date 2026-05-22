import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
} from "ai";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { createClient } from "redis";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import throttle from "throttleit";
import {
  type AppModelDefinition,
  type AppModelId,
  getAppModelDefinition,
} from "@/lib/ai/app-models";
import { determineExplicitlyRequestedTools } from "@/lib/ai/determine-explicitly-requested-tools";
import { ChatSDKError } from "@/lib/ai/errors";
import { calculateMessagesTokens } from "@/lib/ai/token-utils";
import { allTools } from "@/lib/ai/tools/tools-definitions";
import type { ChatMessage, ToolName } from "@/lib/ai/types";
import {
  EVENT_CHAT_STARTED,
  EVENT_CREDITS_EXHAUSTED,
  EVENT_MESSAGE_SENT,
  EVENT_TOOL_USED,
} from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/posthog";
import {
  getAnonymousSession,
  setAnonymousSession,
} from "@/lib/anonymous-session-server";
import { getSafeSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { createAnonymousSession } from "@/lib/create-anonymous-session";
import { CostAccumulator } from "@/lib/credits/cost-accumulator";
import { db as tierDb } from "@/lib/db/client";
import { canSpend, deductCredits } from "@/lib/db/credits";
import { getMcpConnectorsByUserId } from "@/lib/db/mcp-queries";
import {
  getChatById,
  getMessageById,
  getMessageCanceledAt,
  getUserById,
  saveChat,
  saveMessage,
  updateMessage,
  updateMessageActiveStreamId,
  upsertUserFromSession,
} from "@/lib/db/queries";
import type { McpConnector } from "@/lib/db/schema";
import { organization, organizationMember } from "@/lib/db/schema";
import { deductOrgCredits, recordUsageEvent } from "@/lib/db/usage";
import { env } from "@/lib/env";
import type { FeatureFlag } from "@/lib/feature-flags";
import { getServerFeatureFlag } from "@/lib/feature-flags";
import {
  type CanonicalConsumeState,
  canonicalToVercelAiSdkSse,
  makeConsumeState,
} from "@/lib/life-runtime/edge-adapter/canonical-to-vercel-ai-sse";
import {
  dispatchViaLifegw,
  getLifegwBaseUrl,
  type SessionClientFactory,
} from "@/lib/life-runtime/edge-adapter/dispatch-via-lifegw";
import {
  getFrameDeadlineMs,
  wrapWithFrameDeadline,
} from "@/lib/life-runtime/edge-adapter/wrap-with-frame-deadline";
import { MAX_INPUT_TOKENS } from "@/lib/limits/tokens";
import { createModuleLogger } from "@/lib/logger";
import {
  canSpendCredits,
  getUpgradeMessage,
  isModelAllowed,
} from "@/lib/tier-access";
import type { AnonymousSession } from "@/lib/types/anonymous";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";
import { generateUUID } from "@/lib/utils";
import {
  checkAnonymousRateLimit,
  checkAuthenticatedRateLimit,
  getClientIP,
} from "@/lib/utils/rate-limit";
import { generateTitleFromUserMessage } from "../../actions";
import { getThreadUpToMessageId } from "./get-thread-up-to-message-id";

// Shared Redis clients for resumable stream
let redisPublisher: ReturnType<typeof createClient> | null = null;
let redisSubscriber: ReturnType<typeof createClient> | null = null;
let redisConnectPromise: Promise<void> | null = null;

async function ensureRedisClients() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (redisPublisher && redisSubscriber) {
    if (redisConnectPromise) {
      await redisConnectPromise;
    }
    return { publisher: redisPublisher, subscriber: redisSubscriber };
  }

  redisPublisher = createClient({ url: env.REDIS_URL });
  redisSubscriber = createClient({ url: env.REDIS_URL });

  redisConnectPromise = Promise.all([
    redisPublisher.connect(),
    redisSubscriber.connect(),
  ]).then(() => undefined);

  try {
    await redisConnectPromise;
    return { publisher: redisPublisher, subscriber: redisSubscriber };
  } catch (error) {
    redisPublisher = null;
    redisSubscriber = null;
    redisConnectPromise = null;
    console.warn(
      "Redis unavailable, continuing without resumable streams.",
      error,
    );
    return null;
  }
}

let globalStreamContext: ResumableStreamContext | null = null;

export async function getStreamContext(): Promise<ResumableStreamContext | null> {
  if (globalStreamContext) {
    return globalStreamContext;
  }

  const clients = await ensureRedisClients();
  if (!clients) {
    return null;
  }

  globalStreamContext = createResumableStreamContext({
    waitUntil: after,
    keyPrefix: `${config.appPrefix}:resumable-stream`,
    publisher: clients.publisher,
    subscriber: clients.subscriber,
  });

  return globalStreamContext;
}

// ── Test seam — lifegw client factory override ───────────────────────────
// Production code leaves this undefined and the dispatcher constructs a
// real `LifedWsAgentSessionClient`. Tests use `__setSessionClientFactoryForTests`
// to inject a mock so the route can run without an actual gateway.
let testLifegwClientFactory: SessionClientFactory | undefined;

export function __setSessionClientFactoryForTests(
  factory: SessionClientFactory | undefined,
): void {
  testLifegwClientFactory = factory;
}

type AnonymousSessionResult =
  | { success: true; session: AnonymousSession }
  | { success: false; error: Response };

async function handleAnonymousSession({
  request,
  redis,
  selectedModelId,
}: {
  request: NextRequest;
  redis: ReturnType<typeof import("redis").createClient> | null;
  selectedModelId: AppModelId;
}): Promise<AnonymousSessionResult> {
  const log = createModuleLogger("api:chat:anonymous");

  const clientIP = getClientIP(request);
  const rateLimitResult = await checkAnonymousRateLimit(clientIP, redis);

  if (!rateLimitResult.success) {
    log.warn({ clientIP }, "Rate limit exceeded");
    return {
      success: false,
      error: Response.json(
        { error: rateLimitResult.error, type: "RATE_LIMIT_EXCEEDED" },
        { status: 429, headers: rateLimitResult.headers || {} },
      ),
    };
  }

  const session =
    (await getAnonymousSession()) ?? (await createAnonymousSession());

  if (session.remainingCredits <= 0) {
    log.info("Anonymous credit limit reached");
    return {
      success: false,
      error: Response.json(
        {
          error: "You've used your free credits. Sign up to continue chatting!",
          type: "ANONYMOUS_LIMIT_EXCEEDED",
          suggestion:
            "Create an account to get more credits and access to more AI models",
        },
        { status: 402, headers: rateLimitResult.headers || {} },
      ),
    };
  }

  if (
    !(ANONYMOUS_LIMITS.AVAILABLE_MODELS as readonly AppModelId[]).includes(
      selectedModelId,
    )
  ) {
    log.warn("Model not available for anonymous users");
    return {
      success: false,
      error: Response.json(
        {
          error: "Model not available for anonymous users",
          availableModels: ANONYMOUS_LIMITS.AVAILABLE_MODELS,
        },
        { status: 403, headers: rateLimitResult.headers || {} },
      ),
    };
  }

  return { success: true, session };
}

async function handleChatValidation({
  chatId,
  userId,
  userMessage,
  projectId,
}: {
  chatId: string;
  userId: string;
  userMessage: ChatMessage;
  projectId?: string;
}): Promise<{ error: Response | null; isNewChat: boolean }> {
  const log = createModuleLogger("api:chat:validation");

  const chat = await getChatById({ id: chatId });
  let isNewChat = false;

  if (chat) {
    if (chat.userId !== userId) {
      log.warn("Unauthorized - chat ownership mismatch");
      return {
        error: new Response("Unauthorized", { status: 401 }),
        isNewChat,
      };
    }
  } else {
    isNewChat = true;
    const title = await generateTitleFromUserMessage({
      message: userMessage,
    });

    await saveChat({ id: chatId, userId, title, projectId });
  }

  const [existentMessage] = await getMessageById({ id: userMessage.id });

  if (existentMessage && existentMessage.chatId !== chatId) {
    log.warn("Unauthorized - message chatId mismatch");
    return { error: new Response("Unauthorized", { status: 401 }), isNewChat };
  }

  if (!existentMessage) {
    // If the message does not exist, save it
    await saveMessage({
      id: userMessage.id,
      chatId,
      message: userMessage,
    });
  }

  return { error: null, isNewChat };
}

async function checkUserCanSpend(userId: string): Promise<Response | null> {
  const userCanSpend = await canSpend(userId);
  if (!userCanSpend) {
    return new Response("Insufficient credits", { status: 402 });
  }
  return null;
}

async function handleUserValidationAndCredits({
  chatId,
  userId,
  userMessage,
  projectId,
}: {
  chatId: string;
  userId: string;
  userMessage: ChatMessage;
  projectId?: string;
}): Promise<{ error: Response } | { isNewChat: boolean }> {
  const validationResult = await handleChatValidation({
    chatId,
    userId,
    userMessage,
    projectId,
  });
  if (validationResult.error) {
    return { error: validationResult.error };
  }

  const creditError = await checkUserCanSpend(userId);
  if (creditError) {
    return { error: creditError };
  }

  return { isNewChat: validationResult.isNewChat };
}

// ── Feature-flag tool gating (BRO-393) ───────────────────────────────────────

/**
 * Mapping from feature flag to the tool names it gates.
 * When a flag is disabled, all listed tools are excluded.
 */
const FLAG_GATED_TOOLS: Partial<Record<FeatureFlag, ToolName[]>> = {
  deep_research: ["deepResearch"],
  sandbox: ["codeExecution"],
  image_generation: ["generateImage"],
  web_search: ["webSearch"],
  url_retrieval: ["retrieveUrl"],
  knowledge_graph: [
    "searchKnowledge",
    "readKnowledgeNote",
    "traverseKnowledge",
  ],
};

/** The feature flags that gate premium chat tools. */
const TOOL_GATING_FLAGS = Object.keys(FLAG_GATED_TOOLS) as FeatureFlag[];

/**
 * Evaluate feature flags and return the set of tool names that should be
 * excluded because their flag is disabled for this user/org.
 */
async function getGatedToolNames(
  userId: string,
  orgId?: string | null,
): Promise<Set<ToolName>> {
  const groups = orgId ? { organization: orgId } : undefined;
  const disabled = new Set<ToolName>();

  const results = await Promise.all(
    TOOL_GATING_FLAGS.map(async (flag) => ({
      flag,
      enabled: await getServerFeatureFlag(flag, userId, groups),
    })),
  );

  for (const { flag, enabled } of results) {
    if (!enabled) {
      for (const tool of FLAG_GATED_TOOLS[flag] ?? []) {
        disabled.add(tool);
      }
    }
  }

  return disabled;
}

/**
 * Returns a user-facing upgrade message when a gated tool is explicitly
 * requested but the feature flag is disabled.
 */
function getToolGateUpgradeMessage(toolName: ToolName): string {
  const messages: Partial<Record<ToolName, string>> = {
    deepResearch:
      "Deep research requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    codeExecution:
      "Code execution (sandbox) requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    generateImage:
      "Image generation requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    webSearch:
      "Web search requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    retrieveUrl:
      "URL retrieval requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    searchKnowledge:
      "Knowledge graph search requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    readKnowledgeNote:
      "Knowledge graph access requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
    traverseKnowledge:
      "Knowledge graph traversal requires a Pro plan or higher. Upgrade at /pricing to unlock this feature.",
  };
  return (
    messages[toolName] ??
    "This feature requires a plan upgrade. Visit /pricing for details."
  );
}

/**
 * Determines which built-in tools are allowed based on model capabilities
 * and feature flags.
 *
 * NOTE: lifegw owns server-side tool dispatch — the in-app route no
 * longer constructs `getTools()` / `streamText`. The allow-list returned
 * here is still useful for the explicit-request gate (the user clicking
 * the "deepResearch" button, etc.) so we can return a 403 *before* the
 * call hits lifegw rather than relying on lifegw's policy denial.
 */
function determineAllowedTools({
  isAnonymous,
  modelDefinition,
  explicitlyRequestedTools,
  gatedTools,
}: {
  isAnonymous: boolean;
  modelDefinition: AppModelDefinition;
  explicitlyRequestedTools: ToolName[] | null;
  gatedTools?: Set<ToolName>;
}): ToolName[] {
  // Start with all tools or anonymous-limited tools
  let allowedTools: ToolName[] = isAnonymous
    ? [...ANONYMOUS_LIMITS.AVAILABLE_TOOLS]
    : [...allTools];

  // Disable all tools for models with unspecified features
  if (!modelDefinition?.input) {
    return [];
  }

  // Remove tools disabled by feature flags (BRO-393)
  if (gatedTools && gatedTools.size > 0) {
    allowedTools = allowedTools.filter((tool) => !gatedTools.has(tool));
  }

  // If specific tools were requested, filter them against allowed tools
  if (explicitlyRequestedTools && explicitlyRequestedTools.length > 0) {
    return explicitlyRequestedTools.filter((tool) =>
      allowedTools.includes(tool),
    );
  }

  return allowedTools;
}

async function finalizeMessageAndCredits({
  assistantMessage,
  userId,
  organizationId,
  isAnonymous,
  chatId,
  costAccumulator,
}: {
  assistantMessage: ChatMessage | undefined;
  userId: string | null;
  organizationId: string | null;
  isAnonymous: boolean;
  chatId: string;
  costAccumulator: CostAccumulator;
}): Promise<void> {
  const log = createModuleLogger("api:chat:finalize");

  try {
    if (!assistantMessage) {
      throw new Error("No assistant message found!");
    }

    if (!isAnonymous) {
      await updateMessage({
        id: assistantMessage.id,
        chatId,
        message: {
          ...assistantMessage,
          metadata: {
            ...assistantMessage.metadata,
            activeStreamId: null,
          },
        },
      });
    }

    // Get total cost from accumulator (includes all LLM calls + external API costs)
    const totalCost = await costAccumulator.getTotalCost();
    const entries = costAccumulator.getEntries();

    log.info({ entries }, "Cost accumulator entries");
    log.info({ totalCost }, "Cost accumulator total cost");

    // Capture tool_used if assistant message contains tool-* parts (AI SDK v6 naming)
    if (userId && !isAnonymous) {
      const toolParts = (assistantMessage.parts ?? []).filter(
        (p) => typeof p.type === "string" && p.type.startsWith("tool-"),
      );
      if (toolParts.length > 0) {
        captureServerEvent(userId, EVENT_TOOL_USED, {
          chatId,
          toolCount: toolParts.length,
          tools: toolParts.map((p) => p.type.slice("tool-".length)),
        });
      }
    }

    // Deduct credits for authenticated users
    if (userId && !isAnonymous) {
      await deductCredits(userId, totalCost);

      // Deduct org-level credits (atomic — skips if org has insufficient balance)
      if (organizationId) {
        deductOrgCredits(organizationId, totalCost).catch((err) => {
          log.error({ error: err }, "Failed to deduct org credits");
        });
      }

      // Record usage event (fire-and-forget, non-blocking)
      const tokenBreakdown = costAccumulator.getTokenBreakdown();
      recordUsageEvent({
        organizationId: organizationId ?? undefined,
        userId,
        type: "ai_tokens",
        resource: tokenBreakdown.modelId ?? undefined,
        inputTokens: tokenBreakdown.inputTokens,
        outputTokens: tokenBreakdown.outputTokens,
        costCents: totalCost,
        chatId,
      }).catch((err) => {
        log.error({ error: err }, "Failed to record usage event");
      });
    }

    // Note: Anonymous credits are pre-deducted before streaming starts (cookies can't be set after response begins)
  } catch (error) {
    log.error({ error }, "Failed to save chat or finalize credits");
  }
}

type SessionSetupResult =
  | { success: false; error: Response }
  | {
      success: true;
      userId: string | null;
      userName: string | null;
      isAnonymous: boolean;
      anonymousSession: AnonymousSession | null;
      modelDefinition: AppModelDefinition;
    };

async function validateAndSetupSession({
  request,
  selectedModelId,
}: {
  request: NextRequest;
  selectedModelId: AppModelId;
}): Promise<SessionSetupResult> {
  const log = createModuleLogger("api:chat:setup");

  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const userId = session?.user?.id ?? null;
  const isAnonymous = userId === null;

  let anonymousSession: AnonymousSession | null = null;

  if (userId) {
    await upsertUserFromSession({ sessionUser: session.user });
    const user = await getUserById({ userId });
    if (!user) {
      log.warn("User not found");
      return {
        success: false,
        error: new Response("User not found", { status: 404 }),
      };
    }
  } else {
    const result = await handleAnonymousSession({
      request,
      redis: redisPublisher,
      selectedModelId,
    });

    if (!result.success) {
      return result;
    }
    anonymousSession = result.session;
  }

  let modelDefinition: AppModelDefinition;
  try {
    modelDefinition = await getAppModelDefinition(selectedModelId);
  } catch {
    log.warn("Model not found");
    return {
      success: false,
      error: new Response("Model not found", { status: 404 }),
    };
  }

  return {
    success: true,
    userId,
    userName: session?.user?.name ?? null,
    isAnonymous,
    anonymousSession,
    modelDefinition,
  };
}

async function prepareRequestContext({
  userMessage,
  chatId,
  isAnonymous,
  anonymousPreviousMessages,
  modelDefinition,
  explicitlyRequestedTools,
  gatedTools,
}: {
  userMessage: ChatMessage;
  chatId: string;
  isAnonymous: boolean;
  anonymousPreviousMessages: ChatMessage[];
  modelDefinition: AppModelDefinition;
  explicitlyRequestedTools: ToolName[] | null;
  gatedTools?: Set<ToolName>;
}): Promise<{
  previousMessages: ChatMessage[];
  allowedTools: ToolName[];
  error: Response | null;
}> {
  const log = createModuleLogger("api:chat:prepare");

  const allowedTools = determineAllowedTools({
    isAnonymous,
    modelDefinition,
    explicitlyRequestedTools,
    gatedTools,
  });

  // Validate input token limit (50k tokens for user message)
  const totalTokens = calculateMessagesTokens(
    await convertToModelMessages([userMessage]),
  );

  if (totalTokens > MAX_INPUT_TOKENS) {
    log.warn({ totalTokens, MAX_INPUT_TOKENS }, "Token limit exceeded");
    const error = new ChatSDKError(
      "input_too_long:chat",
      `Message too long: ${totalTokens} tokens (max: ${MAX_INPUT_TOKENS})`,
    );
    return {
      previousMessages: [],
      allowedTools: [],
      error: error.toResponse(),
    };
  }

  const messageThreadToParent = isAnonymous
    ? anonymousPreviousMessages
    : await getThreadUpToMessageId(
        chatId,
        userMessage.metadata.parentMessageId,
      );

  const previousMessages = messageThreadToParent.slice(-5);
  log.debug({ allowedTools }, "allowed tools");

  return { previousMessages, allowedTools, error: null };
}

/**
 * Extract plain user-text from a `ChatMessage`. The Vercel-AI-SDK v6
 * `parts[]` shape may carry text + file + tool parts; lifegw expects a
 * single user-message string so we concatenate every `text` part. File
 * parts (images/PDFs/etc.) aren't handled in this PR — adding
 * attachment forwarding is a follow-up once lifegw supports the
 * `attachment_blob_ref` frame field.
 */
function extractUserMessageText(message: ChatMessage): string {
  const parts = message.parts ?? [];
  const textParts: string[] = [];
  for (const part of parts) {
    if (typeof part.type === "string" && part.type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) {
        textParts.push(text);
      }
    }
  }
  return textParts.join("\n\n");
}

/**
 * Build the lifegw-routed response stream. Wraps the canonical iterator
 * from `dispatchViaLifegw` in a `createUIMessageStream` so we can:
 *
 *   - Emit the existing `data-chatConfirmed` chunk on the first turn of
 *     a new chat (chat-sync.tsx's UI reads this).
 *   - Translate canonical agent events into Vercel-AI-SDK chunks.
 *   - Capture the assistant message body + tool calls so the route's
 *     persistence layer can write the finalised message to the DB
 *     (replacing the placeholder created before streaming).
 *   - Attach message metadata (createdAt, parentMessageId, model,
 *     activeStreamId, usage) the same way the streamText path did.
 *
 * Returns an `AsyncIterableStream` of `UIMessageChunk` (same shape as
 * `createUIMessageStream`), ready to be piped through
 * `JsonToSseTransformStream`.
 */
async function createLifegwBackedChatStream({
  messageId,
  chatId,
  userMessage,
  selectedModelId,
  userId,
  anonymousSessionId,
  organizationId,
  abortController,
  isAnonymous,
  isNewChat,
  timeoutId,
  streamId,
  onChunk,
}: {
  messageId: string;
  chatId: string;
  userMessage: ChatMessage;
  selectedModelId: AppModelId;
  userId: string | null;
  /** Anonymous-session id — populated when `userId` is null. Used as the
   *  `anon:<id>` subject on the Tier-0 cap so all turns in a guest
   *  session share one consumer identity. */
  anonymousSessionId: string | null;
  organizationId: string | null;
  abortController: AbortController;
  isAnonymous: boolean;
  isNewChat: boolean;
  timeoutId: NodeJS.Timeout;
  streamId: string;
  onChunk?: () => void;
}) {
  const log = createModuleLogger("api:chat:stream");
  const costAccumulator = new CostAccumulator();
  const consumeState = makeConsumeState();

  const initialMetadata: ChatMessage["metadata"] = {
    createdAt: new Date(),
    parentMessageId: userMessage.id,
    selectedModel: selectedModelId,
    activeStreamId: isAnonymous ? null : streamId,
  };

  // chatId IS the sticky session id for the in-app surface — per-chat
  // continuity is the semantics we want (one chat = one lifed session).
  const stickySid = chatId;

  // Anonymous callers mint a Tier-0 cap (`tier: "anon"`); authenticated
  // users mint Tier-1. Both flow through the same dispatcher. We fall
  // back to `chatId` if the anon session id is missing — that should
  // never happen in production (`handleAnonymousSession` always
  // produces one) but it keeps the call total before any I/O.
  const consumer = userId
    ? { kind: "user" as const, id: userId }
    : { kind: "anon" as const, id: anonymousSessionId ?? chatId };

  const userMessageText = extractUserMessageText(userMessage);

  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer: dataStream }) => {
      // Confirm chat persistence on first message (chat + user message
      // are persisted before streaming begins — this just signals the
      // UI to update its sidebar)
      if (isNewChat) {
        dataStream.write({
          id: generateUUID(),
          type: "data-chatConfirmed",
          data: { chatId },
          transient: true,
        });
      }

      // Open the lifegw dispatch. createSession failures surface here
      // as a thrown error → caught by `createUIMessageStream`'s onError.
      let dispatch: Awaited<ReturnType<typeof dispatchViaLifegw>>;
      try {
        dispatch = await dispatchViaLifegw({
          stickySid,
          userMessage: userMessageText,
          consumer,
          signal: abortController.signal,
          clientFactory: testLifegwClientFactory,
        });
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "dispatchViaLifegw failed",
        );
        // Surface as a UIMessageChunk error so chat-sync.tsx renders
        // an inline error rather than a stream-disconnect.
        dataStream.write({
          type: "error",
          errorText: `lifegw dispatch failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        return;
      }

      // Wrap the canonical iterator with a wakeup-on-progress filter
      // that fires the cancel-check throttler on each frame the way
      // the streamText path did via the `onChunk` callback.
      const wrappedEvents = onChunk
        ? wrapWithProgress(dispatch.events, onChunk)
        : dispatch.events;

      // Per-frame deadline (BRO-1234). If lifegw goes silent the
      // wrapper synthesises an `error` + `finish` canonical event
      // pair so the user sees a structured failure within
      // `frameDeadlineMs` instead of a silent 504 at Vercel's 290s
      // function timeout. The translator turns the synthetic `error`
      // into a UIMessageChunk error that chat-sync.tsx renders inline.
      const frameDeadlineMs = getFrameDeadlineMs();
      const eventsWithDeadline =
        frameDeadlineMs !== null
          ? wrapWithFrameDeadline(wrappedEvents, frameDeadlineMs, log)
          : wrappedEvents;

      // Run the translator and merge its chunks into the writer.
      for await (const chunk of canonicalToVercelAiSdkSse<ChatMessage>(
        eventsWithDeadline,
        {
          fallbackTextId: messageId,
          state: consumeState,
        },
      )) {
        dataStream.write(chunk);
      }

      // After lifegw finishes, account the reported usage. The token
      // counts come from lifegw's terminal `finish` event; cost-cents
      // is optional (lifegw may pre-bill, leaving zero left to add).
      if (consumeState.usage) {
        costAccumulator.addLLMCost(
          selectedModelId,
          {
            inputTokens: consumeState.usage.inputTokens ?? 0,
            outputTokens: consumeState.usage.outputTokens ?? 0,
          },
          "main-chat",
        );
      }
    },
    generateId: () => messageId,
    onFinish: async ({ responseMessage }) => {
      clearTimeout(timeoutId);
      // Stamp the response message's metadata with everything we know
      // post-stream — usage, activeStreamId clear, parent + model.
      const assistantMessage = stitchAssistantMessage({
        responseMessage,
        consumeState,
        initialMetadata,
      });
      await finalizeMessageAndCredits({
        assistantMessage,
        userId,
        organizationId,
        isAnonymous,
        chatId,
        costAccumulator,
      });
    },
    onError: (error) => {
      clearTimeout(timeoutId);
      // If the stream fails, ensure the placeholder assistant message
      // is no longer marked resumable. Otherwise the client will try
      // to resume a stream that no longer exists and we end up with a
      // stuck partial placeholder on reload.
      if (!isAnonymous) {
        after(() =>
          Promise.resolve(
            updateMessageActiveStreamId({
              id: messageId,
              activeStreamId: null,
            }),
          ).catch((dbError) => {
            log.error(
              { error: dbError },
              "Failed to clear activeStreamId on stream error",
            );
          }),
        );
      }

      log.error({ error }, "onError");
      return "Oops, an error occured!";
    },
  });

  return stream;
}

/**
 * Synthesize a `ChatMessage` to persist as the assistant turn. The
 * Vercel-AI-SDK `responseMessage` passed to onFinish already carries
 * the parts the client saw (text + tool + data); we just need to
 * stamp the finalized metadata (usage, activeStreamId: null).
 *
 * Lifegw reports plain token counts (`{ inputTokens, outputTokens }`)
 * but the SDK's `LanguageModelUsage` shape carries per-provider
 * detail (cache reads, reasoning tokens). We pad the missing detail
 * fields with `undefined` so the persisted metadata typecheck-passes
 * without inventing data we don't actually have.
 */
function stitchAssistantMessage({
  responseMessage,
  consumeState,
  initialMetadata,
}: {
  responseMessage: ChatMessage;
  consumeState: CanonicalConsumeState;
  initialMetadata: ChatMessage["metadata"];
}): ChatMessage {
  const usage = consumeState.usage
    ? {
        inputTokens: consumeState.usage.inputTokens,
        outputTokens: consumeState.usage.outputTokens,
        totalTokens:
          (consumeState.usage.inputTokens ?? 0) +
          (consumeState.usage.outputTokens ?? 0),
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
      }
    : undefined;

  return {
    ...responseMessage,
    metadata: {
      ...initialMetadata,
      ...responseMessage.metadata,
      activeStreamId: null,
      ...(usage ? { usage } : {}),
    },
  };
}

/**
 * Wrap an `AsyncIterable<CanonicalAgentEvent>` so a side-effect
 * callback fires on each yielded event. Used to thread the per-chunk
 * cancel-check (which the streamText path used to expose via its
 * `onChunk` option) into the lifegw event loop.
 */
async function* wrapWithProgress(
  source: AsyncIterable<
    import("@/lib/life-runtime/agent-session/types").CanonicalAgentEvent
  >,
  onChunk: () => void,
): AsyncIterable<
  import("@/lib/life-runtime/agent-session/types").CanonicalAgentEvent
> {
  for await (const ev of source) {
    try {
      onChunk();
    } catch {
      // swallow — cancel-check failures shouldn't abort the stream
    }
    yield ev;
  }
}

async function executeChatRequest({
  chatId,
  userMessage,
  selectedModelId,
  userId,
  anonymousSessionId,
  organizationId,
  isAnonymous,
  isNewChat,
  abortController,
  timeoutId,
}: {
  chatId: string;
  userMessage: ChatMessage;
  selectedModelId: AppModelId;
  userId: string | null;
  anonymousSessionId: string | null;
  organizationId: string | null;
  isAnonymous: boolean;
  isNewChat: boolean;
  abortController: AbortController;
  timeoutId: NodeJS.Timeout;
}): Promise<Response> {
  const log = createModuleLogger("api:chat:execute");
  const messageId = generateUUID();
  const streamId = generateUUID();

  if (!isAnonymous) {
    // Save placeholder assistant message immediately (needed for document creation)
    await saveMessage({
      id: messageId,
      chatId,
      message: {
        id: messageId,
        role: "assistant",
        parts: [],
        metadata: {
          createdAt: new Date(),
          parentMessageId: userMessage.id,
          selectedModel: selectedModelId,
          selectedTool: undefined,
          activeStreamId: streamId,
        },
      },
    });
  }

  // Create throttled cancel check (max once per second) for authenticated users
  const onChunk =
    !isAnonymous && userId
      ? throttle(async () => {
          const canceledAt = await getMessageCanceledAt({ messageId });
          if (canceledAt) {
            abortController.abort();
          }
        }, 1000)
      : undefined;

  // Build the data stream that will emit tokens
  const stream = await createLifegwBackedChatStream({
    messageId,
    chatId,
    userMessage,
    selectedModelId,
    userId,
    anonymousSessionId,
    organizationId,
    abortController,
    isAnonymous,
    isNewChat,
    timeoutId,
    streamId,
    onChunk,
  });

  const redisClients = await ensureRedisClients();
  const publisher = redisClients?.publisher;
  if (publisher) {
    after(async () => {
      try {
        const keyPattern = `${config.appPrefix}:resumable-stream:rs:sentinel:${streamId}*`;
        const keys = await publisher.keys(keyPattern);
        if (keys.length > 0) {
          await Promise.all(
            keys.map((key: string) => publisher.expire(key, 300)),
          );
        }
      } catch (error) {
        log.error({ error }, "Failed to set TTL on stream keys");
      }
    });
  }

  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  } as const;

  const streamContext = await getStreamContext();
  const sseStream = () => stream.pipeThrough(new JsonToSseTransformStream());

  if (streamContext) {
    log.debug("Returning resumable stream");
    return new Response(
      await streamContext.resumableStream(streamId, sseStream),
      { headers: sseHeaders },
    );
  }

  return new Response(sseStream(), { headers: sseHeaders });
}

export async function POST(request: NextRequest) {
  const log = createModuleLogger("api:chat");
  try {
    const {
      id: chatId,
      message: userMessage,
      prevMessages: anonymousPreviousMessages,
      projectId,
    }: {
      id: string;
      message: ChatMessage;
      prevMessages: ChatMessage[];
      projectId?: string;
    } = await request.json();

    if (!userMessage) {
      log.warn("No user message found");
      return new ChatSDKError("bad_request:api").toResponse();
    }

    // Extract selectedModel from user message metadata
    const selectedModelId = userMessage.metadata?.selectedModel as AppModelId;

    if (!selectedModelId) {
      log.warn("No selectedModel in user message metadata");
      return new ChatSDKError("bad_request:api").toResponse();
    }

    const sessionSetup = await validateAndSetupSession({
      request,
      selectedModelId,
    });

    if (!sessionSetup.success) {
      return sessionSetup.error;
    }

    const { userId, isAnonymous, anonymousSession, modelDefinition } =
      sessionSetup;

    // ---- Tier-based model & credit gate (authenticated users only) ----
    // userPlan is hoisted so downstream checks can build a tier-appropriate
    // policy in future PRs.
    let userPlan = "anonymous";
    let orgId: string | null = null;
    if (userId && !isAnonymous) {
      // Lightweight single-row lookup for org plan + credits
      const [orgRow] = await tierDb
        .select({
          orgId: organization.id,
          plan: organization.plan,
          planCreditsRemaining: organization.planCreditsRemaining,
        })
        .from(organizationMember)
        .innerJoin(
          organization,
          eq(organizationMember.organizationId, organization.id),
        )
        .where(eq(organizationMember.userId, userId))
        .limit(1);

      orgId = orgRow?.orgId ?? null;
      userPlan = orgRow?.plan ?? "free";

      if (!isModelAllowed(userPlan, selectedModelId)) {
        return Response.json(
          {
            error: "model_not_allowed",
            message: getUpgradeMessage("all_models"),
          },
          { status: 403 },
        );
      }

      if (orgRow) {
        const creditCheck = canSpendCredits(orgRow.planCreditsRemaining);
        if (!creditCheck.allowed && userPlan === "free") {
          captureServerEvent(userId, EVENT_CREDITS_EXHAUSTED, {
            remaining: creditCheck.remaining,
          });
          return Response.json(
            {
              error: "credits_exhausted",
              message:
                "You have run out of free-tier credits. Upgrade at /pricing to continue.",
              remaining: creditCheck.remaining,
              upgradeUrl: "/pricing",
            },
            { status: 403 },
          );
        }
      }
    }

    const selectedTool = userMessage.metadata.selectedTool ?? null;
    let isNewChat = false;

    // Handle authenticated user validation and credit check
    if (userId) {
      // Rate limit authenticated users
      const authRateLimit = await checkAuthenticatedRateLimit(
        userId,
        redisPublisher,
      );
      if (!authRateLimit.success) {
        return Response.json(
          { error: authRateLimit.error, type: "RATE_LIMIT_EXCEEDED" },
          { status: 429, headers: authRateLimit.headers || {} },
        );
      }

      const result = await handleUserValidationAndCredits({
        chatId,
        userId,
        userMessage,
        projectId,
      });
      if ("error" in result) {
        return result.error;
      }
      isNewChat = result.isNewChat;
      after(() => {
        captureServerEvent(userId, EVENT_MESSAGE_SENT, {
          chatId,
          model: selectedModelId,
        });
        if (isNewChat) {
          captureServerEvent(userId, EVENT_CHAT_STARTED, {
            chatId,
            model: selectedModelId,
          });
        }
      });
    } else if (anonymousSession) {
      // Pre-deduct credits for anonymous users (cookies must be set before streaming)
      await setAnonymousSession({
        ...anonymousSession,
        remainingCredits: anonymousSession.remainingCredits - 1,
      });
    }

    const explicitlyRequestedTools =
      determineExplicitlyRequestedTools(selectedTool);

    // ── Feature-flag tool gating (BRO-393) ──────────────────────────
    // Evaluate PostHog feature flags to determine which premium tools
    // should be excluded for this user/org. Anonymous users skip this
    // (they already have a restricted tool set from ANONYMOUS_LIMITS).
    let gatedTools: Set<ToolName> | undefined;

    if (userId && !isAnonymous) {
      gatedTools = await getGatedToolNames(userId, orgId);

      // If the user explicitly requested a gated tool (e.g. clicked the
      // deep-research button), return an upgrade message immediately
      // instead of silently stripping the tool.
      if (
        gatedTools.size > 0 &&
        explicitlyRequestedTools &&
        explicitlyRequestedTools.length > 0
      ) {
        const blockedTool = explicitlyRequestedTools.find((t) =>
          gatedTools!.has(t),
        );
        if (blockedTool) {
          return Response.json(
            {
              error: "feature_gated",
              message: getToolGateUpgradeMessage(blockedTool),
              upgradeUrl: "/pricing",
            },
            { status: 403 },
          );
        }
      }
    }

    const contextResult = await prepareRequestContext({
      userMessage,
      chatId,
      isAnonymous,
      anonymousPreviousMessages,
      modelDefinition,
      explicitlyRequestedTools,
      gatedTools,
    });

    if (contextResult.error) {
      return contextResult.error;
    }

    // Gate MCP-connector loading behind the mcp feature flag (BRO-393).
    // Pre-PR-3 the resolved connectors were threaded into core-chat-agent
    // for streamText-side tool injection; now lifegw owns server-side
    // tool dispatch. We still gate the MCP loader so user-org config
    // changes flow through without surprise, but the result is reserved
    // for a future PR that forwards connector hints to lifegw.
    const mcpFlagEnabled =
      userId && !isAnonymous
        ? await getServerFeatureFlag(
            "mcp",
            userId,
            orgId ? { organization: orgId } : undefined,
          )
        : false;
    const _mcpConnectors: McpConnector[] =
      config.features.mcp && mcpFlagEnabled && userId && !isAnonymous
        ? await getMcpConnectorsByUserId({ userId })
        : [];
    void _mcpConnectors;

    // ── Lifegw configuration check ─────────────────────────────────
    // The route MUST have a configured lifegw to function; we no
    // longer carry the streamText fallback. Surface a clear 503 if
    // the operator forgot to set LIFED_GATEWAY_URL.
    if (!getLifegwBaseUrl()) {
      log.error("LIFED_GATEWAY_URL is unset; cannot dispatch chat");
      return new Response(
        "Chat service unavailable: lifegw is not configured. Set LIFED_GATEWAY_URL on this deployment.",
        { status: 503 },
      );
    }

    // Create AbortController with timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 290_000); // 290 seconds

    return await executeChatRequest({
      chatId,
      userMessage,
      selectedModelId,
      userId,
      anonymousSessionId: anonymousSession?.id ?? null,
      organizationId: orgId,
      isAnonymous,
      isNewChat,
      abortController,
      timeoutId,
    });
  } catch (error) {
    log.error(
      {
        err:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      },
      "RESPONSE > POST /api/chat error",
    );
    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}
