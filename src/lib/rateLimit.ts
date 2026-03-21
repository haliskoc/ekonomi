type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function cleanupExpired(now: number): void {
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function cleanupIfOversized(): void {
  if (buckets.size <= MAX_BUCKETS) {
    return;
  }

  const entries = Array.from(buckets.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt);
  const toDelete = Math.ceil(entries.length * 0.2);

  for (let i = 0; i < toDelete; i += 1) {
    const key = entries[i]?.[0];
    if (key) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  cleanupExpired(now);
  cleanupIfOversized();

  const current = buckets.get(input.key);
  if (!current || current.resetAt <= now) {
    buckets.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - 1),
      retryAfterSeconds: 0,
    };
  }

  if (current.count >= input.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  buckets.set(input.key, current);

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - current.count),
    retryAfterSeconds: 0,
  };
}
