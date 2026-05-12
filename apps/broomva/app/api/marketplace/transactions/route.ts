import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { listUserTransactions } from "@/lib/db/marketplace";

/**
 * GET /api/marketplace/transactions — list the authenticated user's transactions.
 *
 * Query params:
 *   limit — number of results (default 50, max 100)
 */
export const GET = withAuth(async (request, { userId }) => {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : 50;

  if (Number.isNaN(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const transactions = await listUserTransactions(userId, limit);
    return NextResponse.json({ transactions });
  } catch (err) {
    console.error(
      "[marketplace/transactions] Failed to list transactions:",
      err,
    );
    return NextResponse.json(
      { error: "Failed to list transactions" },
      { status: 500 },
    );
  }
});
