import "server-only";
import { config } from "@/lib/config";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";

type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetTime: number;
  error?: string;
};

type RateLimitOptions = {
  identifier: string;
  limit: number;
  windowSize: number;
  redisClient: any;
  keyPrefix: string;
};

// In-memory fallback for when Redis is unavailable
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000; // Purge expired entries every 60s

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of inMemoryCounters) {
    if (entry.resetAt <= now) {
      inMemoryCounters.delete(key);
    }
  }
}

function inMemoryRateLimit(
  key: string,
  limit: number,
  windowSize: number,
): RateLimitResult {
  cleanupStaleEntries();
  const now = Date.now();
  const resetTime =
    Math.floor(now / (windowSize * 1000)) * windowSize * 1000 +
    windowSize * 1000;
  const entry = inMemoryCounters.get(key);
  if (!entry || entry.resetAt <= now) {
    inMemoryCounters.set(key, { count: 1, resetAt: resetTime });
    return { success: true, remaining: limit - 1, resetTime };
  }
  entry.count++;
  if (entry.count > limit) {
    return {
      success: false,
      remaining: 0,
      resetTime,
      error: "Rate limit exceeded",
    };
  }
  return {
    success: true,
    remaining: Math.max(0, limit - entry.count),
    resetTime,
  };
}

async function checkRateLimit({
  identifier,
  limit,
  windowSize,
  redisClient,
  keyPrefix,
}: RateLimitOptions): Promise<RateLimitResult> {
  const key = `${keyPrefix}:${identifier}`;

  if (!redisClient) {
    return inMemoryRateLimit(key, limit, windowSize);
  }

  const now = Date.now();
  const windowStart = Math.floor(now / (windowSize * 1000)) * windowSize * 1000;
  const resetTime = windowStart + windowSize * 1000;

  try {
    // Use individual commands instead of pipeline for compatibility
    const currentCount = await redisClient.get(key);
    const currentCountNum = currentCount
      ? Number.parseInt(currentCount, 10)
      : 0;

    // Increment the counter
    const newCount = await redisClient.incr(key);

    // Set expiry if this is the first increment
    if (currentCountNum === 0) {
      await redisClient.expire(key, windowSize);
    }

    if (newCount > limit) {
      return {
        success: false,
        remaining: 0,
        resetTime,
        error: "Rate limit exceeded",
      };
    }

    return {
      success: true,
      remaining: Math.max(0, limit - newCount),
      resetTime,
    };
  } catch (error) {
    console.error("Rate limit check failed, falling back to in-memory:", error);
    return inMemoryRateLimit(key, limit, windowSize);
  }
}

const WINDOW_SIZE_MINUTE = 60;
const WINDOW_SIZE_MONTH = 30 * 24 * 60 * 60;

export async function checkAnonymousRateLimit(
  ip: string,
  redisClient: any
): Promise<{
  success: boolean;
  error?: string;
  headers?: Record<string, string>;
}> {
  const { RATE_LIMIT } = ANONYMOUS_LIMITS;

  // Check per-minute limit
  const minuteResult = await checkRateLimit({
    identifier: ip,
    limit: RATE_LIMIT.REQUESTS_PER_MINUTE,
    windowSize: WINDOW_SIZE_MINUTE,
    redisClient,
    keyPrefix: `${config.appPrefix}:rate-limit:minute`,
  });

  if (!minuteResult.success) {
    return {
      success: false,
      error: `Rate limit exceeded. You can make ${RATE_LIMIT.REQUESTS_PER_MINUTE} requests per minute. You've made ${RATE_LIMIT.REQUESTS_PER_MINUTE - minuteResult.remaining} requests this minute. Try again in ${Math.ceil((minuteResult.resetTime - Date.now()) / 1000)} seconds.`,
      headers: {
        "X-RateLimit-Limit": RATE_LIMIT.REQUESTS_PER_MINUTE.toString(),
        "X-RateLimit-Remaining": minuteResult.remaining.toString(),
        "X-RateLimit-Reset": minuteResult.resetTime.toString(),
      },
    };
  }

  // Check per-month limit
  const monthResult = await checkRateLimit({
    identifier: ip,
    limit: RATE_LIMIT.REQUESTS_PER_MONTH,
    windowSize: WINDOW_SIZE_MONTH,
    redisClient,
    keyPrefix: `${config.appPrefix}:rate-limit:month`,
  });

  if (!monthResult.success) {
    const daysUntilReset = Math.ceil(
      (monthResult.resetTime - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return {
      success: false,
      error: `Monthly message limit exceeded. You can make ${RATE_LIMIT.REQUESTS_PER_MONTH} requests per month. You've made ${RATE_LIMIT.REQUESTS_PER_MONTH - monthResult.remaining} requests this month. Try again in ${daysUntilReset} day${daysUntilReset !== 1 ? "s" : ""}.`,
      headers: {
        "X-RateLimit-Limit": RATE_LIMIT.REQUESTS_PER_MONTH.toString(),
        "X-RateLimit-Remaining": monthResult.remaining.toString(),
        "X-RateLimit-Reset": monthResult.resetTime.toString(),
      },
    };
  }

  return {
    success: true,
    headers: {
      "X-RateLimit-Limit-Minute": RATE_LIMIT.REQUESTS_PER_MINUTE.toString(),
      "X-RateLimit-Remaining-Minute": minuteResult.remaining.toString(),
      "X-RateLimit-Reset-Minute": minuteResult.resetTime.toString(),
      "X-RateLimit-Limit-Month": RATE_LIMIT.REQUESTS_PER_MONTH.toString(),
      "X-RateLimit-Remaining-Month": monthResult.remaining.toString(),
      "X-RateLimit-Reset-Month": monthResult.resetTime.toString(),
    },
  };
}

const WINDOW_SIZE_HOUR = 3600;

export async function checkAuthenticatedRateLimit(
  userId: string,
  redisClient: any,
): Promise<{
  success: boolean;
  error?: string;
  headers?: Record<string, string>;
}> {
  const { rateLimit } = config.authenticated;

  // Check per-minute limit
  const minuteResult = await checkRateLimit({
    identifier: userId,
    limit: rateLimit.requestsPerMinute,
    windowSize: WINDOW_SIZE_MINUTE,
    redisClient,
    keyPrefix: `${config.appPrefix}:auth-rate-limit:minute`,
  });

  if (!minuteResult.success) {
    return {
      success: false,
      error: `Rate limit exceeded. You can make ${rateLimit.requestsPerMinute} requests per minute. Try again in ${Math.ceil((minuteResult.resetTime - Date.now()) / 1000)} seconds.`,
      headers: {
        "X-RateLimit-Limit": rateLimit.requestsPerMinute.toString(),
        "X-RateLimit-Remaining": minuteResult.remaining.toString(),
        "X-RateLimit-Reset": minuteResult.resetTime.toString(),
      },
    };
  }

  // Check per-hour limit
  const hourResult = await checkRateLimit({
    identifier: userId,
    limit: rateLimit.requestsPerHour,
    windowSize: WINDOW_SIZE_HOUR,
    redisClient,
    keyPrefix: `${config.appPrefix}:auth-rate-limit:hour`,
  });

  if (!hourResult.success) {
    return {
      success: false,
      error: `Hourly rate limit exceeded. You can make ${rateLimit.requestsPerHour} requests per hour. Try again in ${Math.ceil((hourResult.resetTime - Date.now()) / 1000)} seconds.`,
      headers: {
        "X-RateLimit-Limit": rateLimit.requestsPerHour.toString(),
        "X-RateLimit-Remaining": hourResult.remaining.toString(),
        "X-RateLimit-Reset": hourResult.resetTime.toString(),
      },
    };
  }

  return {
    success: true,
    headers: {
      "X-RateLimit-Limit-Minute": rateLimit.requestsPerMinute.toString(),
      "X-RateLimit-Remaining-Minute": minuteResult.remaining.toString(),
      "X-RateLimit-Reset-Minute": minuteResult.resetTime.toString(),
      "X-RateLimit-Limit-Hour": rateLimit.requestsPerHour.toString(),
      "X-RateLimit-Remaining-Hour": hourResult.remaining.toString(),
      "X-RateLimit-Reset-Hour": hourResult.resetTime.toString(),
    },
  };
}

/**
 * Rate-limit device code generation: 10 requests/minute per IP.
 * Uses in-memory fallback (no Redis required).
 */
export async function checkDeviceCodeRateLimit(
  ip: string,
): Promise<{
  success: boolean;
  error?: string;
  headers?: Record<string, string>;
}> {
  const limit = 10;
  const result = await checkRateLimit({
    identifier: ip,
    limit,
    windowSize: WINDOW_SIZE_MINUTE,
    redisClient: null,
    keyPrefix: `${config.appPrefix}:device-code-rate-limit`,
  });

  if (!result.success) {
    return {
      success: false,
      error: `Rate limit exceeded. Maximum ${limit} device code requests per minute.`,
      headers: {
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.resetTime.toString(),
        "Retry-After": Math.ceil(
          (result.resetTime - Date.now()) / 1000,
        ).toString(),
      },
    };
  }

  return {
    success: true,
    headers: {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": result.resetTime.toString(),
    },
  };
}

/**
 * Rate-limit device token polling: 5 requests/minute per device_code + IP.
 * Returns RFC 8628 "slow_down" error when exceeded.
 * Uses in-memory fallback (no Redis required).
 */
export async function checkDeviceTokenRateLimit(
  ip: string,
  deviceCode: string,
): Promise<{
  success: boolean;
  error?: string;
  errorCode?: string;
  headers?: Record<string, string>;
}> {
  const limit = 5;
  const result = await checkRateLimit({
    identifier: `${deviceCode}:${ip}`,
    limit,
    windowSize: WINDOW_SIZE_MINUTE,
    redisClient: null,
    keyPrefix: `${config.appPrefix}:device-token-rate-limit`,
  });

  if (!result.success) {
    return {
      success: false,
      error: "Polling too frequently. Please slow down.",
      errorCode: "slow_down",
      headers: {
        "X-RateLimit-Limit": limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.resetTime.toString(),
        "Retry-After": Math.ceil(
          (result.resetTime - Date.now()) / 1000,
        ).toString(),
      },
    };
  }

  return {
    success: true,
    headers: {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": result.resetTime.toString(),
    },
  };
}

/**
 * Extract client IP from the request.
 *
 * On Vercel, `x-forwarded-for` is set by the edge and can be trusted.
 * We take the *last* entry (the one Vercel appended) rather than the
 * first (which the client can spoof by sending its own header value).
 *
 * Accepts an optional NextRequest so callers in the proxy can pass
 * `request.ip` directly (Vercel sets this from its edge network).
 */
export function getClientIP(
  request: Request & { ip?: string },
): string {
  // Vercel edge provides a reliable .ip property on NextRequest
  if ("ip" in request && request.ip) {
    return request.ip;
  }

  // Fallback: use the rightmost x-forwarded-for entry (proxy-appended)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim());
    // Rightmost non-empty entry is the one the trusted proxy added
    const trustedIp = parts.filter(Boolean).pop();
    if (trustedIp) return trustedIp;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "127.0.0.1";
}
