import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { organization, organizationMember } from "@/lib/db/schema";
import {
  getTierFeatures,
  getTierLimits,
  getTierCreditsMonthly,
} from "@/lib/tier-access";

/**
 * GET /api/tier
 *
 * Returns the authenticated user's current tier information including
 * plan name, available features, numeric limits, and credit balance.
 */
export async function GET() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Look up the user's primary organization (lightweight single-row query)
  const [membership] = await db
    .select({
      plan: organization.plan,
      planCreditsRemaining: organization.planCreditsRemaining,
      planCreditsMonthly: organization.planCreditsMonthly,
    })
    .from(organizationMember)
    .innerJoin(
      organization,
      eq(organizationMember.organizationId, organization.id),
    )
    .where(eq(organizationMember.userId, userId))
    .limit(1);

  const plan = membership?.plan ?? "free";
  const creditsRemaining = membership?.planCreditsRemaining ?? 0;
  const creditsMonthly =
    membership?.planCreditsMonthly ?? getTierCreditsMonthly(plan);

  return NextResponse.json({
    plan,
    features: getTierFeatures(plan),
    limits: getTierLimits(plan),
    credits: {
      remaining: creditsRemaining,
      monthly: creditsMonthly,
    },
    upgradeUrl: "/pricing",
  });
}
