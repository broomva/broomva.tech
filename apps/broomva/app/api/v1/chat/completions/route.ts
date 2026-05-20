/**
 * `POST /api/v1/chat/completions` — OpenAI Chat Completions API
 * edge endpoint.
 *
 * Second sub-PR of BRO-1208 — sibling of `/api/v1/messages` (Anthropic
 * Messages shape). Off-the-shelf `openai` SDK + Vercel AI SDK's
 * `openai-compatible` provider can point at this URL and get
 * byte-faithful OpenAI SSE.
 *
 * Architecture (per the spec; mirrors PR-1):
 *
 *   client ─POST /api/v1/chat/completions───┐
 *                                            │
 *                  ┌─────────────────────────▼─────────────────────────┐
 *                  │ resolveEdgeAuth                                    │
 *                  │   (Tier-1 header OR Neon Auth session              │
 *                  │    → mint lifegw cap)                              │
 *                  └─────────────────────────┬─────────────────────────┘
 *                                            │
 *                                            ▼
 *                                    resolveModel(req.model)
 *                                            │
 *                                            ▼
 *                                buildStickySessionId(messages)
 *                                            │
 *                                            ▼
 *                             LifedWsAgentSessionClient
 *                                .createSession(resume_sid=sid)
 *                                .stream({ sessionId=sid, ... })
 *                                            │
 *                                            ▼
 *                             canonicalToOpenaiSse(...)  OR
 *                             bufferToNonStream(...)
 *                                            │
 *                                            ▼
 *                                   OpenAI SSE / JSON
 *
 * Decisions reused from PR-1 (locked, do NOT re-debate):
 *   - D1: sticky-session sid from `buildStickySessionId(messages)` —
 *     same hash works for OpenAI's shape because the prefix is a
 *     stable JSON blob and the hash is content-only.
 *   - D2: `resolveModel()` — registry-known Claude id ⇒ accept;
 *     `gpt-*` ⇒ 400 model_not_supported (no real GPT backend yet).
 *   - D3: OpenAI `role: "tool"` messages translate to Anthropic
 *     `tool_result` blocks (see `openai-translators.ts`).
 *   - D5: `resolveEdgeAuth()` — Bearer header OR Neon Auth session.
 *     No anon. HS256-in / ES256-out re-mint internal.
 *
 * Out of scope (PR-3+ territory): real GPT backend, image inputs,
 * `n > 1` choices, function-call legacy shape.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import { resolveEdgeAuth } from "@/lib/life-runtime/edge-adapter/auth";
import { buildStickySessionId } from "@/lib/life-runtime/edge-adapter/build-session-id";
import { resolveModel } from "@/lib/life-runtime/edge-adapter/model-registry";
import {
  canonicalToOpenaiSse,
  type OpenAIFinishReason,
} from "@/lib/life-runtime/edge-adapter/openai-sse";
import {
  type OpenAIMessage,
  type OpenAITool,
  openaiMessagesToLatestUserText,
  openaiToolsToAnthropicTools,
} from "@/lib/life-runtime/edge-adapter/openai-translators";
import type {
  AnthropicMessage,
  EdgeAuthContext,
} from "@/lib/life-runtime/edge-adapter/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Factory injection point for tests — mirrors the PR-1 pattern in
 * `/api/v1/messages/route.ts`. Production code lets this be
 * `undefined`; tests install a mock via `__setSessionClientFactoryForTests`.
 */
type SessionClientFactory = (baseUrl: string) => LifedWsAgentSessionClient;
let testClientFactory: SessionClientFactory | undefined;

export function __setSessionClientFactoryForTests(
  factory: SessionClientFactory | undefined,
): void {
  testClientFactory = factory;
}

function getBaseUrl(): string | null {
  const url = process.env.LIFED_GATEWAY_URL;
  return url && url.length > 0 ? url : null;
}

// ---------------------------------------------------------------------------
// OpenAI-shape error envelope
// ---------------------------------------------------------------------------

interface OpenAIErrorBody {
  error: {
    message: string;
    type: string;
    code?: string;
    param?: string;
  };
}

function openaiError(
  message: string,
  type: string,
  code?: string,
): OpenAIErrorBody {
  const body: OpenAIErrorBody = { error: { message, type } };
  if (code) body.error.code = code;
  return body;
}

function openaiErrorJson(
  message: string,
  type: string,
  status: number,
  code?: string,
): NextResponse {
  return NextResponse.json(openaiError(message, type, code), { status });
}

// ---------------------------------------------------------------------------
// Request shape + validation
// ---------------------------------------------------------------------------

interface OpenAIChatCompletionsRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?:
    | "none"
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  n?: number;
  user?: string;
  stop?: string | string[];
}

function isOpenAIRequest(v: unknown): v is OpenAIChatCompletionsRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.model === "string" && Array.isArray(r.messages);
}

function validateRequest(body: unknown):
  | { ok: true; req: OpenAIChatCompletionsRequest }
  | {
      ok: false;
      status: number;
      message: string;
      type: string;
      code?: string;
    } {
  if (!isOpenAIRequest(body)) {
    return {
      ok: false,
      status: 400,
      message:
        "Request body must be an OpenAI Chat Completions object with `model` and `messages`.",
      type: "invalid_request_error",
    };
  }
  if (body.messages.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "messages must not be empty.",
      type: "invalid_request_error",
    };
  }
  // OpenAI permits any role to be the last entry in some niche flows
  // (an assistant-only continuation request), but our forwarding model
  // requires the final entry to carry the user's current turn. Reject
  // assistant- or tool-tail requests here so the failure mode is
  // explicit (mirrors the Anthropic-side validation in PR-1).
  const last = body.messages[body.messages.length - 1];
  if (!last || last.role !== "user") {
    return {
      ok: false,
      status: 400,
      message:
        "The final entry in messages must have role 'user' (the current turn). Tool-result messages cannot be the final entry; the model expects a follow-up user message.",
      type: "invalid_request_error",
    };
  }
  // Enforce `n=1` only — multi-choice generation isn't supported by the
  // lifed agent loop, and silently returning a single choice when the
  // caller asked for multiple would be a misleading API. Spec §Request.
  if (typeof body.n === "number" && body.n !== 1) {
    return {
      ok: false,
      status: 400,
      message: `n must be 1; received n=${body.n}. Multi-choice generation is not supported.`,
      type: "invalid_request_error",
    };
  }
  if (
    typeof body.max_tokens === "number" &&
    (body.max_tokens <= 0 || !Number.isFinite(body.max_tokens))
  ) {
    return {
      ok: false,
      status: 400,
      message: "max_tokens must be a positive integer when provided.",
      type: "invalid_request_error",
    };
  }
  return { ok: true, req: body };
}

// ---------------------------------------------------------------------------
// Error mapping — lifed-ws codes → OpenAI envelope
// ---------------------------------------------------------------------------

function statusFromLifedErrorCode(code: string): number {
  if (code.startsWith("lifed-ws.auth")) return 401;
  if (code.startsWith("lifed-ws.ip_blocked")) return 403;
  if (code === "lifed-ws.aborted") return 499;
  if (code.startsWith("lifed-ws.transient_4002")) return 429;
  if (code.startsWith("lifed-ws.transient_4004")) return 502;
  if (code.startsWith("lifed-ws.transient_")) return 503;
  if (code.startsWith("lifed-ws.unexpected_")) return 502;
  if (code.startsWith("lifed-ws.sequence_retired")) return 410;
  return 500;
}

function statusFromCreateSessionError(err: unknown): number {
  if (err && typeof err === "object" && "httpStatus" in err) {
    const s = (err as { httpStatus?: number }).httpStatus;
    if (typeof s === "number") return s;
  }
  return 502;
}

function openaiErrorTypeFromStatus(status: number): string {
  if (status === 401) return "authentication_error";
  if (status === 403) return "permission_error";
  if (status === 429) return "rate_limit_error";
  if (status === 404) return "not_found_error";
  if (status >= 500) return "api_error";
  return "invalid_request_error";
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Parse + validate request body.
  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return openaiErrorJson(
      `Failed to parse JSON body: ${(err as Error).message}`,
      "invalid_request_error",
      400,
    );
  }
  const validated = validateRequest(body);
  if (!validated.ok) {
    return openaiErrorJson(
      validated.message,
      validated.type,
      validated.status,
      validated.code,
    );
  }
  const completionsRequest = validated.req;

  // 2. Resolve model. `gpt-*` and other non-registered ids return null;
  //    we surface as `model_not_supported` per spec D2.
  const resolved = resolveModel(completionsRequest.model);
  if (!resolved) {
    return openaiErrorJson(
      `model_not_supported: ${completionsRequest.model}`,
      "invalid_request_error",
      400,
      "model_not_supported",
    );
  }

  // 3. Resolve auth. `resolveEdgeAuth` returns an Anthropic-shape
  //    NextResponse on failure (PR-1 inherits its envelope); we
  //    repackage as OpenAI-shape here so external callers see the
  //    expected error envelope no matter which surface they're on.
  const auth = await resolveEdgeAuth(req);
  if (auth instanceof NextResponse) {
    return repackageAuthError(auth);
  }
  const authCtx: EdgeAuthContext = auth;

  // 4. Lifegw must be configured. Same defensive 503 as PR-1.
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return openaiErrorJson(
      "lifegw is not configured for this deployment (LIFED_GATEWAY_URL unset).",
      "api_error",
      503,
    );
  }

  // 5. Sticky session id — `buildStickySessionId` is provider-agnostic;
  //    the hash is over canonical JSON of the messages[] prefix, and
  //    OpenAI messages serialise stably enough for the hash to be
  //    reused across providers. (The same caller swapping shapes mid-
  //    conversation would get a new sid; that's intentional — distinct
  //    wire shapes are distinct conversations from lifed's POV.)
  //
  //    NOTE: build-session-id.ts declares the input as `AnthropicMessage[]`,
  //    but it only reads `role` + `content` via the canonical-JSON
  //    walker — which handles arbitrary shapes. We cast to satisfy
  //    the type signature; the runtime is identical.
  const sid = buildStickySessionId(
    completionsRequest.messages as unknown as AnthropicMessage[],
  );

  // 6. Construct the lifed WS client (test seam mirrors PR-1).
  const client = testClientFactory
    ? testClientFactory(baseUrl)
    : new LifedWsAgentSessionClient({ baseUrl });

  // 7. Open the lifed session — sticky sid resumes existing if present,
  //    fresh-creates otherwise. Mirrors PR-1 exactly.
  try {
    await client.createSession({
      capability: { token: authCtx.tier1Token },
      userId: authCtx.userId,
      projectSlug: authCtx.projectId,
      resumeSid: sid,
      signal: req.signal,
    });
  } catch (err) {
    const status = statusFromCreateSessionError(err);
    const message = err instanceof Error ? err.message : String(err);
    return openaiErrorJson(
      `Failed to open lifed session: ${message}`,
      openaiErrorTypeFromStatus(status),
      status,
    );
  }

  // 8. Open the streaming turn. PR-2 uses per-turn mode (same as PR-1):
  //    each HTTP request opens one streaming turn, closes after FINISH.
  //    Multi-turn continuity comes from the sticky sid + lifed's
  //    session cache, not from a persistent WS.
  const latestUserText = openaiMessagesToLatestUserText(
    completionsRequest.messages,
  );
  // Tools translation — currently informational only; the lifed
  // `stream()` API doesn't yet take a `tools[]` parameter (per
  // AgentStreamInput in agent-session/types.ts), so the translated
  // shape is computed but not forwarded. Reserved for the future
  // surface that does carry per-call tool overrides. The translator
  // call is kept here so any caller validation of tool shapes
  // surfaces at request boundary, not deep inside lifed.
  const _toolsAnthropic = openaiToolsToAnthropicTools(completionsRequest.tools);
  void _toolsAnthropic;

  const requestId = `chatcmpl-${randomId()}`;

  const streamIter = client.stream({
    sessionId: sid,
    agentId: `user:${authCtx.userId}`,
    projectSlug: authCtx.projectId,
    userMessage: latestUserText,
    history: [],
    kernelCtx: {
      sessionId: sid,
      agentId: `user:${authCtx.userId}`,
    },
    capability: {
      token: authCtx.tier1Token,
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 15,
    },
    signal: req.signal,
  });

  // 9. Stream or buffer.
  if (completionsRequest.stream === true) {
    const sseBody = canonicalToOpenaiSse(
      streamIter,
      resolved.anthropicId,
      requestId,
    );
    return new Response(sseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  return await bufferToNonStreamResponse(
    streamIter,
    resolved.anthropicId,
    requestId,
  );
}

// ---------------------------------------------------------------------------
// Auth-error repackaging
// ---------------------------------------------------------------------------

/**
 * `resolveEdgeAuth` (PR-1) returns an Anthropic-shape error envelope on
 * failure because it was authored for `/api/v1/messages`. The OpenAI
 * endpoint needs an OpenAI-shape envelope for SDK clients that key off
 * `body.error.message` rather than `body.error.type`. We pluck the
 * message + status out and rewrap.
 */
async function repackageAuthError(resp: NextResponse): Promise<NextResponse> {
  const status = resp.status;
  let message = "Authentication required.";
  try {
    const body = (await resp.json()) as {
      error?: { message?: string; type?: string };
    };
    if (body?.error?.message) message = body.error.message;
  } catch {
    // Fall through with the default message — original body was
    // already an OpenAI-shape failure or malformed JSON.
  }
  return openaiErrorJson(message, openaiErrorTypeFromStatus(status), status);
}

// ---------------------------------------------------------------------------
// Non-stream buffering
// ---------------------------------------------------------------------------

interface OpenAIChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAINonStreamChoice {
  index: 0;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: OpenAIFinishReason;
}

interface OpenAINonStreamResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: [OpenAINonStreamChoice];
  usage?: OpenAIChatCompletionUsage;
}

async function bufferToNonStreamResponse(
  events: AsyncIterable<CanonicalAgentEvent>,
  modelId: string,
  requestId: string,
): Promise<Response> {
  let textBuffer = "";
  const toolCalls: NonNullable<OpenAINonStreamChoice["message"]["tool_calls"]> =
    [];
  let finishReason: OpenAIFinishReason = "stop";
  let hadToolCall = false;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for await (const envelope of events) {
      const ev = envelope.event;
      switch (ev.kind) {
        case "token":
          textBuffer += ev.delta;
          break;
        case "tool_call_pending": {
          hadToolCall = true;
          toolCalls.push({
            id: ev.call.callId || `call_${randomId()}`,
            type: "function",
            function: {
              name: ev.call.toolName || "unknown_tool",
              arguments: ev.call.inputJson || "{}",
            },
          });
          break;
        }
        case "finish":
          if (ev.usage) {
            inputTokens = ev.usage.inputTokens ?? 0;
            outputTokens = ev.usage.outputTokens ?? 0;
          }
          finishReason = mapFinishReasonForBuffer(ev.reason, hadToolCall);
          break;
        case "error": {
          const status = statusFromLifedErrorCode(ev.code || "");
          return openaiErrorJson(
            ev.message || ev.code || "lifed-ws stream errored",
            openaiErrorTypeFromStatus(status),
            status,
            ev.code || undefined,
          );
        }
        default:
          break;
      }
    }
  } catch (err) {
    return openaiErrorJson(
      `lifed-ws stream failed: ${(err as Error).message}`,
      "api_error",
      500,
    );
  }

  const message: OpenAINonStreamChoice["message"] = {
    role: "assistant",
    content: textBuffer.length > 0 ? textBuffer : null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
    if (finishReason === "stop") finishReason = "tool_calls";
  }

  const resp: OpenAINonStreamResponse = {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [{ index: 0, message, finish_reason: finishReason }],
  };
  // Usage block is best-effort — emit when lifed reported tokens,
  // skip otherwise so consumers don't get misleading zeroes.
  if (inputTokens > 0 || outputTokens > 0) {
    resp.usage = {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    };
  }

  return NextResponse.json(resp, { status: 200 });
}

function mapFinishReasonForBuffer(
  reason: string | undefined,
  hadToolCall: boolean,
): OpenAIFinishReason {
  switch (reason) {
    case "stop":
    case "end_turn":
      return hadToolCall ? "tool_calls" : "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      return hadToolCall ? "tool_calls" : "stop";
  }
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  );
}
