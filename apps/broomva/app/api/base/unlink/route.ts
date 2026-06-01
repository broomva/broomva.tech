import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { deleteBaseAccount, isMissingTable } from "@/lib/base/queries";

export async function POST() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    await deleteBaseAccount(userId);
    return NextResponse.json({ linked: false });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ linked: false });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
