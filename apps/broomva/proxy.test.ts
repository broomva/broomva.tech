import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";
import { auth, getSafeSession, hasNeonAuth } from "@/lib/auth";
import { hasCurrentLegalAcceptance } from "@/lib/db/legal-acceptance";
import { proxy } from "./proxy";

const mockAuthMiddleware = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {
    middleware: vi.fn(() => mockAuthMiddleware),
  },
  getSafeSession: vi.fn(),
  hasNeonAuth: true,
}));
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
  mockAuthMiddleware.mockReset();
  mockGetSafeSession.mockResolvedValue({ data: { session: null, user: null } });
  mockAcceptance.mockResolvedValue(true);
  mockVerifyLifeJWT.mockResolvedValue(null);
  mockAuthMiddleware.mockResolvedValue(null);
});

describe("proxy public artifact routes", () => {
  test("allows the presenter mirror only on the versioned deck document", async () => {
    const response = await proxy(
      req("/agent-workspaces/v1.0.0/deck/index.html?mirror"),
    );
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self'",
    );
    expect(response.headers.get("Content-Security-Policy")).not.toContain(
      "frame-ancestors 'none'",
    );
  });

  test.each([
    "/agent-workspaces",
    "/agent-workspaces/v1.0.0/downloads/agent-workspaces-guide.pdf",
    "/agent-workspaces/v1.0.0/deck/other.html",
    "/agent-workspaces/v1.0.0/deck/index.html/extra",
    "/projects",
  ])("retains frame blocking outside the deck: %s", async (pathname) => {
    const response = await proxy(req(pathname));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test.each([
    "/agent-workspaces",
    "/agent-workspaces/deck/",
    "/agent-workspaces/v1.0.0/deck/index.html",
    "/agent-workspaces/v1.0.0/downloads/agent-workspaces-guide.pdf",
  ])("allows anonymous keynote readers through: %s", async (pathname) => {
    const response = await proxy(req(pathname));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mockGetSafeSession).not.toHaveBeenCalled();
  });

  test.each(["/d/hackathon-fork-inventory", "/h/demo-handoff", "/swapit"])(
    "no longer treats retired surface %s as public (BRO-3833)",
    async (pathname) => {
      const response = await proxy(req(pathname));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://broomva.tech/login?redirectTo=${encodeURIComponent(pathname)}`,
      );
    },
  );

  test.each([
    "/api/prompts/example/copy",
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
      req("/api/prompts/example/copy", {
        method: "POST",
        headers: { Authorization: "Bearer accepted-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockVerifyLifeJWT).toHaveBeenCalledWith("accepted-token");
    expect(mockAcceptance).toHaveBeenCalledWith("user-1");
  });

  test("does NOT treat a sibling like /prompts-admin as public (boundary match)", async () => {
    const response = await proxy(req("/prompts-admin"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://broomva.tech/login?redirectTo=%2Fprompts-admin",
    );
  });

  test("still redirects private app pages for anonymous visitors", async () => {
    const response = await proxy(req("/maestro"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://broomva.tech/login?redirectTo=%2Fmaestro",
    );
  });

  test("preserves query params on login redirect for device auth", async () => {
    const response = await proxy(req("/device?code=PPUC-8799"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://broomva.tech/login?redirectTo=%2Fdevice%3Fcode%3DPPUC-8799",
    );
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

describe("proxy OAuth verifier and deep-linking", () => {
  test("delegates to auth.middleware when neon_auth_session_verifier is present", async () => {
    const redirectResponse = new Response(null, {
      status: 307,
      headers: {
        Location: "https://broomva.tech/legal-acceptance?next=%2Fdevice",
        "Set-Cookie": "__Secure-neon-auth.session_token=valid-token; Path=/",
      },
    });
    mockAuthMiddleware.mockResolvedValue(redirectResponse);

    const response = await proxy(
      req(
        "/legal-acceptance?next=%2Fdevice&neon_auth_session_verifier=verifier123",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://broomva.tech/legal-acceptance?next=%2Fdevice",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "__Secure-neon-auth.session_token=valid-token",
    );
  });

  test("redirects logged-in user on /login to redirectTo if present", async () => {
    mockGetSafeSession.mockResolvedValue({
      data: {
        session: { id: "session-1" },
        user: { id: "user-1", email: "u@example.com" },
      },
    } as never);

    const response = await proxy(
      req("/login?redirectTo=%2Fdevice%3Fcode%3DPPUC-8799"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://broomva.tech/device?code=PPUC-8799",
    );
  });

  test.each([
    "%2F%5Cevil.example",
    "%2F%2Fevil.example",
    "%2F%09%2Fevil.example",
    "https%3A%2F%2Fevil.example",
  ])("never redirects a logged-in user off-site via redirectTo=%s", async (target) => {
    mockGetSafeSession.mockResolvedValue({
      data: {
        session: { id: "session-1" },
        user: { id: "user-1", email: "u@example.com" },
      },
    } as never);

    const response = await proxy(req(`/login?redirectTo=${target}`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://broomva.tech/");
  });

  test("ignores a retired ?plan= and sends a logged-in user home (BRO-3833)", async () => {
    mockGetSafeSession.mockResolvedValue({
      data: {
        session: { id: "session-1" },
        user: { id: "user-1", email: "u@example.com" },
      },
    } as never);

    const response = await proxy(req("/register?plan=pro"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://broomva.tech/");
  });
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
      "https://broomva.tech/legal-acceptance?next=%2Fmaestro",
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

  test.each(["/legal-acceptance"])(
    "keeps the required exception reachable: %s",
    async (pathname) => {
      mockAcceptance.mockResolvedValue(false);

      const response = await proxy(req(pathname));

      expect(response.status).toBe(200);
    },
  );
});
