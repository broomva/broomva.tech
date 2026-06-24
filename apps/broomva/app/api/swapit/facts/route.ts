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
const MAX_FREETEXT = 600;

// The server is the trust boundary for direct POSTs that never touched the Python client's
// allowlist builders, so the payload shape is validated per-kind: free-text is length-capped
// and id-lists must be arrays of strings (a value-typed payload the Python client could never
// produce is rejected here, not silently hashed + published).
const freetext = z.string().max(MAX_FREETEXT);
const id = z.string().max(120);
const idList = z.array(id).max(40).optional();

const productPayload = z
  .object({
    product_name: freetext,
    brand: freetext.nullish(),
    gtin: z.string().max(64).nullish(),
    item_class: id,
    observed_hazards: idList,
    recycling_code: z.string().max(32).nullish(),
    label_terms: z.array(z.string().max(120)).max(20).optional(),
    evidence: z.unknown().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

const hazardPayload = z
  .object({
    item_class: id,
    hazard_id: id,
    presence_likelihood: z.number().optional(),
    rationale: freetext.optional(),
    sources: z.unknown().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

const alternativePayload = z
  .object({
    name: freetext,
    replaces: z.array(id).max(40),
    avoids_hazards: idList,
    material: freetext.optional(),
    rationale: freetext.optional(),
    sources: z.unknown().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

const factSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().optional(),
    kind: z.literal("product"),
    payload: productPayload,
  }),
  z.object({
    id: z.string().optional(),
    kind: z.literal("item_class_hazard"),
    payload: hazardPayload,
  }),
  z.object({
    id: z.string().optional(),
    kind: z.literal("alternative"),
    payload: alternativePayload,
  }),
]);

/** Server-observed contributor identity: the Better Auth session user, else the client IP.
 * NOT a client-supplied header — otherwise one source could mint many identities and
 * self-corroborate. Returns null when no signal is available (then it can't count toward
 * approval). The raw value is hashed and never stored. */
function contributorHash(userId: string | null, h: Headers): string | null {
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  const raw = userId ?? ip;
  return raw
    ? createHash("sha256").update(raw).digest("hex").slice(0, 32)
    : null;
}

// POST /api/swapit/facts — contribute an anonymized fact (anonymous-by-IP or Better-Auth-identified)
export const POST = withValidation(factSchema, async (_request, { body }) => {
  const leaks = scanForbidden(body.payload);
  if (leaks.length > 0) {
    return NextResponse.json(
      { error: "payload carries forbidden fields", fields: leaks },
      { status: 422 },
    );
  }
  if (
    Buffer.byteLength(JSON.stringify(body.payload), "utf8") > MAX_PAYLOAD_BYTES
  ) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const h = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: h },
  });
  const hash = contributorHash(session?.user?.id ?? null, h);

  const fact = await upsertFact(
    { kind: body.kind, payload: body.payload } as FactInput,
    hash,
  );
  return NextResponse.json(serializeFact(fact));
});

// GET /api/swapit/facts?since=<iso>&min_corroboration=<n> — pull approved community facts
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get("since");
    const minCorroboration = Math.max(
      1,
      Number(url.searchParams.get("min_corroboration")) || 1,
    );
    const since = sinceParam ? new Date(sinceParam) : null;
    const facts = await listApprovedSince(since, minCorroboration);
    return NextResponse.json(facts.map(serializeFact));
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// HEAD /api/swapit/facts — liveness + fact counts in headers
export async function HEAD(): Promise<Response> {
  try {
    const stats = await commonsStats();
    return new NextResponse(null, {
      status: 200,
      headers: {
        "x-swapit-facts-total": String(stats.factsTotal),
        "x-swapit-facts-approved": String(stats.factsApproved),
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
