import { describe, expect, it } from "bun:test";
import {
  assertAuditProcess,
  assertExactPolicy,
  assertExceptionShape,
  assertReviewDate,
  collectAdvisories,
  type DependencyException,
  dependencyTopologyHash,
} from "./audit-dependencies";

const validException: DependencyException = {
  package: "example",
  owner: "security",
  topologySha256: "a".repeat(64),
  rationale:
    "A bounded and reviewed residual-risk explanation for this dependency.",
  advisories: ["high|https://example.test/GHSA-1"],
};

describe("dependency advisory policy", () => {
  it("fails closed on invalid or expired review dates", () => {
    expect(() => assertReviewDate("not-a-date")).toThrow("ISO date");
    expect(() => assertReviewDate("2026-02-31")).toThrow("invalid");
    expect(() =>
      assertReviewDate("2026-01-01", new Date("2026-01-02T00:00:00Z")),
    ).toThrow("expired");
  });

  it("rejects abnormal audit subprocess exits and signals", () => {
    expect(() => assertAuditProcess(2, null)).toThrow("abnormally");
    expect(() => assertAuditProcess(1, "SIGTERM")).toThrow("abnormally");
    expect(() => assertAuditProcess(1, null)).not.toThrow();
  });

  it("requires an owner, rationale, topology hash, and advisories", () => {
    expect(() => assertExceptionShape(validException)).not.toThrow();
    expect(() =>
      assertExceptionShape({ ...validException, rationale: "too short" }),
    ).toThrow("Malformed");
  });

  it("rejects every new critical, high, or moderate advisory", () => {
    const { current, counts } = collectAdvisories({
      example: [
        { severity: "critical", title: "critical", url: "https://a" },
        { severity: "high", title: "high", url: "https://b" },
        { severity: "moderate", title: "moderate", url: "https://c" },
      ],
    });
    expect(counts).toEqual({ critical: 1, high: 1, moderate: 1 });
    expect(() => assertExactPolicy(current, new Set())).toThrow("Unreviewed");
  });

  it("ignores only low advisories and rejects unknown severities", () => {
    expect(
      collectAdvisories({
        example: [{ severity: "low", title: "low", url: "https://low" }],
      }).current.size,
    ).toBe(0);
    expect(() =>
      collectAdvisories({
        example: [
          { severity: "future", title: "future", url: "https://future" },
        ],
      }),
    ).toThrow("Unknown dependency advisory severity");
  });

  it("rejects stale allowances as well as path/version topology drift", () => {
    expect(() =>
      assertExactPolicy(new Set(), new Set(["example|high|https://a"])),
    ).toThrow("Stale");
    expect(dependencyTopologyHash("example@1\n")).not.toBe(
      dependencyTopologyHash("example@1\n  parent@2\n"),
    );
  });

  it("allows a clean audit to use an empty exception baseline", () => {
    expect(() => assertExactPolicy(new Set(), new Set())).not.toThrow();
  });
});
