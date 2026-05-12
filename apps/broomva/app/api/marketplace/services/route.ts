import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withAuthAndValidation } from "@/lib/api/with-auth";
import { logAudit } from "@/lib/db/audit";
import {
  createAgentService,
  getUserAgent,
  listAgentServices,
} from "@/lib/db/marketplace";
import { captureServerEvent } from "@/lib/analytics/posthog";
import {
  EVENT_AGENT_REGISTERED,
  EVENT_AGENT_DISCOVERED,
} from "@/lib/analytics/events";

/**
 * GET /api/marketplace/services — discover available agent services.
 *
 * Query params:
 *   category  — filter by category (research, code, data, creative, finance)
 *   minTrust  — minimum trust score (0-100)
 *   limit     — number of results (default 20, max 100)
 *   offset    — pagination offset
 *
 * Public endpoint (no auth required for browsing).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get("category") ?? undefined;
  const minTrustRaw = searchParams.get("minTrust");
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  const minTrust =
    minTrustRaw != null ? Number.parseInt(minTrustRaw, 10) : undefined;
  const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : 20;
  const offset = offsetRaw != null ? Number.parseInt(offsetRaw, 10) : 0;

  if (
    minTrust != null &&
    (Number.isNaN(minTrust) || minTrust < 0 || minTrust > 100)
  ) {
    return NextResponse.json(
      { error: "minTrust must be an integer between 0 and 100" },
      { status: 400 },
    );
  }

  if (Number.isNaN(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const services = await listAgentServices({
      category,
      minTrust,
      limit,
      offset,
    });

    return NextResponse.json({ services });
  } catch (err) {
    console.error("[marketplace/services] Failed to list services:", err);
    return NextResponse.json(
      { error: "Failed to list marketplace services" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/marketplace/services — register a new agent service.
 *
 * Authenticated — the caller must own the agent being registered.
 */
const createServiceSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1).max(256),
  description: z.string().max(2000).optional(),
  category: z.enum(["research", "code", "data", "creative", "finance"]),
  pricing: z.object({
    model: z.enum(["per_call", "per_token", "fixed"]),
    amount_micro_usd: z.number().int().positive(),
  }),
  endpoint: z.string().url().optional(),
  capabilities: z.array(z.string()).max(20).optional(),
  trustMinimum: z.number().int().min(0).max(100).optional(),
});

export const POST = withAuthAndValidation(
  createServiceSchema,
  async (_request, { userId, body }) => {
    // Verify the caller owns the agent
    const ownedAgent = await getUserAgent(userId, body.agentId);

    if (!ownedAgent) {
      return NextResponse.json(
        { error: "Agent not found or you do not own this agent" },
        { status: 403 },
      );
    }

    try {
      const service = await createAgentService({
        agentId: body.agentId,
        userId,
        name: body.name.trim(),
        description: body.description?.trim(),
        category: body.category,
        pricing: body.pricing,
        endpoint: body.endpoint,
        capabilities: body.capabilities,
        trustMinimum: body.trustMinimum,
      });

      logAudit({
        actorId: userId,
        action: "marketplace.service.created",
        resourceType: "agent_service",
        resourceId: service.id,
        metadata: {
          agentId: body.agentId,
          name: service.name,
          category: service.category,
          pricing: service.pricing,
        },
      });

      captureServerEvent(userId, EVENT_AGENT_REGISTERED, {
        serviceId: service.id,
        agentId: body.agentId,
        category: service.category,
        pricingModel: service.pricing.model,
      });

      return NextResponse.json({ service }, { status: 201 });
    } catch (err) {
      console.error("[marketplace/services] Failed to create service:", err);
      return NextResponse.json(
        { error: "Failed to create marketplace service" },
        { status: 500 },
      );
    }
  },
);
