"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function signInWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const email = formData.get("email");
  const password = formData.get("password");
  const plan = formData.get("plan");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Email and password are required." };
  }

  const { error } = await auth.signIn.email({
    email,
    password,
  });

  if (error) {
    return { error: error.message || "Failed to sign in." };
  }

  if (typeof plan === "string" && plan) {
    redirect(`/onboarding?plan=${encodeURIComponent(plan)}` as Route);
  }

  redirect("/chat");
}
