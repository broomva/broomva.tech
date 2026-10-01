"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeSession } from "@/lib/auth";
import { recordCurrentLegalAcceptance } from "@/lib/db/legal-acceptance";
import { upsertUserFromSession } from "@/lib/db/queries";
import { getTrustedClientIPFromHeaders } from "@/lib/utils/rate-limit";

export async function acceptCurrentLegalTerms(formData: FormData) {
  const next = formData.get("next");
  const target =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/onboarding";

  if (
    formData.get("acceptedTerms") !== "on" ||
    formData.get("authorizedProcessing") !== "on" ||
    formData.get("ageConfirmed") !== "on"
  ) {
    const errParam = new URLSearchParams({ error: "required" });
    if (target !== "/onboarding" && target !== "/chat") {
      errParam.set("next", target);
    }
    redirect(`/legal-acceptance?${errParam.toString()}` as Route);
  }

  const requestHeaders = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: requestHeaders },
  });

  if (!session?.user?.id) redirect("/register");

  // First-time social auth may not have a local app user yet. Sync it before
  // writing the acceptance receipt.
  await upsertUserFromSession({ sessionUser: session.user });

  await recordCurrentLegalAcceptance({
    userId: session.user.id,
    source: "legal-acceptance-page",
    ipAddress: getTrustedClientIPFromHeaders(requestHeaders),
    userAgent: requestHeaders.get("user-agent"),
  });

  redirect(target as Route);
}
