import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RuntimeTarget } from "@/lib/db/schema";
import { triggerSpecDoc } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * POST /api/docs/[id]/trigger — dispatch a spec (Maestro Phase 1a, BRO-1367).
 *
 * Owner-gated. Enforces the N=1 dispatch budget (G-D3/D5), records a `queued`
 * SpecDocRun, and moves orchState→`triggered`. Does NOT yet hand off to a live
 * runtime (Phase 1b's dispatcher picks up the queued run). The request body is
 * optional; absent a target, dispatch defaults to a relay Claude Code session
 * (D7).
 */
const TARGET_KINDS = ["session", "chat", "workspace", "service"] as const;

const triggerSchema = z.object({
  target: z
    .object({
      kind: z.enum(TARGET_KINDS),
      runtime: z.string().trim().min(1).max(64),
    })
    .optional(),
});

const DEFAULT_TARGET: RuntimeTarget = {
  kind: "session",
  runtime: "claude-code",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Body is optional — an empty POST triggers the default relay CC session.
  let target: RuntimeTarget = DEFAULT_TARGET;
  const raw = await request.text();
  if (raw.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = triggerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (parsed.data.target) {
      target = parsed.data.target;
    }
  }

  const { id } = await params;
  const result = await triggerSpecDoc(id, auth.userId, target);

  if (result.ok) {
    return NextResponse.json({ ok: true, run: result.run }, { status: 201 });
  }
  if (result.reason === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.reason === "not_triggerable") {
    // Current orch-state forbids dispatch (already running/done/etc.) — 409.
    return NextResponse.json(
      {
        error: `Spec is not triggerable from orch-state '${result.orchState}'`,
        orchState: result.orchState,
      },
      { status: 409 },
    );
  }
  // budget_exhausted (G-D3/D5): N=1 per version — re-publish to act again.
  return NextResponse.json(
    {
      error:
        "Dispatch budget exhausted (N=1 per version) — re-publish to mint a fresh setpoint",
      reason: "budget_exhausted",
    },
    { status: 409 },
  );
}
