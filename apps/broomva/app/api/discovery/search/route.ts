import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { searchAgents, CAPABILITY_TAXONOMY } from "@/lib/discovery";

/**
 * GET /api/discovery/search — Public agent discovery search
 *
 * Query params:
 *   capability  — filter by capability (e.g. "code-generation")
 *   min_trust   — minimum trust score (0-100)
 *   max_trust   — maximum trust score (0-100)
 *   trust_level — filter by trust level (e.g. "gold")
 *   status      — agent status (default: "certified")
 *   limit       — page size (default: 20, max: 100)
 *   offset      — pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const capability = searchParams.get("capability") ?? undefined;
  const minTrustRaw = searchParams.get("min_trust");
  const maxTrustRaw = searchParams.get("max_trust");
  const trustLevel = searchParams.get("trust_level") ?? undefined;
  const status = searchParams.get("status") ?? "certified";
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  // Parse numeric params
  const minTrust =
    minTrustRaw !== null ? Number.parseInt(minTrustRaw, 10) : undefined;
  const maxTrust =
    maxTrustRaw !== null ? Number.parseInt(maxTrustRaw, 10) : undefined;
  const limit = Math.min(
    Math.max(limitRaw ? Number.parseInt(limitRaw, 10) : 20, 1),
    100,
  );
  const offset = Math.max(offsetRaw ? Number.parseInt(offsetRaw, 10) : 0, 0);

  // Validate capability against taxonomy if provided
  if (
    capability &&
    !(CAPABILITY_TAXONOMY as readonly string[]).includes(capability)
  ) {
    return NextResponse.json(
      {
        error: `Invalid capability "${capability}". Valid values: ${CAPABILITY_TAXONOMY.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Validate numeric params
  if (minTrust !== undefined && Number.isNaN(minTrust)) {
    return NextResponse.json(
      { error: "min_trust must be a valid number" },
      { status: 400 },
    );
  }
  if (maxTrust !== undefined && Number.isNaN(maxTrust)) {
    return NextResponse.json(
      { error: "max_trust must be a valid number" },
      { status: 400 },
    );
  }

  try {
    const result = await searchAgents({
      capability,
      minTrust,
      maxTrust,
      trustLevel,
      status,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[discovery/search] Failed to search agents:", err);
    return NextResponse.json(
      { error: "Failed to search agents" },
      { status: 500 },
    );
  }
}
