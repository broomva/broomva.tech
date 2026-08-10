import { describe, expect, it } from "vitest";
import {
  parseAnalyticsConsent,
  resolveAnalyticsConsent,
  serializeAnalyticsConsent,
} from "./analytics-consent";

describe("parseAnalyticsConsent", () => {
  it.each([
    [null, "unknown"],
    ["", "unknown"],
    ["unexpected", "unknown"],
    ['{"choice":"accepted","noticeVersion":"old"}', "unknown"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(parseAnalyticsConsent(input)).toBe(expected);
  });

  it.each(["accepted", "essential"] as const)(
    "round-trips a current %s record",
    (choice) => {
      const value = serializeAnalyticsConsent(
        choice,
        new Date("2026-08-09T12:00:00.000Z")
      );
      expect(parseAnalyticsConsent(value)).toBe(choice);
      expect(JSON.parse(value)).toEqual({
        choice,
        noticeVersion: "2026-08-09",
        decidedAt: "2026-08-09T12:00:00.000Z",
      });
    }
  );
});

describe("resolveAnalyticsConsent", () => {
  it.each([
    ["accepted", "essential"],
    ["essential", "accepted"],
    ["essential", "unknown"],
    ["unknown", "essential"],
  ] as const)("makes refusal win for cookie=%s local=%s", (cookie, local) => {
    expect(resolveAnalyticsConsent(cookie, local)).toBe("essential");
  });

  it.each([
    ["accepted", "unknown"],
    ["unknown", "accepted"],
    ["accepted", "accepted"],
  ] as const)(
    "keeps a stored acceptance for cookie=%s local=%s",
    (cookie, local) => {
      expect(resolveAnalyticsConsent(cookie, local)).toBe("accepted");
    },
  );
});
