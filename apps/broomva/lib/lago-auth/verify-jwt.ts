/**
 * Multi-curve, rotation-aware Agent Auth Protocol JWT verifier —
 * TypeScript port of `crates/lago/lago-auth/src/agent_jwt.rs::verify_jwt`
 * from broomva/core/life (commit `944f2ba9` — "feat(anima): D-Sub-E —
 * SomaCustody + rotation/revocation event flow + lago-auth verifier",
 * PR #1076).
 *
 * Mounted on `/api/v1/*` routes ONLY (BRO-1217). Existing routes keep
 * Better Auth's verifier. Global migration is M11+, NOT this PR.
 *
 * # Threat model (carried verbatim from the Rust source)
 *
 *   - A pwned client can present any header `alg`. The verifier MUST
 *     check the alg before dispatching, and MUST refuse anything
 *     other than `EdDSA` or `ES256`. Other algorithms (HS256, RS256,
 *     `none`) are rejected with `JwtError`.
 *   - The `kid` (header) carries the DID of the signer. The verifier
 *     resolves the DID to extract the public key and confirms that
 *     the resolved curve matches the alg.
 *   - Rotation: the caller is responsible for checking the
 *     `rotation_chain` against the seq of the event being verified.
 *     This module verifies the signature only.
 *
 * # Steps (Spec D D-Sub-E)
 *
 *   1. Detect the alg via [`detectAlg`]; reject anything not EdDSA / ES256.
 *   2. Extract the `kid` (DID) via [`extractKid`].
 *   3. Walk the rotation chain forward from `kid_did` to find the
 *      currently authoritative DID.
 *   4. Check whether the effective DID has been revoked (via the journal
 *      resolver).
 *   5. Resolve the effective DID's public key through `did:key`
 *      multicodec parsing.
 *   6. Verify the signature using the alg-appropriate verifier.
 *
 * # Rust counterpart cross-references
 *
 *   - `agent_jwt.rs::detect_alg` → [`detectAlg`]
 *   - `agent_jwt.rs::extract_kid` → [`extractKid`]
 *   - `agent_jwt.rs::verify_jwt` → [`verifyJwt`]
 *   - `agent_jwt.rs::verify_es256_signature` → [`verifyEs256`]
 *   - `agent_jwt.rs::verify_eddsa_signature` → [`verifyEdDSA`]
 *
 * # Library choices (handoff D1 — locked)
 *
 *   - `jose@^6.2.2` (pinned in `package.json`) — supplies WebCrypto
 *     bindings for both `ES256` (P-256 + SHA-256) and `EdDSA` (Ed25519)
 *     on Node and Vercel Edge runtime.
 *   - Pure TypeScript hand-port (not WASM-compile of the Rust crate)
 *     to keep bundle size small, edge-runtime compatible, and
 *     debuggable from the Vercel logs.
 */

import "server-only";

import { importJWK, jwtVerify } from "jose";
import { DidKeyError, resolveDidKey } from "./did-key";
import {
  type DidRotation,
  type JournalResolver,
  walkRotationChain,
} from "./rotation-chain";

/**
 * Supported Agent Auth Protocol algorithms.
 *
 * Mirrors `agent_jwt.rs::AgentJwtAlg`. The Rust enum is
 * `#[non_exhaustive]`; this string-union form is the TypeScript
 * idiom — consumers MUST switch defensively.
 */
export type AgentJwtAlg = "EdDSA" | "ES256";

/**
 * Error thrown for any JWT verification failure.
 *
 * Mirrors `JwtError::Invalid(String)` from `crates/lago/lago-auth/
 * src/jwt.rs`. The error message wording matches the Rust source
 * (e.g. `"unsupported agent JWT alg '...' (expected EdDSA or ES256)"`)
 * so test assertions that match on substrings port verbatim.
 */
export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtError";
  }
}

/**
 * Verified claims body returned by [`verifyJwt`].
 *
 * Mirrors `VerifiedAgentJwt` (`agent_jwt.rs:134`).
 *
 *   - `alg` — algorithm advertised in the JWT header
 *   - `kidDid` — `kid` claim from the JWT header (the DID the
 *     signature was produced under; may differ from `effectiveDid`
 *     when the signature was minted by an OLD DID still inside the
 *     rotation chain)
 *   - `effectiveDid` — head of the rotation chain (same as `kidDid`
 *     when no rotations apply)
 *   - `rotationChain` — chain walked to resolve the verifying key
 *     (empty when no rotations apply)
 *   - `claims` — decoded body of the JWT (the verifier confirms the
 *     signature + chain + revocation; it does NOT interpret the
 *     claims body — that's the route handler's job)
 */
export interface VerifiedAgentJwt {
  readonly alg: AgentJwtAlg;
  readonly kidDid: string;
  readonly effectiveDid: string;
  readonly rotationChain: readonly DidRotation[];
  readonly claims: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Header parsing (no signature work yet)
// ---------------------------------------------------------------------------

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

function decodeBase64UrlBytes(s: string): Uint8Array {
  // Convert base64url → base64, pad, then decode via atob.
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  // `atob` is part of the Web platform — present on Node 16+ and
  // Vercel Edge.
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function decodeHeader(jwt: string): JwtHeader {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new JwtError(`agent JWT must have 3 parts, got ${parts.length}`);
  }
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64UrlBytes(parts[0]);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`base64 decode header: ${reason}`);
  }
  try {
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as JwtHeader;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`decode header json: ${reason}`);
  }
}

/**
 * Detect the algorithm of an Agent Auth Protocol JWT WITHOUT verifying
 * the signature.
 *
 * Mirrors `agent_jwt.rs::detect_alg`. Only the header is parsed; the
 * body and signature are not touched.
 */
export function detectAlg(jwt: string): AgentJwtAlg {
  const header = decodeHeader(jwt);
  const alg = header.alg;
  if (typeof alg !== "string" || alg.length === 0) {
    throw new JwtError("agent JWT header missing 'alg'");
  }
  if (alg === "EdDSA") {
    return "EdDSA";
  }
  if (alg === "ES256") {
    return "ES256";
  }
  throw new JwtError(
    `unsupported agent JWT alg '${alg}' (expected EdDSA or ES256)`,
  );
}

/**
 * Extract the `kid` (signer DID) from the JWT header.
 *
 * Mirrors `agent_jwt.rs::extract_kid`. Spec D L4-D6 — every agent JWT
 * carries the DID in the header so verifiers can resolve to the
 * public key without an out-of-band lookup.
 */
export function extractKid(jwt: string): string {
  const header = decodeHeader(jwt);
  const kid = header.kid;
  if (typeof kid !== "string" || kid.length === 0) {
    throw new JwtError("agent JWT header missing 'kid' (DID)");
  }
  return kid;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify an ES256 (P-256) JWT signature against a SEC1-compressed
 * 33-byte public key.
 *
 * Mirrors `agent_jwt.rs::verify_es256_signature`. The Rust source
 * uses the `p256` crate; this port uses `jose.importJWK` + WebCrypto's
 * `ECDSA` algorithm under the hood, which is supported on Vercel Edge.
 *
 * Returns the decoded claims body on success; throws `JwtError` on
 * any failure.
 */
async function verifyEs256(
  jwt: string,
  pubkeySec1Compressed: Uint8Array,
): Promise<Record<string, unknown>> {
  if (pubkeySec1Compressed.length !== 33) {
    throw new JwtError(
      `es256 expected 33-byte SEC1 compressed pubkey, got ${pubkeySec1Compressed.length}`,
    );
  }
  const firstByte = pubkeySec1Compressed[0];
  if (firstByte !== 0x02 && firstByte !== 0x03) {
    throw new JwtError(
      `es256 SEC1-compressed point must start with 0x02 or 0x03, got 0x${firstByte.toString(16).padStart(2, "0")}`,
    );
  }
  // P-256 SEC1 compressed → JWK by decompressing the x-coordinate +
  // sign byte. WebCrypto's `importKey('raw', ...)` accepts UNCOMPRESSED
  // SEC1 (65 bytes: 0x04 || X || Y), not compressed, so we decompress
  // explicitly here. Decompression involves a modular square root over
  // F_p which we compute via BigInt — this is the only path that
  // matches the Rust `p256` crate's behaviour of resolving from the
  // 33-byte compressed form embedded in `did:key:`.
  const uncompressed = decompressP256(pubkeySec1Compressed);
  const x = uncompressed.subarray(1, 33);
  const y = uncompressed.subarray(33, 65);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(x),
    y: bytesToBase64Url(y),
    alg: "ES256",
  };
  const key = await importJWK(jwk, "ES256");
  try {
    const result = await jwtVerify(jwt, key, { algorithms: ["ES256"] });
    return result.payload as Record<string, unknown>;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`es256 verify: ${reason}`);
  }
}

/**
 * Verify an EdDSA (Ed25519) JWT signature against a 32-byte public
 * key.
 *
 * Mirrors `agent_jwt.rs::verify_eddsa_signature`. Uses jose's WebCrypto
 * binding for the `Ed25519` algorithm.
 */
async function verifyEdDSA(
  jwt: string,
  pubkey: Uint8Array,
): Promise<Record<string, unknown>> {
  if (pubkey.length !== 32) {
    throw new JwtError(`eddsa expected 32-byte pubkey, got ${pubkey.length}`);
  }
  const jwk = {
    kty: "OKP",
    crv: "Ed25519",
    x: bytesToBase64Url(pubkey),
    alg: "EdDSA",
  };
  const key = await importJWK(jwk, "EdDSA");
  try {
    const result = await jwtVerify(jwt, key, { algorithms: ["EdDSA"] });
    return result.payload as Record<string, unknown>;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`eddsa verify: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Verify a JWT against the public key resolved through the rotation
 * chain.
 *
 * Mirrors `agent_jwt.rs::verify_jwt`. The asynchronous TS shape preserves
 * the I/O boundary at the `JournalResolver` interface so a real
 * HTTP-backed resolver (e.g. `LifegwJournalResolver`) drops in
 * transparently.
 *
 * @param jwt — the bearer JWT (3-part dot-separated form)
 * @param journal — resolver for rotation events + revocation lookups
 * @returns the [`VerifiedAgentJwt`] body on success
 * @throws `JwtError` on any verification failure (alg, kid, rotation
 *   walk, revocation, curve mismatch, signature)
 */
export async function verifyJwt(
  jwt: string,
  journal: JournalResolver,
): Promise<VerifiedAgentJwt> {
  // 1. Alg detection.
  const alg = detectAlg(jwt);

  // 2. Kid extraction.
  const kidDid = extractKid(jwt);

  // 3. Rotation chain walk.
  let rotationChain: readonly DidRotation[];
  try {
    rotationChain = await walkRotationChain(kidDid, journal);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`rotation walk for ${kidDid}: ${reason}`);
  }
  const effectiveDid =
    rotationChain.length > 0
      ? rotationChain[rotationChain.length - 1].newDid
      : kidDid;

  // 4. Revocation check.
  let revokedSeq: number | null;
  try {
    revokedSeq = await journal.revocationEventFor(effectiveDid);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`revocation lookup: ${reason}`);
  }
  if (revokedSeq !== null) {
    throw new JwtError(`did ${effectiveDid} has been revoked`);
  }

  // 5. Resolve the public key via did:key. We resolve the EFFECTIVE
  //    DID — the head of the rotation chain — because that's the DID
  //    whose key actually signed the payload.
  //
  //    NB: If the kidDid differs from the effectiveDid, the JWT
  //    header advertises the OLD DID but the signature is by the NEW
  //    key. That's the "verifier sees the old DID, fetches rotation
  //    chain, re-resolves" flow per Spec D L4-D10. Old signatures
  //    minted before the rotation event seq are still valid against
  //    the OLD DID — that path is for replaying historical events,
  //    not for live verification.
  let resolution: ReturnType<typeof resolveDidKey>;
  try {
    resolution = resolveDidKey(effectiveDid);
  } catch (e) {
    if (e instanceof DidKeyError) {
      throw new JwtError(`resolve ${effectiveDid}: ${e.message}`);
    }
    const reason = e instanceof Error ? e.message : String(e);
    throw new JwtError(`resolve ${effectiveDid}: ${reason}`);
  }

  // Sanity: the alg the JWT advertises must match the curve carried
  // in the resolved DID. Mixing ES256 + Ed25519 is a forged-header
  // smell.
  const algMatches =
    (alg === "ES256" && resolution.algorithm === "P256") ||
    (alg === "EdDSA" && resolution.algorithm === "Ed25519");
  if (!algMatches) {
    throw new JwtError(
      `alg/curve mismatch: jwt alg=${alg} did alg=${resolution.algorithm}`,
    );
  }

  // 6. Per-alg signature verification.
  const claims =
    alg === "ES256"
      ? await verifyEs256(jwt, resolution.publicKey)
      : await verifyEdDSA(jwt, resolution.publicKey);

  return { alg, kidDid, effectiveDid, rotationChain, claims };
}

// ---------------------------------------------------------------------------
// P-256 SEC1-compressed → uncompressed decompression
// ---------------------------------------------------------------------------

/**
 * Decompress a 33-byte SEC1-compressed P-256 point into the 65-byte
 * uncompressed form (`0x04 || X || Y`).
 *
 * P-256 curve equation: y² ≡ x³ - 3x + b (mod p)
 *   p = 2^256 - 2^224 + 2^192 + 2^96 - 1
 *   b = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
 *
 * Given the x-coordinate and the sign byte (0x02 = even y, 0x03 = odd
 * y), we recover y by computing the modular square root of (x³ - 3x +
 * b) using the fact that p ≡ 3 (mod 4), which lets us use the formula
 * y = (x³ - 3x + b)^((p+1)/4) mod p.
 *
 * This matches the algorithm the `p256` Rust crate uses internally
 * when calling `PublicKey::from_sec1_bytes` on a compressed point.
 */
function decompressP256(compressed: Uint8Array): Uint8Array {
  const P256_P =
    0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
  const P256_B =
    0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
  const x = bytesToBigInt(compressed.subarray(1, 33));
  const sign = compressed[0] & 0x01; // 0 for 0x02 (even), 1 for 0x03 (odd)
  const ySquared = ((((x * x) % P256_P) * x) % P256_P) + (P256_P - 3n) * x;
  // Add b and reduce mod p in a way that keeps the intermediate
  // positive. Because (P256_P - 3n) * x can be huge, we reduce in
  // pieces.
  const lhs = ((ySquared % P256_P) + P256_B) % P256_P;
  // For p ≡ 3 (mod 4), sqrt(a) = a^((p+1)/4) mod p.
  const exp = (P256_P + 1n) >> 2n;
  let y = modPow(lhs, exp, P256_P);
  // Choose the root with the correct parity.
  if ((y & 1n) !== BigInt(sign)) {
    y = P256_P - y;
  }
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(bigIntToBytes32(x), 1);
  out.set(bigIntToBytes32(y), 33);
  return out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if ((e & 1n) === 1n) {
      result = (result * b) % mod;
    }
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const byte of bytes) {
    n = (n << 8n) | BigInt(byte);
  }
  return n;
}

function bigIntToBytes32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // `btoa` is on the Web platform; available on Node 16+ and Vercel Edge.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
