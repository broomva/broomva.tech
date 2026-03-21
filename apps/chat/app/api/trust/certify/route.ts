import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { agentRegistration } from "@/lib/db/schema";
import { logAudit } from "@/lib/db/audit";

/**
 * POST /api/trust/certify — Submit an agent for trust certification.
 *
 * Body: { name, description?, version?, sourceUrl?, capabilities?: string[], organizationId? }
 *
 * Creates an AgentRegistration record with status "pending".
 * Actual evaluation is performed externally (Life pipeline).
 */
export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    name: string;
    description?: string;
    version?: string;
    sourceUrl?: string;
    capabilities?: string[];
    organizationId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json(
      { error: "Missing required field: name" },
      { status: 400 },
    );
  }

  if (body.capabilities && !Array.isArray(body.capabilities)) {
    return NextResponse.json(
      { error: "capabilities must be an array of strings" },
      { status: 400 },
    );
  }

  try {
    const [registration] = await db
      .insert(agentRegistration)
      .values({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        version: body.version?.trim() ?? null,
        sourceUrl: body.sourceUrl?.trim() ?? null,
        capabilities: body.capabilities ?? [],
        organizationId: body.organizationId ?? null,
        status: "pending",
        trustLevel: "unrated",
      })
      .returning({ id: agentRegistration.id, status: agentRegistration.status });

    logAudit({
      organizationId: body.organizationId,
      actorId: session.user.id,
      action: "agent.certification.submitted",
      resourceType: "agent_registration",
      resourceId: registration.id,
      metadata: {
        name: body.name.trim(),
        version: body.version ?? null,
        sourceUrl: body.sourceUrl ?? null,
      },
    });

    return NextResponse.json(
      {
        id: registration.id,
        status: "pending",
        message: "Agent submitted for evaluation",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[trust/certify] Failed to create agent registration:", err);
    return NextResponse.json(
      { error: "Failed to submit agent for certification" },
      { status: 500 },
    );
  }
}
