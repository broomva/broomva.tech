import { describe, expect, it } from "vitest";
import { safeInternalPath } from "../safe-redirect";

describe("safeInternalPath", () => {
  it.each([
    ["/", "/"],
    ["/writing/some-post", "/writing/some-post"],
    ["/prompts?tag=agents#top", "/prompts?tag=agents#top"],
    ["/%2F%2Fevil.example", "/%2F%2Fevil.example"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeInternalPath(input)).toBe(expected);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\\\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    // Dot segments that normalize into a protocol-relative path (round 2).
    "/.//evil.example",
    "/%2e//evil.example",
    "/%2E%2E//evil.example",
    "/a/..//evil.example",
    "/./%2e//evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
  ])("rejects off-site or ambiguous target %j", (input) => {
    expect(safeInternalPath(input)).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(42)).toBeNull();
  });
});
