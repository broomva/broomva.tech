import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  incrementPromptCopyCount: vi.fn(),
  getPromptBySlug: vi.fn(),
}));

vi.mock("@/lib/telemetry/log-invocation", () => ({
  logInvocation: vi.fn(),
}));

vi.mock("@/lib/analytics/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSafeSession: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

import { POST } from "./route";
import {
  incrementPromptCopyCount,
  getPromptBySlug,
} from "@/lib/db/queries";
import { logInvocation } from "@/lib/telemetry/log-invocation";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { getSafeSession } from "@/lib/auth";

const mockIncrement = vi.mocked(incrementPromptCopyCount);
const mockGetPrompt = vi.mocked(getPromptBySlug);
const mockLog = vi.mocked(logInvocation);
const mockCapture = vi.mocked(captureServerEvent);
const mockGetSession = vi.mocked(getSafeSession);

function makeReq() {
  return new Request("http://localhost/api/prompts/code-review/copy", {
    method: "POST",
  });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("POST /api/prompts/[slug]/copy", () => {
  beforeEach(() => {
    mockIncrement.mockReset();
    mockGetPrompt.mockReset();
    mockLog.mockReset();
    mockCapture.mockReset();
    mockGetSession.mockReset();

    mockGetSession.mockResolvedValue({ data: null } as never);
    mockLog.mockResolvedValue({
      id: "inv-1",
      promptSlug: "x",
      promptVersion: "1.0",
      source: "web",
      caller: null,
      userId: null,
      agentId: null,
      sessionId: null,
      clientIpHash: null,
      variables: null,
      status: "completed",
      model: null,
      latencyMs: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      errorMessage: null,
      externalTraceId: null,
      externalSpanId: null,
      metadata: null,
      createdAt: new Date(),
      completedAt: new Date(),
    } as never);
  });

  test("happy path — increments, fires PostHog, writes invocation", async () => {
    mockIncrement.mockResolvedValue({ copyCount: 7 });
    mockGetPrompt.mockResolvedValue({
      id: "p1",
      slug: "code-review",
      version: "1.0",
    } as never);

    const res = await POST(makeReq(), makeParams("code-review"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.copyCount).toBe(7);
    expect(mockLog).toHaveBeenCalledOnce();
    const callArg = mockLog.mock.calls[0][0];
    expect(callArg.input.prompt_slug).toBe("code-review");
    expect(callArg.input.prompt_version).toBe("1.0");
    expect(callArg.input.source).toBe("web");
    expect(mockCapture).toHaveBeenCalledOnce();
    expect(mockCapture.mock.calls[0][1]).toBe("prompt_copied");
  });

  test("MDX-only prompt — increment fails, falls back to version='unknown'", async () => {
    mockIncrement.mockRejectedValue(new Error("not in db"));
    mockGetPrompt.mockResolvedValue(undefined);

    const res = await POST(makeReq(), makeParams("mdx-only"));

    expect(res.status).toBe(200);
    expect(mockLog).toHaveBeenCalledOnce();
    const callArg = mockLog.mock.calls[0][0];
    expect(callArg.input.prompt_slug).toBe("mdx-only");
    expect(callArg.input.prompt_version).toBe("unknown");
  });

  test("logInvocation failure does not crash the route", async () => {
    mockIncrement.mockResolvedValue({ copyCount: 1 });
    mockGetPrompt.mockResolvedValue({
      id: "p1",
      slug: "x",
      version: "1.0",
    } as never);
    mockLog.mockRejectedValue(new Error("db down"));

    const res = await POST(makeReq(), makeParams("x"));

    // Route should still succeed; logging is best-effort
    expect(res.status).toBe(200);
    expect(mockCapture).toHaveBeenCalledOnce();
  });
});
