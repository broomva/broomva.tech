import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { getBaseAccountLink } from "@/lib/base/queries";

export async function GET() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const link = await getBaseAccountLink(userId);
    if (!link) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({
      linked: true,
      address: link.address,
      chainId: link.chainId,
      verifiedAt: link.verifiedAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
