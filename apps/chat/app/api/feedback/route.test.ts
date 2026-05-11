import { describe, expect, test, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prompts/resolve-auth", () => ({
  resolveAuth: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  createPromptFeedbackRow: vi.fn(),
  getFeedbackForPrompt: vi.fn(),
}));

vi.mock("@/lib/telemetry/rate-limit", () => ({
  checkTelemetryRateLimit: vi.fn(),
}));

import { POST, GET } from "./route";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import {
  createPromptFeedbackRow,
  getFeedbackForPrompt,
} from "@/lib/db/queries";
import { checkTelemetryRateLimit } from "@/lib/telemetry/rate-limit";

const mockResolveAuth = vi.mocked(resolveAuth);
const mockCreate = vi.mocked(createPromptFeedbackRow);
const mockGet = vi.mocked(getFeedbackForPrompt);
const mockRateLimit = vi.mocked(checkTelemetryRateLimit);

function makePostReq(body: unknown) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeGetReq(qs: string) {
  return new Request(`http://localhost/api/feedback?${qs}`);
}

describe("/api/feedback", () => {
  beforeEach(() => {
    mockResolveAuth.mockReset();
    mockCreate.mockReset();
    mockGet.mockReset();
    mockRateLimit.mockReset();

    mockResolveAuth.mockResolvedValue(null);
    mockRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
    mockCreate.mockResolvedValue({
      id: "fb-1",
      invocationId: null,
      promptSlug: "x",
      promptVersion: "1.0",
      userId: null,
      signal: "thumbs_up",
      text: null,
      source: "web",
      createdAt: new Date("2026-05-11T00:00:00Z"),
    } as never);
    mockGet.mockResolvedValue([]);
  });

  test("POST 201 — attached feedback (with invocation_id)", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    const res = await POST(
      makePostReq({
        invocation_id: validUuid,
        prompt_slug: "x",
        prompt_version: "1.0",
        signal: "thumbs_up",
        source: "web",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledOnce();
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.invocationId).toBe(validUuid);
    expect(arg.signal).toBe("thumbs_up");
  });

  test("POST 201 — detached feedback (no invocation_id)", async () => {
    const res = await POST(
      makePostReq({
        prompt_slug: "x",
        prompt_version: "1.0",
        signal: "thumbs_down",
        source: "web",
      }),
    );
    expect(res.status).toBe(201);
    const arg = mockCreate.mock.calls[0][0];
    expect(arg.invocationId).toBeNull();
  });

  test("POST 400 — invalid signal value", async () => {
    const res = await POST(
      makePostReq({
        prompt_slug: "x",
        prompt_version: "1.0",
        signal: "neutral",
        source: "web",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("GET 200 — happy path returns array", async () => {
    mockGet.mockResolvedValue([
      {
        id: "fb-1",
        invocationId: null,
        promptSlug: "code-review-agent",
        promptVersion: "1.0",
        userId: null,
        signal: "thumbs_up",
        text: null,
        source: "web",
        createdAt: new Date("2026-05-11T00:00:00Z"),
      },
    ] as never);
    const res = await GET(makeGetReq("prompt_slug=code-review-agent"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(mockGet).toHaveBeenCalledOnce();
    expect(mockGet.mock.calls[0][0]).toEqual({
      promptSlug: "code-review-agent",
      limit: 8,
    });
  });

  test("GET 400 — missing prompt_slug", async () => {
    const res = await GET(makeGetReq(""));
    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
