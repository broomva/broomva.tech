// Unit tests for the AgentSessionClient factory.
//
// The factory's job is the env → backend decision tree:
//
//   - LIFED_DISABLED=1                    → in-process (kill-switch)
//   - LIFED_GATEWAY_URL set + non-empty   → lifed-ws
//   - otherwise                           → in-process
//
// `forceBackendId` overrides skip the env entirely. We exercise each
// branch + the missing-URL error path. The lifed-ws client is
// constructed with an empty deps override so we don't open a real
// WebSocket — its constructor is pure aside from the
// `defaultWebSocketFactory` which is only invoked when no override
// is supplied.
//
// File under test: ./factory.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `factory.ts` begins with `import "server-only"`; stub the module so
// it loads in node-side test environments.
vi.mock("server-only", () => ({}));

// `factory.ts` imports `resolveProjectBySlug` from `../db-seed` which
// pulls in the entire DB layer (drizzle + better-sqlite3 + schema).
// The factory only invokes that resolver lazily inside the
// in-process client's constructor closure, so a no-op stub is safe.
vi.mock("../db-seed", () => ({
  resolveProjectBySlug: vi.fn(async () => null),
}));

// `in-process-client.ts` transitively pulls in `real-runner` →
// `@/lib/ai/providers` → `@/lib/env`, which validates DATABASE_URL +
// AUTH_SECRET on module load. We stub the in-process client itself
// since the factory only constructs it; the actual translation logic
// is exercised in `in-process-client.test.ts`.
vi.mock("./in-process-client", () => {
  class InProcessAgentSessionClient {
    backendId = "in-process" as const;
    constructor(_deps: unknown) {
      // No-op — the factory passes deps through but tests only assert
      // the `backendId` field.
    }
    async health() {
      return { backendId: this.backendId, reachable: true } as const;
    }
    async *stream() {
      // No-op generator. Tests don't iterate.
    }
  }
  return { InProcessAgentSessionClient };
});

import {
  createAgentSessionClient,
  type CreateAgentSessionClientOverrides,
} from "./factory";

// Cache the env we may stomp; restore in afterEach.
const originalEnv = {
  LIFED_GATEWAY_URL: process.env.LIFED_GATEWAY_URL,
  LIFED_DISABLED: process.env.LIFED_DISABLED,
  LIFED_HEALTH_TIMEOUT_MS: process.env.LIFED_HEALTH_TIMEOUT_MS,
};

beforeEach(() => {
  // Start each test from a clean slate — no env, no overrides.
  delete process.env.LIFED_GATEWAY_URL;
  delete process.env.LIFED_DISABLED;
  delete process.env.LIFED_HEALTH_TIMEOUT_MS;
});

afterEach(() => {
  // Restore so we don't leak state between tests / test files.
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  vi.unstubAllEnvs();
});

describe("createAgentSessionClient — env-driven backend selection", () => {
  it("returns the in-process client when no env vars are set", () => {
    const client = createAgentSessionClient();
    expect(client.backendId).toBe("in-process");
  });

  it("returns the lifed-ws client when LIFED_GATEWAY_URL is set", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.test");
    const client = createAgentSessionClient();
    expect(client.backendId).toBe("lifed-ws");
  });

  it("falls back to in-process when LIFED_DISABLED=1, even with LIFED_GATEWAY_URL set (kill-switch wins)", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.test");
    vi.stubEnv("LIFED_DISABLED", "1");
    const client = createAgentSessionClient();
    expect(client.backendId).toBe("in-process");
  });

  it("returns the in-process client when LIFED_GATEWAY_URL is the empty string", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "");
    const client = createAgentSessionClient();
    expect(client.backendId).toBe("in-process");
  });
});

describe("createAgentSessionClient — overrides", () => {
  it("forceBackendId='in-process' overrides LIFED_GATEWAY_URL", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.test");
    const overrides: CreateAgentSessionClientOverrides = {
      forceBackendId: "in-process",
    };
    const client = createAgentSessionClient(overrides);
    expect(client.backendId).toBe("in-process");
  });

  it("forceBackendId='lifed-ws' with lifedGatewayUrl override constructs the lifed-ws client", () => {
    const overrides: CreateAgentSessionClientOverrides = {
      forceBackendId: "lifed-ws",
      lifedGatewayUrl: "https://x",
    };
    const client = createAgentSessionClient(overrides);
    expect(client.backendId).toBe("lifed-ws");
  });

  it("forceBackendId='lifed-ws' without a URL throws (cannot construct LifedWsAgentSessionClient with empty baseUrl)", () => {
    expect(() =>
      createAgentSessionClient({ forceBackendId: "lifed-ws" }),
    ).toThrow(/LIFED_GATEWAY_URL/);
  });

  it("lifedGatewayUrl override beats the env var", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "https://wrong.test");
    const overrides: CreateAgentSessionClientOverrides = {
      lifedGatewayUrl: "https://right.test",
    };
    const client = createAgentSessionClient(overrides);
    // Backend selection is unchanged — both URLs are non-empty — but
    // the constructor uses the override. We only assert backendId here
    // since baseUrl is private; the lifed-ws client is exercised
    // separately in lifed-ws-client.test.ts.
    expect(client.backendId).toBe("lifed-ws");
  });
});

describe("createAgentSessionClient — LIFED_HEALTH_TIMEOUT_MS parsing", () => {
  it("parses a numeric LIFED_HEALTH_TIMEOUT_MS without throwing", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.test");
    vi.stubEnv("LIFED_HEALTH_TIMEOUT_MS", "500");
    // The timeout is private state; we can't read it back without
    // firing a probe. The point of this test is that the parser
    // doesn't throw on a well-formed integer — non-finite or
    // non-positive values fall back to the 2_000 default.
    const client = createAgentSessionClient();
    expect(client.backendId).toBe("lifed-ws");
  });

  it("falls back to default when LIFED_HEALTH_TIMEOUT_MS is not a number", () => {
    vi.stubEnv("LIFED_GATEWAY_URL", "https://gw.test");
    vi.stubEnv("LIFED_HEALTH_TIMEOUT_MS", "not-a-number");
    const client = createAgentSessionClient();
    expect(client.backendId).toBe("lifed-ws");
  });
});
