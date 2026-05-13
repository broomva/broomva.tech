import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getUpstream } from "../_lib/upstream";

describe("getUpstream factory", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.LIFEGW_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns the in-process adapter when LIFEGW_URL is unset", () => {
    const u = getUpstream();
    expect(u.kind).toBe("in-process");
  });

  it("returns the lifegw adapter when LIFEGW_URL is set", () => {
    process.env.LIFEGW_URL = "https://example.test";
    const u = getUpstream();
    expect(u.kind).toBe("lifegw");
  });
});
