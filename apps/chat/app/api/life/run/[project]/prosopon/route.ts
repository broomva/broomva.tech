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

import {
  type Envelope,
  makeEnvelope,
  type ProsoponEvent,
} from "@broomva/prosopon";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { getAnonymousSession } from "@/lib/anonymous-session-server";
import { getSafeSession } from "@/lib/auth";
import {
  pickPaymentMode,
  settleCreditsDebit,
  userHasCreditsFor,
} from "@/lib/life-runtime/billing";
import {
  createKernelClient,
  type KernelContext,
  type VmHandle,
} from "@/lib/life-runtime/kernel";
import {
  makeInitialScene,
  ProsoponEmitter,
  SCENE_ROOT_ID,
} from "@/lib/life-runtime/prosopon-emitter";
import {
  appendRunEvent,
  bumpProjectStats,
  createRun,
  finishRun,
  getCurrentRulesVersion,
  getOrCreateChatForLifeSession,
  getOrCreateSession,
  getProjectBySlug,
  getSessionHistory,
  maybeSetChatTitle,
  setLifeSessionKernelVmHandle,
} from "@/lib/life-runtime/queries";
import {
  makeLifeToolHandlers,
  RealAgentRunner,
} from "@/lib/life-runtime/real-runner";
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
  // SSE: one envelope per "data:" block; event name = "envelope" so clients
  // can addEventListener("envelope") just like prosopon-daemon's fanout.
  const json = JSON.stringify(envelope);
  return `event: envelope\ndata: ${json}\n\n`;
}

/**
 * Narrow `LifeSession.kernelVmHandleJson` to a usable `VmHandle`. Rejects
 * stale rows where the persisted backend differs from the current client's
 * backend, so a config flip (`LIFED_GATEWAY_URL` set/unset) re-mints rather
 * than reuses an incompatible handle. All required scalar fields must be
 * strings; `status` must be an object.
 */
function isValidPersistedHandle(
  raw: unknown,
  expectedBackend: string,
): raw is VmHandle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const h = raw as Record<string, unknown>;
  return (
    typeof h.vmId === "string" &&
    typeof h.backend === "string" &&
    h.backend === expectedBackend &&
    typeof h.sessionId === "string" &&
    typeof h.agentId === "string" &&
    typeof h.createdAt === "string" &&
    typeof h.metadataJson === "string" &&
    typeof h.status === "object" &&
    h.status !== null
  );
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
  // rehydrate them. The `LifeSession.consumerKind` enum was widened to
  // accept 'agent' (see schema.ts) so all three kinds can now persist.
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

  // Tier-1: for logged-in users, ensure a Chat row exists + link it to this
  // LifeSession so the thread shows up in the existing sidebar history UI.
  // Best-effort — a Chat insert failure must NOT block the turn (e.g., FK
  // misalignment on a stale user row). We log + continue; persistence still
  // works without the linkage.
  const placeholderChatTitle = `${project.displayName} — new session`;
  let linkedChatId: string | null = null;
  let linkedChatCreated = false;
  if (consumer.kind === "user" && lifeSession) {
    try {
      const linked = await getOrCreateChatForLifeSession({
        lifeSessionId: lifeSession.id,
        userId: consumer.id,
        fallbackTitle: placeholderChatTitle,
      });
      linkedChatId = linked.chatId;
      linkedChatCreated = linked.created;
    } catch (err) {
      console.warn(
        "[life/run/prosopon] getOrCreateChatForLifeSession failed (non-fatal):",
        err,
      );
    }
  }

  let finalCostCents = 0;
  let model: string | undefined;
  let provider: string | undefined;
  let assistantTextAccum = "";

  // KernelClient — every tool call is dispatched through this surface so
  // attribution + ResourceUsage land on a uniform contract. Today we only
  // ship `InProcessKernelClient`; the `LIFED_GATEWAY_URL` env var picks
  // `LifedHttpKernelClient` when Phase D lands.
  const toolHandlers = makeLifeToolHandlers(project);
  const kernelClient = createKernelClient({ tools: toolHandlers });

  const kernelCtx: KernelContext = {
    sessionId: lifeSession?.id ?? run.id,
    agentId: consumer.kind === "agent" ? consumer.id : `user:${consumer.id}`,
  };

  // VmHandle: reuse the persisted handle when the LifeSession has a valid
  // one matching the current backend; otherwise create a fresh VM and
  // persist its handle. The validity check is deliberately strict — a
  // handle from a different backend (e.g., persisted under
  // `LifedHttpKernelClient` and now read by `InProcessKernelClient`) would
  // mis-attribute OTel spans + Vigil signals if reused as-is. A re-mint
  // is cheap and the new handle is persisted in the same code path.
  let vm: VmHandle;
  const persistedHandle = lifeSession?.kernelVmHandleJson;
  if (isValidPersistedHandle(persistedHandle, kernelClient.backendId)) {
    vm = persistedHandle as VmHandle;
  } else {
    vm = await kernelClient.createVm(
      {
        backendHint: kernelClient.backendId,
        toolAllowlist: Object.keys(toolHandlers),
        metadataJson: JSON.stringify({
          projectSlug: slug,
          moduleTypeId: project.moduleTypeId,
        }),
      },
      kernelCtx,
    );
    if (lifeSession) {
      try {
        await setLifeSessionKernelVmHandle({
          lifeSessionId: lifeSession.id,
          vmHandle: vm,
        });
      } catch (err) {
        console.warn(
          "[life/run/prosopon] setLifeSessionKernelVmHandle failed (non-fatal):",
          err,
        );
      }
    }
  }

  // `onFinish` is threaded via the constructor (not post-construction
  // assignment) so the runner's `opts` can stay private. It's the terminal
  // cost-attribution hook — captures LLM cents + model identity so the
  // downstream `finishRun` / `settleCreditsDebit` calls have the real
  // numbers rather than a quote.
  const runner = new RealAgentRunner({
    projectSlug: slug,
    moduleTypeId: project.moduleTypeId,
    input,
    maxCostCents: decision.maxCostCents,
    project,
    history,
    userMessage,
    paymentMode: decision.mode,
    kernelClient,
    vm,
    kernelCtx,
    turnId: run.id,
    lifeSessionId: lifeSession?.id,
    onFinish: (cost) => {
      finalCostCents = cost.llmCents;
      model = cost.model;
      provider = cost.provider;
    },
  });

  const emitter = new ProsoponEmitter({
    sessionId: prosoponSessionId,
    projectSlug: slug,
    displayName: project.displayName,
    paymentMode: decision.mode,
    priorCostCents: 0,
    kernelBackendId: kernelClient.backendId,
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

        // Envelope N+1: user's turn-starting message. Persisting this to
        // LifeRunEvent closes the hydration gap where replay could reconstruct
        // the agent half of the conversation but not the user's own bubble.
        // `run.id` is a stable per-turn identifier; the envelope node id
        // (`user-<run.id>`) lets diffing / retries stay deterministic.
        await write(
          emitter.userTurnStarted({ text: userMessage, turnId: run.id }),
        );

        for await (const yielded of runner.run()) {
          // Accumulate the assistant's final text by peeking at AI SDK
          // `text-delta` parts before they're translated. Previously this
          // branched on our internal `RunEvent.type === "text_delta"`; the
          // runner now yields the AI SDK part directly, so we read `part.text`.
          if (yielded.kind === "llm" && yielded.part.type === "text-delta") {
            assistantTextAccum += yielded.part.text;
          }
          for (const env of emitter.translate(yielded)) {
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

        // Auto-title: fire-and-forget a title-generation LLM call for the
        // newly-created Chat row. Only runs on the first turn (when the Chat
        // row was just created with the placeholder title). `maybeSetChatTitle`
        // is guarded with a WHERE clause against the placeholder so turn 2+
        // or a user-initiated rename won't be clobbered by a late-arriving
        // auto-title. All failures are logged and swallowed — title generation
        // is cosmetic and must never fail a turn.
        if (linkedChatId && linkedChatCreated) {
          const chatIdForTitle = linkedChatId;
          void (async () => {
            try {
              const title = await generateTitleFromUserMessage({
                message: {
                  id: `life-${run.id}`,
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
