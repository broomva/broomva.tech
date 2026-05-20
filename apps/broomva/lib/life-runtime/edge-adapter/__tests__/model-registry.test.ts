// Unit tests for edge-adapter model resolution.
//
// Covers D2:
//   1. Namespaced form (`anthropic/claude-3.5-sonnet`) resolves.
//   2. Un-namespaced form (`claude-3.5-sonnet`) resolves.
//   3. Date-snapshot form (`claude-sonnet-4-20250514`) resolves to the
//      latest-by-base entry when the dated id isn't directly in the
//      registry, OR to the dated entry when it IS.
//   4. Unknown id → null (route turns this into a 400).
//   5. Malformed inputs (empty, double-prefixed, cross-provider) → null.
//
// File under test: ../model-registry.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveModel } from "../model-registry";

describe("resolveModel — namespaced + un-namespaced forms", () => {
  it("accepts the bare anthropic id `claude-3.5-sonnet`", () => {
    const r = resolveModel("claude-3.5-sonnet");
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe("anthropic/claude-3.5-sonnet");
    expect(r!.anthropicId).toBe("claude-3.5-sonnet");
  });

  it("accepts the namespaced form `anthropic/claude-3.5-sonnet`", () => {
    const r = resolveModel("anthropic/claude-3.5-sonnet");
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe("anthropic/claude-3.5-sonnet");
    expect(r!.anthropicId).toBe("claude-3.5-sonnet");
  });

  it("accepts a model that's directly registered with a date suffix", () => {
    // `anthropic/claude-3.5-sonnet-20240620` is in the registry as-is.
    const r = resolveModel("claude-3.5-sonnet-20240620");
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe("anthropic/claude-3.5-sonnet-20240620");
    expect(r!.anthropicId).toBe("claude-3.5-sonnet-20240620");
  });
});

describe("resolveModel — date-suffix fallback", () => {
  it("strips a trailing -YYYYMMDD to find the base entry", () => {
    // The registry tracks `anthropic/claude-sonnet-4` (no date), but
    // the caller sends today's snapshot id `claude-sonnet-4-20250514`.
    // We resolve to the base canonical id and preserve the dated id
    // as `anthropicId`.
    const r = resolveModel("claude-sonnet-4-20250514");
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe("anthropic/claude-sonnet-4");
    // anthropicId preserves the snapshot.
    expect(r!.anthropicId).toBe("claude-sonnet-4-20250514");
  });

  it("works with the namespaced + dated form too", () => {
    const r = resolveModel("anthropic/claude-opus-4-20250514");
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe("anthropic/claude-opus-4");
    expect(r!.anthropicId).toBe("claude-opus-4-20250514");
  });
});

describe("resolveModel — unknown / malformed inputs", () => {
  it("returns null for an unknown id", () => {
    expect(resolveModel("claude-9000-imagined")).toBeNull();
  });

  it("returns null for cross-provider namespaced ids", () => {
    expect(resolveModel("openai/gpt-4o")).toBeNull();
  });

  it("returns null for double-prefixed ids", () => {
    expect(resolveModel("anthropic/anthropic/claude-3.5-sonnet")).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(resolveModel("")).toBeNull();
    // @ts-expect-error — runtime guard test
    expect(resolveModel(undefined)).toBeNull();
    // @ts-expect-error — runtime guard test
    expect(resolveModel(null)).toBeNull();
  });

  it("returns null for an id that's only the namespace prefix", () => {
    expect(resolveModel("anthropic/")).toBeNull();
  });
});
