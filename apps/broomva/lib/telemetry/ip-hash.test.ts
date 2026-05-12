import { describe, expect, test, vi } from "vitest";

// `ip-hash` is server-only; stub the marker so vitest's node env can load it.
vi.mock("server-only", () => ({}));

import { currentDailySalt, hashIp } from "./ip-hash";

describe("hashIp", () => {
  test("same input produces same hash within the same day", () => {
    const day = "2026-05-09";
    expect(hashIp("1.2.3.4", day)).toBe(hashIp("1.2.3.4", day));
  });

  test("different inputs produce different hashes", () => {
    const day = "2026-05-09";
    expect(hashIp("1.2.3.4", day)).not.toBe(hashIp("1.2.3.5", day));
  });

  test("same IP on different days produces different hashes", () => {
    expect(hashIp("1.2.3.4", "2026-05-09")).not.toBe(
      hashIp("1.2.3.4", "2026-05-10"),
    );
  });

  test("output is 64-char hex (SHA-256)", () => {
    expect(hashIp("1.2.3.4", "2026-05-09")).toMatch(/^[a-f0-9]{64}$/);
  });

  test("currentDailySalt returns a stable string for the same day", () => {
    const salt1 = currentDailySalt(new Date("2026-05-09T03:00:00Z"));
    const salt2 = currentDailySalt(new Date("2026-05-09T22:00:00Z"));
    expect(salt1).toBe(salt2);
  });

  test("currentDailySalt rotates across UTC midnight", () => {
    const salt1 = currentDailySalt(new Date("2026-05-09T23:59:59Z"));
    const salt2 = currentDailySalt(new Date("2026-05-10T00:00:01Z"));
    expect(salt1).not.toBe(salt2);
  });
});
