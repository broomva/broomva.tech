/**
 * POST /api/life/run/[project]/prosopon
 *
 * Prosopon-native variant of /api/life/run/[project]. Emits
 * `Envelope<ProsoponEvent>` frames over SSE — one envelope per `data:` line.
 * The canonical wire format aligning broomva.tech/life with the Prosopon
 * display server.
 *
 * The legacy endpoint at /api/life/run/[project] (without /prosopon) still
 * exists for the current UI. It will be removed in PR C once the UI is
 * migrated to consume envelopes.
 *
 * Transport: SSE for now. A WS upgrade path lands when we deploy
 * prosopon-daemon and switch to its /ws fanout; for a single Next.js
 * process SSE is sufficient and CDN-friendly.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";

import {
  type Envelope,
  encode as encodeEnvelope,
  makeEnvelope,
  type ProsoponEvent,
  ProsoponSession,
} from "@broomva/prosopon";
import { getSafeSession } from "@/lib/auth";
import { getAnonymousSession } from "@/lib/anonymous-session-server";
import {
  appendRunEvent,
  bumpProjectStats,
  createRun,
  finishRun,
  getCurrentRulesVersion,
  getOrCreateSession,
  getProjectBySlug,
  getSessionHistory,
} from "@/lib/life-runtime/queries";
import {
  pickPaymentMode,
  settleCreditsDebit,
  userHasCreditsFor,
} from "@/lib/life-runtime/billing";
import { RealAgentRunner } from "@/lib/life-runtime/real-runner";
import {
  ProsoponEmitter,
  makeInitialScene,
  SCENE_ROOT_ID,
} from "@/lib/life-runtime/prosopon-emitter";
import {
  RunRequestSchema,
  type ConsumerIdentity,
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
  // SSE: one envelope per "data:" block; event name = "envelope" so clients
  // can addEventListener("envelope") just like prosopon-daemon's fanout.
  const json = JSON.stringify(envelope);
  return `event: envelope\ndata: ${json}\n\n`;
}

async function resolveConsumer(): Promise<ConsumerIdentity | null> {
  const hdrs = await headers();
  const session = await getSafeSession({ fetchOptions: { headers: hdrs } });
  if (session?.user?.id) {
    return { kind: "user", id: session.user.id };
  }
  const anon = await getAnonymousSession();
  if (anon) return { kind: "anon", id: anon.id };
  if (
    hdrs.get("x-payment") ||
    hdrs.get("authorization")?.startsWith("x402 ")
  ) {
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
  const resolvedParams = await params;
  const parsedParams = ParamsSchema.safeParse(resolvedParams);
  if (!parsedParams.success) {
    return jsonError(400, "Invalid project slug.");
  }
  const { project: slug } = parsedParams.data;

  const project = await getProjectBySlug(slug);
  if (!project) return jsonError(404, "Project not found.");
  if (project.status !== "active") {
    return jsonError(403, `Project is ${project.status}.`);
  }

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
    return jsonError(400, "Invalid body.", { issues: parsedBody.error.issues });
  }
  const {
    input = {},
    byokKeyId,
    sessionId: lifeSessionIdHint,
    message,
  } = parsedBody.data;
  const userMessage = typeof message === "string" ? message.trim() : "";

  const decision = pickPaymentMode({ project, consumer, byokKeyId });

  // 402 Payment Required — return as a plain JSON response with the quote;
  // the client retries with X-PAYMENT header. Does not use Prosopon envelope
  // shape because this happens before the session has begun.
  if (decision.mode === "x402") {
    return NextResponse.json(
      {
        error: "Payment Required",
        quote: decision.paymentQuote,
        retryWithHeader: "X-PAYMENT",
        projectSlug: slug,
      },
      {
        status: 402,
        headers: {
          "WWW-Authenticate": `x402 nonce="${decision.paymentQuote?.nonce}"`,
        },
      },
    );
  }

  if (decision.mode === "credits" && consumer.kind === "user") {
    const ok = await userHasCreditsFor(consumer.id, decision.quotedCents);
    if (!ok) {
      return jsonError(402, "Insufficient credits.", {
        quotedCents: decision.quotedCents,
        rationale: decision.rationale,
      });
    }
  }

  // Sessions (LifeSession on our side, separate from ProsoponSession id).
  //
  // Every live turn gets a LifeSession, including agent-kind callers.
  // Previously agents skipped the session table, which meant the Prosopon
  // session id fell through to `run.id` and the /state endpoint couldn't
  // find anything to rehydrate. Now all three consumer kinds produce a
  // proper session row — see schema.ts, LifeSession.consumerKind is the
  // widened 'user' | 'anon' | 'agent' enum.
  const isLiveTurn = userMessage.length > 0;
  const lifeSession = isLiveTurn
    ? await getOrCreateSession({
        projectId: project.id,
        sessionId: lifeSessionIdHint,
        consumerKind: consumer.kind,
        consumerId: consumer.id,
        organizationId: consumer.organizationId,
      })
    : null;
  const history = lifeSession ? await getSessionHistory(lifeSession.id) : [];

  const rulesVersion = await getCurrentRulesVersion(project);
  const run = await createRun({
    projectId: project.id,
    rulesVersionId: rulesVersion?.id ?? null,
    sessionId: lifeSession?.id,
    inputText: isLiveTurn ? userMessage : undefined,
    consumerKind: consumer.kind,
    consumerId: consumer.id,
    organizationId: consumer.organizationId,
    input,
    paymentMode: decision.mode,
  });

  // Prosopon session id — when we have a LifeSession, reuse its id so the
  // Prosopon stream and LifeRun table share a stable handle. Otherwise mint
  // a random one scoped to this run.
  const prosoponSessionId = lifeSession?.id ?? run.id;

  // Scenario replay path is NOT supported on the Prosopon endpoint — this is
  // intentionally "live only". Scenario demos continue to work on the legacy
  // endpoint (without /prosopon) until PR D removes it.
  if (!isLiveTurn) {
    return jsonError(
      400,
      "Prosopon endpoint requires a `message` in the request body. " +
        "Scenario-replay demos still work on /api/life/run/[project] until PR D.",
    );
  }

  const runner = new RealAgentRunner({
    projectSlug: slug,
    moduleTypeId: project.moduleTypeId,
    input,
    maxCostCents: decision.maxCostCents,
    project,
    history,
    userMessage,
    paymentMode: decision.mode,
  });

  let finalCostCents = 0;
  let model: string | undefined;
  let provider: string | undefined;
  let assistantTextAccum = "";

  const emitter = new ProsoponEmitter({
    sessionId: prosoponSessionId,
    projectSlug: slug,
    displayName: project.displayName,
    paymentMode: decision.mode,
    priorCostCents: 0,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let frameSeq = 0;

      const write = async (envelope: Envelope) => {
        controller.enqueue(enc.encode(sseFrame(envelope)));
        // Persist the envelope JSON into LifeRunEvent so reruns can be
        // reconstructed — Prosopon's "journal" on our substrate.
        await appendRunEvent(run.id, frameSeq++, envelope.event.type, {
          envelope: envelope as unknown as Record<string, unknown>,
        });
      };

      try {
        // Envelope 1..N: scene_reset + initial signals.
        for (const env of emitter.runStarted()) {
          await write(env);
        }

        // Attach the onFinish hook so we capture llm cost + model.
        runner["opts"].onFinish = (cost) => {
          finalCostCents = cost.llmCents;
          model = cost.model;
          provider = cost.provider;
        };

        for await (const ev of runner.run()) {
          if (ev.type === "text_delta") {
            const t = (ev.payload as { text?: string }).text ?? "";
            assistantTextAccum += t;
          }
          for (const env of emitter.translate(ev)) {
            await write(env);
          }
        }

        await finishRun({
          runId: run.id,
          status: "succeeded",
          output: assistantTextAccum ? { text: assistantTextAccum } : undefined,
          llmCostCents: finalCostCents,
          consumerPaidCents: decision.quotedCents,
          model,
          provider,
        });
        if (decision.mode === "credits" && consumer.kind === "user") {
          await settleCreditsDebit({
            userId: consumer.id,
            mode: decision.mode,
            amountCents: decision.quotedCents,
          });
        }
        try {
          await bumpProjectStats(project.id, finalCostCents);
        } catch (statsErr) {
          console.warn(
            "[life/run/prosopon] bumpProjectStats failed (non-fatal):",
            statsErr,
          );
        }

        // Final heartbeat so clients flush timers.
        await write(emitter.heartbeat());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const errorEnv = makeEnvelope({
          session_id: prosoponSessionId,
          seq: frameSeq + 1,
          event: {
            type: "node_added",
            parent: SCENE_ROOT_ID,
            node: {
              id: `err-${Date.now().toString(36)}`,
              intent: {
                type: "confirm",
                message: msg,
                severity: "danger",
              },
              children: [],
              bindings: [],
              actions: [],
              attrs: {},
              lifecycle: { created_at: new Date().toISOString() },
            },
          } as ProsoponEvent,
        });
        try {
          await write(errorEnv);
        } catch {
          /* ignore */
        }
        await finishRun({
          runId: run.id,
          status: "failed",
          errorReason: msg,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

/**
 * GET /api/life/run/[project]/prosopon
 * Diagnostic — returns the initial Scene that POST would emit as its
 * scene_reset. Lets clients render a skeleton UI before the first turn.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ project: string }> },
) {
  try {
    const { project: slug } = await params;
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
