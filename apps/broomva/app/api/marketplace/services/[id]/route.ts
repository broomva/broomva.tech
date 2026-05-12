import { NextResponse } from "next/server";

import { getAgentServiceById } from "@/lib/db/marketplace";

/**
 * GET /api/marketplace/services/[id] — get service details.
 *
 * Public endpoint (no auth required).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Service ID is required" },
      { status: 400 },
    );
  }

  try {
    const service = await getAgentServiceById(id);

    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    return NextResponse.json({ service });
  } catch (err) {
    console.error("[marketplace/services/id] Failed to get service:", err);
    return NextResponse.json(
      { error: "Failed to get service details" },
      { status: 500 },
    );
  }
}
