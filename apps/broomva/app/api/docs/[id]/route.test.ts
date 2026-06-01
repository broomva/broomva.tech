import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/spec-doc-queries", () => ({
  getSpecDocForOwner: vi.fn(),
  deleteSpecDoc: vi.fn(),
}));

import { deleteSpecDoc, getSpecDocForOwner } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { DELETE, GET } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockGet = vi.mocked(getSpecDocForOwner);
const mockDelete = vi.mocked(deleteSpecDoc);

const req = () => new NextRequest("http://localhost/api/docs/doc-1");
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/docs/[id]", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGet.mockReset();
    mockDelete.mockReset();
  });

  test("404 when the doc belongs to a different owner (no existence leak)", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockGet.mockResolvedValue(null); // owner-scoped query returns null for non-owner
    const resp = await GET(req(), params("doc-1"));
    expect(resp.status).toBe(404);
    // the query was scoped to the *requesting* user, never the owner
    expect(mockGet).toHaveBeenCalledWith("doc-1", "intruder");
  });

  test("200 returns metadata without the html body", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockGet.mockResolvedValue({
      id: "doc-1",
      ownerId: "owner-1",
      title: "Spec",
      html: "<h1>secret body</h1>",
      sourceRepo: null,
      sourcePath: "docs/specs/x.html",
      sourceCommit: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    } as never);

    const resp = await GET(req(), params("doc-1"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.title).toBe("Spec");
    expect(body.html).toBeUndefined(); // body is omitted from metadata
  });

  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await GET(req(), params("doc-1"));
    expect(resp.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/docs/[id]", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDelete.mockReset();
  });

  test("404 when nothing was deleted (not owner / missing)", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockDelete.mockResolvedValue(false);
    const resp = await DELETE(req(), params("doc-1"));
    expect(resp.status).toBe(404);
    expect(mockDelete).toHaveBeenCalledWith("doc-1", "intruder");
  });

  test("200 ok when the owner deletes their doc", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockDelete.mockResolvedValue(true);
    const resp = await DELETE(req(), params("doc-1"));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true });
  });
});
