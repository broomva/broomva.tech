/**
 * POST /api/sandbox/:sandboxId/snapshot — manually trigger a sandbox snapshot
 *
 * Proxies to arcand which calls SandboxService.snapshot() → provider.snapshot().
 * For Vercel v2 (BRO-263): snapshot = POST /v2/sandboxes/sessions/{id}/stop
 * (auto-snapshots the filesystem for persistent sandboxes).
 *
 * Part of BRO-261.
 */

import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { EVENT_SANDBOX_SNAPSHOT_MANUAL } from "@/lib/analytics/events";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { logAudit } from "@/lib/db/audit";
import { getUserOrganizations } from "@/lib/db/organization";
import {
  getSandboxById,
  recordSandboxSnapshot,
  updateSandboxStatus,
} from "@/lib/db/sandbox-queries";

export const POST = withAuth(async (request: Request, { userId }) => {
  const parts = request.url.split("/api/sandbox/")[1]?.split("/");
  const sandboxId = parts?.[0];
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

    let snapshotId: string | null = null;

    // Proxy snapshot to arcand (gracefully degrade when not configured).
    const arcanUrl = process.env.ARCAN_URL;
    if (arcanUrl) {
      try {
        const res = await fetch(
          `${arcanUrl}/sandbox/${encodeURIComponent(sandbox.sandboxId)}/snapshot`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(30_000),
          },
        );
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          snapshotId = body.snapshotId ?? null;
        } else {
          console.warn(
            `[sandbox] arcand snapshot returned ${res.status} for ${sandbox.sandboxId}`,
          );
          return NextResponse.json(
            { error: "Snapshot request failed" },
            { status: 502 },
          );
        }
      } catch (arcandErr) {
        console.warn("[sandbox] arcand snapshot failed:", arcandErr);
        return NextResponse.json(
          { error: "Could not reach arcand" },
          { status: 503 },
        );
      }
    } else {
      // arcand not configured — record a placeholder snapshot for local dev.
      snapshotId = `local-snap-${Date.now()}`;
    }

    // Record snapshot + update status in local DB.
    const resolvedSnapshotId = snapshotId ?? `fallback-${Date.now()}`;
    await Promise.all([
      recordSandboxSnapshot(sandbox.id, resolvedSnapshotId, "api"),
      updateSandboxStatus(sandbox.id, "snapshotted"),
    ]);

    // Audit + analytics.
    logAudit({
      organizationId: org.id,
      actorId: userId,
      action: "sandbox.snapshot.manual",
      resourceType: "SandboxInstance",
      resourceId: sandbox.id,
      metadata: {
        sandboxId: sandbox.sandboxId,
        snapshotId,
        provider: sandbox.provider,
      },
    });
    captureServerEvent(userId, EVENT_SANDBOX_SNAPSHOT_MANUAL, {
      sandbox_id: sandbox.sandboxId,
      snapshot_id: resolvedSnapshotId,
      provider: sandbox.provider,
      organization_id: org.id,
    });

    return NextResponse.json({ snapshotId: resolvedSnapshotId });
  } catch (err) {
    console.error("[sandbox] Failed to snapshot sandbox:", err);
    return NextResponse.json(
      { error: "Failed to snapshot sandbox" },
      { status: 500 },
    );
  }
});
