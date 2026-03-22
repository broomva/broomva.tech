import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuthAndValidation } from "@/lib/api/with-auth";
import { logAudit } from "@/lib/db/audit";
import {
  createMarketplaceServiceTransaction,
  getAgentServiceById,
  getUserAgent,
} from "@/lib/db/marketplace";

/**
 * POST /api/marketplace/transact — initiate a service transaction.
 *
 * Body: { serviceId, buyerAgentId }
 *
 * Checks that:
 * 1. The buyer agent is owned by the authenticated user
 * 2. The service exists and is active
 * 3. The buyer is not the seller
 *
 * Records the transaction and returns the transaction ID.
 */
const transactSchema = z.object({
  serviceId: z.string().min(1),
  buyerAgentId: z.string().min(1),
});

export const POST = withAuthAndValidation(
  transactSchema,
  async (_request, { userId, body }) => {
    const { serviceId, buyerAgentId } = body;

    // Verify the caller owns the buyer agent
    const buyerAgent = await getUserAgent(userId, buyerAgentId);

    if (!buyerAgent) {
      return NextResponse.json(
        { error: "Buyer agent not found or you do not own this agent" },
        { status: 403 },
      );
    }

    // Get the service
    const service = await getAgentServiceById(serviceId);

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    if (service.status !== "active") {
      return NextResponse.json(
        { error: "Service is not currently active" },
        { status: 400 },
      );
    }

    // Prevent self-transactions
    if (service.agentId === buyerAgentId) {
      return NextResponse.json(
        { error: "Cannot transact with your own service" },
        { status: 400 },
      );
    }

    // Resolve amount from service pricing
    const pricing = service.pricing as {
      model: string;
      amount_micro_usd: number;
    };
    const amountMicroUsd = pricing.amount_micro_usd;

    try {
      const transaction = await createMarketplaceServiceTransaction({
        serviceId,
        buyerAgentId,
        sellerAgentId: service.agentId,
        amountMicroUsd,
      });

      logAudit({
        actorId: userId,
        action: "marketplace.transaction.created",
        resourceType: "marketplace_transaction",
        resourceId: transaction.id,
        metadata: {
          serviceId,
          buyerAgentId,
          sellerAgentId: service.agentId,
          amountMicroUsd,
          serviceName: service.name,
        },
      });

      return NextResponse.json({ transaction }, { status: 201 });
    } catch (err) {
      console.error(
        "[marketplace/transact] Failed to create transaction:",
        err,
      );
      return NextResponse.json(
        { error: "Failed to create marketplace transaction" },
        { status: 500 },
      );
    }
  },
);
