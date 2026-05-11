import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prompts/resolve-auth", () => ({
  resolveAuth: vi.fn(),
}));

vi.mock("@/lib/telemetry/log-invocation", () => ({
  logInvocation: vi.fn(),
}));

vi.mock("@/lib/telemetry/rate-limit", () => ({
  checkTelemetryRateLimit: vi.fn(),
}));

import { POST } from "./route";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { logInvocation } from "@/lib/telemetry/log-invocation";
import { checkTelemetryRateLimit } from "@/lib/telemetry/rate-limit";

const mockResolveAuth = vi.mocked(resolveAuth);
const mockLogInvocation = vi.mocked(logInvocation);
const mockRateLimit = vi.mocked(checkTelemetryRateLimit);

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/invocations", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const FROZEN_DATE = new Date("2026-05-11T00:00:00Z");

describe("POST /api/invocations", () => {
  beforeEach(() => {
    mockResolveAuth.mockReset();
    mockLogInvocation.mockReset();
    mockRateLimit.mockReset();

    mockResolveAuth.mockResolvedValue(null);
    mockRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
    mockLogInvocation.mockResolvedValue({
      id: "abc-uuid",
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
      createdAt: FROZEN_DATE,
      completedAt: null,
    } as never);
  });

  test("201 — happy path returns id + created_at", async () => {
    const res = await POST(
      makeReq({
        prompt_slug: "code-review-agent",
        prompt_version: "1.0",
        source: "cli",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("abc-uuid");
    expect(body.created_at).toBeDefined();
    expect(mockLogInvocation).toHaveBeenCalledOnce();
  });

  test("400 — missing prompt_slug", async () => {
    const res = await POST(
      makeReq({ prompt_version: "1.0", source: "cli" }),
    );
    expect(res.status).toBe(400);
    expect(mockLogInvocation).not.toHaveBeenCalled();
  });

  test("400 — invalid source enum value", async () => {
    const res = await POST(
      makeReq({
        prompt_slug: "x",
        prompt_version: "1.0",
        source: "bogus",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockLogInvocation).not.toHaveBeenCalled();
  });

  test("429 — rate-limited returns Retry-After", async () => {
    mockRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });
    const res = await POST(
      makeReq({
        prompt_slug: "x",
        prompt_version: "1.0",
        source: "cli",
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
    expect(mockLogInvocation).not.toHaveBeenCalled();
  });
});
