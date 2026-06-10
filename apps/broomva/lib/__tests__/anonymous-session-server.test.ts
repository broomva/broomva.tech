// Pins the anonymous-session cookie contract (#249): the server-set
// cookie MUST be client-readable (httpOnly: false) because the
// remaining-credits banner reads it via document.cookie
// (anonymous-session-client.ts getAnonymousSession → useGetCredits).
// With httpOnly: true the per-message decrement was invisible to the
// client and the banner stuck at the default credit count.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSet, get: cookieGet })),
}));

import { setAnonymousSession } from "@/lib/anonymous-session-server";
import { ANONYMOUS_SESSION_COOKIES_KEY } from "@/lib/constants";

describe("setAnonymousSession cookie contract", () => {
  beforeEach(() => {
    cookieSet.mockClear();
  });

  it("writes a client-readable (non-httpOnly) cookie with the session JSON", async () => {
    const session = {
      id: "anon-test",
      remainingCredits: 46,
      createdAt: new Date("2026-06-10T00:00:00Z"),
    };

    await setAnonymousSession(session);

    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSet.mock.calls[0];
    expect(name).toBe(ANONYMOUS_SESSION_COOKIES_KEY);
    expect(JSON.parse(value).remainingCredits).toBe(46);
    expect(options).toMatchObject({
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  });
});
