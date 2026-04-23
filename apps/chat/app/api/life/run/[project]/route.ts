/**
 * POST /api/life/run/[project]
 *
 * Executes a Life project and streams the result as Server-Sent Events.
 * Every event is persisted to LifeRunEvent so the run is replayable.
 *
 * Billing contract (BRO-846 / refined commercial model):
 *   • Authed user        → credits debit via @/lib/db/credits (subscription)
 *   • Anon on free pub   → free_tier (existing anon-session quota)
 *   • Anon on paid pub   → 402 Payment Required with x402 quote in body
 *   • Authed + BYOK      → byok mode, bypasses LLM cost (platform fee stays)
 *   • Paid pub + authed  → haima_balance (settlement wiring lands in follow-up)
 *
 * Phase 2 scope (this PR):
 *   • Full billing decision + LifeRun row + event persistence
 *   • Scenario-replay runner (zero Claude cost)
 *   • 402 Payment Required response for x402 callers (scaffold body)
 * Phase 2.1 (next PR):
 *   • Real Sentinel runner through @broomva/sentinel-property-ops
 *   • Haima / x402 settlement wiring
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";

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
import { getRunner } from "@/lib/life-runtime/runner-dispatch";
import { RealAgentRunner } from "@/lib/life-runtime/real-runner";
import { RunRequestSchema, type ConsumerIdentity } from "@/lib/life-runtime/types";

// nextConfig.cacheComponents blocks the usual `export const runtime` pattern.
// Dynamism comes from the POST handler + SSE body, which Next infers
// automatically without explicit hints.

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
    "X-Accel-Buffering": "no", // hint to nginx / Vercel to NOT buffer
  };
}

function sseFormat(event: { type: string; payload: unknown; at?: string }): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Resolve who is calling this endpoint. */
async function resolveConsumer(): Promise<ConsumerIdentity | null> {
  const hdrs = await headers();

  // Authed Neon/Better-Auth session → user identity + optional org.
  const session = await getSafeSession({ fetchOptions: { headers: hdrs } });
  if (session?.user?.id) {
    return {
      kind: "user",
      id: session.user.id,
      // Org context is discovered via the tenant package in a follow-up PR;
      // keeping it undefined here routes authed users to credits-debit path.
    };
  }

  // Anon session (cookie-based) — existing chat infra.
  const anon = await getAnonymousSession();
  if (anon) return { kind: "anon", id: anon.id };

  // Presence of X-PAYMENT (x402) header → machine consumer.
  if (hdrs.get("x-payment") || hdrs.get("authorization")?.startsWith("x402 ")) {
    return { kind: "agent", id: hdrs.get("x-payment-sender") ?? "unknown-wallet" };
  }

  return null; // Fall through to anon-by-default below in the route.
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const ParamsSchema = z.object({ project: z.string().min(1).max(128) });

/**
 * GET /api/life/run/[project]
 * Diagnostic endpoint — returns the project row + module type as JSON.
 * Useful for verifying DB seed + migration state from the browser without
 * needing DB credentials. Safe to expose: no secrets returned.
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
    return NextResponse.json(
      {
        ok: true,
        project: {
          id: project.id,
          slug: project.slug,
          displayName: project.displayName,
          moduleTypeId: project.moduleTypeId,
          ownerKind: project.ownerKind,
          ownerId: project.ownerId,
          visibility: project.visibility,
          status: project.status,
          pricing: project.pricing,
          hasRulesVersion: project.currentRulesVersionId !== null,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[life/run GET] diagnostic error:", err);
    return NextResponse.json(
      {
        ok: false,
        reason: "db-error",
        detail:
          process.env.VERCEL_ENV !== "production" ? message : message.slice(0, 300),
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ project: string }> },
) {
  try {
    return await handlePost(request, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[life/run] uncaught handler error:", err);
    return NextResponse.json(
      {
        error: "Internal error while starting run.",
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

  // 1. Load project
  const project = await getProjectBySlug(slug);
  if (!project) return jsonError(404, "Project not found.");
  if (project.status !== "active") {
    return jsonError(403, `Project is ${project.status}.`);
  }

  // 2. Resolve consumer (fall back to anon-by-default for public projects)
  let consumer = await resolveConsumer();
  if (!consumer) {
    // Read-only public access: treat as ephemeral agent-without-payment.
    // The billing decision below will route to x402 for paid projects.
    consumer = { kind: "agent", id: "anonymous" };
  }

  // 3. Parse body
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
  // `input` column is JSONB NOT NULL — default to {} so the "start a demo
  // without structured input" path (e.g. /life/sentinel landing) still works.
  const { input = {}, byokKeyId, sessionId, message } = parsedBody.data;
  // If a chat message is provided, the run is "real" — attach a session.
  // Otherwise we're in demo-start mode and stream a scripted scenario.
  const userMessage = typeof message === "string" ? message.trim() : "";

  // 4. Billing decision
  const decision = pickPaymentMode({ project, consumer, byokKeyId });

  // 402 fast-path for external callers on paid projects
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
        headers: { "WWW-Authenticate": `x402 nonce="${decision.paymentQuote?.nonce}"` },
      },
    );
  }

  // Credits pre-flight for authed users on their own projects
  if (decision.mode === "credits" && consumer.kind === "user") {
    const ok = await userHasCreditsFor(consumer.id, decision.quotedCents);
    if (!ok) {
      return jsonError(402, "Insufficient credits.", {
        quotedCents: decision.quotedCents,
        rationale: decision.rationale,
      });
    }
  }

  // 5. Resolve session (real chat only; demo-start mode skips this)
  const isLiveTurn = userMessage.length > 0;
  const sessionConsumerKind: "user" | "anon" =
    consumer.kind === "user" ? "user" : "anon";
  const session =
    isLiveTurn && consumer.kind !== "agent"
      ? await getOrCreateSession({
          projectId: project.id,
          sessionId,
          consumerKind: sessionConsumerKind,
          consumerId: consumer.id,
          organizationId: consumer.organizationId,
        })
      : null;
  const history = session ? await getSessionHistory(session.id) : [];

  // 6. Create run row
  const rulesVersion = await getCurrentRulesVersion(project);
  const run = await createRun({
    projectId: project.id,
    rulesVersionId: rulesVersion?.id ?? null,
    sessionId: session?.id,
    inputText: isLiveTurn ? userMessage : undefined,
    consumerKind: consumer.kind,
    consumerId: consumer.id,
    organizationId: consumer.organizationId,
    input,
    paymentMode: decision.mode,
  });

  // 7. Dispatch runner; stream over SSE.
  // Scenario replay is kept for the landing auto-play — when the UI opens
  // /life/<slug> without sending a message, we run the scripted demo. When
  // the user types into the composer, we switch to the RealAgentRunner.
  const runner = isLiveTurn
    ? new RealAgentRunner({
        projectSlug: slug,
        moduleTypeId: project.moduleTypeId,
        input,
        maxCostCents: decision.maxCostCents,
        project,
        history,
        userMessage,
        paymentMode: decision.mode,
      })
    : getRunner(project.moduleTypeId);

  let finalCostCents = 0;
  let model: string | undefined;
  let provider: string | undefined;
  // For the real runner we also want to persist the assistant text into
  // LifeRun.output so history reload works on subsequent turns. Accumulate
  // from text_delta events as they flow.
  let assistantTextAccum = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let seq = 0;

      const emit = async (event: { type: string; payload: unknown; at?: string }) => {
        const at = event.at ?? new Date().toISOString();
        const frame = sseFormat({ ...event, at });
        controller.enqueue(enc.encode(frame));
        await appendRunEvent(run.id, seq++, event.type, {
          ...(event.payload as Record<string, unknown>),
          at,
        });
      };

      try {
        // Emit run metadata up-front so the UI can render project chrome
        // before the first agent event lands.
        await emit({
          type: "run_metadata",
          payload: {
            runId: run.id,
            sessionId: session?.id ?? null,
            projectSlug: slug,
            moduleTypeId: project.moduleTypeId,
            paymentMode: decision.mode,
            quotedCents: decision.quotedCents,
            displayName: project.displayName,
            isLiveTurn,
          },
        });

        // The real runner carries its own context; the legacy scenario
        // runner wants the RunnerContext at call time. Dispatch accordingly.
        const stream = isLiveTurn
          ? (runner as RealAgentRunner).run()
          : runner.run({
              projectSlug: slug,
              moduleTypeId: project.moduleTypeId,
              input,
              maxCostCents: decision.maxCostCents,
              onFinish: (cost) => {
                finalCostCents = cost.llmCents;
                model = cost.model;
                provider = cost.provider;
              },
            });

        // Wire onFinish for the real runner through a captured side channel;
        // RealAgentRunner calls onFinish via its internal options.
        if (isLiveTurn) {
          (runner as RealAgentRunner)["opts"].onFinish = (cost) => {
            finalCostCents = cost.llmCents;
            model = cost.model;
            provider = cost.provider;
          };
        }

        for await (const ev of stream) {
          // Accumulate assistant text so we can persist the full response
          // to LifeRun.output at run-completion for history reload.
          if (ev.type === "text_delta") {
            const t = (ev.payload as { text?: string }).text ?? "";
            assistantTextAccum += t;
          }
          await emit(ev);
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
        await bumpProjectStats(project.id, finalCostCents);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await emit({ type: "error", payload: { message: msg } });
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
