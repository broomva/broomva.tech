"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSafeSession } from "@/lib/auth";
import {
  createOrganization,
  ensurePersonalOrg,
  getOrganizationBySlug,
} from "@/lib/db/organization";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { EVENT_ORG_CREATED, EVENT_ORG_SKIPPED } from "@/lib/analytics/events";

export async function createOnboardingOrg(
  _prevState: { error?: string; orgId?: string } | null,
  formData: FormData,
): Promise<{ error?: string; orgId?: string }> {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user) {
    redirect("/login");
  }

  const name = formData.get("orgName");
  const slug = formData.get("orgSlug");

  if (typeof name !== "string" || !name.trim()) {
    return { error: "Organization name is required." };
  }

  if (typeof slug !== "string" || !slug.trim()) {
    return { error: "Slug is required." };
  }

  const normalizedSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  if (normalizedSlug.length < 3) {
    return { error: "Slug must be at least 3 characters." };
  }

  // Check if slug is already taken
  const existing = await getOrganizationBySlug(normalizedSlug);
  if (existing) {
    return { error: `Slug "${normalizedSlug}" is already taken.` };
  }

  try {
    const org = await createOrganization(
      name.trim(),
      normalizedSlug,
      session.user.id,
    );
    captureServerEvent(session.user.id, EVENT_ORG_CREATED, {
      orgId: org.id,
      orgName: name.trim(),
    });
    return { orgId: org.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create organization.";
    return { error: message };
  }
}

export async function skipOnboarding(
  _prevState: null,
  _formData: FormData,
): Promise<never> {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user) {
    redirect("/login");
  }

  // Ensure a personal org exists before redirecting
  await ensurePersonalOrg(session.user.id, session.user.name ?? "User");
  captureServerEvent(session.user.id, EVENT_ORG_SKIPPED);

  redirect("/chat");
}
