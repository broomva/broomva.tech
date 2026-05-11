import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import {
  getPromptInvocation,
  updatePromptInvocation,
} from "@/lib/db/queries";
import { updateInvocationSchema } from "@/lib/prompts/validation";
import { computeCostUsd } from "@/lib/prompts/pricing";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = await getPromptInvocation(id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const auth = await resolveAuth(request);

  // Ownership check: if the row is bound to a user, only that user
  // (authenticated) may update it. Anonymous-owned rows (userId=null) are
  // fair game for anyone holding the id — they were anonymous to begin
  // with.
  if (existing.userId) {
    if (!auth || auth.userId !== existing.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (existing.status !== "pulled") {
    return NextResponse.json({ error: "already_locked" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateInvocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const tokensIn = data.tokens_in ?? null;
  const tokensOut = data.tokens_out ?? null;
  const rawCost = data.model
    ? computeCostUsd(data.model, tokensIn, tokensOut)
    : null;
  const costUsd = rawCost === null ? null : rawCost.toFixed(6);

  const updated = await updatePromptInvocation(id, {
    status: data.status,
    model: data.model ?? null,
    latencyMs: data.latency_ms ?? null,
    tokensIn,
    tokensOut,
    costUsd,
    errorMessage: data.error_message ?? null,
  });

  // Race: another writer flipped status between our check and update.
  if (!updated) {
    return NextResponse.json({ error: "already_locked" }, { status: 409 });
  }

  return NextResponse.json(updated, { status: 200 });
}
