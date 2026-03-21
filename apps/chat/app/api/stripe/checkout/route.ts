import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { getStripe, PLAN_TIERS, type PlanTier } from "@/lib/stripe";


export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan: string; organizationId: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan, organizationId } = body;

  if (!plan || !organizationId) {
    return NextResponse.json(
      { error: "Missing required fields: plan, organizationId" },
      { status: 400 },
    );
  }

  if (plan !== "pro" && plan !== "team") {
    return NextResponse.json(
      { error: 'Plan must be "pro" or "team"' },
      { status: 400 },
    );
  }

  const tier = PLAN_TIERS[plan as PlanTier];
  if (!tier?.priceId) {
    return NextResponse.json(
      { error: `No Stripe price configured for plan "${plan}"` },
      { status: 400 },
    );
  }

  // Verify the organization exists
  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  try {
    const appUrl = process.env.APP_URL || "http://localhost:3001";

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: "subscription",
      client_reference_id: organizationId,
      customer_email: session.user.email ?? undefined,
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
      actorId: session.user.id,
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
}
