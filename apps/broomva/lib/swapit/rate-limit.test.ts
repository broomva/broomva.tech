import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  __resetSwapitRateLimit,
  checkSwapitWriteRateLimit,
} from "./rate-limit";

function reqFromIp(ip: string): Request {
  return new Request("https://broomva.tech/api/swapit/facts", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  __resetSwapitRateLimit();
});

describe("checkSwapitWriteRateLimit", () => {
  it("allows 60 anonymous writes/min per IP, then blocks with a future reset", () => {
    const request = reqFromIp("1.2.3.4");
    for (let i = 0; i < 60; i++) {
      expect(checkSwapitWriteRateLimit({ request, userId: null }).allowed).toBe(
        true,
      );
    }
    const blocked = checkSwapitWriteRateLimit({ request, userId: null });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBeGreaterThan(Date.now());
  });

  it("keeps a separate budget per IP", () => {
    for (let i = 0; i < 60; i++) {
      checkSwapitWriteRateLimit({
        request: reqFromIp("1.1.1.1"),
        userId: null,
      });
    }
    expect(
      checkSwapitWriteRateLimit({ request: reqFromIp("1.1.1.1"), userId: null })
        .allowed,
    ).toBe(false);
    // a different IP still has its full budget
    expect(
      checkSwapitWriteRateLimit({ request: reqFromIp("2.2.2.2"), userId: null })
        .allowed,
    ).toBe(true);
  });

  it("gives authenticated users a higher per-user budget, keyed by user not IP", () => {
    const request = reqFromIp("9.9.9.9"); // same IP throughout
    let last = checkSwapitWriteRateLimit({ request, userId: "user-1" });
    // 100 writes — well past the anon cap of 60 — all allowed for a signed-in user
    for (let i = 0; i < 99; i++) {
      last = checkSwapitWriteRateLimit({ request, userId: "user-1" });
    }
    expect(last.allowed).toBe(true);
    // a different user shares neither budget
    expect(
      checkSwapitWriteRateLimit({ request, userId: "user-2" }).allowed,
    ).toBe(true);
  });

  it("keys on the trusted rightmost XFF entry — spoofing the leftmost can't mint new buckets", () => {
    // Vercel appends the real client IP to the RIGHT of x-forwarded-for. An attacker
    // prepending junk on the left must NOT get a fresh budget — both requests below share
    // the same real IP (203.0.113.7), so they share ONE bucket. This is the same property
    // contributorHash now relies on to prevent anonymous self-approval.
    function spoofed(leftmost: string): Request {
      return new Request("https://broomva.tech/api/swapit/facts", {
        method: "POST",
        headers: { "x-forwarded-for": `${leftmost}, 203.0.113.7` },
      });
    }
    for (let i = 0; i < 60; i++) {
      checkSwapitWriteRateLimit({
        request: spoofed(i % 2 ? "9.9.9.9" : "8.8.8.8"),
        userId: null,
      });
    }
    // 60 combined writes against the shared trusted IP → blocked regardless of leftmost
    expect(
      checkSwapitWriteRateLimit({ request: spoofed("1.1.1.1"), userId: null })
        .allowed,
    ).toBe(false);
  });
});
