/**
 * A TokenProvider is an async function that returns a fresh bearer token.
 *
 * The client invokes the provider before every RPC (browser unary calls,
 * server-side gRPC calls). For WS streams, the provider is called once at
 * connection time. Implementations should be cheap (cache-friendly) since
 * they may be called per-request.
 */
export type TokenProvider = () => Promise<string>;

/** Return the same token on every call. Useful for tests and service accounts. */
export function staticTokenProvider(token: string): TokenProvider {
  return async () => token;
}

export interface CacheOptions {
  /** How long a fetched token is considered fresh, in milliseconds. */
  ttlMs: number;
}

/**
 * Wrap a TokenProvider with a TTL cache. Useful when the underlying provider
 * is expensive (e.g. hits a server endpoint or signs a JWT each call).
 */
export function cachedTokenProvider(
  inner: TokenProvider,
  opts: CacheOptions,
): TokenProvider {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.token;
    const token = await inner();
    cached = { token, expiresAt: now + opts.ttlMs };
    return token;
  };
}
