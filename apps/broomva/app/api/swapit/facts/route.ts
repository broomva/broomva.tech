import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withValidation } from "@/lib/api/with-auth";
import { getSafeSession } from "@/lib/auth";
import {
  commonsStats,
  type FactInput,
  listApprovedSince,
  scanForbidden,
  serializeFact,
  upsertFact,
} from "@/lib/db/swapit-facts";

const MAX_PAYLOAD_BYTES = 32_768;

const factSchema = z.object({
  // the client sends an id, but the server recomputes its own (content-addressed) id
  id: z.string().optional(),
  kind: z.enum(["product", "item_class_hazard", "alternative"]),
  payload: z.record(z.string(), z.unknown()),
});

/** Hash the contributor identity (a Better Auth user id or an anonymous token); the raw
 * value is never stored. Returns null for a fully anonymous, un-tokened contribution. */
function contributorHash(
  userId: string | null,
  anonToken: string | null,
): string | null {
  const raw = userId ?? anonToken;
  return raw
    ? createHash("sha256").update(raw).digest("hex").slice(0, 32)
    : null;
}

// POST /api/swapit/facts — contribute an anonymized fact (anonymous or Better-Auth-identified)
export const POST = withValidation(factSchema, async (_request, { body }) => {
  const leaks = scanForbidden(body.payload);
  if (leaks.length > 0) {
    return NextResponse.json(
      { error: "payload carries forbidden fields", fields: leaks },
      { status: 422 },
    );
  }
  if (JSON.stringify(body.payload).length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const h = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: h },
  });
  const hash = contributorHash(
    session?.user?.id ?? null,
    h.get("x-anon-token"),
  );

  const fact = await upsertFact(body as FactInput, hash);
  return NextResponse.json(serializeFact(fact));
});

// GET /api/swapit/facts?since=<iso>&min_corroboration=<n> — pull approved community facts
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const minCorroboration = Math.max(
    1,
    Number(url.searchParams.get("min_corroboration")) || 1,
  );
  const since = sinceParam ? new Date(sinceParam) : null;
  const facts = await listApprovedSince(since, minCorroboration);
  return NextResponse.json(facts.map(serializeFact));
}

// GET helper is the data endpoint; /health-style stats live on the same resource head.
export async function HEAD(): Promise<Response> {
  const stats = await commonsStats();
  return new NextResponse(null, {
    status: 200,
    headers: {
      "x-swapit-facts-total": String(stats.factsTotal),
      "x-swapit-facts-approved": String(stats.factsApproved),
    },
  });
}
