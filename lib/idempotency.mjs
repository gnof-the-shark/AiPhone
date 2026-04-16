// @ts-check
/**
 * In-memory idempotency store.
 *
 * When a caller supplies an `Idempotency-Key` header the response is cached
 * for IDEMPOTENCY_TTL_MS (default 24 h).  A second request with the same key
 * returns the cached result immediately without sending another SMS.
 *
 * The store is intentionally in-memory (no database needed) — on process
 * restart the store clears, which is acceptable because idempotency within a
 * single agent session is the main goal.
 */

/**
 * @typedef {{ response: unknown, expiresAt: number }} IdempotencyEntry
 */

/** @type {Map<string, IdempotencyEntry>} */
const _store = new Map();

/**
 * Look up a previously cached response for `key`.
 * Returns the cached response, or `null` if not found / expired.
 *
 * @param {string} key
 * @returns {unknown|null}
 */
export function checkIdempotency(key) {
  const entry = _store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    return null;
  }
  return entry.response;
}

/**
 * Cache `response` under `key` for `ttlMs` milliseconds.
 *
 * @param {string} key
 * @param {unknown} response
 * @param {number} ttlMs
 */
export function saveIdempotency(key, response, ttlMs) {
  _store.set(key, { response, expiresAt: Date.now() + ttlMs });
}

/**
 * Remove all entries (used in tests to reset state between runs).
 */
export function clearIdempotencyStore() {
  _store.clear();
}

/**
 * Evict all expired entries.
 * Call periodically to prevent unbounded memory growth in long-running servers.
 */
export function evictExpiredIdempotencyEntries() {
  const now = Date.now();
  for (const [key, entry] of _store) {
    if (now > entry.expiresAt) _store.delete(key);
  }
}
