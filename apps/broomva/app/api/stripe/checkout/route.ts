import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuthAndValidation } from "@/lib/api/with-auth";
import {
  getOrganizationById,
  hasOrganizationRole,
} from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { getStripe, PLAN_TIERS, type PlanTier } from "@/lib/stripe";
import { captureServerEvent } from "@/lib/analytics/posthog";
import {
  PRIVACY_CONTENT_SHA256,
  PRIVACY_VERSION,
  TERMS_CONTENT_SHA256,
  TERMS_VERSION,
} from "@/lib/legal";
import {
  EVENT_CHECKOUT_STARTED,
  EVENT_PLAN_SELECTED,
} from "@/lib/analytics/events";

const checkoutSchema = z.object({
  plan: z.literal("pro"),
  organizationId: z.string().min(1),
});

export const POST = withAuthAndValidation(
  checkoutSchema,
  async (_request, { userId, email, body }) => {
    const { plan, organizationId } = body;

    if (process.env.SELF_SERVICE_CHECKOUT_ENABLED !== "true") {
      return NextResponse.json(
        {
          error:
            "Self-service checkout is temporarily unavailable pending operator and consumer-flow validation.",
        },
        { status: 503 },
      );
    }

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

    if (
      !(await hasOrganizationRole(userId, organizationId, ["owner", "admin"]))
    ) {
      return NextResponse.json(
        { error: "Forbidden — billing access requires an owner or admin" },
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
        consent_collection: {
          terms_of_service: "required",
        },
        custom_text: {
          submit: {
            message:
              "Your subscription renews monthly until canceled. Cancel before renewal in billing settings. Refunds are available where required by law.",
          },
        },
        success_url: `${appUrl}/console/billing?checkout=success`,
        cancel_url: `${appUrl}/console/billing?checkout=cancel`,
        metadata: {
          organizationId,
          plan,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          termsHash: TERMS_CONTENT_SHA256,
          privacyHash: PRIVACY_CONTENT_SHA256,
        },
        subscription_data: {
          metadata: {
            organizationId,
            plan,
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_VERSION,
            termsHash: TERMS_CONTENT_SHA256,
            privacyHash: PRIVACY_CONTENT_SHA256,
          },
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

      captureServerEvent(userId, EVENT_PLAN_SELECTED, {
        plan,
        organizationId,
      });
      captureServerEvent(userId, EVENT_CHECKOUT_STARTED, {
        plan,
        organizationId,
        checkoutSessionId: checkoutSession.id,
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
