import { createNeonAuth } from "@neondatabase/auth/next/server";
import { env } from "@/lib/env";

const neonAuthBaseUrl = process.env.NEON_AUTH_BASE_URL;

export const auth = createNeonAuth({
  baseUrl: neonAuthBaseUrl || process.env.APP_URL || "http://localhost:3001",
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET || env.AUTH_SECRET || "default_secret_for_build",
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
