/**
 * Passkey enrollment status helpers — both server-side (during layouts/pages
 * needing to know "does this user have a passkey?") and client-side
 * (during /account/security/passkey UI rendering).
 *
 * Status data flows: lifegw `/anima/custody/status` → edge proxy
 * `/api/anima/custody/status` → these helpers → UI.
 *
 * BRO-1213 / M9-C
 */

export interface PasskeyEnrolledStatus {
  enrolled: true;
  /** `did:key:z…` form, P-256 DID. */
  did: string;
  /** EVM address derived from the wallet keypair (Spec D L4-D7). */
  address?: string;
  /** Unix-seconds timestamp of original enrollment. */
  enrolledAt?: number;
  /** Human-readable device label (`MacBook Pro`, `iPhone 15`). */
  deviceLabel?: string;
}

export interface PasskeyNotEnrolledStatus {
  enrolled: false;
}

export type PasskeyStatus = PasskeyEnrolledStatus | PasskeyNotEnrolledStatus;

/**
 * Fetch passkey status from the edge proxy. Returns `{ enrolled: false }`
 * on any non-2xx (treat unknown failures as not-enrolled so the UI surfaces
 * the enrollment flow rather than wedging on an error screen).
 *
 * Call this from Client Components or via Server Component fetch (with the
 * incoming request's cookies forwarded — usually via `next/headers`).
 */
export async function fetchPasskeyStatus(
  baseUrl?: string,
  init?: RequestInit,
): Promise<PasskeyStatus> {
  const url = baseUrl
    ? new URL("/api/anima/custody/status", baseUrl).toString()
    : "/api/anima/custody/status";
  try {
    const res = await fetch(url, {
      ...init,
      credentials: init?.credentials ?? "include",
      headers: {
        accept: "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      return { enrolled: false };
    }
    const body = (await res.json()) as PasskeyStatus;
    if (body && typeof body === "object" && body.enrolled === true) {
      return body;
    }
    return { enrolled: false };
  } catch {
    return { enrolled: false };
  }
}
