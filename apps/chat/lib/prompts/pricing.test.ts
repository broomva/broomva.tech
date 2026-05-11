import { describe, expect, test } from "vitest";
import { computeCostUsd } from "./pricing";

describe("computeCostUsd", () => {
  test("claude-sonnet-4.5: 1M input + 1M output = $3 + $15 = $18", () => {
    expect(computeCostUsd("claude-sonnet-4.5", 1_000_000, 1_000_000)).toBeCloseTo(
      18,
      4,
    );
  });

  test("claude-opus-4.5: 1k input + 0 output", () => {
    // opus pricing per the model table: input $15/M, output $75/M
    expect(computeCostUsd("claude-opus-4.5", 1000, 0)).toBeCloseTo(0.015, 4);
  });

  test("unknown model returns null (does not throw)", () => {
    expect(computeCostUsd("gpt-5-magic", 1000, 1000)).toBeNull();
  });

  test("zero tokens returns 0 for a known model", () => {
    expect(computeCostUsd("claude-sonnet-4.5", 0, 0)).toBe(0);
  });

  test("null tokens are treated as zero", () => {
    expect(computeCostUsd("claude-sonnet-4.5", null, null)).toBe(0);
  });
});
