import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/spec-doc-queries", () => ({
  getSpecDocForOwner: vi.fn(),
  setSpecDocState: vi.fn(),
  softDeleteSpecDoc: vi.fn(),
}));

import {
  getSpecDocForOwner,
  setSpecDocState,
  softDeleteSpecDoc,
} from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { DELETE, GET, PATCH } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockGet = vi.mocked(getSpecDocForOwner);
const mockSetState = vi.mocked(setSpecDocState);
const mockSoftDelete = vi.mocked(softDeleteSpecDoc);

const getReq = () => new NextRequest("http://localhost/api/docs/doc-1");
const patchReq = (body: unknown) =>
  new NextRequest("http://localhost/api/docs/doc-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const delReq = () =>
  new NextRequest("http://localhost/api/docs/doc-1", { method: "DELETE" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mockAuth.mockReset();
  mockGet.mockReset();
  mockSetState.mockReset();
  mockSoftDelete.mockReset();
});

describe("GET /api/docs/[id]", () => {
  test("404 when the doc belongs to a different owner (no existence leak)", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockGet.mockResolvedValue(null);
    const resp = await GET(getReq(), params("doc-1"));
    expect(resp.status).toBe(404);
    expect(mockGet).toHaveBeenCalledWith("doc-1", "intruder");
  });

  test("200 returns metadata without the html body", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockGet.mockResolvedValue({
      id: "doc-1",
      ownerId: "owner-1",
      handle: "spec",
      version: 1,
      state: "published",
      title: "Spec",
      html: "<h1>secret body</h1>",
      sourceRepo: null,
      sourcePath: "docs/specs/x.html",
      sourceCommit: null,
      ticketId: null,
      prNumber: null,
      sessionId: null,
      expiresAt: null,
      deletedAt: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    } as never);

    const resp = await GET(getReq(), params("doc-1"));
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.title).toBe("Spec");
    expect(body.html).toBeUndefined();
  });

  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await GET(getReq(), params("doc-1"));
    expect(resp.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/docs/[id]", () => {
  test("archive → setSpecDocState(archived), owner-scoped", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockSetState.mockResolvedValue(true);
    const resp = await PATCH(patchReq({ action: "archive" }), params("doc-1"));
    expect(resp.status).toBe(200);
    expect(mockSetState).toHaveBeenCalledWith("doc-1", "owner-1", "archived");
    expect(await resp.json()).toEqual({ ok: true, state: "archived" });
  });

  test("restore → setSpecDocState(published)", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockSetState.mockResolvedValue(true);
    const resp = await PATCH(patchReq({ action: "restore" }), params("doc-1"));
    expect(resp.status).toBe(200);
    expect(mockSetState).toHaveBeenCalledWith("doc-1", "owner-1", "published");
  });

  test("400 on an unknown action", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    const resp = await PATCH(patchReq({ action: "nuke" }), params("doc-1"));
    expect(resp.status).toBe(400);
    expect(mockSetState).not.toHaveBeenCalled();
  });

  test("404 when the doc isn't the owner's", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockSetState.mockResolvedValue(false);
    const resp = await PATCH(patchReq({ action: "archive" }), params("doc-1"));
    expect(resp.status).toBe(404);
  });
});

describe("DELETE /api/docs/[id]", () => {
  test("404 when nothing was deleted (not owner / missing)", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockSoftDelete.mockResolvedValue(false);
    const resp = await DELETE(delReq(), params("doc-1"));
    expect(resp.status).toBe(404);
    expect(mockSoftDelete).toHaveBeenCalledWith("doc-1", "intruder");
  });

  test("200 ok — soft-deletes the owner's doc", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockSoftDelete.mockResolvedValue(true);
    const resp = await DELETE(delReq(), params("doc-1"));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true });
  });
});
