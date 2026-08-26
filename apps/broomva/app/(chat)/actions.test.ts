import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  getLanguageModel: vi.fn(),
  getSafeSession: vi.fn(),
  requireCurrentLegalAcceptance: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/ai/providers", () => ({
  getLanguageModel: mocks.getLanguageModel,
}));
vi.mock("@/lib/auth", () => ({ getSafeSession: mocks.getSafeSession }));
vi.mock("@/lib/legal-acceptance-gate", () => ({
  requireCurrentLegalAcceptance: mocks.requireCurrentLegalAcceptance,
}));

import { generateTitleFromUserMessage } from "./actions";

const message = {
  id: "message-1",
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Adversarial audit" }],
  metadata: {
    createdAt: new Date("2026-08-09T12:00:00.000Z"),
    parentMessageId: null,
    selectedModel: "openai/gpt-5-mini" as const,
    activeStreamId: null,
  },
};

describe("generateTitleFromUserMessage boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSafeSession.mockResolvedValue({ data: null });
    mocks.getLanguageModel.mockResolvedValue("model");
    mocks.generateText.mockResolvedValue({ text: "Audit" });
  });

  it("rejects direct anonymous Server Action invocation before AI dispatch", async () => {
    await expect(generateTitleFromUserMessage({ message })).rejects.toThrow(
      "Authentication required",
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("checks current acceptance before dispatching for an authenticated user", async () => {
    mocks.getSafeSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    await expect(generateTitleFromUserMessage({ message })).resolves.toBe(
      "Audit",
    );
    expect(mocks.requireCurrentLegalAcceptance).toHaveBeenCalledWith("user-1");
    expect(mocks.generateText).toHaveBeenCalledOnce();
  });
});
