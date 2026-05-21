/**
 * `did:key` multicodec parser — TypeScript port of
 * `crates/anima/anima-identity/src/did.rs` from broomva/core/life
 * (commit `944f2ba9` — "feat(anima): D-Sub-E — SomaCustody + rotation/
 * revocation event flow + lago-auth verifier").
 *
 * The Agent Auth Protocol uses `did:key:` DIDs in the JWT `kid` header.
 * The DID itself ENCODES the public key via multicodec — no JWKS lookup
 * is needed to extract the verifying key. The JWKS-cache abstraction in
 * the parent `verify-jwt.ts` is for the journal (rotation events +
 * revocation), not for raw key material.
 *
 * Multicodec prefixes (varint-encoded):
 *   - `0xed 0x01` — Ed25519 public key (32 bytes; legacy)
 *   - `0x80 0x24` — P-256 SEC1-compressed public key (33 bytes; current)
 *
 * Format: `did:key:z<base58btc(multicodec_prefix || pubkey)>`
 *
 * References:
 *   - W3C DID Core: https://www.w3.org/TR/did-core/
 *   - did:key Method: https://w3c-ccg.github.io/did-method-key/
 *   - Multicodec: https://github.com/multiformats/multicodec
 */

import "server-only";

/**
 * Supported auth algorithms a `did:key:` DID can encode.
 *
 * Mirrors `anima_identity::did::AuthAlg`. The Rust enum is
 * `#[non_exhaustive]`; we don't add a TS-side equivalent because TS
 * doesn't ship the same exhaustiveness guarantees, but consumers MUST
 * `switch` defensively and throw on unknown values.
 */
export type AuthAlg = "Ed25519" | "P256";

const DID_KEY_PREFIX = "did:key:z";
const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01]);
const P256_MULTICODEC = new Uint8Array([0x80, 0x24]);

/**
 * Output of [`resolveDidKey`] — the algorithm extracted from the DID's
 * multicodec prefix + the raw public key bytes.
 *
 * - Ed25519 → `publicKey.length === 32`
 * - P-256 → `publicKey.length === 33` (SEC1 compressed, first byte 0x02/0x03)
 */
export interface DidResolution {
  readonly algorithm: AuthAlg;
  readonly publicKey: Uint8Array;
}

/**
 * Error thrown when a `did:key:` DID is malformed or carries an
 * unsupported multicodec prefix.
 *
 * The Rust port uses `AnimaError::Identity(String)`; we surface the
 * same message text on `.message` so test assertions that match on
 * substrings (`"unknown multicodec prefix"`, `"P-256 SEC1-compressed
 * public key must be 33 bytes"`) port verbatim.
 */
export class DidKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DidKeyError";
  }
}

/**
 * Resolve a `did:key:` DID and extract the verifying public key.
 *
 * Mirrors `anima_identity::did::resolve_did_key`. Throws `DidKeyError`
 * on any parse failure — the caller (`verify-jwt.ts`) catches and
 * wraps into a `JwtError` with the spec'd error-message shape.
 *
 * Cross-checked against `tests/verify_jwt.rs` (commit `944f2ba9`,
 * lines 84-148) — the 5 canonical test vectors use this resolver
 * indirectly via `verifyJwt`.
 */
export function resolveDidKey(did: string): DidResolution {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new DidKeyError(`invalid did:key format: ${did}`);
  }
  const encoded = did.slice(DID_KEY_PREFIX.length);
  let bytes: Uint8Array;
  try {
    bytes = base58btcDecode(encoded);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new DidKeyError(`base58 decode failed: ${reason}`);
  }
  if (bytes.length < 2) {
    throw new DidKeyError("decoded DID too short for multicodec prefix");
  }
  const prefix = bytes.subarray(0, 2);
  const keyBytes = bytes.subarray(2);
  if (prefix[0] === ED25519_MULTICODEC[0] && prefix[1] === ED25519_MULTICODEC[1]) {
    if (keyBytes.length !== 32) {
      throw new DidKeyError(
        `Ed25519 public key must be 32 bytes, got ${keyBytes.length}`,
      );
    }
    return { algorithm: "Ed25519", publicKey: new Uint8Array(keyBytes) };
  }
  if (prefix[0] === P256_MULTICODEC[0] && prefix[1] === P256_MULTICODEC[1]) {
    if (keyBytes.length !== 33) {
      throw new DidKeyError(
        `P-256 SEC1-compressed public key must be 33 bytes, got ${keyBytes.length}`,
      );
    }
    if (keyBytes[0] !== 0x02 && keyBytes[0] !== 0x03) {
      throw new DidKeyError(
        `P-256 SEC1-compressed point must start with 0x02 or 0x03, got 0x${keyBytes[0].toString(16).padStart(2, "0")}`,
      );
    }
    return { algorithm: "P256", publicKey: new Uint8Array(keyBytes) };
  }
  const hex = (b: number) => `0x${b.toString(16).padStart(2, "0")}`;
  throw new DidKeyError(
    `unknown multicodec prefix: [${hex(prefix[0])}, ${hex(prefix[1])}] (expected Ed25519 [0xed, 0x01] or P-256 [0x80, 0x24])`,
  );
}

// ---------------------------------------------------------------------------
// base58btc decode — hand-rolled to avoid pulling a npm dep just for one
// function. The Bitcoin alphabet + a simple big-int decode loop matches
// what `bs58` ships in 200 LOC. We need the SAME byte output the Rust
// `bs58` crate produces (it uses the same alphabet), so we cross-check
// against the test vectors derived from canonical DIDs in
// `crates/anima/anima-identity/src/did.rs` test fixtures.
// ---------------------------------------------------------------------------

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Reverse lookup table — `BASE58_INDEX[char.charCodeAt(0)]` gives the
// alphabet index or `-1` for invalid characters.
const BASE58_INDEX = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    table[BASE58_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Decode a base58btc-encoded string to bytes.
 *
 * Algorithm: standard big-int conversion (multiply by 58 + add digit).
 * Leading '1' characters in the input map to leading 0x00 bytes in the
 * output (the multibase convention). Empty input returns an empty byte
 * array.
 *
 * Throws `Error` on any invalid character; the caller in `resolveDidKey`
 * catches and re-wraps into a `DidKeyError`.
 */
function base58btcDecode(input: string): Uint8Array {
  if (input.length === 0) {
    return new Uint8Array(0);
  }
  // Count leading '1' (= 0) chars.
  let leadingZeros = 0;
  while (leadingZeros < input.length && input[leadingZeros] === "1") {
    leadingZeros++;
  }
  // Each base58 char carries ~log2(58)/8 ≈ 0.733 bytes of information.
  // Allocate generously then trim leading zeros at the end.
  const size = Math.floor((input.length * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  let length = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    const digit = code < 128 ? BASE58_INDEX[code] : -1;
    if (digit < 0) {
      throw new Error(`invalid base58 character '${input[i]}' at index ${i}`);
    }
    let carry = digit;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 58 * b256[k];
      b256[k] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    if (carry !== 0) {
      throw new Error(`base58 overflow at index ${i}`);
    }
    length = j;
  }
  // Strip the leading zero-bytes from the bigint conversion, then
  // prepend the leading-'1' zero bytes from the input.
  let zeros = size - length;
  while (zeros < size && b256[zeros] === 0) {
    zeros++;
  }
  const out = new Uint8Array(leadingZeros + (size - zeros));
  out.set(b256.subarray(zeros), leadingZeros);
  return out;
}
