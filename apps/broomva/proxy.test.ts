import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getSafeSession } from "@/lib/auth";
import { proxy } from "./proxy";

vi.mock("@/lib/auth", () => ({ getSafeSession: vi.fn() }));

const mockGetSafeSession = vi.mocked(getSafeSession);

function req(pathname: string) {
  return new NextRequest(`https://broomva.tech${pathname}`);
}

beforeEach(() => {
  mockGetSafeSession.mockReset();
  mockGetSafeSession.mockResolvedValue({ data: { session: null, user: null } });
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

  test("still redirects private app pages for anonymous visitors", async () => {
    const response = await proxy(req("/maestro"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://broomva.tech/login");
  });
});
