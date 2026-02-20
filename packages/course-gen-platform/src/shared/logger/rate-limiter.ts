/**
 * In-memory rate limiter for error log DB writes
 * @module shared/logger/rate-limiter
 *
 * Prevents flood during infrastructure outages (Redis, DB).
 * Max 5 DB writes per normalized message per 60s window.
 * Pino/Axiom logging is unaffected — only DB writes are limited.
 */

const buckets = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

// GC: clean stale entries every 5 minutes
const gcInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.windowStart > WINDOW_MS * 2) {
      buckets.delete(key);
    }
  }
}, 300_000);
gcInterval.unref();

/**
 * Normalize error message to group similar errors.
 * Strips UUIDs, large numbers, and timestamps to create a stable key.
 */
function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\b\d{10,13}\b/g, '<TS>')
    .replace(/\b\d+\b/g, '<N>')
    .substring(0, 200);
}

/**
 * Check if this error should be written to DB.
 * Returns false if rate limit exceeded for this message fingerprint.
 *
 * @param message - Error message to check
 * @returns true if DB write is allowed, false if rate-limited
 */
export function shouldWriteToDb(message: string): boolean {
  const fp = normalizeMessage(message);
  const now = Date.now();
  const entry = buckets.get(fp);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    buckets.set(fp, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_PER_WINDOW;
}
