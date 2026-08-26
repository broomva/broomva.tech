import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSafeSession: vi.fn(),
  hasCurrentLegalAcceptance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth", () => ({ getSafeSession: mocks.getSafeSession }));
vi.mock("@/lib/db/legal-acceptance", () => ({
  hasCurrentLegalAcceptance: mocks.hasCurrentLegalAcceptance,
}));

import {
  callerOwnsLifeSession,
  resolveAcceptedLifeConsumer,
} from "./legal-access";

describe("Life legal-access boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getSafeSession.mockResolvedValue({ data: null });
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
  });

  it("rejects anonymous and stale-policy prompt consumers", async () => {
    await expect(resolveAcceptedLifeConsumer()).resolves.toBeNull();

    mocks.getSafeSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    await expect(resolveAcceptedLifeConsumer()).resolves.toBeNull();
  });

  it("resolves only an accepted user consumer", async () => {
    mocks.getSafeSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(true);

    await expect(resolveAcceptedLifeConsumer()).resolves.toEqual({
      kind: "user",
      id: "user-1",
    });
  });

  it.each([
    ["anon", "legacy-anon-id"],
    ["agent", "anonymous"],
    ["agent", "0xlegacy-wallet"],
  ] as const)(
    "fails closed for legacy unowned %s session",
    async (consumerKind, consumerId) => {
      await expect(
        callerOwnsLifeSession({ consumerKind, consumerId }),
      ).resolves.toBe(false);
    },
  );
  it("requires owner match and current acceptance for user state", async () => {
    mocks.getSafeSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    await expect(
      callerOwnsLifeSession({ consumerKind: "user", consumerId: "user-1" }),
    ).resolves.toBe(false);

    mocks.hasCurrentLegalAcceptance.mockResolvedValue(true);
    await expect(
      callerOwnsLifeSession({ consumerKind: "user", consumerId: "user-1" }),
    ).resolves.toBe(true);
  });
});
