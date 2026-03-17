"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function signUpWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return { error: "Name, email, and password are required." };
  }

  const { error } = await auth.signUp.email({
    name,
    email,
    password,
  });

  if (error) {
    return { error: error.message || "Failed to create account." };
  }

  redirect("/chat");
}
