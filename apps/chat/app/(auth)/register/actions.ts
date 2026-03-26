"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  captureServerEvent,
  identifyServerUser,
} from "@/lib/analytics/posthog";
import {
  EVENT_USER_SIGNED_UP,
} from "@/lib/analytics/events";

export async function signUpWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const plan = formData.get("plan");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { error: "Name, email, and password are required." };
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
    identifyServerUser(data.user.id, {
      email: data.user.email,
      name: data.user.name,
    });
    captureServerEvent(data.user.id, EVENT_USER_SIGNED_UP, {
      plan: typeof plan === "string" && plan ? plan : undefined,
    });
  }

  const planParam =
    typeof plan === "string" && plan
      ? `?plan=${encodeURIComponent(plan)}`
      : "";
  redirect(`/onboarding${planParam}` as Route);
}
