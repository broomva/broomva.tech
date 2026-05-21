/**
 * JWKS cache + `LifegwJournalResolver` — TypeScript shim that mounts
 * the canonical `JournalResolver` shape (`rotation-chain.ts`) on top of
 * the lifegw HTTPS endpoints that publish rotation + revocation events.
 *
 * The canonical Rust verifier in `crates/lago/lago-auth/src/agent_jwt.rs`
 * (commit `944f2ba9`) resolves public keys from the `did:key:` DID
 * itself — NOT from a JWKS lookup. The JWKS cache here is for the
 * JOURNAL state (rotation chain + revocation), which Lago publishes
 * via the lifegw gateway as a JWKS-shaped document at:
 *
 *   - `/.well-known/anima/rotations` — rotation events
 *   - `/.well-known/anima/revocations` — revocation events
 *
 * (lifegw's `crates/life-runtime/lifegw/src/auth/jwks.rs` is the
 * `JwksCache` for Tier-1 Vercel-issued bearer tokens — different
 * concern. We intentionally mirror its 5-minute TTL + single-flight
 * fetch shape so operators reading both codebases see the same cache
 * model.)
 *
 * Cache strategy (per Spec D D-Sub-E + handoff D2):
 *
 *   - TTL: 5 minutes (chaos-drill rotation-propagation upper bound)
 *   - Cache key: starting DID (rotation chain) + DID (revocation)
 *   - On miss: fetch once before failing
 *   - Single-flight: concurrent misses for the same key coalesce
 *     onto one in-flight HTTP request
 *
 * Bundle constraint: this file is `server-only`. It MUST NOT be
 * imported from any client component. The chunk-analysis P11 check in
 * the PR body verifies that.
 */

import "server-only";

import type {
  DidRotation,
  JournalResolver,
  RotationChainQuery,
} from "./rotation-chain";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 1000;

/**
 * Configuration for the HTTP-backed journal resolver.
 *
 * - `baseUrl` — lifegw origin (e.g. `https://lifegw.broomva.tech`)
 * - `ttlMs` — cache TTL; defaults to 5 minutes
 * - `fetchImpl` — DI seam for tests; defaults to global `fetch`
 * - `timeoutMs` — per-request timeout; defaults to 10 seconds
 */
export interface LifegwJournalResolverConfig {
  readonly baseUrl: string;
  readonly ttlMs?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface RotationCacheEntry {
  readonly fetchedAt: number;
  readonly events: readonly DidRotation[];
}

interface RevocationCacheEntry {
  readonly fetchedAt: number;
  readonly seq: number | null;
}

/**
 * JSON wire shape for rotation events. Mirrors the Rust
 * `DidRotation` serialization (snake_case fields).
 */
interface RotationWire {
  old_did: string;
  new_did: string;
  rotation_proof_jws: string;
  rotated_at_seq: number;
}

/**
 * JSON wire shape for the lifegw rotation endpoint. The endpoint
 * returns the same shape as the Lago journal: `{ events: [...] }`.
 */
interface RotationDocWire {
  events: RotationWire[];
}

/**
 * JSON wire shape for the lifegw revocation endpoint.
 *
 * `seq` is the journal seq at which the revocation event was written,
 * or `null` if the DID is currently resolvable.
 */
interface RevocationDocWire {
  seq: number | null;
}

/**
 * HTTP-backed `JournalResolver` with a TTL cache + single-flight
 * fetching. Sits in front of the lifegw `/.well-known/anima/*`
 * endpoints.
 *
 * This is the production `JournalResolver` implementation for
 * `/api/v1/*` routes. Tests use the in-memory mocks in
 * `__tests__/verify-jwt.test.ts`.
 */
export class LifegwJournalResolver implements JournalResolver {
  private readonly baseUrl: string;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  private readonly rotations = new Map<string, RotationCacheEntry>();
  private readonly revocations = new Map<string, RevocationCacheEntry>();
  // Single-flight coalescer: in-flight requests are keyed by the
  // cache key so concurrent misses for the same DID share one fetch.
  private readonly rotationsInflight = new Map<
    string,
    Promise<readonly DidRotation[]>
  >();
  private readonly revocationsInflight = new Map<
    string,
    Promise<number | null>
  >();

  constructor(config: LifegwJournalResolverConfig) {
    // Strip trailing slash so URL composition stays stable regardless
    // of how callers configure `LIFEGW_GATEWAY_URL`.
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async rotationEventsFor(
    query: RotationChainQuery,
  ): Promise<readonly DidRotation[]> {
    const key = query.startingDid;
    const cached = this.rotations.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.events;
    }
    const inflight = this.rotationsInflight.get(key);
    if (inflight !== undefined) {
      return inflight;
    }
    const promise = this.fetchRotations(query.startingDid).finally(() => {
      this.rotationsInflight.delete(key);
    });
    this.rotationsInflight.set(key, promise);
    return promise;
  }

  async revocationEventFor(did: string): Promise<number | null> {
    const cached = this.revocations.get(did);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.seq;
    }
    const inflight = this.revocationsInflight.get(did);
    if (inflight !== undefined) {
      return inflight;
    }
    const promise = this.fetchRevocation(did).finally(() => {
      this.revocationsInflight.delete(did);
    });
    this.revocationsInflight.set(did, promise);
    return promise;
  }

  /** Test-only: clear all cached entries. */
  _resetCacheForTests(): void {
    this.rotations.clear();
    this.revocations.clear();
    this.rotationsInflight.clear();
    this.revocationsInflight.clear();
  }

  private async fetchRotations(
    startingDid: string,
  ): Promise<readonly DidRotation[]> {
    const url = `${this.baseUrl}/.well-known/anima/rotations?did=${encodeURIComponent(startingDid)}`;
    const doc = await this.fetchJson<RotationDocWire>(url);
    const events: DidRotation[] = (doc.events ?? []).map((w) => ({
      oldDid: w.old_did,
      newDid: w.new_did,
      rotationProofJws: w.rotation_proof_jws,
      rotatedAtSeq: w.rotated_at_seq,
    }));
    this.rotations.set(startingDid, { fetchedAt: Date.now(), events });
    return events;
  }

  private async fetchRevocation(did: string): Promise<number | null> {
    const url = `${this.baseUrl}/.well-known/anima/revocations?did=${encodeURIComponent(did)}`;
    const doc = await this.fetchJson<RevocationDocWire>(url);
    const seq = doc.seq ?? null;
    this.revocations.set(did, { fetchedAt: Date.now(), seq });
    return seq;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await this.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`lifegw fetch ${url}: status ${resp.status}`);
      }
      return (await resp.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
