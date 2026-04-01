import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuthAndValidation } from "@/lib/api/with-auth";
import { getOrganizationById, isOrganizationMember } from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { getStripe } from "@/lib/stripe";

const portalSchema = z.object({
  organizationId: z.string().min(1),
});

export const POST = withAuthAndValidation(
  portalSchema,
  async (_request, { userId, body }) => {
    const { organizationId } = body;

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

    if (!org.stripeCustomerId) {
      return NextResponse.json(
        { error: "Organization has no billing account. Subscribe to a plan first." },
        { status: 400 },
      );
    }

    try {
      const appUrl = process.env.APP_URL || "http://localhost:3001";

      const portalSession = await getStripe().billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${appUrl}/console/billing`,
      });

      logAudit({
        organizationId,
        actorId: userId,
        action: "billing.portal_opened",
        resourceType: "organization",
        resourceId: organizationId,
      });

      return NextResponse.json({ url: portalSession.url });
    } catch (err) {
      console.error("[stripe] Failed to create portal session:", err);
      return NextResponse.json(
        { error: "Failed to create billing portal session" },
        { status: 500 },
      );
    }
  },
);
