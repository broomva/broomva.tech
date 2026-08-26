import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";
import { getSafeSession } from "@/lib/auth";
import { hasCurrentLegalAcceptance } from "@/lib/db/legal-acceptance";
import { proxy } from "./proxy";

vi.mock("@/lib/auth", () => ({ getSafeSession: vi.fn() }));
vi.mock("@/lib/ai/vault/jwt", () => ({ verifyLifeJWT: vi.fn() }));
vi.mock("@/lib/db/legal-acceptance", () => ({
  hasCurrentLegalAcceptance: vi.fn(),
}));

const mockGetSafeSession = vi.mocked(getSafeSession);
const mockAcceptance = vi.mocked(hasCurrentLegalAcceptance);
const mockVerifyLifeJWT = vi.mocked(verifyLifeJWT);

function req(
  pathname: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`https://broomva.tech${pathname}`, init);
}

beforeEach(() => {
  mockGetSafeSession.mockReset();
  mockAcceptance.mockReset();
  mockVerifyLifeJWT.mockReset();
  mockGetSafeSession.mockResolvedValue({ data: { session: null, user: null } });
  mockAcceptance.mockResolvedValue(true);
  mockVerifyLifeJWT.mockResolvedValue(null);
});

describe("proxy public artifact routes", () => {
  test("allows anonymous public spec pages through to the route handler", async () => {
    const response = await proxy(req("/d/hackathon-fork-inventory"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetSafeSession).not.toHaveBeenCalled();
  });

  test("allows anonymous public handoff pages through to the route handler", async () => {
    const response = await proxy(req("/h/demo-handoff"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetSafeSession).not.toHaveBeenCalled();
  });

  test("allows the anonymous swapit commons page through to the handler", async () => {
    const response = await proxy(req("/swapit"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetSafeSession).not.toHaveBeenCalled();
  });

  test("allows the public swapit commons API (GET browse/pull) through", async () => {
    const response = await proxy(
      req("/api/swapit/facts?kind=procurement_option&region=US"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetSafeSession).toHaveBeenCalledOnce();
  });

  test.each([
    "/api/invocations",
    "/api/feedback",
    "/api/prompts/example/copy",
    "/api/swapit/facts",
  ])("blocks anonymous data-writing surface %s", async (pathname) => {
    const response = await proxy(req(pathname, { method: "POST" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication and current legal acceptance are required",
    });
  });

  test("allows an accepted CLI bearer token to reach a write handler", async () => {
    mockVerifyLifeJWT.mockResolvedValue({ sub: "user-1" } as never);

    const response = await proxy(
      req("/api/invocations", {
        method: "POST",
        headers: { Authorization: "Bearer accepted-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockVerifyLifeJWT).toHaveBeenCalledWith("accepted-token");
    expect(mockAcceptance).toHaveBeenCalledWith("user-1");
  });

  test.each(["/api/prompts/example/copy", "/api/swapit/facts"])(
    "allows accepted bearer write %s to reach its auth-rechecking handler",
    async (pathname) => {
      mockVerifyLifeJWT.mockResolvedValue({ sub: "user-1" } as never);

      const response = await proxy(
        req(pathname, {
          method: "POST",
          headers: { Authorization: "Bearer accepted-token" },
        }),
      );

      expect(response.status).toBe(200);
      expect(mockVerifyLifeJWT).toHaveBeenCalledWith("accepted-token");
      expect(mockAcceptance).toHaveBeenCalledWith("user-1");
    },
  );

  test("does NOT treat a sibling like /swapit-admin as public (boundary match)", async () => {
    const response = await proxy(req("/swapit-admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://broomva.tech/login");
  });

  test("still redirects private app pages for anonymous visitors", async () => {
    const response = await proxy(req("/maestro"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://broomva.tech/login");
  });

  test.each(["/security", "/subprocessors"])(
    "allows anonymous legal transparency page %s",
    async (pathname) => {
      const response = await proxy(req(pathname));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );
});

describe("proxy legal-acceptance boundary", () => {
  beforeEach(() => {
    mockGetSafeSession.mockResolvedValue({
      data: {
        session: { id: "session-1" },
        user: { id: "user-1", email: "u@example.com" },
      },
    } as never);
  });

  test("redirects an authenticated page request without current acceptance", async () => {
    mockAcceptance.mockResolvedValue(false);

    const response = await proxy(req("/maestro"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://broomva.tech/legal-acceptance",
    );
  });

  test("rejects an authenticated public API request without current acceptance", async () => {
    mockAcceptance.mockResolvedValue(false);

    const response = await proxy(req("/api/trpc/chat.list"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Current legal acceptance required",
    });
  });

  test("allows current acceptance through", async () => {
    const response = await proxy(req("/maestro"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test.each(["/legal-acceptance", "/api/stripe/portal"])(
    "keeps the required exception reachable: %s",
    async (pathname) => {
      mockAcceptance.mockResolvedValue(false);

      const response = await proxy(req(pathname));

      expect(response.status).toBe(200);
    },
  );
});
