import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/queries", () => ({
  createPromptInvocation: vi.fn(),
}));

import { logInvocation } from "./log-invocation";
import { createPromptInvocation } from "@/lib/db/queries";

const mockCreate = vi.mocked(createPromptInvocation);

describe("logInvocation", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      id: "fixed-uuid",
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
      createdAt: new Date(),
      completedAt: null,
    } as never);
  });

  test("happy path — calls createPromptInvocation with shaped values", async () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const result = await logInvocation({
      request: req,
      input: {
        prompt_slug: "code-review-agent",
        prompt_version: "1.0",
        source: "web",
      },
      auth: null,
    });
    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.promptSlug).toBe("code-review-agent");
    expect(call.promptVersion).toBe("1.0");
    expect(call.source).toBe("web");
    expect(call.clientIpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.id).toBe("fixed-uuid");
  });

  test("variables are hashed (not raw) by default", async () => {
    const req = new Request("http://localhost/");
    await logInvocation({
      request: req,
      input: {
        prompt_slug: "x",
        prompt_version: "1.0",
        source: "cli",
        variables: { language: "python" },
      },
      auth: null,
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.variables).toEqual({ language: expect.stringMatching(/^[a-f0-9]{16}$/) });
  });

  test("user_id and agent_id come from auth when present", async () => {
    const req = new Request("http://localhost/");
    await logInvocation({
      request: req,
      input: { prompt_slug: "x", prompt_version: "1.0", source: "skill" },
      auth: { userId: "user_123", email: "x@y.z", agentId: "agent_99" },
    });
    const call = mockCreate.mock.calls[0][0];
    expect(call.userId).toBe("user_123");
    expect(call.agentId).toBe("agent_99");
  });

  test("missing prompt_slug rejects with TypeError", async () => {
    const req = new Request("http://localhost/");
    await expect(
      logInvocation({
        request: req,
        // @ts-expect-error — intentional bad input
        input: { prompt_version: "1.0", source: "web" },
        auth: null,
      }),
    ).rejects.toThrow();
  });
});
