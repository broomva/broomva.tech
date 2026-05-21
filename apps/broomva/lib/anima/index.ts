/**
 * Anima identity barrel. Re-exports passkey-enrollment helpers (lazy-loaded
 * via next/dynamic on the `/account/security/passkey` route, NEVER imported
 * eagerly from the shared client shell) and the status fetcher (cheap, safe
 * to import from layouts).
 *
 * BRO-1213 / M9-C.
 */

export {
  fetchPasskeyStatus,
  type PasskeyEnrolledStatus,
  type PasskeyNotEnrolledStatus,
  type PasskeyStatus,
} from "./passkey-status";

export {
  enrollPasskey,
  isPasskeySupported,
  base64UrlEncode,
  PasskeyCeremonyAbortedError,
  PasskeyRegistrationError,
  PasskeyUnsupportedError,
  type EnrollPasskeyInput,
  type EnrolledPasskey,
} from "./passkey-enrollment";
