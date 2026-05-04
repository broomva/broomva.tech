// Unit tests for the lifed-ws-client decoder + close-code policy.
//
// We exercise the *pure* parts of the client via the `_internals`
// export — `decodeAgentEvent`, `parseSeqStrict`, and the
// `TRANSIENT_CLOSE_CODES` set. These tests intentionally do NOT open
// a real WebSocket; the pump path is covered by integration tests
// under tests/relay-* once the lifegw mock substrate ships.
//
// File under test: ./lifed-ws-client.ts

import { describe, expect, it } from "vitest";

// `lifed-ws-client.ts` begins with `import "server-only"`; stub the
// module so it loads in node-side test environments.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { _internals } from "./lifed-ws-client";
import type { AgentStreamInput } from "./types";

const { decodeAgentEvent, parseSeqStrict, TRANSIENT_CLOSE_CODES } = _internals;

// Minimal `AgentStreamInput` stub for ctx-passing into the decoder.
// The decoder only reads `sessionId` (used in the warning fallback),
// so the rest can be empty.
const ctx: AgentStreamInput = {
  sessionId: "sess-test",
  agentId: "agent-test",
  projectSlug: "sentinel",
  userMessage: "",
  history: [],
  kernelCtx: { sessionId: "sess-test", agentId: "agent-test" },
};

// Helper — build a wire `agent_event` frame the decoder expects.
function frame(kind: string, payload: unknown) {
  return {
    kind: "agent_event" as const,
    seq_no: "1",
    record: {
      sequence: "1",
      at: "2026-05-02T00:00:00Z",
      kind,
      payload,
    },
    agent_kind: kind,
  };
}

describe("parseSeqStrict", () => {
  it("parses '0' as 0n", () => {
    expect(parseSeqStrict("0")).toBe(0n);
  });

  it("parses '42' as 42n", () => {
    expect(parseSeqStrict("42")).toBe(42n);
  });

  it("parses very large strings as bigints (beyond Number.MAX_SAFE_INTEGER)", () => {
    const big = parseSeqStrict("99999999999999999999");
    expect(big).toBe(99_999_999_999_999_999_999n);
  });

  it("returns null for non-numeric strings", () => {
    expect(parseSeqStrict("not-a-number")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(parseSeqStrict("")).toBeNull();
  });

  it("returns null for floats", () => {
    expect(parseSeqStrict("3.14")).toBeNull();
  });

  it("returns null for negatives", () => {
    expect(parseSeqStrict("-5")).toBeNull();
  });
});

describe("decodeAgentEvent — TOKEN", () => {
  it("decodes a TOKEN frame with payload.text into a token event", () => {
    const f = frame("AGENT_EVENT_KIND_TOKEN", { text: "hello" });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({ kind: "token", delta: "hello" });
  });

  it("returns null for a TOKEN frame with empty text", () => {
    const f = frame("AGENT_EVENT_KIND_TOKEN", { text: "" });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toBeNull();
  });

  it("falls back to payload.delta when payload.text is absent", () => {
    const f = frame("AGENT_EVENT_KIND_TOKEN", { delta: "world" });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({ kind: "token", delta: "world" });
  });
});

describe("decodeAgentEvent — TOOL_CALL_PENDING", () => {
  it("decodes a TOOL_CALL_PENDING frame with call_id, tool_name, and input", () => {
    const f = frame("AGENT_EVENT_KIND_TOOL_CALL_PENDING", {
      call_id: "call_1",
      tool_name: "note",
      input: { slug: "x", title: "T" },
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "tool_call_pending",
      call: {
        callId: "call_1",
        toolName: "note",
        inputJson: JSON.stringify({ slug: "x", title: "T" }),
        requestedCapabilities: [],
      },
    });
  });

  it("preserves requested_capabilities when present", () => {
    const f = frame("AGENT_EVENT_KIND_TOOL_CALL_PENDING", {
      call_id: "call_2",
      tool_name: "note",
      input: {},
      requested_capabilities: ["fs.write"],
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "tool_call_pending",
      call: {
        callId: "call_2",
        toolName: "note",
        inputJson: "{}",
        requestedCapabilities: ["fs.write"],
      },
    });
  });
});

describe("decodeAgentEvent — TOOL_RESULT", () => {
  it("decodes a TOOL_RESULT frame with is_error: true", () => {
    const f = frame("AGENT_EVENT_KIND_TOOL_RESULT", {
      call_id: "call_err",
      tool_name: "note",
      output: { error: "boom" },
      is_error: true,
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "tool_result",
      result: {
        callId: "call_err",
        toolName: "note",
        outputJson: JSON.stringify({ error: "boom" }),
        isError: true,
      },
    });
  });

  it("defaults is_error to false when absent", () => {
    const f = frame("AGENT_EVENT_KIND_TOOL_RESULT", {
      call_id: "call_ok",
      tool_name: "note",
      output: { ok: true },
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toMatchObject({
      kind: "tool_result",
      result: { isError: false },
    });
  });
});

describe("decodeAgentEvent — FINISH", () => {
  it("decodes a FINISH frame with usage into a finish event preserving usage fields", () => {
    const f = frame("AGENT_EVENT_KIND_FINISH", {
      finish_reason: "stop",
      usage: {
        input_tokens: 123,
        output_tokens: 45,
        cost_cents: 7,
      },
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "finish",
      reason: "stop",
      usage: {
        inputTokens: 123,
        outputTokens: 45,
        costCents: 7,
      },
    });
  });

  it("decodes a FINISH frame without usage", () => {
    const f = frame("AGENT_EVENT_KIND_FINISH", { reason: "stop" });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "finish",
      reason: "stop",
      usage: undefined,
    });
  });
});

describe("decodeAgentEvent — ERROR", () => {
  it("decodes an ERROR frame with code + message", () => {
    const f = frame("AGENT_EVENT_KIND_ERROR", {
      code: "lifed.timeout",
      message: "ran out of time",
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "error",
      code: "lifed.timeout",
      message: "ran out of time",
    });
  });

  it("falls back to default code/message when fields absent", () => {
    const f = frame("AGENT_EVENT_KIND_ERROR", {});
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "error",
      code: "lifed.error",
      message: "unknown error",
    });
  });
});

describe("decodeAgentEvent — HIBERNATE", () => {
  it("decodes a HIBERNATE frame into a warning with code 'lifed.hibernate'", () => {
    const f = frame("AGENT_EVENT_KIND_HIBERNATE", {});
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toMatchObject({
      kind: "warning",
      code: "lifed.hibernate",
    });
  });
});

describe("decodeAgentEvent — APPROVAL_REQUIRED", () => {
  it("decodes an APPROVAL_REQUIRED frame with dispatch_id + preview", () => {
    const f = frame("AGENT_EVENT_KIND_APPROVAL_REQUIRED", {
      dispatch_id: "disp_1",
      preview: "delete /etc/hosts",
    });
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toEqual({
      kind: "approval_required",
      dispatchId: "disp_1",
      preview: "delete /etc/hosts",
    });
  });
});

describe("decodeAgentEvent — UNKNOWN", () => {
  it("returns a warning event for an unknown kind", () => {
    const f = {
      ...frame("AGENT_EVENT_KIND_FUTURE", {}),
      agent_kind: "AGENT_EVENT_KIND_FUTURE",
    };
    const decoded = decodeAgentEvent(f, ctx);
    expect(decoded).toMatchObject({
      kind: "warning",
      code: "lifed-ws.unknown_kind",
    });
    // The session id should be threaded into the warning message so
    // operators can correlate.
    expect((decoded as { message: string }).message).toContain(
      "sess-test",
    );
  });
});

describe("createSession (Stage 3a)", () => {
  // Setup: import the class lazily here so the `vi.mock("server-only")`
  // above takes effect before module evaluation, then construct an
  // instance with an injected `fetch` so we can probe the request shape
  // and stub responses without a network call.
  const importClient = async () => {
    const m = await import("./lifed-ws-client");
    return m.LifedWsAgentSessionClient;
  };

  // No-op WebSocket factory so the constructor doesn't trip the
  // "no WebSocket impl" guard when `globalThis.WebSocket` is missing.
  const noopWsFactory = () =>
    ({
      readyState: 0,
      send: () => {},
      close: () => {},
      addEventListener: () => {},
    }) as unknown as ReturnType<typeof Object>;

  it("POSTs to /v1/agent/create_session with the Tier-1 bearer + JSON body", async () => {
    const Cls = await importClient();
    const captured: { url?: string; init?: RequestInit } = {};
    const stubFetch: typeof fetch = async (url, init) => {
      captured.url = url as string;
      captured.init = init;
      return new Response(
        JSON.stringify({
          sid: "lifed_sid_001",
          agent_id: "agent_x",
          user_id: "alice",
          project_id: "sentinel",
          created_at_unix: 1_777_900_000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const client = new Cls({
      baseUrl: "https://lifegw.test",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    const out = await client.createSession({
      capability: { token: "tok_xyz" },
      userId: "alice",
      projectSlug: "sentinel",
      label: "smoke",
    });
    expect(out.sid).toBe("lifed_sid_001");
    expect(out.agentId).toBe("agent_x");
    expect(out.userId).toBe("alice");
    expect(out.projectId).toBe("sentinel");
    expect(out.createdAtUnix).toBe(1_777_900_000);

    // Wire-shape assertions.
    expect(captured.url).toBe(
      "https://lifegw.test/v1/agent/create_session",
    );
    expect(captured.init?.method).toBe("POST");
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_xyz");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(captured.init?.body as string);
    expect(body).toEqual({
      user_id: "alice",
      project_id: "sentinel",
      label: "smoke",
    });
  });

  it("omits empty optional fields from the request body", async () => {
    const Cls = await importClient();
    const captured: { body?: string } = {};
    const stubFetch: typeof fetch = async (_url, init) => {
      captured.body = init?.body as string;
      return new Response(
        JSON.stringify({ sid: "x", agent_id: "y" }),
        { status: 200 },
      );
    };
    const client = new Cls({
      baseUrl: "https://lifegw.test",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    await client.createSession({
      capability: { token: "t" },
      userId: "alice",
      projectSlug: "sentinel",
      // no label, no resumeSid
    });
    const body = JSON.parse(captured.body as string);
    expect(body).toEqual({ user_id: "alice", project_id: "sentinel" });
    expect(body).not.toHaveProperty("label");
    expect(body).not.toHaveProperty("resume_sid");
  });

  it("throws LifedCreateSessionError on non-2xx with httpStatus + code populated", async () => {
    const Cls = await importClient();
    const { LifedCreateSessionError } = await import("./lifed-ws-client");
    const stubFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "missing Tier-1 bearer" }), {
        status: 401,
      });
    const client = new Cls({
      baseUrl: "https://lifegw.test",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    await expect(
      client.createSession({
        capability: { token: "stale" },
        userId: "alice",
        projectSlug: "sentinel",
      }),
    ).rejects.toMatchObject({
      name: "LifedCreateSessionError",
      code: "lifed-ws.create_session.http_401",
      httpStatus: 401,
    });
    // `instanceof` check for completeness — the import path is unique
    // even with hot-reload.
    try {
      await client.createSession({
        capability: { token: "stale" },
        userId: "alice",
        projectSlug: "sentinel",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(LifedCreateSessionError);
    }
  });

  it("throws on network failure with code='fetch_failed'", async () => {
    const Cls = await importClient();
    const stubFetch: typeof fetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = new Cls({
      baseUrl: "https://lifegw.test",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    await expect(
      client.createSession({
        capability: { token: "t" },
        userId: "alice",
        projectSlug: "sentinel",
      }),
    ).rejects.toMatchObject({
      name: "LifedCreateSessionError",
      code: "lifed-ws.create_session.fetch_failed",
    });
  });

  it("throws on missing 'sid' in the response body", async () => {
    const Cls = await importClient();
    const stubFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ agent_id: "no-sid-here" }), {
        status: 200,
      });
    const client = new Cls({
      baseUrl: "https://lifegw.test",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    await expect(
      client.createSession({
        capability: { token: "t" },
        userId: "alice",
        projectSlug: "sentinel",
      }),
    ).rejects.toMatchObject({
      code: "lifed-ws.create_session.missing_sid",
    });
  });

  it("throws on non-JSON response with code='bad_response_body'", async () => {
    const Cls = await importClient();
    const stubFetch: typeof fetch = async () =>
      new Response("not json at all", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    const client = new Cls({
      baseUrl: "https://lifegw.test",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    await expect(
      client.createSession({
        capability: { token: "t" },
        userId: "alice",
        projectSlug: "sentinel",
      }),
    ).rejects.toMatchObject({
      code: "lifed-ws.create_session.bad_response_body",
    });
  });

  it("strips trailing slashes from baseUrl when constructing the URL", async () => {
    const Cls = await importClient();
    const captured: { url?: string } = {};
    const stubFetch: typeof fetch = async (url) => {
      captured.url = url as string;
      return new Response(JSON.stringify({ sid: "x" }), { status: 200 });
    };
    const client = new Cls({
      baseUrl: "https://lifegw.test///",
      fetchFn: stubFetch,
      // biome-ignore lint/suspicious/noExplicitAny: test-only factory
      webSocketFactory: noopWsFactory as any,
    });
    await client.createSession({
      capability: { token: "t" },
      userId: "alice",
      projectSlug: "sentinel",
    });
    expect(captured.url).toBe("https://lifegw.test/v1/agent/create_session");
  });
});

describe("TRANSIENT_CLOSE_CODES", () => {
  it("includes the 4 codes Spec C₃ §6.5 marks as transient", () => {
    // 4002 — backpressure
    // 4004 — lifed-down
    // 1011 — internal
    // 1001 — going-away
    expect(TRANSIENT_CLOSE_CODES.has(4002)).toBe(true);
    expect(TRANSIENT_CLOSE_CODES.has(4004)).toBe(true);
    expect(TRANSIENT_CLOSE_CODES.has(1011)).toBe(true);
    expect(TRANSIENT_CLOSE_CODES.has(1001)).toBe(true);
  });

  it("does NOT include codes that should be treated as terminal", () => {
    // 1008 — auth (terminal — caller must re-auth)
    // 4003 — ip-blocked (terminal — caller must contact ops)
    // 4005 — sequence-retired (terminal — caller must restart from 0)
    expect(TRANSIENT_CLOSE_CODES.has(1008)).toBe(false);
    expect(TRANSIENT_CLOSE_CODES.has(4003)).toBe(false);
    expect(TRANSIENT_CLOSE_CODES.has(4005)).toBe(false);
  });
});
