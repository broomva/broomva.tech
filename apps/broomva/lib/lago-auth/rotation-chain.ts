/**
 * Rotation chain walking — TypeScript port of
 * `crates/anima/anima-identity/src/rotation.rs` from broomva/core/life
 * (commit `944f2ba9`).
 *
 * Spec D §"Event additions" defines the verifier semantics for DID
 * rotation: every `anima.identity_rotated { old_did, new_did, …,
 * rotated_at_seq }` event in the Lago journal extends a chain from the
 * genesis DID to the currently authoritative DID. Verifiers seeing an
 * old DID resolve back through this chain to discover the new DID and
 * pull the verifying key from there.
 *
 * This module ports the `walk_rotation_chain` helper + the
 * `JournalResolver` interface verbatim. The TypeScript shape mirrors
 * the Rust trait's two async methods so the verifier path (in
 * `verify-jwt.ts`) reads identically.
 */

import "server-only";

/**
 * One `anima.identity_rotated` event from the Lago journal.
 *
 * Mirrors `anima_core::identity_document::DidRotation`.
 *
 * - `oldDid` — the DID being retired
 * - `newDid` — the new authoritative DID
 * - `rotationProofJws` — JWS proving the holder of `oldDid` authorized
 *   the rotation (lago-auth verifies this separately; this port only
 *   needs the chain edge)
 * - `rotatedAtSeq` — Lago journal seq at which this rotation was
 *   written; used by callers to filter rotations against a JWT's
 *   `iat`/`exp` window (the JWT was minted under the OLD DID at some
 *   seq; if `rotatedAtSeq > jwt.iat`, the JWT is historical)
 */
export interface DidRotation {
  readonly oldDid: string;
  readonly newDid: string;
  readonly rotationProofJws: string;
  readonly rotatedAtSeq: number;
}

/**
 * Query parameters for the rotation chain lookup. Currently carries
 * only the starting DID; matches the Rust `RotationChainQuery<'a>`.
 */
export interface RotationChainQuery {
  readonly startingDid: string;
}

/**
 * Backend-agnostic resolver over the Lago journal.
 *
 * Production: `LifegwJournalResolver` (in `journal-resolver.ts`) talks
 * to the lifegw JWKS-style rotation/revocation endpoints over HTTPS
 * with a TTL cache.
 *
 * Tests: in-memory mock fixtures inside `__tests__/verify-jwt.test.ts`.
 *
 * Mirrors the Rust `JournalResolver` trait. The async methods preserve
 * the I/O boundary so a real HTTP-backed implementation can sit behind
 * the same interface as the in-process test fixture.
 */
export interface JournalResolver {
  /**
   * Return all `anima.identity_rotated` events that mention
   * `query.startingDid` in the rotation chain (either as `oldDid` or
   * as `newDid`). Implementations MAY also return earlier rotations so
   * the caller can build a full ancestor chain.
   *
   * Order: ascending by `rotatedAtSeq` (oldest first). `walkRotationChain`
   * depends on this ordering.
   */
  rotationEventsFor(query: RotationChainQuery): Promise<readonly DidRotation[]>;
  /**
   * If the DID is revoked, return the seq at which the
   * `anima.identity_revoked` event was written. `null` means the DID
   * is currently resolvable.
   */
  revocationEventFor(did: string): Promise<number | null>;
}

/**
 * Trivial in-memory journal that returns no rotations and no
 * revocations. Mirrors the Rust `EmptyJournal`. Used by callers without
 * a real journal hooked up (initial deploys, tests that don't exercise
 * the rotation path).
 */
export class EmptyJournal implements JournalResolver {
  async rotationEventsFor(
    _query: RotationChainQuery,
  ): Promise<readonly DidRotation[]> {
    return [];
  }
  async revocationEventFor(_did: string): Promise<number | null> {
    return null;
  }
}

/**
 * Walk the rotation chain forward from `startingDid` until we hit the
 * currently authoritative DID (the one whose `newDid` is not itself the
 * `oldDid` of any later event).
 *
 * Returns the chain in journal order (oldest rotation first). Empty
 * chain means the DID has never rotated — the caller is holding the
 * genesis DID and can resolve directly via `did:key:`.
 *
 * ## Cycle protection
 *
 * The walker bounds at 256 hops to bail out of pathological journals
 * (a malicious or corrupt journal that links DIDs in a loop). 256 is
 * well above any plausible production rotation rate (a hop a day for
 * 8 months would still fit) but tight enough to fail-fast on bugs.
 *
 * Mirrors `walk_rotation_chain` from
 * `crates/anima/anima-identity/src/rotation.rs` (commit `944f2ba9`).
 */
export async function walkRotationChain(
  startingDid: string,
  resolver: JournalResolver,
): Promise<readonly DidRotation[]> {
  const MAX_HOPS = 256;
  const events = await resolver.rotationEventsFor({ startingDid });
  if (events.length === 0) {
    return [];
  }
  // Build a forward index: oldDid -> rotation event.
  const byOld = new Map<string, DidRotation>();
  for (const r of events) {
    byOld.set(r.oldDid, r);
  }
  const chain: DidRotation[] = [];
  let cursor = startingDid;
  let hops = 0;
  let rot = byOld.get(cursor);
  while (rot !== undefined) {
    if (hops >= MAX_HOPS) {
      throw new Error(
        `rotation chain exceeded ${MAX_HOPS} hops from ${startingDid} (cycle in journal?)`,
      );
    }
    chain.push(rot);
    cursor = rot.newDid;
    hops++;
    rot = byOld.get(cursor);
  }
  return chain;
}
