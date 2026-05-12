import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkTelemetryRateLimit } from "./rate-limit";

function makeReq(ip?: string) {
  const headers = new Headers();
  if (ip) headers.set("x-forwarded-for", ip);
  return new Request("http://localhost/", { headers });
}

describe("checkTelemetryRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-05-09T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("anonymous bucket allows up to 60 calls per IP per minute", () => {
    const req = makeReq("1.2.3.4");
    for (let i = 0; i < 60; i++) {
      const r = checkTelemetryRateLimit({ request: req, userId: null });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(60 - 1 - i);
    }
    const blocked = checkTelemetryRateLimit({ request: req, userId: null });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  test("authenticated bucket allows up to 600 calls per userId per minute", () => {
    const req = makeReq();
    for (let i = 0; i < 600; i++) {
      const r = checkTelemetryRateLimit({ request: req, userId: "u_42" });
      expect(r.allowed).toBe(true);
    }
    const blocked = checkTelemetryRateLimit({ request: req, userId: "u_42" });
    expect(blocked.allowed).toBe(false);
  });

  test("different IPs get separate buckets", () => {
    for (let i = 0; i < 60; i++) {
      checkTelemetryRateLimit({ request: makeReq("9.9.9.9"), userId: null });
    }
    // First IP exhausted
    expect(checkTelemetryRateLimit({ request: makeReq("9.9.9.9"), userId: null }).allowed).toBe(false);
    // Second IP fresh
    expect(checkTelemetryRateLimit({ request: makeReq("9.9.9.10"), userId: null }).allowed).toBe(true);
  });

  test("different userIds get separate buckets", () => {
    for (let i = 0; i < 600; i++) {
      checkTelemetryRateLimit({ request: makeReq(), userId: "user_a" });
    }
    expect(checkTelemetryRateLimit({ request: makeReq(), userId: "user_a" }).allowed).toBe(false);
    expect(checkTelemetryRateLimit({ request: makeReq(), userId: "user_b" }).allowed).toBe(true);
  });

  test("anonymous and authenticated buckets are independent for the same caller", () => {
    const req = makeReq("5.5.5.5");
    for (let i = 0; i < 60; i++) {
      checkTelemetryRateLimit({ request: req, userId: null });
    }
    // Anon bucket exhausted
    expect(checkTelemetryRateLimit({ request: req, userId: null }).allowed).toBe(false);
    // Auth bucket fresh for any userId
    expect(checkTelemetryRateLimit({ request: req, userId: "u_5" }).allowed).toBe(true);
  });

  test("bucket resets after window elapses", () => {
    const req = makeReq("7.7.7.7");
    for (let i = 0; i < 60; i++) {
      checkTelemetryRateLimit({ request: req, userId: null });
    }
    expect(checkTelemetryRateLimit({ request: req, userId: null }).allowed).toBe(false);

    // Advance past the 60_000ms window
    vi.advanceTimersByTime(60_001);
    expect(checkTelemetryRateLimit({ request: req, userId: null }).allowed).toBe(true);
  });

  test("remaining count decreases linearly across requests", () => {
    const req = makeReq("3.3.3.3");
    expect(checkTelemetryRateLimit({ request: req, userId: null }).remaining).toBe(59);
    expect(checkTelemetryRateLimit({ request: req, userId: null }).remaining).toBe(58);
    expect(checkTelemetryRateLimit({ request: req, userId: null }).remaining).toBe(57);
  });
});
