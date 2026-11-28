import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  getSafeSession: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getUserPromptById: vi.fn(),
  updateUserPrompt: vi.fn(),
  deleteUserPrompt: vi.fn(),
}));

import { getSafeSession } from "@/lib/auth";
import {
  deleteUserPrompt,
  getUserPromptById,
  updateUserPrompt,
} from "@/lib/db/queries";
import { DELETE, GET, PUT } from "./route";

const mockGetSafeSession = vi.mocked(getSafeSession);
const mockGetById = vi.mocked(getUserPromptById);
const mockUpdate = vi.mocked(updateUserPrompt);
const mockDelete = vi.mocked(deleteUserPrompt);

const BASE_ROW = {
  id: "prompt-1",
  userId: "owner-1",
  slug: "secret-prompt",
  title: "Secret Prompt",
  summary: "Private",
  content: "classified instructions",
  category: "engineering",
  tags: [],
  links: [],
  model: "claude",
  version: "1.0",
  variables: null,
  visibility: "public",
  copyCount: 0,
  isHighlighted: false,
  deletedAt: null,
  createdAt: new Date("2026-05-09T00:00:00Z"),
  updatedAt: new Date("2026-05-09T00:00:00Z"),
};

describe("/api/prompts/user/[id] visibility & validation", () => {
  beforeEach(() => {
    mockGetSafeSession.mockReset();
    mockGetById.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  test("GET returns 404 for soft-deleted row even if visibility is public", async () => {
    mockGetById.mockResolvedValue({
      ...BASE_ROW,
      visibility: "public",
      deletedAt: new Date("2026-05-10T00:00:00Z"),
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/prompts/user/prompt-1"), {
      params: Promise.resolve({ id: "prompt-1" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("GET hides non-public visibility (including arbitrary strings like 'unlisted') from non-owners", async () => {
    mockGetById.mockResolvedValue({
      ...BASE_ROW,
      visibility: "unlisted",
    } as never);
    mockGetSafeSession.mockResolvedValue({ data: null } as never);

    const res = await GET(new NextRequest("http://localhost/api/prompts/user/prompt-1"), {
      params: Promise.resolve({ id: "prompt-1" }),
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("GET allows owner to read their non-public prompt with private, no-store", async () => {
    mockGetById.mockResolvedValue({
      ...BASE_ROW,
      visibility: "private",
    } as never);
    mockGetSafeSession.mockResolvedValue({
      data: { user: { id: "owner-1" } },
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/prompts/user/prompt-1"), {
      params: Promise.resolve({ id: "prompt-1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("PUT rejects invalid visibility values with 400 before calling updateUserPrompt", async () => {
    mockGetSafeSession.mockResolvedValue({
      data: { user: { id: "owner-1" } },
    } as never);

    const res = await PUT(
      new NextRequest("http://localhost/api/prompts/user/prompt-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: "unlisted" }),
      }),
      { params: Promise.resolve({ id: "prompt-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("DELETE delegates to deleteUserPrompt for authenticated owner", async () => {
    mockGetSafeSession.mockResolvedValue({
      data: { user: { id: "owner-1" } },
    } as never);
    mockDelete.mockResolvedValue(true);

    const res = await DELETE(
      new NextRequest("http://localhost/api/prompts/user/prompt-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "prompt-1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith("prompt-1", "owner-1");
  });
});
