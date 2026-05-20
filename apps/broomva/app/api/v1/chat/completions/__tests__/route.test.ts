// Integration tests for POST /api/v1/chat/completions.
//
// Mirrors the PR-1 pattern in `/api/v1/messages/__tests__/route.test.ts`.
//
// We mock:
//   - `LifedWsAgentSessionClient` — via the
//     `__setSessionClientFactoryForTests` seam exported from the route module.
//   - `@/lib/auth` — `getSafeSession` returns whatever the test sets.
//   - `@/lib/ai/vault/jwt` — `verifyLifeJWT` returns a fake claim or null.
//   - `@/lib/auth/lifegw-jwt` — `mintTier1ForConsumer` returns a fake cap.
//
// File under test: ../route.ts

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSafeSession: vi.fn(),
  verifyLifeJWT: vi.fn(),
  mintTier1ForConsumer: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSafeSession: mocks.getSafeSession,
  hasNeonAuth: false,
  auth: {},
}));

vi.mock("@/lib/ai/vault/jwt", () => ({
  verifyLifeJWT: mocks.verifyLifeJWT,
  JWT_ACCESS_EXPIRY_MS: 24 * 60 * 60 * 1000,
  JWT_REFRESH_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  generateRefreshToken: () => "ref",
  hashRefreshToken: (s: string) => s,
  signLifeJWT: async () => "fake-jwt",
}));

vi.mock("@/lib/auth/lifegw-jwt", () => ({
  mintTier1ForConsumer: mocks.mintTier1ForConsumer,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockGetSafeSession = mocks.getSafeSession;
const mockVerifyLifeJWT = mocks.verifyLifeJWT;
const mockMintTier1 = mocks.mintTier1ForConsumer;

import type { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import type {
  AgentStreamInput,
  CanonicalAgentEvent,
} from "@/lib/life-runtime/agent-session/types";
// 3. Bring in the route AFTER all mocks are registered.
import { __setSessionClientFactoryForTests, POST } from "../route";

// ---------------------------------------------------------------------------
// Fake LifedWsAgentSessionClient
// ---------------------------------------------------------------------------

interface FakeOpts {
  events?: CanonicalAgentEvent["event"][];
  createSessionError?: Error;
  createSessionCalls?: Array<{ resumeSid?: string; userId: string }>;
  streamCalls?: AgentStreamInput[];
}

function makeFakeClient(opts: FakeOpts): LifedWsAgentSessionClient {
  const events = opts.events ?? [
    { kind: "token", delta: "Hello!" },
    { kind: "finish", reason: "stop" },
  ];
  const fake = {
    backendId: "lifed-ws" as const,
    async createSession(input: {
      capability: { token: string };
      userId: string;
      projectSlug: string;
      resumeSid?: string;
    }) {
      if (opts.createSessionError) throw opts.createSessionError;
      opts.createSessionCalls?.push({
        resumeSid: input.resumeSid,
        userId: input.userId,
      });
      return {
        sid: input.resumeSid ?? "fresh-sid",
        agentId: `agent_${input.userId}`,
        userId: input.userId,
        projectId: input.projectSlug,
        createdAtUnix: Math.floor(Date.now() / 1000),
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
  };
  return fake as unknown as LifedWsAgentSessionClient;
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): import("next/server").NextRequest {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  };
  return new Request(
    "https://broomva.tech/api/v1/chat/completions",
    init,
  ) as unknown as import("next/server").NextRequest;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGetSafeSession.mockReset();
  mockVerifyLifeJWT.mockReset();
  mockMintTier1.mockReset();
  mockGetSafeSession.mockResolvedValue({ data: null, error: null });
  mockVerifyLifeJWT.mockResolvedValue(null);
  mockMintTier1.mockResolvedValue({
    token: "fake-tier1-token",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  });
  vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.example.test");
});

afterEach(() => {
  __setSessionClientFactoryForTests(undefined);
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — auth", () => {
  it("returns 401 with OpenAI error envelope when no auth", async () => {
    const req = makeRequest({
      model: "claude-3.5-sonnet",
      messages: [{ role: "user", content: "Hi" }],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as {
      error: { message: string; type: string; code?: string };
    };
    // OpenAI shape: top-level `error` object, NOT `{type, error}` (Anthropic).
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe("authentication_error");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 401 when bearer token verification fails", async () => {
    mockVerifyLifeJWT.mockResolvedValue(null);
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
      },
      { authorization: "Bearer bad-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as { error: { type: string } };
    expect(body.error.type).toBe("authentication_error");
  });

  it("accepts valid bearer token and proceeds to lifed", async () => {
    mockVerifyLifeJWT.mockResolvedValue({
      sub: "user_alice",
      email: "alice@test",
    });
    const createSessionCalls: Array<{ resumeSid?: string; userId: string }> =
      [];
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({ createSessionCalls }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
      },
      { authorization: "Bearer good-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(createSessionCalls).toHaveLength(1);
    expect(createSessionCalls[0].userId).toBe("user_alice");
    expect(mockMintTier1).toHaveBeenCalledWith({
      consumer: { kind: "user", id: "user_alice" },
      projectSlug: "default",
    });
  });

  it("accepts Neon Auth session when no bearer header is present", async () => {
    mockGetSafeSession.mockResolvedValue({
      data: { user: { id: "user_bob", email: "bob@test" } },
      error: null,
    });
    const createSessionCalls: Array<{ resumeSid?: string; userId: string }> =
      [];
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({ createSessionCalls }),
    );
    const req = makeRequest({
      model: "claude-3.5-sonnet",
      messages: [{ role: "user", content: "Hi" }],
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(createSessionCalls[0].userId).toBe("user_bob");
  });
});

// ---------------------------------------------------------------------------
// Model resolution (D2)
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — model resolution", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({
      sub: "user_alice",
      email: "alice@test",
    });
  });

  it("returns 400 with model_not_supported on unknown model", async () => {
    const req = makeRequest(
      {
        model: "claude-9000-imagined",
        messages: [{ role: "user", content: "Hi" }],
      },
      { authorization: "Bearer good-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as {
      error: { message: string; type: string; code?: string };
    };
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBe("model_not_supported");
    expect(body.error.message).toContain("model_not_supported");
    expect(body.error.message).toContain("claude-9000-imagined");
  });

  it("returns 400 model_not_supported for gpt-* (no real GPT backend in PR-2)", async () => {
    const req = makeRequest(
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hi" }],
      },
      { authorization: "Bearer good-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as {
      error: { type: string; code?: string };
    };
    expect(body.error.code).toBe("model_not_supported");
  });

  it("accepts both namespaced and bare Claude model ids", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const baseBody = {
      messages: [{ role: "user", content: "Hi" }],
    };
    const r1 = await POST(
      makeRequest(
        { ...baseBody, model: "anthropic/claude-3.5-sonnet" },
        { authorization: "Bearer x" },
      ),
    );
    const r2 = await POST(
      makeRequest(
        { ...baseBody, model: "claude-3.5-sonnet" },
        { authorization: "Bearer x" },
      ),
    );
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — request validation", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns 400 on empty messages[]", async () => {
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [],
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns 400 when last message is not a user message", async () => {
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns 400 when last message is a tool result (cannot be the final entry)", async () => {
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [
          { role: "user", content: "What time is it?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_x",
                type: "function",
                function: { name: "now", arguments: "{}" },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_x", content: "12:00" },
        ],
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns 400 on missing required field (model)", async () => {
    const req = makeRequest(
      { messages: [{ role: "user", content: "Hi" }] },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns 400 when n > 1 (multi-choice generation not supported)", async () => {
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        n: 3,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as { error: { message: string } };
    expect(body.error.message).toContain("n must be 1");
  });

  it("accepts n=1 (explicit)", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        n: 1,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
  });

  it("returns 400 on invalid max_tokens", async () => {
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 0,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Sticky session id
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — sticky session id", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("re-uses the same sid for two requests with the same prefix", async () => {
    const createSessionCalls: Array<{ resumeSid?: string; userId: string }> =
      [];
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({ createSessionCalls }),
    );

    const sharedPrefix = [
      { role: "user", content: "Tell me about cats." },
      { role: "assistant", content: "Cats are mammals." },
    ];

    await POST(
      makeRequest(
        {
          model: "claude-3.5-sonnet",
          messages: [...sharedPrefix, { role: "user", content: "More?" }],
        },
        { authorization: "Bearer x" },
      ),
    );
    await POST(
      makeRequest(
        {
          model: "claude-3.5-sonnet",
          messages: [
            ...sharedPrefix,
            { role: "user", content: "Different follow-up." },
          ],
        },
        { authorization: "Bearer x" },
      ),
    );

    expect(createSessionCalls).toHaveLength(2);
    expect(createSessionCalls[0].resumeSid).toBeDefined();
    expect(createSessionCalls[0].resumeSid).toBe(
      createSessionCalls[1].resumeSid,
    );
  });
});

// ---------------------------------------------------------------------------
// Non-stream response
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — non-stream response", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns an OpenAI-shape JSON envelope when stream=false (default)", async () => {
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({
        events: [
          { kind: "token", delta: "Hello, " },
          { kind: "token", delta: "world!" },
          {
            kind: "finish",
            reason: "stop",
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
      }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Greet me" }],
        stream: false,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("application/json");
    const body = (await resp.json()) as {
      id: string;
      object: string;
      model: string;
      choices: Array<{
        index: number;
        message: { role: string; content: string | null };
        finish_reason: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("claude-3.5-sonnet");
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0].index).toBe(0);
    expect(body.choices[0].message.role).toBe("assistant");
    expect(body.choices[0].message.content).toBe("Hello, world!");
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage).toBeDefined();
    expect(body.usage!.prompt_tokens).toBe(10);
    expect(body.usage!.completion_tokens).toBe(5);
    expect(body.usage!.total_tokens).toBe(15);
  });

  it("omits usage block when lifed reports no token counts", async () => {
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({
        events: [
          { kind: "token", delta: "ok" },
          { kind: "finish", reason: "stop" },
        ],
      }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    const body = (await resp.json()) as { usage?: unknown };
    expect(body.usage).toBeUndefined();
  });

  it("emits tool_calls in the assistant message when present", async () => {
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({
        events: [
          { kind: "token", delta: "Calling tool: " },
          {
            kind: "tool_call_pending",
            call: {
              callId: "call_xyz",
              toolName: "update_cabin_params",
              inputJson: '{"width":3.5}',
              requestedCapabilities: [],
            },
          },
          { kind: "finish", reason: "tool_use" },
        ],
      }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "make it taller" }],
        stream: false,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    };
    expect(body.choices[0].message.content).toBe("Calling tool: ");
    expect(body.choices[0].message.tool_calls).toBeDefined();
    expect(body.choices[0].message.tool_calls).toHaveLength(1);
    expect(body.choices[0].message.tool_calls![0].id).toBe("call_xyz");
    expect(body.choices[0].message.tool_calls![0].function.name).toBe(
      "update_cabin_params",
    );
    expect(body.choices[0].message.tool_calls![0].function.arguments).toBe(
      '{"width":3.5}',
    );
    expect(body.choices[0].finish_reason).toBe("tool_calls");
  });
});

// ---------------------------------------------------------------------------
// Streaming response
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — streaming response", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns text/event-stream when stream=true", async () => {
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({
        events: [
          { kind: "token", delta: "Hi!" },
          { kind: "finish", reason: "stop" },
        ],
      }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Greet" }],
        stream: true,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/event-stream");
    expect(resp.headers.get("Cache-Control")).toContain("no-cache");

    const text = await resp.text();
    // OpenAI SSE — bare `data:` lines, NO `event:` lines.
    expect(text).not.toContain("event:");
    expect(text).toContain('"role":"assistant"');
    expect(text).toContain('"content":"Hi!"');
    expect(text).toContain('"finish_reason":"stop"');
    // [DONE] sentinel as the terminator.
    expect(text).toContain("data: [DONE]\n\n");
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — error mapping", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns 503 when LIFED_GATEWAY_URL is unset", async () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "");
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(503);
    const body = (await resp.json()) as { error: { type: string } };
    expect(body.error.type).toBe("api_error");
  });

  it("returns 502 when createSession throws a generic error", async () => {
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({
        createSessionError: new Error("connect ECONNREFUSED"),
      }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(502);
  });

  it("returns OpenAI-shape error envelope when lifed yields an error (non-stream)", async () => {
    __setSessionClientFactoryForTests(() =>
      makeFakeClient({
        events: [
          {
            kind: "error",
            code: "lifed-ws.transport_error",
            message: "lifed went away",
          },
          { kind: "finish", reason: "error" },
        ],
      }),
    );
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as {
      error: { message: string; type: string };
    };
    // OpenAI-shape (`{error: {...}}`), NOT Anthropic-shape (`{type:"error", error: {...}}`).
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("lifed went away");
  });
});

// ---------------------------------------------------------------------------
// User message extraction (route → translator integration)
// ---------------------------------------------------------------------------

describe("POST /api/v1/chat/completions — user message extraction", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("forwards the latest user message text to lifed.stream", async () => {
    const streamCalls: AgentStreamInput[] = [];
    __setSessionClientFactoryForTests(() => makeFakeClient({ streamCalls }));
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [
          { role: "system", content: "Be helpful." },
          { role: "user", content: "First question." },
          { role: "assistant", content: "First answer." },
          { role: "user", content: "Latest question." },
        ],
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].userMessage).toBe("Latest question.");
  });

  it("handles array-shaped content with text parts", async () => {
    const streamCalls: AgentStreamInput[] = [];
    __setSessionClientFactoryForTests(() => makeFakeClient({ streamCalls }));
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hi " },
              { type: "text", text: "there." },
            ],
          },
        ],
      },
      { authorization: "Bearer x" },
    );
    await POST(req);
    expect(streamCalls[0].userMessage).toBe("Hi there.");
  });
});
