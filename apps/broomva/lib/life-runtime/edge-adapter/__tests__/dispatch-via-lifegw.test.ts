// Unit tests for `dispatchViaLifegw`. We mock the JWT mint + the
// `LifedWsAgentSessionClient` constructor (via the test-only
// `clientFactory` injection point) so the dispatcher runs without
// needing a real lifegw deployment.
//
// File under test: ../dispatch-via-lifegw.ts

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  mintTier1ForConsumer: vi.fn(),
}));

vi.mock("@/lib/auth/lifegw-jwt", () => ({
  mintTier1ForConsumer: mocks.mintTier1ForConsumer,
}));

import type { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import type {
  AgentStreamInput,
  CanonicalAgentEvent,
} from "@/lib/life-runtime/agent-session/types";
import { dispatchViaLifegw } from "../dispatch-via-lifegw";

interface FakeOpts {
  createSessionCalls?: Array<{
    resumeSid?: string;
    userId: string;
    capability: { token: string };
    projectSlug: string;
  }>;
  streamCalls?: AgentStreamInput[];
  events?: CanonicalAgentEvent["event"][];
}

function makeFakeClient(opts: FakeOpts): LifedWsAgentSessionClient {
  const events = opts.events ?? [
    { kind: "token", delta: "hi" },
    { kind: "finish", reason: "stop" },
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
        projectSlug: input.projectSlug,
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

beforeEach(() => {
  mocks.mintTier1ForConsumer.mockReset();
  mocks.mintTier1ForConsumer.mockResolvedValue({
    token: "fake-tier1-token",
    expiresAt: Math.floor(Date.now() / 1000) + 900,
  });
  vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dispatchViaLifegw — happy path", () => {
  it("mints Tier-1 for an authenticated user and forwards the sticky sid", async () => {
    const createSessionCalls: FakeOpts["createSessionCalls"] = [];
    const streamCalls: FakeOpts["streamCalls"] = [];
    const handle = await dispatchViaLifegw({
      stickySid: "chat_abc_uuid",
      userMessage: "hello",
      consumer: { kind: "user", id: "user_alice" },
      clientFactory: () => makeFakeClient({ createSessionCalls, streamCalls }),
    });

    expect(mocks.mintTier1ForConsumer).toHaveBeenCalledWith({
      consumer: { kind: "user", id: "user_alice" },
      projectSlug: "default",
    });
    expect(createSessionCalls).toHaveLength(1);
    expect(createSessionCalls![0]).toMatchObject({
      resumeSid: "chat_abc_uuid",
      userId: "user_alice",
      projectSlug: "default",
      capability: { token: "fake-tier1-token" },
    });
    // Consume the iterator — stream() doesn't execute until consumed.
    const out: CanonicalAgentEvent[] = [];
    for await (const ev of handle.events) out.push(ev);
    expect(out.length).toBeGreaterThan(0);

    expect(streamCalls).toHaveLength(1);
    expect(streamCalls![0]).toMatchObject({
      sessionId: "chat_abc_uuid",
      agentId: "user:user_alice",
      projectSlug: "default",
      userMessage: "hello",
    });
    expect(handle.sessionId).toBe("chat_abc_uuid");
  });

  it("uses an anon consumer when no userId is present", async () => {
    const createSessionCalls: FakeOpts["createSessionCalls"] = [];
    const streamCalls: FakeOpts["streamCalls"] = [];
    const handle = await dispatchViaLifegw({
      stickySid: "chat_anon_uuid",
      userMessage: "hi from anon",
      consumer: { kind: "anon", id: "anon-session-abc" },
      clientFactory: () => makeFakeClient({ createSessionCalls, streamCalls }),
    });

    // Drain the iterator so stream() actually runs and populates calls.
    for await (const _ of handle.events) {
      void _;
    }

    expect(mocks.mintTier1ForConsumer).toHaveBeenCalledWith({
      consumer: { kind: "anon", id: "anon-session-abc" },
      projectSlug: "default",
    });
    expect(createSessionCalls![0].userId).toBe("anon:anon-session-abc");
    expect(streamCalls![0].agentId).toBe("user:anon:anon-session-abc");
  });

  it("forwards a custom project slug when supplied", async () => {
    const createSessionCalls: FakeOpts["createSessionCalls"] = [];
    await dispatchViaLifegw({
      stickySid: "chat_x",
      userMessage: "hello",
      consumer: { kind: "user", id: "user_bob" },
      projectSlug: "exclusive-rentals",
      clientFactory: () => makeFakeClient({ createSessionCalls }),
    });
    expect(createSessionCalls![0].projectSlug).toBe("exclusive-rentals");
    expect(mocks.mintTier1ForConsumer).toHaveBeenCalledWith({
      consumer: { kind: "user", id: "user_bob" },
      projectSlug: "exclusive-rentals",
    });
  });
});

describe("dispatchViaLifegw — failure modes", () => {
  it("throws a typed error when LIFED_GATEWAY_URL is unset", async () => {
    vi.unstubAllEnvs();
    await expect(
      dispatchViaLifegw({
        stickySid: "chat_y",
        userMessage: "hello",
        consumer: { kind: "user", id: "user_x" },
        clientFactory: () => makeFakeClient({}),
      }),
    ).rejects.toThrow(/LIFED_GATEWAY_URL/);
  });

  it("propagates mint failures", async () => {
    mocks.mintTier1ForConsumer.mockRejectedValueOnce(
      new Error("mint failed: signing key missing"),
    );
    await expect(
      dispatchViaLifegw({
        stickySid: "chat_m",
        userMessage: "hi",
        consumer: { kind: "user", id: "user_x" },
        clientFactory: () => makeFakeClient({}),
      }),
    ).rejects.toThrow(/signing key missing/);
  });

  it("propagates createSession failures", async () => {
    const fake = {
      backendId: "lifed-ws" as const,
      async createSession() {
        throw new Error("lifegw refused: HTTP 401");
      },
      async sendMessage() {},
      async health() {
        return { backendId: "lifed-ws", reachable: true };
      },
      async *stream() {},
    } as unknown as LifedWsAgentSessionClient;
    await expect(
      dispatchViaLifegw({
        stickySid: "chat_s",
        userMessage: "hi",
        consumer: { kind: "user", id: "user_x" },
        clientFactory: () => fake,
      }),
    ).rejects.toThrow(/HTTP 401/);
  });
});
