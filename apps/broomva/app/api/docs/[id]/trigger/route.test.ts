import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prompts/resolve-auth", () => ({ resolveAuth: vi.fn() }));
vi.mock("@/lib/db/spec-doc-queries", () => ({ triggerSpecDoc: vi.fn() }));

import { triggerSpecDoc } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { POST } from "./route";

const mockAuth = vi.mocked(resolveAuth);
const mockTrigger = vi.mocked(triggerSpecDoc);
const params = Promise.resolve({ id: "doc-1" });

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/docs/doc-1/trigger", {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function run(over: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    specDocId: "doc-1",
    ownerId: "u1",
    handle: "h",
    specVersion: 1,
    target: { kind: "session", runtime: "claude-code" },
    status: "queued",
    runRef: null,
    attempt: 1,
    maxAttempts: 3,
    lastSeq: 0,
    receipt: null,
    idempotencyKey: "k",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("POST /api/docs/[id]/trigger", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockTrigger.mockReset();
  });

  test("401 unauth — never touches the DB", async () => {
    mockAuth.mockResolvedValue(null);
    const resp = await POST(req(), { params });
    expect(resp.status).toBe(401);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  test("201 + defaults to a relay Claude Code session when no body (D7)", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    mockTrigger.mockResolvedValue({ ok: true, run: run() as never });
    const resp = await POST(req(), { params });
    expect(resp.status).toBe(201);
    expect(mockTrigger).toHaveBeenCalledWith("doc-1", "u1", {
      kind: "session",
      runtime: "claude-code",
    });
    const body = await resp.json();
    expect(body.run.id).toBe("run-1");
  });

  test("honors an explicit target from the body", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    mockTrigger.mockResolvedValue({ ok: true, run: run() as never });
    await POST(req({ target: { kind: "chat", runtime: "claude-code" } }), {
      params,
    });
    expect(mockTrigger).toHaveBeenCalledWith("doc-1", "u1", {
      kind: "chat",
      runtime: "claude-code",
    });
  });

  test("400 on an invalid target kind — never touches the DB", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    const resp = await POST(req({ target: { kind: "bogus", runtime: "x" } }), {
      params,
    });
    expect(resp.status).toBe(400);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  test("404 when the spec is missing / not the owner's", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    mockTrigger.mockResolvedValue({ ok: false, reason: "not_found" });
    const resp = await POST(req(), { params });
    expect(resp.status).toBe(404);
  });

  test("409 when not triggerable from the current orch-state", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    mockTrigger.mockResolvedValue({
      ok: false,
      reason: "not_triggerable",
      orchState: "running",
    });
    const resp = await POST(req(), { params });
    expect(resp.status).toBe(409);
    expect((await resp.json()).orchState).toBe("running");
  });

  test("409 when the N=1 dispatch budget is exhausted", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", email: "a@b.com" });
    mockTrigger.mockResolvedValue({ ok: false, reason: "budget_exhausted" });
    const resp = await POST(req(), { params });
    expect(resp.status).toBe(409);
    expect((await resp.json()).reason).toBe("budget_exhausted");
  });
});
