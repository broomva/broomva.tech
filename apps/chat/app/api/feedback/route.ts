import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import {
  createPromptFeedbackRow,
  getFeedbackForPrompt,
} from "@/lib/db/queries";
import { createFeedbackSchema } from "@/lib/prompts/validation";
import { serializeFeedback } from "@/lib/prompts/serialize";
import { checkTelemetryRateLimit } from "@/lib/telemetry/rate-limit";

export async function POST(request: Request) {
  const auth = await resolveAuth(request);

  const rate = checkTelemetryRateLimit({
    request,
    userId: auth?.userId ?? null,
  });
  if (!rate.allowed) {
    const retryAfter = Math.max(
      0,
      Math.ceil((rate.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", code: "invalid_payload" },
      { status: 400 },
    );
  }

  const parsed = createFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        code: "invalid_payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const row = await createPromptFeedbackRow({
      invocationId: parsed.data.invocation_id ?? null,
      promptSlug: parsed.data.prompt_slug,
      promptVersion: parsed.data.prompt_version,
      userId: auth?.userId ?? null,
      signal: parsed.data.signal,
      text: parsed.data.text ?? null,
      source: parsed.data.source,
    });
    return NextResponse.json(
      { id: row.id, created_at: row.createdAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    console.error("createPromptFeedbackRow failed:", error);
    return NextResponse.json(
      { error: "Failed to log feedback", code: "internal" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const promptSlug = url.searchParams.get("prompt_slug");
  if (!promptSlug) {
    return NextResponse.json(
      {
        error: "prompt_slug query param is required",
        code: "invalid_payload",
      },
      { status: 400 },
    );
  }

  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 8;
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 8),
  );

  const rows = await getFeedbackForPrompt({ promptSlug, limit });
  return NextResponse.json(rows.map(serializeFeedback), { status: 200 });
}
