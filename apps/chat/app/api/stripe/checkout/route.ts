import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuthAndValidation } from "@/lib/api/with-auth";
import { getOrganizationById, isOrganizationMember } from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { getStripe, PLAN_TIERS, type PlanTier } from "@/lib/stripe";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "team"]),
  organizationId: z.string().min(1),
});

export const POST = withAuthAndValidation(
  checkoutSchema,
  async (_request, { userId, email, body }) => {
    const { plan, organizationId } = body;

    const tier = PLAN_TIERS[plan as PlanTier];
    if (!tier?.priceId) {
      return NextResponse.json(
        { error: `No Stripe price configured for plan "${plan}"` },
        { status: 400 },
      );
    }

    // Verify the organization exists and user is a member
    const org = await getOrganizationById(organizationId);
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    if (!(await isOrganizationMember(userId, organizationId))) {
      return NextResponse.json(
        { error: "Forbidden — not a member of this organization" },
        { status: 403 },
      );
    }

    try {
      const appUrl = process.env.APP_URL || "http://localhost:3001";

      const checkoutSession = await getStripe().checkout.sessions.create({
        mode: "subscription",
        client_reference_id: organizationId,
        customer_email: email ?? undefined,
        line_items: [
          {
            price: tier.priceId,
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/settings/billing?checkout=success`,
        cancel_url: `${appUrl}/settings/billing?checkout=cancel`,
        metadata: {
          organizationId,
          plan,
        },
      });

      logAudit({
        organizationId,
        actorId: userId,
        action: "billing.checkout_started",
        resourceType: "organization",
        resourceId: organizationId,
        metadata: { plan, checkoutSessionId: checkoutSession.id },
      });

      return NextResponse.json({ url: checkoutSession.url });
    } catch (err) {
      console.error("[stripe] Failed to create checkout session:", err);
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 },
      );
    }
  },
);
