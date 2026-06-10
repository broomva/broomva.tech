// Integration-ish tests for POST /api/chat (the in-app chat surface).
//
// PR-3 of BRO-1208 rewires this route to dispatch through lifegw. The
// tests mock everything below the route handler:
//
//   - `LifedWsAgentSessionClient` — via the `__setSessionClientFactoryForTests`
//     seam exported from the route module.
//   - `@/lib/auth` — `getSafeSession` returns null (anonymous) or a fake user.
//   - `@/lib/auth/lifegw-jwt` — `mintTier1ForConsumer` returns a fake cap.
//   - `@/lib/anonymous-session-server` — `getAnonymousSession` /
//     `setAnonymousSession` are stubbed.
//   - `@/lib/db/queries` — all save/get/update helpers are stubbed.
//   - `@/lib/db/credits` — `canSpend` / `deductCredits` are stubbed.
//   - Tier + feature-flag + rate-limit helpers — all stubbed to permissive defaults.
//
// We exercise the full handler from request-parse through stream-finish
// and assert:
//
//   1. The SSE body contains the expected Vercel-AI-SDK chunks.
//   2. The right consumer kind (user vs anon) is sent to the dispatcher.
//   3. `data-chatConfirmed` appears for new chats only.
//   4. Anonymous credits are pre-deducted.
//   5. The route does NOT call into the Arcan modules (regression guard
//      — those still exist for non-chat consumers but `/api/chat` must
//      no longer touch them).
//
// File under test: ../route.ts

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// `lib/env.ts` calls `createEnv` at import time which throws if
// DATABASE_URL / AUTH_SECRET are unset. We don't actually use the env
// (every DB / auth call is mocked) so stub the module to bypass the
// validation entirely.
vi.mock("@/lib/env", () => ({
  env: {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    AUTH_SECRET: "test-auth-secret",
    REDIS_URL: undefined,
  },
}));

// ── Hoisted mock instances ────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  // auth
  getSafeSession: vi.fn(),
  mintTier1ForConsumer: vi.fn(),
  // anon session
  getAnonymousSession: vi.fn(),
  setAnonymousSession: vi.fn(),
  createAnonymousSession: vi.fn(),
  // db
  upsertUserFromSession: vi.fn(),
  getUserById: vi.fn(),
  getChatById: vi.fn(),
  getMessageById: vi.fn(),
  getMessageCanceledAt: vi.fn(),
  saveChat: vi.fn(),
  saveMessage: vi.fn(),
  updateMessage: vi.fn(),
  updateMessageActiveStreamId: vi.fn(),
  getThreadUpToMessageId: vi.fn(),
  // credits + tier
  canSpend: vi.fn(),
  deductCredits: vi.fn(),
  deductOrgCredits: vi.fn(),
  recordUsageEvent: vi.fn(),
  // misc
  generateTitleFromUserMessage: vi.fn(),
  getMcpConnectorsByUserId: vi.fn(),
  getServerFeatureFlag: vi.fn(),
  checkAnonymousRateLimit: vi.fn(),
  checkAuthenticatedRateLimit: vi.fn(),
  getClientIP: vi.fn(),
  captureServerEvent: vi.fn(),
  isModelAllowed: vi.fn(),
  canSpendCredits: vi.fn(),
  getUpgradeMessage: vi.fn(),
  getAppModelDefinition: vi.fn(),
}));

// ── Module-level mocks ─────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSafeSession: mocks.getSafeSession,
  hasNeonAuth: false,
  auth: {},
}));

vi.mock("@/lib/auth/lifegw-jwt", () => ({
  mintTier1ForConsumer: mocks.mintTier1ForConsumer,
}));

vi.mock("@/lib/anonymous-session-server", () => ({
  getAnonymousSession: mocks.getAnonymousSession,
  setAnonymousSession: mocks.setAnonymousSession,
}));

vi.mock("@/lib/create-anonymous-session", () => ({
  createAnonymousSession: mocks.createAnonymousSession,
}));

vi.mock("@/lib/db/queries", () => ({
  upsertUserFromSession: mocks.upsertUserFromSession,
  getUserById: mocks.getUserById,
  getChatById: mocks.getChatById,
  getMessageById: mocks.getMessageById,
  getMessageCanceledAt: mocks.getMessageCanceledAt,
  saveChat: mocks.saveChat,
  saveMessage: mocks.saveMessage,
  updateMessage: mocks.updateMessage,
  updateMessageActiveStreamId: mocks.updateMessageActiveStreamId,
  getProjectById: vi.fn(),
}));

vi.mock("@/lib/db/credits", () => ({
  canSpend: mocks.canSpend,
  deductCredits: mocks.deductCredits,
}));

vi.mock("@/lib/db/usage", () => ({
  deductOrgCredits: mocks.deductOrgCredits,
  recordUsageEvent: mocks.recordUsageEvent,
}));

vi.mock("@/lib/db/mcp-queries", () => ({
  getMcpConnectorsByUserId: mocks.getMcpConnectorsByUserId,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => [],
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  getServerFeatureFlag: mocks.getServerFeatureFlag,
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  checkAnonymousRateLimit: mocks.checkAnonymousRateLimit,
  checkAuthenticatedRateLimit: mocks.checkAuthenticatedRateLimit,
  getClientIP: mocks.getClientIP,
}));

vi.mock("@/lib/analytics/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

vi.mock("@/lib/tier-access", () => ({
  isModelAllowed: mocks.isModelAllowed,
  canSpendCredits: mocks.canSpendCredits,
  getUpgradeMessage: mocks.getUpgradeMessage,
}));

vi.mock("@/lib/ai/app-models", () => ({
  getAppModelDefinition: mocks.getAppModelDefinition,
}));

vi.mock("../get-thread-up-to-message-id", () => ({
  getThreadUpToMessageId: mocks.getThreadUpToMessageId,
}));

vi.mock("../../../actions", () => ({
  generateTitleFromUserMessage: mocks.generateTitleFromUserMessage,
}));

// Arcan modules — keep a separate marker so we can assert they're
// never touched by the route. If the route imports them, the mock fires
// and the test FAILS via the spy below.
const arcanGuard = vi.hoisted(() => ({
  executeViaArcan: vi.fn(() => {
    throw new Error("Arcan must not be invoked from /api/chat in PR-3");
  }),
  resolveArcanEndpoints: vi.fn(() => {
    throw new Error("Arcan must not be invoked from /api/chat in PR-3");
  }),
  markInstanceDegraded: vi.fn(() => {
    throw new Error("Arcan must not be invoked from /api/chat in PR-3");
  }),
}));

vi.mock("@/lib/arcan", () => arcanGuard);

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (fn: () => unknown) => {
      // Fire after-callbacks synchronously so DB-write side effects are
      // observable inside the test. Real Next runs them post-response;
      // for unit tests it's fine to drain them eagerly.
      try {
        const r = fn();
        if (r instanceof Promise) r.catch(() => undefined);
      } catch {
        // swallow
      }
    },
  };
});

// ── Bring route in AFTER mocks ────────────────────────────────────────

import type { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import type {
  AgentStreamInput,
  CanonicalAgentEvent,
} from "@/lib/life-runtime/agent-session/types";
import { __setSessionClientFactoryForTests, POST } from "../route";

// ── Fake LifedWsAgentSessionClient ────────────────────────────────────

interface FakeOpts {
  events?: CanonicalAgentEvent["event"][];
  createSessionCalls?: Array<{
    resumeSid?: string;
    userId: string;
    capability: { token: string };
  }>;
  streamCalls?: AgentStreamInput[];
}

function makeFakeClient(opts: FakeOpts): LifedWsAgentSessionClient {
  const events = opts.events ?? [
    { kind: "token", delta: "Hello!" },
    {
      kind: "finish",
      reason: "stop",
      usage: { inputTokens: 5, outputTokens: 3 },
    },
  ];
  return {
    backendId: "lifed-ws" as const,
    async createSession(input: {
      capability: { token: string };
      userId: string;
      projectSlug: string;
      resumeSid?: string;
    }) {
      opts.createSessionCalls?.push({
        resumeSid: input.resumeSid,
        userId: input.userId,
        capability: input.capability,
      });
      return {
        sid: input.resumeSid ?? "fresh-sid",
        agentId: `agent_${input.userId}`,
        userId: input.userId,
        projectId: input.projectSlug,
        createdAtUnix: 0,
      };
    },
    async sendMessage() {},
    async health() {
      return { backendId: "lifed-ws", reachable: true };
    },
    async *stream(input: AgentStreamInput): AsyncIterable<CanonicalAgentEvent> {
      opts.streamCalls?.push(input);
      let i = 0n;
      for (const ev of events) {
        yield { seq: ++i, at: new Date().toISOString(), event: ev };
      }
    },
  } as unknown as LifedWsAgentSessionClient;
}

// ── Request helpers ────────────────────────────────────────────────────

function makeRequest(body: unknown): import("next/server").NextRequest {
  return new Request("https://broomva.tech/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const ANON_MODEL = "openai/gpt-5-mini";
const AUTH_MODEL = "anthropic/claude-sonnet-4";

function makeChatMessage(
  text: string,
  modelId = ANON_MODEL,
): {
  id: string;
  role: "user";
  parts: Array<{ type: "text"; text: string }>;
  metadata: {
    createdAt: Date;
    parentMessageId: string | null;
    selectedModel: string;
    activeStreamId: string | null;
  };
} {
  return {
    id: `msg_${Math.random().toString(36).slice(2, 10)}`,
    role: "user",
    parts: [{ type: "text", text }],
    metadata: {
      createdAt: new Date(),
      parentMessageId: null,
      selectedModel: modelId,
      activeStreamId: null,
    },
  };
}

// Drains an SSE response body into the raw string for asserting on
// chunk markers (`data: ...\n\n`).
//
// The route returns `new Response(stream, ...)` where `stream` is a
// `ReadableStream<string>` (the output of `JsonToSseTransformStream`).
// `Response.text()` works on real browsers / Node fetch but vitest's
// node env complains about non-Uint8Array chunks, so we drain the
// reader manually and concatenate.
async function drainBody(resp: Response): Promise<string> {
  if (!resp.body) return "";
  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (typeof value === "string") {
      out += value;
    } else if (value instanceof Uint8Array) {
      out += decoder.decode(value, { stream: true });
    } else if (value != null) {
      out += String(value);
    }
  }
  out += decoder.decode();
  return out;
}

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();

  // Default permissive behaviour — overridden per test as needed.
  mocks.getSafeSession.mockResolvedValue({ data: null, error: null });
  mocks.mintTier1ForConsumer.mockResolvedValue({
    token: "fake-tier1-token",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  });
  mocks.getAnonymousSession.mockResolvedValue({
    id: "anon-abc",
    remainingCredits: 5,
    createdAt: new Date(),
  });
  mocks.createAnonymousSession.mockResolvedValue({
    id: "anon-abc",
    remainingCredits: 5,
    createdAt: new Date(),
  });
  mocks.setAnonymousSession.mockResolvedValue(undefined);
  mocks.upsertUserFromSession.mockResolvedValue(undefined);
  mocks.getUserById.mockResolvedValue({ id: "user_1", email: "x@y" });
  mocks.getChatById.mockResolvedValue(null); // fresh chat by default
  mocks.getMessageById.mockResolvedValue([]); // message not yet saved
  mocks.getMessageCanceledAt.mockResolvedValue(null);
  mocks.saveChat.mockResolvedValue(undefined);
  mocks.saveMessage.mockResolvedValue(undefined);
  mocks.updateMessage.mockResolvedValue(undefined);
  mocks.updateMessageActiveStreamId.mockResolvedValue(undefined);
  mocks.getThreadUpToMessageId.mockResolvedValue([]);
  mocks.canSpend.mockResolvedValue(true);
  mocks.deductCredits.mockResolvedValue(undefined);
  mocks.deductOrgCredits.mockResolvedValue(undefined);
  mocks.recordUsageEvent.mockResolvedValue(undefined);
  mocks.generateTitleFromUserMessage.mockResolvedValue("Test chat");
  mocks.getMcpConnectorsByUserId.mockResolvedValue([]);
  mocks.getServerFeatureFlag.mockResolvedValue(true);
  mocks.checkAnonymousRateLimit.mockResolvedValue({ success: true });
  mocks.checkAuthenticatedRateLimit.mockResolvedValue({ success: true });
  mocks.getClientIP.mockReturnValue("127.0.0.1");
  mocks.isModelAllowed.mockReturnValue(true);
  mocks.canSpendCredits.mockReturnValue({ allowed: true, remaining: 100 });
  mocks.getUpgradeMessage.mockReturnValue("upgrade");
  mocks.getAppModelDefinition.mockResolvedValue({
    id: ANON_MODEL,
    apiModelId: ANON_MODEL,
    input: { text: true },
    output: { text: true },
  });
  mocks.captureServerEvent.mockReturnValue(undefined);

  vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.example.test");
  // Disable Redis (resumable stream context bypassed)
  vi.stubEnv("REDIS_URL", "");
});

afterEach(() => {
  __setSessionClientFactoryForTests(undefined);
  vi.unstubAllEnvs();
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("POST /api/chat — anonymous flow", () => {
  it("dispatches via lifegw with an anon consumer and streams Vercel-AI-SDK SSE", async () => {
    const createSessionCalls: FakeOpts["createSessionCalls"] = [];
    const streamCalls: FakeOpts["streamCalls"] = [];
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({ createSessionCalls, streamCalls }),
    );

    const chatId = "11111111-1111-1111-1111-111111111111";
    const req = makeRequest({
      id: chatId,
      message: makeChatMessage("Hello", ANON_MODEL),
      prevMessages: [],
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/event-stream");

    const body = await drainBody(resp);
    // The translator emits text-start + text-delta + text-end and the
    // SDK's createUIMessageStream owns the finish event.
    expect(body).toContain("text-start");
    expect(body).toContain("text-delta");
    expect(body).toContain("Hello!");
    // SSE wire framing — `data: ...` per chunk plus a `[DONE]` sentinel
    expect(body).toMatch(/data: \{[^}]+\}/);
    expect(body).toContain("[DONE]");
    // Anonymous users don't get `data-chatConfirmed` (the chat record
    // isn't persisted for anon users); that fires only on the
    // authenticated isNewChat path — see the authenticated test below.

    expect(createSessionCalls).toHaveLength(1);
    // anon consumer id comes from the anonymous-session cookie (NOT
    // chatId — same anon session can have multiple chats, all minted
    // under the same Tier-0 subject)
    expect(createSessionCalls![0].userId).toBe("anon:anon-abc");
    // sticky sid is the chatId — per-chat continuity
    expect(createSessionCalls![0].resumeSid).toBe(chatId);
    expect(mocks.mintTier1ForConsumer).toHaveBeenCalledWith({
      consumer: { kind: "anon", id: "anon-abc" },
      projectSlug: "default",
    });

    // Anon credits pre-deducted
    expect(mocks.setAnonymousSession).toHaveBeenCalledWith(
      expect.objectContaining({ remainingCredits: 4 }),
    );

    // Arcan was NOT invoked
    expect(arcanGuard.executeViaArcan).not.toHaveBeenCalled();
    expect(arcanGuard.resolveArcanEndpoints).not.toHaveBeenCalled();
  });

  it("stamps assistant metadata on the stream (message-metadata chunks)", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));

    const userMessage = makeChatMessage("Hello", ANON_MODEL);
    const resp = await POST(
      makeRequest({
        id: "44444444-4444-4444-4444-444444444444",
        message: userMessage,
        prevMessages: [],
      }),
    );
    expect(resp.status).toBe(200);

    const body = await drainBody(resp);
    const metadataChunks = body
      .split("\n")
      .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
      .map((line) => JSON.parse(line.slice("data: ".length)))
      .filter((chunk) => chunk.type === "message-metadata");

    // The route wrapper owns message-metadata emission (the canonical
    // translator deliberately does not) — without these chunks the
    // client's live assistant message has no parentMessageId and
    // lib/stores/with-threads.ts renders consecutive turns as version
    // siblings.
    expect(metadataChunks.length).toBeGreaterThanOrEqual(2);

    const first = metadataChunks[0].messageMetadata;
    expect(first.parentMessageId).toBe(userMessage.id);
    expect(first.selectedModel).toBe(ANON_MODEL);

    const last = metadataChunks.at(-1).messageMetadata;
    expect(last.parentMessageId).toBe(userMessage.id);
    expect(last.activeStreamId).toBeNull();
  });

  it("prepends recent conversation context to the lifegw user message (multi-turn)", async () => {
    const streamCalls: FakeOpts["streamCalls"] = [];
    __setSessionClientFactoryForTests(() => makeFakeClient({ streamCalls }));

    const chatId = "22222222-2222-2222-2222-222222222222";
    const priorUser = { ...makeChatMessage("My code word is ARCANGEL."), id: "prev-u" };
    const priorAssistant = {
      id: "prev-a",
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Got it — ARCANGEL." }],
      metadata: {
        createdAt: new Date(),
        parentMessageId: "prev-u",
        selectedModel: ANON_MODEL,
        activeStreamId: null,
      },
    };

    const resp = await POST(
      makeRequest({
        id: chatId,
        message: makeChatMessage("What is my code word?"),
        prevMessages: [priorUser, priorAssistant],
      }),
    );
    expect(resp.status).toBe(200);
    await drainBody(resp);

    // The content lifegw forwards to the LLM carries the prior turns as
    // labelled context plus the current message — so the model can
    // "remember" earlier turns despite lifed's per-turn dispatch.
    expect(streamCalls).toHaveLength(1);
    const sent = streamCalls![0].userMessage;
    expect(sent).toContain("User: My code word is ARCANGEL.");
    expect(sent).toContain("Assistant: Got it — ARCANGEL.");
    expect(sent).toContain("What is my code word?");
  });

  it("sends only the current message when there is no prior context", async () => {
    const streamCalls: FakeOpts["streamCalls"] = [];
    __setSessionClientFactoryForTests(() => makeFakeClient({ streamCalls }));

    const resp = await POST(
      makeRequest({
        id: "33333333-3333-3333-3333-333333333333",
        message: makeChatMessage("Just one message"),
        prevMessages: [],
      }),
    );
    expect(resp.status).toBe(200);
    await drainBody(resp);

    // First turn: byte-for-byte the bare user text (no transcript wrapper).
    expect(streamCalls![0].userMessage).toBe("Just one message");
  });

  it("rejects anonymous request when model is not in ANONYMOUS_LIMITS", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest({
      id: "22222222-2222-2222-2222-222222222222",
      message: makeChatMessage("Hi", "anthropic/claude-opus-4"),
      prevMessages: [],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(403);
  });

  it("rejects when anonymous credits are exhausted", async () => {
    mocks.getAnonymousSession.mockResolvedValue({
      id: "anon-empty",
      remainingCredits: 0,
      createdAt: new Date(),
    });
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest({
      id: "33333333-3333-3333-3333-333333333333",
      message: makeChatMessage("Hi", ANON_MODEL),
      prevMessages: [],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(402);
  });
});

describe("POST /api/chat — authenticated flow", () => {
  it("dispatches via lifegw with a user consumer and persists assistant message", async () => {
    mocks.getSafeSession.mockResolvedValue({
      data: {
        user: { id: "user_alice", email: "alice@x", name: "Alice" },
      },
      error: null,
    });
    mocks.getAppModelDefinition.mockResolvedValue({
      id: AUTH_MODEL,
      apiModelId: AUTH_MODEL,
      input: { text: true },
      output: { text: true },
    });
    const createSessionCalls: FakeOpts["createSessionCalls"] = [];
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({ createSessionCalls }),
    );
    const chatId = "44444444-4444-4444-4444-444444444444";
    const req = makeRequest({
      id: chatId,
      message: makeChatMessage("Hello!", AUTH_MODEL),
      prevMessages: [],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);

    // Drain so onFinish fires
    await drainBody(resp);

    expect(createSessionCalls![0].userId).toBe("user_alice");
    expect(mocks.mintTier1ForConsumer).toHaveBeenCalledWith({
      consumer: { kind: "user", id: "user_alice" },
      projectSlug: "default",
    });

    // Placeholder assistant message was saved BEFORE streaming (so
    // resumable-stream replay would land)
    expect(mocks.saveMessage).toHaveBeenCalled();
    // Credit deduction wired
    // (Bun + vitest+timers run after the response — drainBody flushes
    // the entire SSE so onFinish has already run.)
    expect(mocks.deductCredits).toHaveBeenCalled();
  });

  it("emits data-chatConfirmed for a brand-new authenticated chat", async () => {
    mocks.getSafeSession.mockResolvedValue({
      data: { user: { id: "user_first", email: "f@x", name: "F" } },
      error: null,
    });
    mocks.getAppModelDefinition.mockResolvedValue({
      id: AUTH_MODEL,
      apiModelId: AUTH_MODEL,
      input: { text: true },
      output: { text: true },
    });
    // No chat exists yet → isNewChat=true → data-chatConfirmed fires
    mocks.getChatById.mockResolvedValue(null);

    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest({
      id: "77777777-7777-7777-7777-777777777777",
      message: makeChatMessage("Greet me", AUTH_MODEL),
      prevMessages: [],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = await drainBody(resp);
    expect(body).toContain("data-chatConfirmed");
    // saveChat was called for the new chat record
    expect(mocks.saveChat).toHaveBeenCalled();
  });
});

describe("POST /api/chat — lifegw configuration", () => {
  it("returns 503 when LIFED_GATEWAY_URL is unset", async () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "");
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest({
      id: "55555555-5555-5555-5555-555555555555",
      message: makeChatMessage("hi", ANON_MODEL),
      prevMessages: [],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(503);
    expect(await resp.text()).toContain("lifegw is not configured");
  });
});

describe("POST /api/chat — request validation", () => {
  it("returns 400 when message is missing", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest({ id: "no-msg-id", prevMessages: [] });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns 400 when selectedModel metadata is missing", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const message = makeChatMessage("hi", ANON_MODEL);
    // Strip selectedModel
    (message.metadata as Record<string, unknown>).selectedModel = undefined;
    const req = makeRequest({ id: "no-model", message, prevMessages: [] });
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });
});

describe("POST /api/chat — Arcan no-touch invariant", () => {
  it("never imports/invokes lib/arcan even when authenticated", async () => {
    mocks.getSafeSession.mockResolvedValue({
      data: { user: { id: "user_a", email: "a@b", name: "A" } },
      error: null,
    });
    mocks.getAppModelDefinition.mockResolvedValue({
      id: AUTH_MODEL,
      apiModelId: AUTH_MODEL,
      input: { text: true },
      output: { text: true },
    });
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest({
      id: "66666666-6666-6666-6666-666666666666",
      message: makeChatMessage("hi", AUTH_MODEL),
      prevMessages: [],
    });
    const resp = await POST(req);
    await drainBody(resp);
    expect(arcanGuard.executeViaArcan).not.toHaveBeenCalled();
    expect(arcanGuard.resolveArcanEndpoints).not.toHaveBeenCalled();
    expect(arcanGuard.markInstanceDegraded).not.toHaveBeenCalled();
  });
});
