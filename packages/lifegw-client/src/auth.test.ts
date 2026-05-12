import { describe, expect, it } from "vitest";
import { cachedTokenProvider, staticTokenProvider } from "./auth.js";

describe("staticTokenProvider", () => {
  it("returns the same token on every call", async () => {
    const tp = staticTokenProvider("test-jwt-abc");
    expect(await tp()).toBe("test-jwt-abc");
    expect(await tp()).toBe("test-jwt-abc");
  });
});

describe("cachedTokenProvider", () => {
  it("calls the underlying provider once, then reuses the token", async () => {
    let calls = 0;
    const inner = async () => {
      calls += 1;
      return `token-${calls}`;
    };
    const tp = cachedTokenProvider(inner, { ttlMs: 60_000 });
    expect(await tp()).toBe("token-1");
    expect(await tp()).toBe("token-1");
    expect(calls).toBe(1);
  });

  it("refreshes after TTL expires", async () => {
    let calls = 0;
    const inner = async () => {
      calls += 1;
      return `token-${calls}`;
    };
    const tp = cachedTokenProvider(inner, { ttlMs: 10 });
    expect(await tp()).toBe("token-1");
    await new Promise((r) => setTimeout(r, 20));
    expect(await tp()).toBe("token-2");
    expect(calls).toBe(2);
  });
});
