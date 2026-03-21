import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { agentRegistration } from "@/lib/db/schema";
import { CAPABILITY_TAXONOMY } from "@/lib/discovery";

/**
 * POST /api/discovery/register — Register an agent for discovery (authenticated)
 *
 * Body: {
 *   name: string,
 *   description: string,
 *   capabilities: string[],
 *   version?: string,
 *   sourceUrl?: string,
 *   organizationId?: string
 * }
 *
 * Returns: { id, status: "pending" }
 */
export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    name?: string;
    description?: string;
    capabilities?: string[];
    version?: string;
    sourceUrl?: string;
    organizationId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, capabilities, version, sourceUrl, organizationId } =
    body;

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid field: name" },
      { status: 400 },
    );
  }

  if (
    !description ||
    typeof description !== "string" ||
    description.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Missing or invalid field: description" },
      { status: 400 },
    );
  }

  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return NextResponse.json(
      { error: "capabilities must be a non-empty array of strings" },
      { status: 400 },
    );
  }

  // Validate each capability against the taxonomy
  const invalidCapabilities = capabilities.filter(
    (c) => !(CAPABILITY_TAXONOMY as readonly string[]).includes(c),
  );
  if (invalidCapabilities.length > 0) {
    return NextResponse.json(
      {
        error: `Invalid capabilities: ${invalidCapabilities.join(", ")}. Valid values: ${CAPABILITY_TAXONOMY.join(", ")}`,
      },
      { status: 400 },
    );
  }

  try {
    const [inserted] = await db
      .insert(agentRegistration)
      .values({
        name: name.trim(),
        description: description.trim(),
        capabilities,
        version: version?.trim() ?? null,
        sourceUrl: sourceUrl?.trim() ?? null,
        organizationId: organizationId ?? null,
        status: "pending",
        trustScore: 0,
        trustLevel: "none",
      })
      .returning({ id: agentRegistration.id, status: agentRegistration.status });

    return NextResponse.json(
      { id: inserted.id, status: inserted.status },
      { status: 201 },
    );
  } catch (err) {
    console.error("[discovery/register] Failed to register agent:", err);
    return NextResponse.json(
      { error: "Failed to register agent" },
      { status: 500 },
    );
  }
}
