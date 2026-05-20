// Integration tests for POST /api/v1/messages.
//
// We mock:
//   - `LifedWsAgentSessionClient` — via the `__setSessionClientFactoryForTests`
//     seam exported from the route module.
//   - `@/lib/auth` — `getSafeSession` returns whatever the test sets.
//   - `@/lib/ai/vault/jwt` — `verifyLifeJWT` returns a fake claim or null.
//   - `@/lib/auth/lifegw-jwt` — `mintTier1ForConsumer` returns a fake cap.
//
// The mocks let us exercise the full route handler without standing up
// lifegw, Neon Auth, or the JWT signer.
//
// File under test: ../route.ts

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// 1. Auth-related modules. Each must be mocked BEFORE the route imports
//    them at module load time. The vi.mock factory hoists to the top
//    of the file, so the mock functions must be created INSIDE the
//    factory and then re-exported via `vi.hoisted` for per-test
//    overrides. `vi.hoisted` is the documented escape hatch for
//    shared state across hoisted factories.
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

// 2. `next/headers` — `getSafeSession`'s mock above doesn't actually
//    use the headers, but the route awaits `headers()` regardless.
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

// Aliases for legibility — these still point at the same vi.fn instances
// the mocks were registered with.
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
  /** Events the stream should yield. Defaults to a single token + finish. */
  events?: CanonicalAgentEvent["event"][];
  /** If set, createSession throws this. */
  createSessionError?: Error;
  /** Captured createSession input — populated on call. */
  createSessionCalls?: Array<{ resumeSid?: string; userId: string }>;
  /** Captured stream input — populated on call. */
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
  // NextRequest extends Request — we cast to satisfy the route's
  // `NextRequest` parameter type. The route only reads `.headers`,
  // `.json()`, and `.signal`, all of which Request supports.
  return new Request(
    "https://broomva.tech/api/v1/messages",
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
  // Default behaviours — overridden per-test as needed.
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
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/messages — auth", () => {
  it("returns 401 with Anthropic error envelope when no auth", async () => {
    const req = makeRequest({
      model: "claude-3.5-sonnet",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 100,
    });
    const resp = await POST(req);
    expect(resp.status).toBe(401);
    const body = (await resp.json()) as {
      type: string;
      error: { type: string; message: string };
    };
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 401 when bearer token verification fails", async () => {
    mockVerifyLifeJWT.mockResolvedValue(null);
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 100,
      },
      { authorization: "Bearer bad-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(401);
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
        max_tokens: 100,
      },
      { authorization: "Bearer good-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(createSessionCalls).toHaveLength(1);
    expect(createSessionCalls[0].userId).toBe("user_alice");
    // mintTier1 was called to convert the HS256 caller token into the
    // ES256 lifegw cap.
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
      max_tokens: 100,
    });
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(createSessionCalls[0].userId).toBe("user_bob");
  });
});

describe("POST /api/v1/messages — model resolution", () => {
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
        max_tokens: 100,
      },
      { authorization: "Bearer good-token" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as {
      type: string;
      error: { type: string; message: string };
    };
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("model_not_supported");
    expect(body.error.message).toContain("claude-9000-imagined");
  });

  it("accepts both namespaced and bare model ids", async () => {
    __setSessionClientFactoryForTests(() => makeFakeClient({}));
    const baseBody = {
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 100,
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

describe("POST /api/v1/messages — request validation", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns 400 on empty messages[]", async () => {
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [],
        max_tokens: 100,
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
        max_tokens: 100,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });

  it("returns 400 on missing required field", async () => {
    const req = makeRequest(
      { model: "claude-3.5-sonnet" },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(400);
  });
});

describe("POST /api/v1/messages — sticky session id", () => {
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
          max_tokens: 100,
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
          max_tokens: 100,
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

describe("POST /api/v1/messages — non-stream response", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns an Anthropic-shape JSON envelope when stream=false", async () => {
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
        max_tokens: 100,
        stream: false,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("application/json");
    const body = (await resp.json()) as {
      type: string;
      role: string;
      content: Array<{ type: string; text?: string }>;
      model: string;
      stop_reason: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    expect(body.type).toBe("message");
    expect(body.role).toBe("assistant");
    expect(body.content).toHaveLength(1);
    expect(body.content[0].type).toBe("text");
    expect(body.content[0].text).toBe("Hello, world!");
    expect(body.model).toBe("claude-3.5-sonnet");
    expect(body.stop_reason).toBe("end_turn");
    expect(body.usage.input_tokens).toBe(10);
    expect(body.usage.output_tokens).toBe(5);
  });
});

describe("POST /api/v1/messages — streaming response", () => {
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
        max_tokens: 100,
        stream: true,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/event-stream");
    expect(resp.headers.get("Cache-Control")).toContain("no-cache");

    // Drain the body and confirm it contains the expected Anthropic event names.
    const text = await resp.text();
    expect(text).toContain("event: message_start");
    expect(text).toContain("event: content_block_start");
    expect(text).toContain("event: content_block_delta");
    expect(text).toContain("event: content_block_stop");
    expect(text).toContain("event: message_delta");
    expect(text).toContain("event: message_stop");
    expect(text).toContain('"text":"Hi!"');
  });
});

describe("POST /api/v1/messages — error mapping", () => {
  beforeEach(() => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user_alice", email: "" });
  });

  it("returns 503 when LIFED_GATEWAY_URL is unset", async () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "");
    const req = makeRequest(
      {
        model: "claude-3.5-sonnet",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 100,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(503);
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
        max_tokens: 100,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBe(502);
  });

  it("returns a non-2xx Anthropic error envelope when lifed yields an error event (non-stream path)", async () => {
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
        max_tokens: 100,
        stream: false,
      },
      { authorization: "Bearer x" },
    );
    const resp = await POST(req);
    expect(resp.status).toBeGreaterThanOrEqual(400);
    const body = (await resp.json()) as { type: string; error: unknown };
    expect(body.type).toBe("error");
  });
});
