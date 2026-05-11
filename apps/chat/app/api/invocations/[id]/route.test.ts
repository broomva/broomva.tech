import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prompts/resolve-auth", () => ({
  resolveAuth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getPromptInvocation: vi.fn(),
  updatePromptInvocation: vi.fn(),
}));

import { PATCH } from "./route";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import {
  getPromptInvocation,
  updatePromptInvocation,
} from "@/lib/db/queries";

const mockResolveAuth = vi.mocked(resolveAuth);
const mockGet = vi.mocked(getPromptInvocation);
const mockUpdate = vi.mocked(updatePromptInvocation);

const ID = "11111111-2222-3333-4444-555555555555";

function makeReq(body: unknown) {
  return new Request(`http://localhost/api/invocations/${ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeParams() {
  return { params: Promise.resolve({ id: ID }) };
}

function baseRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: ID,
    promptSlug: "x",
    promptVersion: "1.0",
    source: "cli",
    caller: null,
    userId: null,
    agentId: null,
    sessionId: null,
    clientIpHash: null,
    variables: null,
    status: "pulled",
    model: null,
    latencyMs: null,
    tokensIn: null,
    tokensOut: null,
    costUsd: null,
    errorMessage: null,
    externalTraceId: null,
    externalSpanId: null,
    metadata: null,
    createdAt: new Date("2026-05-11T00:00:00Z"),
    completedAt: null,
    ...over,
  } as never;
}

describe("PATCH /api/invocations/[id]", () => {
  beforeEach(() => {
    mockResolveAuth.mockReset();
    mockGet.mockReset();
    mockUpdate.mockReset();
    mockResolveAuth.mockResolvedValue(null);
  });

  test("happy path — updates with computed cost", async () => {
    mockGet.mockResolvedValue(baseRow());
    mockUpdate.mockResolvedValue(
      baseRow({ status: "completed", costUsd: "0.018000" }),
    );
    const res = await PATCH(
      makeReq({
        status: "completed",
        model: "claude-sonnet-4.5",
        tokens_in: 1_000_000,
        tokens_out: 1_000_000,
        latency_ms: 500,
      }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(mockUpdate).toHaveBeenCalledOnce();
    const args = mockUpdate.mock.calls[0];
    expect(args[0]).toBe(ID);
    expect(args[1].costUsd).toBe("18.000000");
  });

  test("404 — invocation does not exist", async () => {
    mockGet.mockResolvedValue(undefined);
    const res = await PATCH(
      makeReq({ status: "completed" }),
      makeParams(),
    );
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("409 — invocation already locked (status != pulled)", async () => {
    mockGet.mockResolvedValue(baseRow({ status: "completed" }));
    const res = await PATCH(
      makeReq({ status: "completed" }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("403 — wrong user", async () => {
    mockResolveAuth.mockResolvedValue({
      userId: "other-user",
      email: "x@y.z",
    });
    mockGet.mockResolvedValue(baseRow({ userId: "owner-user" }));
    const res = await PATCH(
      makeReq({ status: "completed" }),
      makeParams(),
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("403 — anonymous request against user-owned row", async () => {
    mockResolveAuth.mockResolvedValue(null);
    mockGet.mockResolvedValue(baseRow({ userId: "owner-user" }));
    const res = await PATCH(
      makeReq({ status: "completed" }),
      makeParams(),
    );
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("null cost for unknown model", async () => {
    mockGet.mockResolvedValue(baseRow());
    mockUpdate.mockResolvedValue(baseRow({ status: "completed" }));
    const res = await PATCH(
      makeReq({
        status: "completed",
        model: "unknown-model-xyz",
        tokens_in: 1000,
        tokens_out: 1000,
      }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    const args = mockUpdate.mock.calls[0];
    expect(args[1].costUsd).toBeNull();
  });
});
