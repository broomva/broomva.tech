import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSafeSession: vi.fn(),
  hasCurrentLegalAcceptance: vi.fn(),
  verifyLifeJWT: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({
  getSafeSession: mocks.getSafeSession,
}));
vi.mock("@/lib/db/legal-acceptance", () => ({
  hasCurrentLegalAcceptance: mocks.hasCurrentLegalAcceptance,
}));
vi.mock("@/lib/ai/vault/jwt", () => ({
  verifyLifeJWT: mocks.verifyLifeJWT,
}));

import { withAuth, withRelayAuth } from "./with-auth";

const session = {
  user: { id: "user-1", email: "user@example.test", name: "Test User" },
};

describe("withAuth legal-acceptance boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSafeSession.mockResolvedValue({ data: session, error: null });
  });

  it("rejects a missing session", async () => {
    mocks.getSafeSession.mockResolvedValue({ data: null, error: null });
    const route = withAuth(async () => Response.json({ ok: true }));
    expect((await route(new Request("https://example.test"))).status).toBe(401);
  });

  it("rejects a session without the current acceptance", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
    const route = withAuth(async () => Response.json({ ok: true }));
    expect((await route(new Request("https://example.test"))).status).toBe(403);
  });

  it("passes a session with the current acceptance", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(true);
    const route = withAuth(async (_request, context) =>
      Response.json({ userId: context.userId }),
    );
    const response = await route(new Request("https://example.test"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId: "user-1" });
  });

  it("allows an explicit cancellation-access exception", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
    const route = withAuth(async () => Response.json({ ok: true }), {
      requireLegalAcceptance: false,
    });
    expect((await route(new Request("https://example.test"))).status).toBe(200);
    expect(mocks.hasCurrentLegalAcceptance).not.toHaveBeenCalled();
  });
});

describe("withRelayAuth legal-acceptance boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyLifeJWT.mockResolvedValue({
      sub: "user-1",
      email: "user@example.test",
      termsVersion: "2026-08-09",
      privacyVersion: "2026-08-09",
    });
  });

  it("rejects a valid bearer identity without current acceptance", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
    const route = withRelayAuth(async () => Response.json({ ok: true }));
    const response = await route(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("passes a current bearer identity", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(true);
    const route = withRelayAuth(async (_request, context) =>
      Response.json({ userId: context.userId }),
    );
    const response = await route(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(200);
  });
});
