import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "../../_lib/auth";
import { getUpstream } from "../../_lib/upstream";

export const runtime = "nodejs";

const body = z.object({
  sid: z.string().min(1),
  content: z.string().min(1).max(64_000),
});

export async function POST(req: NextRequest): Promise<Response> {
  try {
    await requireSession();
  } catch (resp) {
    if (resp instanceof Response) return resp;
    throw resp;
  }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await getUpstream().sendMessage(parsed.data);
    return Response.json({ ok: true }, { status: 202 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
