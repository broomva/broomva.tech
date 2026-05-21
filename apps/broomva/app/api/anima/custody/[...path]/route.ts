/**
 * Edge proxy for the `/anima/custody/*` lifegw surface.
 *
 * BRO-1213 / M9-C — Spec D D-Sub-C / D-Sub-E browser-facing custody routes.
 *
 * # Why a proxy
 *
 * The handoff doc spelled this out (D2 in `2026-05-20-spec-c-m9-sub-c.md`):
 * the browser-direct path to lifegw on `/anima/custody/*` is unreliable
 * because lifegw expects a Tier-1 JWT in the `Authorization` header, not
 * the Neon Auth session cookie. We mint a fresh Tier-1 here (server-side
 * with the JWKS-pinned ES256 key) and forward.
 *
 * # Auth surface
 *
 * 1. Verify the Neon Auth session via `getSafeSession`. Reject 401 if
 *    not signed in.
 * 2. Mint a Tier-1 JWT for `{ kind: "user", id: session.user.id }` via
 *    `mintTier1ForConsumer`. TTL = 15 min, scope = `["anima:custody"]`.
 * 3. Forward to `${LIFEGW_URL}/anima/custody/<path>` with that JWT as
 *    `Authorization: Bearer …` and the original body + content-type.
 * 4. Return the upstream response verbatim minus hop-by-hop headers.
 *
 * # Routes handled
 *
 * - `POST /api/anima/custody/register`  — first-time enrollment
 * - `GET  /api/anima/custody/status`    — status check (cheap, idempotent)
 * - `POST /api/anima/custody/rotate`    — rotation (M9-D scope; we just
 *                                          pass through so the edge stays
 *                                          method-agnostic)
 * - `POST /api/anima/custody/revoke`    — revocation
 * - `POST /api/anima/custody/verify`    — verification
 * - `POST /api/anima/custody/mint_session_cap` — Tier-User cap mint (M9-E)
 *
 * # LIFEGW_URL unset (local dev)
 *
 * If `LIFEGW_URL` is not configured, the proxy returns a deterministic
 * stub response — `status` says not-enrolled, `register` echoes a synthetic
 * DID derived from the credential id. This keeps the UI exercising end-to-
 * end locally without forcing every developer to run a full lifegw.
 */

import "server-only";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { mintTier1ForConsumer } from "@/lib/auth/lifegw-jwt";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function resolveUser(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; res: Response }
> {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return {
      ok: false,
      res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    userId: session.user.id,
    email: session.user.email ?? "",
  };
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "missing custody path" }, { status: 400 });
  }
  const subpath = segments.join("/");

  const auth = await resolveUser();
  if (!auth.ok) return auth.res;

  const lifegwBase = process.env.LIFEGW_URL?.trim();
  if (!lifegwBase) {
    return localStub({ subpath, request, userId: auth.userId });
  }

  // Mint a Tier-1 JWT scoped to anima:custody. Spec C₃ §5.4 caps TTL
  // at 15 min — we let mintTier1ForConsumer enforce the cap.
  const cap = await mintTier1ForConsumer({
    consumer: { kind: "user", id: auth.userId },
    projectSlug: "personal",
    scopes: ["anima:custody"],
  });

  const upstreamUrl = new URL(`/anima/custody/${subpath}`, lifegwBase);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  const fwdHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      fwdHeaders.set(key, value);
    }
  });
  fwdHeaders.set("authorization", `Bearer ${cap.token}`);
  fwdHeaders.set("x-broomva-user-id", auth.userId);
  if (auth.email) fwdHeaders.set("x-broomva-user-email", auth.email);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: fwdHeaders,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
      // @ts-expect-error -- duplex is required for streaming bodies on Node 18+
      duplex: "half",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "lifegw unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      resHeaders.set(key, value);
    }
  });

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: resHeaders,
  });
}

/**
 * Local-dev stub — LIFEGW_URL is unset. Returns the minimal shape the UI
 * needs so the enrollment flow renders without a real lifegw running.
 *
 * Status is keyed by an in-memory map (per-process) keyed off userId.
 * Resets on every server restart — that's fine; this is a dev convenience,
 * not a persistence layer. Vercel preview deploys MUST set LIFEGW_URL.
 */
const devEnrollments = new Map<
  string,
  { did: string; address: string; enrolledAt: number }
>();

async function localStub({
  subpath,
  request,
  userId,
}: {
  subpath: string;
  request: NextRequest;
  userId: string;
}): Promise<Response> {
  if (subpath === "status" && request.method === "GET") {
    const enrolled = devEnrollments.get(userId);
    if (enrolled) {
      return NextResponse.json({
        enrolled: true,
        did: enrolled.did,
        address: enrolled.address,
        enrolledAt: enrolled.enrolledAt,
      });
    }
    return NextResponse.json({ enrolled: false });
  }

  if (subpath === "register" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      credentialId?: string;
      publicKeySpki?: string;
    } | null;
    if (!body?.credentialId || !body?.publicKeySpki) {
      return NextResponse.json(
        { error: "missing credentialId or publicKeySpki" },
        { status: 400 },
      );
    }
    // Derive a stable synthetic DID from the credentialId so refresh keeps
    // showing the same value. Real lifegw computes this off the SPKI.
    const did = `did:key:zDEV${body.credentialId.slice(0, 32)}`;
    const address = `0xdev${body.credentialId.slice(0, 38).replace(/[^0-9a-fA-F]/g, "a").padEnd(40, "0")}`;
    const enrolledAt = Math.floor(Date.now() / 1000);
    devEnrollments.set(userId, { did, address, enrolledAt });
    return NextResponse.json({ did, address, enrolledAt });
  }

  return NextResponse.json(
    {
      error: "LIFEGW_URL is not configured and this route is not stubbed",
      hint: "Set LIFEGW_URL in the environment, or extend the dev stub.",
      subpath,
      method: request.method,
    },
    { status: 503 },
  );
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
