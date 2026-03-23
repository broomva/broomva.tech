import type { Metadata, Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding-form";
import { getSafeSession } from "@/lib/auth";
import { getUserOrganizations } from "@/lib/db/organization";

export const metadata: Metadata = {
  title: "Welcome — Set up your workspace",
  description: "Create your organization and choose a plan.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;

  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user) {
    redirect((plan ? `/login?plan=${plan}` : "/login") as Route);
  }

  const orgs = await getUserOrganizations(session.user.id);
  const hasExistingOrg = orgs.length > 0;

  // If user already has an org and no plan to select, skip onboarding entirely
  if (hasExistingOrg && !plan) {
    redirect("/chat");
  }

  return (
    <div className="container mx-auto flex min-h-dvh w-screen flex-col items-center justify-center px-4 py-8">
      <div className="mx-auto w-full sm:w-[520px]">
        <OnboardingForm
          plan={plan}
          hasExistingOrg={hasExistingOrg}
          existingOrgId={hasExistingOrg ? orgs[0].id : undefined}
          userName={session.user.name ?? ""}
        />
      </div>
    </div>
  );
}
