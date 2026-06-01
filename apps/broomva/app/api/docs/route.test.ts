import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://broomva.tech" } }));
vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/spec-doc-queries", () => ({
  createSpecDoc: vi.fn(),
  listSpecDocs: vi.fn(),
}));

import { createSpecDoc, listSpecDocs } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockCreate = vi.mocked(createSpecDoc);
const mockList = vi.mocked(listSpecDocs);

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/docs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "doc-1",
    ownerId: "user-abc",
    title: "T",
    html: "<h1>x</h1>",
    sourceRepo: null,
    sourcePath: null,
    sourceCommit: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

describe("POST /api/docs", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockCreate.mockReset();
    mockList.mockReset();
  });

  test("401 when unauthenticated — never touches the DB", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await POST(postReq({ html: "<h1>x</h1>" }));
    expect(resp.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("400 when html is missing", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    const resp = await POST(postReq({ title: "no html" }));
    expect(resp.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("201 — owner is the authed identity (not hardcoded) and url is /d/<id>", async () => {
    mockAuth.mockResolvedValue({ userId: "user-abc", email: "a@b.com" });
    mockCreate.mockImplementation(async (p) => row({ id: p.id, ownerId: p.ownerId, title: p.title }) as never);

    const resp = await POST(postReq({ html: "<title>My Spec</title><h1>x</h1>" }));

    expect(resp.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const arg = mockCreate.mock.calls[0]?.[0];
    expect(arg?.ownerId).toBe("user-abc"); // owner == authed user.id, nothing hardcoded
    expect(arg?.title).toBe("My Spec"); // derived from <title> when none provided

    const body = await resp.json();
    expect(body.url).toBe(`https://broomva.tech/d/${arg?.id}`);
  });

  test("GET lists only the authed owner's docs and attaches urls", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockList.mockResolvedValue([row({ id: "d1", ownerId: "owner-1" }) as never]);

    const resp = await GET(new NextRequest("http://localhost/api/docs"));

    expect(resp.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("owner-1");
    const body = await resp.json();
    expect(body[0].url).toBe("https://broomva.tech/d/d1");
  });

  test("GET 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await GET(new NextRequest("http://localhost/api/docs"));
    expect(resp.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});
