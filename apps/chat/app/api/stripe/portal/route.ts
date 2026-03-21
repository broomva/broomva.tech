import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { getOrganizationById, isOrganizationMember } from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { getStripe } from "@/lib/stripe";


export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { organizationId: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { organizationId } = body;

  if (!organizationId) {
    return NextResponse.json(
      { error: "Missing required field: organizationId" },
      { status: 400 },
    );
  }

  const org = await getOrganizationById(organizationId);
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  if (!(await isOrganizationMember(session.user.id, organizationId))) {
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
      return_url: `${appUrl}/settings/billing`,
    });

    logAudit({
      organizationId,
      actorId: session.user.id,
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
}
