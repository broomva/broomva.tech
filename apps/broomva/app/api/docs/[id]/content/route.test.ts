import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/spec-doc-queries", () => ({
  resolveSpecDocForViewer: vi.fn(),
}));

import { resolveSpecDocForViewer } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { GET } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockResolve = vi.mocked(resolveSpecDocForViewer);

const req = (url = "http://localhost/api/docs/maestro/content") =>
  new NextRequest(url);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const row = (over: Record<string, unknown> = {}) => ({
  id: "doc-1",
  ownerId: "owner-1",
  handle: "maestro",
  version: 2,
  state: "published",
  title: "Maestro",
  html: "<h1>body</h1>",
  sourceRepo: null,
  sourcePath: null,
  sourceCommit: null,
  ticketId: null,
  prNumber: null,
  sessionId: null,
  expiresAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-02T00:00:00Z"),
  updatedAt: new Date("2026-06-02T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  mockAuth.mockReset();
  mockResolve.mockReset();
});

describe("GET /api/docs/[id]/content", () => {
  test("401 when unauthenticated — never touches the DB", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await GET(req(), params("maestro"));
    expect(resp.status).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  test("200 returns the html body, resolved by ref + owner-scoped", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockResolve.mockResolvedValue(row() as never);
    const resp = await GET(req(), params("maestro"));
    expect(resp.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith("maestro", "owner-1", undefined);
    const body = await resp.json();
    expect(body.html).toBe("<h1>body</h1>");
    expect(body.handle).toBe("maestro");
    expect(body.version).toBe(2);
  });

  test("404 when not the owner's / missing (no existence leak)", async () => {
    mockAuth.mockResolvedValue({ userId: "intruder", email: "x@y.com" });
    mockResolve.mockResolvedValue(null);
    const resp = await GET(req(), params("maestro"));
    expect(resp.status).toBe(404);
    expect(mockResolve).toHaveBeenCalledWith("maestro", "intruder", undefined);
  });

  test("?version=<n> pins a specific version", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    mockResolve.mockResolvedValue(
      row({ version: 1, state: "superseded" }) as never,
    );
    const resp = await GET(
      req("http://localhost/api/docs/maestro/content?version=1"),
      params("maestro"),
    );
    expect(resp.status).toBe(200);
    expect(mockResolve).toHaveBeenCalledWith("maestro", "owner-1", 1);
  });

  test("400 on an invalid version", async () => {
    mockAuth.mockResolvedValue({ userId: "owner-1", email: "a@b.com" });
    const resp = await GET(
      req("http://localhost/api/docs/maestro/content?version=abc"),
      params("maestro"),
    );
    expect(resp.status).toBe(400);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
