// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getWorkspaceId } from "../identity";

describe("getWorkspaceId", () => {
  it("is deterministic — same userId always yields the same workspace_id", () => {
    const a = getWorkspaceId("user-123");
    const b = getWorkspaceId("user-123");
    expect(a).toBe(b);
    expect(a).toMatch(/^w-[0-9a-f]{16}$/);
  });

  it("produces different ids for different users", () => {
    const alice = getWorkspaceId("alice");
    const bob = getWorkspaceId("bob");
    expect(alice).not.toBe(bob);
  });
});
