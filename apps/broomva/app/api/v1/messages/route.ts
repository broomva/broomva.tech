/**
 * `POST /api/v1/messages` — Anthropic Messages API edge endpoint.
 *
 * First sub-PR of BRO-1208 — closes the gap between the existing
 * `/api/chat` (Arcan-direct, Vercel-AI-SDK shape) and the canonical
 * lifegw-routed agent stack. Off-the-shelf `@anthropic-ai/sdk` callers
 * (browser, CLI, third-party) can point at this URL and get byte-faithful
 * Anthropic SSE.
 *
 * Architecture (per the spec):
 *
 *   client ─POST /api/v1/messages──┐
 *                                   │
 *                  ┌────────────────▼────────────────┐
 *                  │ resolveEdgeAuth                  │
 *                  │   (Tier-1 header OR Neon Auth    │
 *                  │    session → mint lifegw cap)    │
 *                  └────────────────┬────────────────┘
 *                                   │
 *                                   ▼
 *                          resolveModel(req.model)
 *                                   │
 *                                   ▼
 *                       buildStickySessionId(msgs)
 *                                   │
 *                                   ▼
 *                    LifedWsAgentSessionClient
 *                       .createSession(resume_sid=sid)
 *                       .stream({ sessionId=sid, ... })
 *                                   │
 *                                   ▼
 *                    canonicalToAnthropicSse(...)
 *                                   │
 *                                   ▼
 *                          Anthropic SSE stream
 *
 * Out of scope (PR-3 territory): per-tier credit gate, tool flag gating,
 * MCP injection. Those belong on `/api/chat` (the in-app surface), not
 * this external API.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import { canonicalToAnthropicSse } from "@/lib/life-runtime/edge-adapter/anthropic-sse";
import { resolveEdgeAuth } from "@/lib/life-runtime/edge-adapter/auth";
import { buildStickySessionId } from "@/lib/life-runtime/edge-adapter/build-session-id";
import { resolveModel } from "@/lib/life-runtime/edge-adapter/model-registry";
import type {
  AnthropicErrorBody,
  AnthropicMessage,
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AnthropicStopReason,
  AnthropicTextContentBlock,
  AnthropicToolUseContentBlock,
  EdgeAuthContext,
} from "@/lib/life-runtime/edge-adapter/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Factory injection point for tests. Production code lets this be
 * `undefined`; tests pass a mock client via the symbol on the route
 * module. Kept module-local (not exported as a route handler concern)
 * so production callers see the simple `POST` export.
 */
type SessionClientFactory = (baseUrl: string) => LifedWsAgentSessionClient;
let testClientFactory: SessionClientFactory | undefined;

/**
 * Test-only hook — installs a mock `LifedWsAgentSessionClient` factory
 * for the next call. The test file imports this symbol and calls it in
 * `beforeEach`; the route reads `testClientFactory` lazily so the
 * normal export shape stays clean.
 */
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
// Helpers
// ---------------------------------------------------------------------------

function errorBody(
  type: AnthropicErrorBody["error"]["type"],
  message: string,
): AnthropicErrorBody {
  return { type: "error", error: { type, message } };
}

function errorJson(
  type: AnthropicErrorBody["error"]["type"],
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(errorBody(type, message), { status });
}

/**
 * Pull plain text out of an Anthropic content array. The Messages API
 * lets `content` be either a raw `string` or an array of structured
 * blocks; for the user-message we forward downstream, we concatenate
 * text-block bodies and drop tool/image blocks. (Tool-result round-trip
 * is the spec D3 concern — out of scope for PR-1.)
 */
function extractText(content: AnthropicMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "text") {
      parts.push(block.text);
    }
  }
  return parts.join("");
}

function isAnthropicMessagesRequest(v: unknown): v is AnthropicMessagesRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.model === "string" &&
    Array.isArray(r.messages) &&
    typeof r.max_tokens === "number"
  );
}

function validateRequest(
  body: unknown,
):
  | { ok: true; req: AnthropicMessagesRequest }
  | { ok: false; status: number; message: string } {
  if (!isAnthropicMessagesRequest(body)) {
    return {
      ok: false,
      status: 400,
      message:
        "Request body must be an Anthropic Messages API object with `model`, `messages`, and `max_tokens`.",
    };
  }
  if (body.messages.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "messages must not be empty.",
    };
  }
  const last = body.messages[body.messages.length - 1];
  if (!last || last.role !== "user") {
    return {
      ok: false,
      status: 400,
      message:
        "The final entry in messages must have role 'user' (the current turn).",
    };
  }
  if (body.max_tokens <= 0 || !Number.isFinite(body.max_tokens)) {
    return {
      ok: false,
      status: 400,
      message: "max_tokens must be a positive integer.",
    };
  }
  return { ok: true, req: body };
}

/**
 * Map a lifed-ws error code (yielded as a CanonicalAgentEvent.error) to
 * an HTTP status. Used by the non-stream code path; the streaming path
 * lets the canonical→SSE translator surface errors as `event: error`
 * inside the stream instead.
 */
function statusFromLifedErrorCode(code: string): number {
  if (code.startsWith("lifed-ws.auth")) return 401;
  if (code.startsWith("lifed-ws.ip_blocked")) return 403;
  if (code === "lifed-ws.aborted") return 499; // client-cancelled
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
    if (typeof s === "number") {
      // The lifegw HTTP/JSON wrapper already maps tonic codes to HTTP
      // statuses (see `crates/life-runtime/lifegw/src/services/agent_http.rs`),
      // so we just forward what it returned.
      return s;
    }
  }
  return 502;
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
    return errorJson(
      "invalid_request_error",
      `Failed to parse JSON body: ${(err as Error).message}`,
      400,
    );
  }
  const validated = validateRequest(body);
  if (!validated.ok) {
    return errorJson(
      "invalid_request_error",
      validated.message,
      validated.status,
    );
  }
  const messagesRequest = validated.req;

  // 2. Resolve model.
  const resolved = resolveModel(messagesRequest.model);
  if (!resolved) {
    return errorJson(
      "invalid_request_error",
      `model_not_supported: ${messagesRequest.model}`,
      400,
    );
  }

  // 3. Resolve auth (header bearer first, then Neon Auth session).
  const auth = await resolveEdgeAuth(req);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const authCtx: EdgeAuthContext = auth;

  // 4. Confirm lifegw is configured. In dev without LIFED_GATEWAY_URL
  //    we return 503 rather than silently falling back to InProcess —
  //    this is the external edge surface; in-process makes no sense
  //    here (no auth chain, no observability, no billing).
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return errorJson(
      "api_error",
      "lifegw is not configured for this deployment (LIFED_GATEWAY_URL unset).",
      503,
    );
  }

  // 5. Compute sticky session id.
  const sid = buildStickySessionId(messagesRequest.messages);

  // 6. Construct the lifed WS client.
  const client = testClientFactory
    ? testClientFactory(baseUrl)
    : new LifedWsAgentSessionClient({ baseUrl });

  // 7. Open the lifed session (resume sticky sid if it already exists,
  //    else lifed creates fresh).
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
    const type =
      status === 401 || status === 403
        ? "authentication_error"
        : status === 429
          ? "rate_limit_error"
          : status >= 500
            ? "api_error"
            : "invalid_request_error";
    return errorJson(type, `Failed to open lifed session: ${message}`, status);
  }

  // 8. Open the streaming turn. PR-1 uses per-turn mode — each
  //    request opens a single-turn stream and closes. Multi-turn
  //    continuity is provided by the sticky sid + lifed's session
  //    cache, not by an open WS that spans HTTP requests.
  const lastMessage =
    messagesRequest.messages[messagesRequest.messages.length - 1];
  const latestUserText = extractText(lastMessage.content);
  const requestId = `msg_${randomId()}`;

  const streamIter = client.stream({
    sessionId: sid,
    agentId: `user:${authCtx.userId}`,
    projectSlug: authCtx.projectId,
    userMessage: latestUserText,
    history: [], // lifed accumulates server-side via the sticky sid.
    kernelCtx: {
      sessionId: sid,
      agentId: `user:${authCtx.userId}`,
    },
    capability: {
      token: authCtx.tier1Token,
      // expiresAt is informational on the client; lifegw owns enforcement.
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 15,
    },
    signal: req.signal,
  });

  // 9. Either stream as SSE or buffer for non-stream response.
  if (messagesRequest.stream === true) {
    const sseBody = canonicalToAnthropicSse(
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

  // Non-stream: buffer the canonical events into a single JSON response.
  return await bufferToNonStreamResponse(
    streamIter,
    resolved.anthropicId,
    requestId,
  );
}

// ---------------------------------------------------------------------------
// Non-stream buffering — collects all events into a single JSON envelope.
// ---------------------------------------------------------------------------

async function bufferToNonStreamResponse(
  events: AsyncIterable<CanonicalAgentEvent>,
  modelId: string,
  requestId: string,
): Promise<Response> {
  const content: Array<
    AnthropicTextContentBlock | AnthropicToolUseContentBlock
  > = [];
  let textBuffer = "";
  let stopReason: AnthropicStopReason = "end_turn";
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
          // Flush any buffered text before recording the tool block.
          if (textBuffer.length > 0) {
            content.push({ type: "text", text: textBuffer });
            textBuffer = "";
          }
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = ev.call.inputJson
              ? (JSON.parse(ev.call.inputJson) as Record<string, unknown>)
              : {};
          } catch {
            parsedInput = {};
          }
          content.push({
            type: "tool_use",
            id: ev.call.callId || `toolu_${randomId()}`,
            name: ev.call.toolName || "unknown_tool",
            input: parsedInput,
          });
          stopReason = "tool_use";
          break;
        }
        case "finish":
          if (ev.usage) {
            inputTokens = ev.usage.inputTokens ?? 0;
            outputTokens = ev.usage.outputTokens ?? 0;
          }
          stopReason = mapFinishReasonForBuffer(ev.reason, stopReason);
          break;
        case "error": {
          // Mid-stream lifed error — surface as a non-2xx Anthropic
          // error envelope.
          const status = statusFromLifedErrorCode(ev.code || "");
          const type =
            status === 401 || status === 403
              ? "authentication_error"
              : status === 429
                ? "rate_limit_error"
                : "api_error";
          return errorJson(
            type,
            ev.message || ev.code || "lifed-ws stream errored",
            status,
          );
        }
        default:
          // Telemetry events — ignore for the non-stream response.
          break;
      }
    }
  } catch (err) {
    return errorJson(
      "api_error",
      `lifed-ws stream failed: ${(err as Error).message}`,
      500,
    );
  }

  if (textBuffer.length > 0) {
    content.push({ type: "text", text: textBuffer });
  }

  const resp: AnthropicMessagesResponse = {
    id: requestId,
    type: "message",
    role: "assistant",
    content,
    model: modelId,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
  return NextResponse.json(resp, { status: 200 });
}

function mapFinishReasonForBuffer(
  reason: string | undefined,
  current: AnthropicStopReason,
): AnthropicStopReason {
  switch (reason) {
    case "stop":
    case "end_turn":
      return current === "tool_use" ? "tool_use" : "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "tool_use":
      return "tool_use";
    default:
      return current;
  }
}

function randomId(): string {
  // 22 url-safe-ish chars — collision-resistant enough for ids that
  // are only meaningful within a single request lifecycle.
  return (
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  );
}
