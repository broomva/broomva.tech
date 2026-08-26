"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { upsertUserFromSession } from "@/lib/db/queries";
import {
  captureServerEvent,
  identifyServerUser,
} from "@/lib/analytics/posthog";
import { EVENT_USER_SIGNED_UP } from "@/lib/analytics/events";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { recordCurrentLegalAcceptance } from "@/lib/db/legal-acceptance";
import { getTrustedClientIPFromHeaders } from "@/lib/utils/rate-limit";

export async function signUpWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const plan = formData.get("plan");
  const acceptedTerms = formData.get("acceptedTerms");
  const authorizedProcessing = formData.get("authorizedProcessing");
  const ageConfirmed = formData.get("ageConfirmed");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { error: "Name, email, and password are required." };
  }

  if (acceptedTerms !== "on") {
    return {
      error: "You must agree to the Terms of Service to create an account.",
    };
  }

  if (authorizedProcessing !== "on") {
    return {
      error:
        "You must authorize the account and service data processing described in the Privacy Policy.",
    };
  }

  if (ageConfirmed !== "on") {
    return { error: "You must confirm that you are at least 18 years old." };
  }

  const { data, error } = await auth.signUp.email({
    name,
    email,
    password,
  });

  if (error) {
    return { error: error.message || "Failed to create account." };
  }

  if (data?.user?.id) {
    // Sync Neon Auth user into app user table immediately after signup
    await upsertUserFromSession({
      sessionUser: {
        id: data.user.id,
        name: data.user.name ?? name,
        email: data.user.email ?? email,
        image: data.user.image ?? null,
      },
    });

    const requestHeaders = await headers();
    await recordCurrentLegalAcceptance({
      userId: data.user.id,
      source: "email-signup",
      ipAddress: getTrustedClientIPFromHeaders(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    });

    identifyServerUser(data.user.id, {
      email: data.user.email,
      name: data.user.name,
    });
    captureServerEvent(data.user.id, EVENT_USER_SIGNED_UP, {
      plan: typeof plan === "string" && plan ? plan : undefined,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      acceptanceSource: "email-signup",
      processingAuthorization: true,
    });
  }

  const planParam =
    typeof plan === "string" && plan ? `?plan=${encodeURIComponent(plan)}` : "";
  redirect(`/onboarding${planParam}` as Route);
}
