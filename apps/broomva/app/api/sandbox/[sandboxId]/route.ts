/**
 * GET    /api/sandbox/:sandboxId — sandbox detail + snapshots
 * DELETE /api/sandbox/:sandboxId — force-destroy sandbox via arcand
 *
 * Part of BRO-261: Sandbox management API + console UI
 *
 * Dependency chain:
 *   broomva.tech (this file)
 *     → arcand (ARCAN_URL) — Rust daemon exposing sandbox lifecycle HTTP API
 *       → SandboxService (BRO-253) → arcan-provider-vercel (BRO-263)
 *     → Neon DB — SandboxInstance table for status tracking
 */

import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import {
  EVENT_SANDBOX_DESTROYED,
} from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { logAudit } from "@/lib/db/audit";
import { getUserOrganizations } from "@/lib/db/organization";
import {
  getSandboxById,
  getSandboxSnapshots,
  updateSandboxStatus,
} from "@/lib/db/sandbox-queries";

// ── GET ───────────────────────────────────────────────────────────────────────

export const GET = withAuth(async (request: Request, { userId }) => {
  const sandboxId = request.url.split("/api/sandbox/")[1]?.split("/")[0];
  if (!sandboxId) {
    return NextResponse.json({ error: "Missing sandbox ID" }, { status: 400 });
  }

  try {
    const orgs = await getUserOrganizations(userId);
    const org = orgs[0];
    if (!org) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const sandbox = await getSandboxById(sandboxId, org.id);
    if (!sandbox) {
      return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
    }

    const snapshots = await getSandboxSnapshots(sandbox.id);

    return NextResponse.json({ sandbox, snapshots });
  } catch (err) {
    console.error("[sandbox] Failed to get sandbox:", err);
    return NextResponse.json(
      { error: "Failed to get sandbox" },
      { status: 500 },
    );
  }
});

// ── DELETE ───────────────────────────────────────────────────────────────────

export const DELETE = withAuth(async (request: Request, { userId }) => {
  const sandboxId = request.url.split("/api/sandbox/")[1]?.split("/")[0];
  if (!sandboxId) {
    return NextResponse.json({ error: "Missing sandbox ID" }, { status: 400 });
  }

  try {
    const orgs = await getUserOrganizations(userId);
    const org = orgs[0];
    if (!org) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const sandbox = await getSandboxById(sandboxId, org.id);
    if (!sandbox) {
      return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
    }

    // Proxy destroy to arcand (gracefully degrade when not configured).
    const arcanUrl = process.env.ARCAN_URL;
    if (arcanUrl) {
      try {
        const res = await fetch(
          `${arcanUrl}/sandbox/${encodeURIComponent(sandbox.sandboxId)}`,
          { method: "DELETE", signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok && res.status !== 404) {
          console.warn(
            `[sandbox] arcand destroy returned ${res.status} for ${sandbox.sandboxId}`,
          );
        }
      } catch (arcandErr) {
        console.warn("[sandbox] arcand destroy failed (non-fatal):", arcandErr);
      }
    }

    // Mark stopped in local DB regardless of arcand result.
    await updateSandboxStatus(sandbox.id, "stopped");

    // Audit + analytics.
    logAudit({
      organizationId: org.id,
      actorId: userId,
      action: "sandbox.destroy",
      resourceType: "SandboxInstance",
      resourceId: sandbox.id,
      metadata: { sandboxId: sandbox.sandboxId, provider: sandbox.provider },
    });
    captureServerEvent(userId, EVENT_SANDBOX_DESTROYED, {
      sandbox_id: sandbox.sandboxId,
      provider: sandbox.provider,
      organization_id: org.id,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[sandbox] Failed to destroy sandbox:", err);
    return NextResponse.json(
      { error: "Failed to destroy sandbox" },
      { status: 500 },
    );
  }
});
