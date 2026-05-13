import "server-only";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";

export interface AuthedConsumer {
  userId: string;
  email: string;
  projectId: string; // resolved from active workspace context; v1 default = "personal"
}

/**
 * Validate the Better Auth session cookie on a Route Handler request.
 * Throws a Response (401) if no valid session exists; that Response should
 * be returned directly from the handler.
 *
 * Uses `getSafeSession` (broomva's wrapper over `auth.getSession`) which
 * degrades gracefully to `{ data: null }` when Neon Auth isn't configured.
 * v1 returns `projectId: "personal"` for everyone — multi-tenant lands with
 * the org plugin.
 */
export async function requireSession(): Promise<AuthedConsumer> {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    throw new Response("unauthorized", { status: 401 });
  }
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    projectId: "personal",
  };
}
