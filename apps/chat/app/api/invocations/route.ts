import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { isAdmin } from "@/lib/prompts/admin";
import { logInvocation } from "@/lib/telemetry/log-invocation";
import { checkTelemetryRateLimit } from "@/lib/telemetry/rate-limit";
import { createInvocationSchema } from "@/lib/prompts/validation";

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
      { error: "rate_limited" },
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createInvocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const rawVars =
    url.searchParams.get("raw_vars") === "1" && isAdmin(auth?.email);

  try {
    const row = await logInvocation({
      request,
      input: parsed.data,
      auth,
      rawVars,
    });
    return NextResponse.json(
      { id: row.id, created_at: row.createdAt.toISOString() },
      { status: 201 },
    );
  } catch (error) {
    console.error("logInvocation failed:", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
