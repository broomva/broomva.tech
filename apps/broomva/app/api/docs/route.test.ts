import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://broomva.tech" } }));
vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/spec-doc-queries", () => ({
  publishSpecDoc: vi.fn(),
  listSpecDocs: vi.fn(),
  listSpecDocVersions: vi.fn(),
}));

import {
  listSpecDocs,
  listSpecDocVersions,
  publishSpecDoc,
} from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { GET, POST } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockPublish = vi.mocked(publishSpecDoc);
const mockList = vi.mocked(listSpecDocs);
const mockVersions = vi.mocked(listSpecDocVersions);

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
    handle: "my-spec",
    version: 1,
    state: "published",
    title: "T",
    html: "<h1>x</h1>",
    sourceRepo: null,
    sourcePath: null,
    sourceCommit: null,
    ticketId: null,
    prNumber: null,
    sessionId: null,
    expiresAt: null,
    deletedAt: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

describe("POST /api/docs", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockPublish.mockReset();
    mockList.mockReset();
    mockVersions.mockReset();
  });

  test("401 when unauthenticated — never touches the DB", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await POST(postReq({ html: "<h1>x</h1>" }));
    expect(resp.status).toBe(401);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("400 when html is missing", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    const resp = await POST(postReq({ title: "no html" }));
    expect(resp.status).toBe(400);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test("201 — owner is the authed identity (not hardcoded); url is the stable /d/<handle>", async () => {
    mockAuth.mockResolvedValue({ userId: "user-abc", email: "a@b.com" });
    mockPublish.mockImplementation(
      async (p) =>
        row({
          id: p.id,
          ownerId: p.ownerId,
          handle: "my-spec",
          version: 3,
          title: p.title,
        }) as never,
    );

    const resp = await POST(
      postReq({ html: "<title>My Spec</title><h1>x</h1>", handle: "my-spec" }),
    );

    expect(resp.status).toBe(201);
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const arg = mockPublish.mock.calls[0]?.[0];
    expect(arg?.ownerId).toBe("user-abc"); // owner == authed user.id, nothing hardcoded
    expect(arg?.handle).toBe("my-spec");
    expect(arg?.title).toBe("My Spec"); // derived from <title> when none provided

    const body = await resp.json();
    // stable handle URL — NOT the per-version id
    expect(body.url).toBe("https://broomva.tech/d/my-spec");
    expect(body.version).toBe(3);
  });

  test("publishes a draft when draft:true", async () => {
    mockAuth.mockResolvedValue({ userId: "user-abc", email: "a@b.com" });
    mockPublish.mockImplementation(
      async (p) => row({ id: p.id, state: "draft" }) as never,
    );
    await POST(postReq({ html: "<h1>wip</h1>", draft: true }));
    expect(mockPublish.mock.calls[0]?.[0]?.draft).toBe(true);
  });

  test("GET lists only the authed owner's docs with stable-handle urls", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockList.mockResolvedValue([
      row({ id: "d1", ownerId: "owner-1", handle: "alpha" }) as never,
    ]);

    const resp = await GET(new NextRequest("http://localhost/api/docs"));

    expect(resp.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith("owner-1");
    const body = await resp.json();
    expect(body[0].url).toBe("https://broomva.tech/d/alpha");
  });

  test("GET ?handle= returns version history with pinned urls", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockVersions.mockResolvedValue([
      row({ id: "d2", handle: "alpha", version: 2 }) as never,
      row({
        id: "d1",
        handle: "alpha",
        version: 1,
        state: "superseded",
      }) as never,
    ]);

    const resp = await GET(
      new NextRequest("http://localhost/api/docs?handle=alpha"),
    );

    expect(resp.status).toBe(200);
    expect(mockVersions).toHaveBeenCalledWith("alpha", "owner-1");
    const body = await resp.json();
    expect(body[0].url).toBe("https://broomva.tech/d/alpha/v/2");
    expect(body[1].url).toBe("https://broomva.tech/d/alpha/v/1");
  });

  test("GET 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await GET(new NextRequest("http://localhost/api/docs"));
    expect(resp.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});
