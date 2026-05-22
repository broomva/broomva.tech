/**
 * Tier-User capability — browser-side mint + cache + auto-refresh.
 *
 * BRO-1214 / M9-D. Spec D D-Sub-C/D — Tier-User cap is the HTTP-only
 * credential a chatOS browser uses to authenticate against the
 * `/anima/custody/*` surface beyond first-time enrollment. It's distinct
 * from Tier-1 (which auth's broomva.tech → lifegw server-side) — Tier-User
 * is the browser → lifegw cap that authorises per-user custody operations
 * (sign, rotate, revoke, status).
 *
 * # Lifecycle
 *
 *   1. On sign-in, the cap-provider component triggers `ensureFreshTierUserCap`
 *   2. This reads IndexedDB; if a cap exists and is > 60s from expiry, returns it
 *   3. Otherwise, POSTs `/api/anima/custody/mint_session_cap` (proxied to lifegw
 *      by the M9-C edge route at `app/api/anima/custody/[...path]/route.ts`)
 *   4. The new cap is persisted to IndexedDB keyed `"current"` and returned
 *
 * # Failure mode
 *
 * Best-effort: if minting fails (lifegw down, route not yet deployed,
 * network error), the helper returns `null` and the consumer continues
 * without a Tier-User cap. This is safe because all current `/anima/custody/*`
 * callers also pass the Neon Auth session cookie which the edge proxy
 * already accepts. The Tier-User cap is opt-in additive auth; not having
 * it doesn't break anything.
 *
 * # Not persisted across sessions
 *
 * Caps are scoped to the browser tab's signed-in user. The cap-provider
 * clears the IndexedDB store on sign-out. A second user signing in on the
 * same browser wipes the previous user's cap before minting their own.
 */

const DB_NAME = "anima-tier-user";
const DB_VERSION = 1;
const STORE_NAME = "caps";
const CAP_KEY = "current";

const MINT_ENDPOINT = "/api/anima/custody/mint_session_cap";
const MINT_TIMEOUT_MS = 5_000;
const DEFAULT_REFRESH_THRESHOLD_SECS = 60;

export interface TierUserCap {
  /** JWT (ES256, lifegw-signed). Caller MUST send as `Authorization: Bearer <token>`. */
  token: string;
  /** Unix seconds. Caller refreshes when `expiresAt - now <= threshold`. */
  expiresAt: number;
  /** Userid the cap was minted for. Stored so we can detect signed-in-user changes. */
  userId: string;
}

interface MintResponse {
  token: string;
  expiresAt: number;
}

const isBrowser = typeof globalThis !== "undefined"
  && typeof (globalThis as { indexedDB?: IDBFactory }).indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb open failed"));
  });
}

export async function getStoredCap(): Promise<TierUserCap | null> {
  if (!isBrowser) return null;
  try {
    const db = await openDb();
    return await new Promise<TierUserCap | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CAP_KEY);
      req.onsuccess = () => {
        const value = req.result as TierUserCap | undefined;
        resolve(value ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function storeCap(cap: TierUserCap): Promise<void> {
  if (!isBrowser) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(cap, CAP_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Swallow: storage failure isn't user-actionable, and the cap is
    // additive — the app keeps working without it.
  }
}

export async function clearStoredCap(): Promise<void> {
  if (!isBrowser) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(CAP_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Swallow per storeCap rationale.
  }
}

/**
 * POST `/api/anima/custody/mint_session_cap`. Returns the minted cap, or
 * `null` on any failure (network, 4xx, 5xx, timeout, malformed body).
 *
 * The route forwards to lifegw via the M9-C edge proxy. Lifegw decides
 * eligibility based on the Tier-1 cap the proxy mints from the Neon Auth
 * session — so this call requires the user to be signed in already.
 */
async function mintFromServer(userId: string): Promise<TierUserCap | null> {
  if (!isBrowser) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MINT_TIMEOUT_MS);
  try {
    const resp = await fetch(MINT_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as Partial<MintResponse>;
    if (
      typeof body.token !== "string"
      || typeof body.expiresAt !== "number"
      || body.token.length === 0
    ) {
      return null;
    }
    return { token: body.token, expiresAt: body.expiresAt, userId };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a non-expired Tier-User cap, minting one if necessary.
 *
 *   - If the stored cap is for a different user, it's cleared first.
 *   - If the stored cap is within `thresholdSecs` of expiry (default 60s),
 *     a fresh one is minted.
 *   - On mint failure, returns `null` (consumer must tolerate this; the
 *     cap is additive).
 */
export async function ensureFreshTierUserCap(
  userId: string,
  thresholdSecs: number = DEFAULT_REFRESH_THRESHOLD_SECS,
): Promise<TierUserCap | null> {
  if (!isBrowser) return null;
  const stored = await getStoredCap();
  if (stored && stored.userId !== userId) {
    await clearStoredCap();
  } else if (stored) {
    const nowSecs = Math.floor(Date.now() / 1000);
    if (stored.expiresAt - nowSecs > thresholdSecs) {
      return stored;
    }
  }
  const fresh = await mintFromServer(userId);
  if (fresh) await storeCap(fresh);
  return fresh;
}
