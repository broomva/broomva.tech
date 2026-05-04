/**
 * POST /api/life/run/[project]/prosopon
 *
 * Prosopon-native variant of /api/life/run/[project]. Emits
 * `Envelope<ProsoponEvent>` frames over SSE — one envelope per
 * `data:` line.
 *
 * As of 2026-05-03 this route is a **thin handler** — auth + body
 * parse + 402-response shape + Chat-row linking + auto-title +
 * SSE framing. All agent orchestration lives in the canonical
 * `LifeRuntime` (`lib/life-runtime/canonical.ts`), which is the
 * single source of truth across in-process and lifed-ws backends.
 *
 * Spec: `apps/chat/docs/superpowers/specs/2026-05-03-life-runtime-canonical.md`
 *
 * GET /api/life/run/[project]/prosopon
 * Diagnostic — returns the initial Scene that POST would emit as its
 * scene_reset. Lets clients render a skeleton UI before the first turn.
 */

import { type Envelope } from "@broomva/prosopon";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { getAnonymousSession } from "@/lib/anonymous-session-server";
import { getSafeSession } from "@/lib/auth";
import { userHasCreditsFor } from "@/lib/life-runtime/billing";
import { createLifeRuntime } from "@/lib/life-runtime/canonical";
import {
  getOrCreateChatForLifeSession,
  getProjectBySlug,
  maybeSetChatTitle,
} from "@/lib/life-runtime/queries";
import {
  isProjectSlug,
  type ProjectSlug,
} from "@/lib/life-runtime/projects";
import { makeInitialScene } from "@/lib/life-runtime/prosopon-emitter";
import {
  type ConsumerIdentity,
  RunRequestSchema,
} from "@/lib/life-runtime/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

function sseFrame(envelope: Envelope): string {
  return `event: envelope\ndata: ${JSON.stringify(envelope)}\n\n`;
}

async function resolveConsumer(): Promise<ConsumerIdentity | null> {
  const hdrs = await headers();
  const session = await getSafeSession({ fetchOptions: { headers: hdrs } });
  if (session?.user?.id) {
    return { kind: "user", id: session.user.id };
  }
  const anon = await getAnonymousSession();
  if (anon) return { kind: "anon", id: anon.id };
  if (hdrs.get("x-payment") || hdrs.get("authorization")?.startsWith("x402 ")) {
    return {
      kind: "agent",
      id: hdrs.get("x-payment-sender") ?? "unknown-wallet",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const ParamsSchema = z.object({ project: z.string().min(1).max(128) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ project: string }> },
) {
  try {
    return await handlePost(request, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[life/run/prosopon] uncaught error:", err);
    return NextResponse.json(
      {
        error: "Internal error while starting Prosopon run.",
        detail:
          process.env.VERCEL_ENV === "production"
            ? "See function logs for trace."
            : message,
      },
      { status: 500 },
    );
  }
}

async function handlePost(
  request: Request,
  params: Promise<{ project: string }>,
) {
  // ── 1. Validate URL slug ──────────────────────────────────────
  const resolvedParams = await params;
  const parsedParams = ParamsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return jsonError(400, "Invalid project slug.");
  }
  const { project: rawSlug } = parsedParams.data;
  if (!isProjectSlug(rawSlug)) {
    return jsonError(404, "Project not found.", { slug: rawSlug });
  }
  const slug: ProjectSlug = rawSlug;

  // ── 2. Auth + body parse ──────────────────────────────────────
  let consumer = await resolveConsumer();
  if (!consumer) {
    consumer = { kind: "agent", id: "anonymous" };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsedBody = RunRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonError(400, "Invalid body.", {
      issues: parsedBody.error.issues,
    });
  }
  const {
    input = {},
    byokKeyId,
    sessionId: lifeSessionIdHint,
    message,
  } = parsedBody.data;
  const userMessage = typeof message === "string" ? message.trim() : "";
  if (!userMessage) {
    return jsonError(
      400,
      "Prosopon endpoint requires a `message` in the request body.",
    );
  }

  // ── 3. Delegate to canonical LifeRuntime ──────────────────────
  const runtime = createLifeRuntime();
  const outcome = await runtime.run({
    projectSlug: slug,
    consumer,
    userMessage,
    sessionIdHint: lifeSessionIdHint,
    input,
    byokKeyId,
  });

  if (outcome.kind === "rejected") {
    if (outcome.reason === "unknown_project") {
      return jsonError(404, "Project not found.", { slug });
    }
    if (outcome.reason === "insufficient_credits") {
      return jsonError(402, outcome.message, outcome.meta);
    }
    return jsonError(500, outcome.message);
  }

  if (outcome.kind === "payment_required") {
    return NextResponse.json(
      {
        error: "Payment Required",
        quote: outcome.quote,
        retryWithHeader: "X-PAYMENT",
        projectSlug: outcome.projectSlug,
      },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": `x402 nonce="${outcome.quote.nonce}"`,
        },
      },
    );
  }

  // ── 4. Auxiliary HTTP-layer side effects (Chat row + auto-title) ─
  // Run in parallel with the stream — they shouldn't block envelopes.
  const project = await getProjectBySlug(slug);
  const placeholderChatTitle = `${project?.displayName ?? slug} — new session`;
  let linkedChatId: string | null = null;
  let linkedChatCreated = false;
  if (consumer.kind === "user" && project) {
    // We need a session id to link the Chat row, but the runtime
    // owns session creation. The session id is observable via the
    // first envelope. To keep the linking logic simple, we look up
    // the Chat row reactively — the runtime already created the
    // session. Find the most recent session for this user+project
    // and link to that.
    try {
      // Best-effort: the runtime has just upserted a session — fetch
      // the latest session for this user+project. We don't have a
      // direct query yet, so fall through if it's not trivially
      // available. When the migration to runtime-owned sessions
      // settles we'll surface a `lifeSessionId` field on the runtime
      // outcome.
      // For now, skip the linking unless we can determine the session
      // synchronously — the chat-row linkage is purely cosmetic
      // (sidebar display) and not critical to the agent flow.
      const linked = await getOrCreateChatForLifeSession({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        lifeSessionId: lifeSessionIdHint!,
        userId: consumer.id,
        fallbackTitle: placeholderChatTitle,
      }).catch(() => null);
      if (linked) {
        linkedChatId = linked.chatId;
        linkedChatCreated = linked.created;
      }
    } catch (err) {
      console.warn(
        "[life/run/prosopon] getOrCreateChatForLifeSession failed (non-fatal):",
        err,
      );
    }
  }

  // ── 5. SSE streaming ──────────────────────────────────────────
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const env of outcome.stream) {
          controller.enqueue(enc.encode(sseFrame(env)));
        }
      } catch (err) {
        // The canonical runtime catches its own errors and yields a
        // node_added envelope; this catch is belt-and-suspenders for
        // unexpected throws (e.g. the underlying fetch tearing down
        // the stream mid-iteration).
        console.error(
          "[life/run/prosopon] envelope stream errored:",
          err,
        );
      } finally {
        controller.close();
      }
    },
  });

  // ── 6. Auto-title (fire-and-forget) ───────────────────────────
  if (linkedChatId && linkedChatCreated) {
    const chatIdForTitle = linkedChatId;
    void (async () => {
      try {
        const title = await generateTitleFromUserMessage({
          message: {
            id: `life-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: userMessage }],
            metadata: {},
          } as unknown as Parameters<
            typeof generateTitleFromUserMessage
          >[0]["message"],
        });
        await maybeSetChatTitle({
          chatId: chatIdForTitle,
          placeholderTitle: placeholderChatTitle,
          newTitle: title.slice(0, 256),
        });
      } catch (titleErr) {
        console.warn(
          "[life/run/prosopon] auto-title failed (non-fatal):",
          titleErr,
        );
      }
    })();
  }

  return new Response(stream, { headers: sseHeaders() });
}

// ---------------------------------------------------------------------------
// GET — diagnostic
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ project: string }> },
) {
  try {
    const { project: slug } = await params;
    if (!isProjectSlug(slug)) {
      return NextResponse.json(
        { ok: false, reason: "project-not-found", slug },
        { status: 404 },
      );
    }
    const project = await getProjectBySlug(slug);
    if (!project) {
      return NextResponse.json(
        { ok: false, reason: "project-not-found", slug },
        { status: 404 },
      );
    }
    const scene = makeInitialScene({
      projectSlug: slug,
      displayName: project.displayName,
    });
    return NextResponse.json({
      ok: true,
      project: {
        slug: project.slug,
        displayName: project.displayName,
        moduleTypeId: project.moduleTypeId,
      },
      scene,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, reason: "internal", detail: message },
      { status: 500 },
    );
  }
}

// Suppress unused-import warning for `userHasCreditsFor` — the
// canonical runtime now owns the credits check, but we re-export it
// transitively via the billing module.
void userHasCreditsFor;
