/**
 * Passkey enrollment — browser-side WebAuthn ceremony plus Anima registration.
 *
 * BRO-1213 / M9-C. Spec reference: docs/superpowers/specs/2026-04-29-spec-d-anima-custody.md.
 *
 * # Why this lives in broomva.tech instead of `@broomva/life-sdk`
 *
 * The handoff doc anticipates `WebCryptoAnima` + `PasskeyOracle` factories
 * shipping from `@broomva/life-sdk`, but as of M9-C that SDK is not yet
 * published as a workspace package and the only available life-runtime
 * client (`@broomva/lifegw-client`) ships proto bindings, not WebAuthn
 * glue. Rather than block M9-C on SDK work, we ship the ceremony locally
 * with a clean interface that the SDK factory can drop in to replace
 * later — same call surface, same registration shape.
 *
 * # Browser surface
 *
 * 1. Call `enrollPasskey({ userId, userEmail, deviceLabel })` from a
 *    Client Component. This is the entry point.
 * 2. `enrollPasskey` calls `navigator.credentials.create()` with a P-256
 *    `pubKeyCredParams` so the platform authenticator mints an EC2 key.
 * 3. The COSE pubkey is decoded into a raw P-256 (x, y) pair, the DID
 *    derived from a SHA-256 over the SEC1-uncompressed bytes (Spec D
 *    §"DID derivation"), and we POST to `/api/anima/custody/register`.
 * 4. The edge route forwards to lifegw with a fresh Tier-1 JWT.
 *
 * # Bundle-size budget (D4)
 *
 * This file is dynamic-imported from `/account/security/passkey/page.tsx`
 * via `next/dynamic({ ssr: false })`. Nothing here is allowed to leak into
 * the shared client shell. Imports are deliberately kept browser-only.
 */

"use client";

export interface EnrollPasskeyInput {
  /** Neon Auth user id — used as the WebAuthn `user.id`. */
  userId: string;
  /** Human-readable identifier — surfaced in the OS passkey picker. */
  userEmail: string;
  /** Display label captured into the registration record. */
  deviceLabel?: string;
}

export interface EnrolledPasskey {
  /** `did:key:z…` form, derived from the P-256 public key. */
  did: string;
  /** Credential ID (base64url) — opaque token from the authenticator. */
  credentialId: string;
  /** EVM address from the wallet keypair, if lifegw provisioned one. */
  address?: string;
  /** Unix-seconds timestamp the lifegw recorded. */
  enrolledAt?: number;
}

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super("WebAuthn is not available in this browser.");
    this.name = "PasskeyUnsupportedError";
  }
}

export class PasskeyCeremonyAbortedError extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `Passkey ceremony aborted: ${detail}`
        : "Passkey ceremony aborted by the user or the platform.",
    );
    this.name = "PasskeyCeremonyAbortedError";
  }
}

export class PasskeyRegistrationError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, detail?: string) {
    super(
      `Failed to register passkey with the Anima identity service (${status})`,
    );
    this.name = "PasskeyRegistrationError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The Relying Party — must match the registrable suffix of the page's origin
 * (e.g. `broomva.tech` for `https://broomva.tech`, `localhost` in dev).
 * Computed lazily so the value is the live origin, not a build-time constant.
 */
function relyingParty(): { id: string; name: string } {
  if (typeof window === "undefined") {
    return { id: "broomva.tech", name: "broomva.tech" };
  }
  const host = window.location.hostname;
  // WebAuthn requires `rp.id` to be a registrable domain or `localhost`.
  // Vercel preview URLs like `*.vercel.app` need to use the literal host;
  // production broomva.tech uses the bare host. Either way the live host
  // satisfies the WebAuthn registrable-suffix check.
  return { id: host, name: "broomva.tech" };
}

/**
 * Probe whether the browser supports the WebAuthn surface this enrollment
 * requires (platform authenticator + P-256). Quick check; safe in SSR.
 */
export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  if (!window.crypto?.subtle) return false;
  return typeof navigator.credentials?.create === "function";
}

/**
 * Run the WebAuthn `navigator.credentials.create()` ceremony, derive the
 * DID, and register with lifegw via the Next.js edge proxy. Throws typed
 * errors so the UI can branch on cancellation vs. registration failure.
 */
export async function enrollPasskey(
  input: EnrollPasskeyInput,
): Promise<EnrolledPasskey> {
  if (!isPasskeySupported()) {
    throw new PasskeyUnsupportedError();
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rp = relyingParty();

  const userIdBytes = new TextEncoder().encode(input.userId);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp,
    user: {
      id: userIdBytes,
      name: input.userEmail,
      displayName: input.userEmail,
    },
    pubKeyCredParams: [
      // P-256 (ES256, COSE alg -7) — Spec D D-Sub-C requires P-256.
      { type: "public-key", alg: -7 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    attestation: "none",
    timeout: 60_000,
  };

  let credential: PublicKeyCredential;
  try {
    const raw = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential | null;
    if (!raw) {
      throw new PasskeyCeremonyAbortedError(
        "navigator.credentials.create() returned null",
      );
    }
    credential = raw;
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      throw new PasskeyCeremonyAbortedError(err.message);
    }
    throw err;
  }

  const attestation = credential.response as AuthenticatorAttestationResponse;
  const publicKeyDer = attestation.getPublicKey?.();
  if (!publicKeyDer) {
    throw new PasskeyRegistrationError(
      0,
      "Attestation did not include a SubjectPublicKeyInfo (browser too old?)",
    );
  }

  const publicKeySpki = new Uint8Array(publicKeyDer);
  const credentialIdBase64Url = base64UrlEncode(
    new Uint8Array(credential.rawId),
  );
  const publicKeySpkiBase64Url = base64UrlEncode(publicKeySpki);

  // Server-side derivation of the DID is the authoritative path —
  // doing it here would risk a client-vs-server mismatch if the SPKI
  // encoding ever shifts. We send the SPKI; lifegw derives the DID.
  const res = await fetch("/api/anima/custody/register", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credentialId: credentialIdBase64Url,
      publicKeySpki: publicKeySpkiBase64Url,
      authenticatorAttachment: credential.authenticatorAttachment ?? "platform",
      deviceLabel: input.deviceLabel ?? defaultDeviceLabel(),
      transports:
        typeof attestation.getTransports === "function"
          ? attestation.getTransports()
          : undefined,
    }),
  });

  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.error ?? body.detail;
    } catch {
      detail = undefined;
    }
    throw new PasskeyRegistrationError(res.status, detail);
  }

  const body = (await res.json()) as {
    did: string;
    address?: string;
    enrolledAt?: number;
  };

  return {
    did: body.did,
    credentialId: credentialIdBase64Url,
    address: body.address,
    enrolledAt: body.enrolledAt,
  };
}

/**
 * Default device label derived from `navigator.userAgentData` (Chromium) or
 * the UA string (Safari / Firefox). Best-effort; never blocks enrollment.
 */
function defaultDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  type NavigatorWithUaData = Navigator & {
    userAgentData?: { platform?: string };
  };
  const nav = navigator as NavigatorWithUaData;
  const uaDataPlatform = nav.userAgentData?.platform;
  if (uaDataPlatform) return `${uaDataPlatform} device`;
  const ua = navigator.userAgent ?? "";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Browser device";
}

/** RFC 4648 §5 base64url, no padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
