import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { organization } from "@/lib/db/schema";
import { updateOrganizationPlan } from "@/lib/db/organization";
import { stripe, PLAN_TIERS, tierFromPriceId, type PlanTier } from "@/lib/stripe";
import type Stripe from "stripe";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the customer ID string from a Stripe customer field,
 * which may be a string, Customer object, or DeletedCustomer object.
 */
function resolveCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

async function getOrgByStripeCustomerId(customerId: string) {
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.stripeCustomerId, customerId))
    .limit(1);
  return org;
}

async function replenishCredits(orgId: string, plan: PlanTier) {
  const tier = PLAN_TIERS[plan];
  if (!tier || tier.creditsMonthly === 0) return;

  await db
    .update(organization)
    .set({
      planCreditsRemaining: tier.creditsMonthly,
      planCreditsMonthly: tier.creditsMonthly,
      billingPeriodStart: new Date(),
    })
    .where(eq(organization.id, orgId));
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe] Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      // -----------------------------------------------------------------
      // Checkout completed — link org to Stripe customer + subscription
      // -----------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.client_reference_id;

        if (!orgId) {
          console.warn("[stripe] checkout.session.completed missing client_reference_id");
          break;
        }

        // Determine the plan tier from the subscription's price
        let plan: PlanTier = "pro"; // default
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          const priceId = sub.items.data[0]?.price?.id;
          if (priceId) {
            plan = tierFromPriceId(priceId);
          }
        }

        await updateOrganizationPlan(
          orgId,
          plan,
          session.customer as string,
          session.subscription as string,
        );

        // Replenish credits for the new plan
        await replenishCredits(orgId, plan);

        logAudit({
          organizationId: orgId,
          actorId: "system",
          action: "billing.checkout_completed",
          resourceType: "organization",
          resourceId: orgId,
          metadata: {
            plan,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          },
        });

        break;
      }

      // -----------------------------------------------------------------
      // Subscription updated — sync plan tier
      // -----------------------------------------------------------------
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = resolveCustomerId(sub.customer);

        if (!customerId) break;

        const org = await getOrgByStripeCustomerId(customerId);
        if (!org) {
          console.warn(
            `[stripe] customer.subscription.updated: no org for customer ${customerId}`,
          );
          break;
        }

        const priceId = sub.items.data[0]?.price?.id;
        const plan: PlanTier = priceId ? tierFromPriceId(priceId) : "free";

        await updateOrganizationPlan(org.id, plan, undefined, sub.id);

        logAudit({
          organizationId: org.id,
          actorId: "system",
          action: "billing.subscription_updated",
          resourceType: "organization",
          resourceId: org.id,
          metadata: {
            plan,
            stripeSubscriptionId: sub.id,
            status: sub.status,
          },
        });

        break;
      }

      // -----------------------------------------------------------------
      // Subscription deleted — downgrade to free
      // -----------------------------------------------------------------
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = resolveCustomerId(sub.customer);

        if (!customerId) break;

        const org = await getOrgByStripeCustomerId(customerId);
        if (!org) {
          console.warn(
            `[stripe] customer.subscription.deleted: no org for customer ${customerId}`,
          );
          break;
        }

        await updateOrganizationPlan(org.id, "free", undefined, undefined);

        // Reset to free-tier credits
        await replenishCredits(org.id, "free");

        logAudit({
          organizationId: org.id,
          actorId: "system",
          action: "billing.subscription_deleted",
          resourceType: "organization",
          resourceId: org.id,
          metadata: {
            previousPlan: org.plan,
            stripeSubscriptionId: sub.id,
          },
        });

        break;
      }

      // -----------------------------------------------------------------
      // Invoice paid — replenish monthly credits
      // -----------------------------------------------------------------
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = resolveCustomerId(invoice.customer);

        if (!customerId) break;

        const org = await getOrgByStripeCustomerId(customerId);
        if (!org) {
          console.warn(
            `[stripe] invoice.payment_succeeded: no org for customer ${customerId}`,
          );
          break;
        }

        await replenishCredits(org.id, org.plan as PlanTier);

        logAudit({
          organizationId: org.id,
          actorId: "system",
          action: "billing.invoice_paid",
          resourceType: "organization",
          resourceId: org.id,
          metadata: {
            invoiceId: invoice.id,
            amountPaid: invoice.amount_paid,
            plan: org.plan,
          },
        });

        break;
      }

      // -----------------------------------------------------------------
      // Invoice payment failed — log for now, could suspend later
      // -----------------------------------------------------------------
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = resolveCustomerId(invoice.customer);

        if (!customerId) break;

        const org = await getOrgByStripeCustomerId(customerId);
        if (!org) {
          console.warn(
            `[stripe] invoice.payment_failed: no org for customer ${customerId}`,
          );
          break;
        }

        logAudit({
          organizationId: org.id,
          actorId: "system",
          action: "billing.invoice_payment_failed",
          resourceType: "organization",
          resourceId: org.id,
          metadata: {
            invoiceId: invoice.id,
            amountDue: invoice.amount_due,
            attemptCount: invoice.attempt_count,
          },
        });

        break;
      }

      default:
        // Unhandled event type — ignore silently
        break;
    }
  } catch (err) {
    console.error(`[stripe] Error handling event ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
