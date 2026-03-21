import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withValidation } from "@/lib/api/with-auth";

/**
 * Allowlist of permitted model ID patterns.
 * Uses a regex to accept any vendor-prefixed model string that follows
 * typical naming conventions (alphanumeric, hyphens, dots, colons, slashes).
 */
const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.:\-/]{1,128}[a-zA-Z0-9]$/;

const chatModelSchema = z.object({
  model: z.string().min(1).regex(MODEL_ID_PATTERN, "Invalid model identifier"),
});

// Route for updating selected-model cookie because setting in an action causes a refresh
export const POST = withValidation(
  chatModelSchema,
  async (_request, { body }) => {
    try {
      const cookieStore = await cookies();
      cookieStore.set("chat-model", body.model, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });

      return NextResponse.json({ success: true });
    } catch (_error) {
      return NextResponse.json(
        { error: "Failed to set cookie" },
        { status: 500 },
      );
    }
  },
);
