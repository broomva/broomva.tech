import { createNeonAuth } from "@neondatabase/auth/next/server";
import { env } from "@/lib/env";

const neonAuthBaseUrl = process.env.NEON_AUTH_BASE_URL;

const cookieSecret =
  process.env.NEON_AUTH_COOKIE_SECRET || env.AUTH_SECRET || "";

if (
  neonAuthBaseUrl &&
  process.env.NODE_ENV === "production" &&
  cookieSecret.length < 32
) {
  throw new Error(
    "AUTH_SECRET or NEON_AUTH_COOKIE_SECRET must be set (>=32 chars) in production",
  );
}

export const auth = createNeonAuth({
  baseUrl: neonAuthBaseUrl || process.env.APP_URL || "http://localhost:3001",
  cookies: {
    secret: cookieSecret || "insecure-dev-only-secret-do-not-use-in-prod",
  },
});

export const hasNeonAuth = Boolean(neonAuthBaseUrl);

export async function getSafeSession(
  options?: Parameters<typeof auth.getSession>[0],
): Promise<Awaited<ReturnType<typeof auth.getSession>>> {
  if (!hasNeonAuth) {
    return {
      data: null,
      error: null,
    } as Awaited<ReturnType<typeof auth.getSession>>;
  }

  try {
    return await auth.getSession(options);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Neon Auth session lookup failed, continuing anonymously.", error);
    }

    return {
      data: null,
      error: error as Error,
    } as Awaited<ReturnType<typeof auth.getSession>>;
  }
}

// Use Awaited to infer the session type from the actual runtime method
export type Session = NonNullable<Awaited<ReturnType<typeof auth.getSession>>>["data"];
