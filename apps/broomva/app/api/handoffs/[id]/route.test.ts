import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { APP_URL: "" } }));
vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/handoff-queries", () => ({
  getHandoffForOwner: vi.fn(),
  isHandoffAction: (value: unknown) =>
    ["pick_up", "complete", "archive", "requeue"].includes(String(value)),
  setHandoffVisibility: vi.fn(),
  softDeleteHandoff: vi.fn(),
  transitionHandoff: vi.fn(),
}));

import {
  getHandoffForOwner,
  setHandoffVisibility,
  softDeleteHandoff,
  transitionHandoff,
} from "@/lib/db/handoff-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { DELETE, GET, PATCH } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockGet = vi.mocked(getHandoffForOwner);
const mockSetVisibility = vi.mocked(setHandoffVisibility);
const mockTransition = vi.mocked(transitionHandoff);
const mockSoftDelete = vi.mocked(softDeleteHandoff);

const req = () => new NextRequest("http://localhost/api/handoffs/h1");
const patchReq = (body: unknown) =>
  new NextRequest("http://localhost/api/handoffs/h1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const delReq = () =>
  new NextRequest("http://localhost/api/handoffs/h1", { method: "DELETE" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mockAuth.mockReset();
  mockGet.mockReset();
  mockSetVisibility.mockReset();
  mockTransition.mockReset();
  mockSoftDelete.mockReset();
});

describe("GET /api/handoffs/[id]", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await GET(req(), params("h1"));
    expect(resp.status).toBe(401);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test("404 when missing / not owner", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockGet.mockResolvedValue(null);
    const resp = await GET(req(), params("h1"));
    expect(resp.status).toBe(404);
    expect(mockGet).toHaveBeenCalledWith("h1", "intruder");
  });
});

describe("PATCH /api/handoffs/[id]", () => {
  test("share → public visibility and standalone /h URL", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockSetVisibility.mockResolvedValue({
      id: "h1",
      visibility: "public",
    } as never);
    const resp = await PATCH(patchReq({ action: "share" }), params("h1"));
    expect(resp.status).toBe(200);
    expect(mockSetVisibility).toHaveBeenCalledWith("h1", "owner-1", "public");
    expect(await resp.json()).toEqual({
      ok: true,
      visibility: "public",
      publicUrl: "http://localhost/h/h1",
    });
  });

  test("unshare → private visibility and no public URL", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockSetVisibility.mockResolvedValue({
      id: "h1",
      visibility: "private",
    } as never);
    const resp = await PATCH(patchReq({ action: "unshare" }), params("h1"));
    expect(resp.status).toBe(200);
    expect(mockSetVisibility).toHaveBeenCalledWith("h1", "owner-1", "private");
    expect(await resp.json()).toEqual({
      ok: true,
      visibility: "private",
      publicUrl: null,
    });
  });

  test("queue transition still uses transitionHandoff", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockTransition.mockResolvedValue("in_progress");
    const resp = await PATCH(patchReq({ action: "pick_up" }), params("h1"));
    expect(resp.status).toBe(200);
    expect(mockTransition).toHaveBeenCalledWith(
      "h1",
      "owner-1",
      "pick_up",
      "web",
    );
    expect(await resp.json()).toEqual({ ok: true, status: "in_progress" });
  });
});

describe("DELETE /api/handoffs/[id]", () => {
  test("soft-deletes owner-scoped row", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockSoftDelete.mockResolvedValue(true);
    const resp = await DELETE(delReq(), params("h1"));
    expect(resp.status).toBe(200);
    expect(mockSoftDelete).toHaveBeenCalledWith("h1", "owner-1");
  });
});
