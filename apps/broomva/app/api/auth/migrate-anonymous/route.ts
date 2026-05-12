/**
 * POST /api/auth/migrate-anonymous — BRO-227
 *
 * When an anonymous user signs up mid-session, migrates their conversation
 * history into the new authenticated account and upgrades the live Arcan
 * session's PolicySet without requiring a session restart.
 *
 * Flow:
 *  1. Verify the caller is now authenticated (Better Auth session).
 *  2. Read the anonymous session cookie to confirm it belongs to this browser.
 *  3. Save conversation messages to the Chat DB under the new user.
 *  4. PATCH /sessions/{anonymous_session_id}/identity on arcand.
 *  5. Clear the anonymous session cookie.
 *  6. Return { saved: true, message: "..." }.
 */

import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { ANONYMOUS_SESSION_COOKIES_KEY } from "@/lib/constants";
import { saveChat, saveChatMessages } from "@/lib/db/queries";
import { ArcanClient } from "@/lib/arcan/client";
import { resolveArcanEndpoints } from "@/lib/arcan/resolve";
import type { ChatMessage } from "@/lib/ai/types";

interface MigrateRequest {
  /** The Arcan session ID assigned to the anonymous session. */
  anonymous_session_id: string;
  /** Full message list from the anonymous context (client-side history). */
  messages: ChatMessage[];
  /** Chat title derived from the first user message. */
  title?: string;
  /** Optional project to attach the migrated chat to. */
  project_id?: string;
}

export async function POST(request: NextRequest) {
  // 1. Require authenticated session.
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate the anonymous session cookie is present (belongs to this browser).
  const cookieStore = await cookies();
  const anonCookie = cookieStore.get(ANONYMOUS_SESSION_COOKIES_KEY);
  if (!anonCookie?.value) {
    return NextResponse.json(
      { error: "No anonymous session found for this browser" },
      { status: 400 }
    );
  }

  let body: MigrateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { anonymous_session_id, messages, title, project_id } = body;

  if (!anonymous_session_id) {
    return NextResponse.json(
      { error: "anonymous_session_id is required" },
      { status: 400 }
    );
  }

  // 3. Persist conversation to Chat DB under the new authenticated user.
  const chatId = crypto.randomUUID();
  const chatTitle = title ?? "Migrated conversation";

  try {
    await saveChat({
      id: chatId,
      userId,
      title: chatTitle,
      projectId: project_id,
    });

    if (messages.length > 0) {
      const dbMessages = messages.map((msg) => ({
        id: crypto.randomUUID(),
        chatId,
        message: msg,
      }));
      await saveChatMessages({ messages: dbMessages });
    }
  } catch (err) {
    console.error("[migrate-anonymous] DB save failed:", err);
    return NextResponse.json(
      { error: "Failed to save conversation history" },
      { status: 500 }
    );
  }

  // 4. Upgrade the live Arcan session identity (best-effort — don't fail the
  //    migration if Arcan is unreachable; the DB history is already saved).
  try {
    const { dedicated, shared } = await resolveArcanEndpoints(userId);
    const endpoints = [dedicated, shared].filter(Boolean);

    for (const ep of endpoints) {
      if (!ep) continue;
      try {
        const client = await ArcanClient.forUser(ep.arcanUrl, {
          id: userId,
          email: session.user.email ?? `${userId}@guest`,
        });
        await client.upgradeIdentity(anonymous_session_id, userId);
        break; // success — stop trying further endpoints
      } catch {
        // Try next endpoint
      }
    }
  } catch (err) {
    // Non-fatal: log and continue — the DB migration succeeded.
    console.warn("[migrate-anonymous] Arcan identity upgrade failed:", err);
  }

  // 5. Clear the anonymous session cookie.
  cookieStore.delete(ANONYMOUS_SESSION_COOKIES_KEY);

  return NextResponse.json({
    saved: true,
    chat_id: chatId,
    message: "Your conversation has been saved to your account",
  });
}
