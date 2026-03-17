import { createNeonAuth } from "@neondatabase/auth/next/server";
import { env } from "@/lib/env";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL || process.env.APP_URL || "http://localhost:3001",
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET || env.AUTH_SECRET || "default_secret_for_build",
  },
});

// Use Awaited to infer the session type from the actual runtime method
export type Session = NonNullable<Awaited<ReturnType<typeof auth.getSession>>>["data"];
