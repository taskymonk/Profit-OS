// In-memory cache for frequently accessed, rarely-changed data
// Reduces MongoDB round-trips for hot paths like tenant config

const caches = new Map();

/**
 * Get a value from cache, or fetch it using the provided function.
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Async function to fetch the value if not cached
 * @param {number} ttlMs - Time-to-live in milliseconds (default: 60 seconds)
 * @returns {Promise<any>} Cached or freshly fetched value
 */
export async function getCached(key, fetchFn, ttlMs = 60000) {
  const entry = caches.get(key);
  const now = Date.now();

  if (entry && (now - entry.timestamp) < ttlMs) {
    return entry.value;
  }

  const value = await fetchFn();
  caches.set(key, { value, timestamp: now });
  return value;
}

/**
 * Invalidate a specific cache key (call after writes/updates)
 * @param {string} key - Cache key to invalidate
 */
export function invalidateCache(key) {
  caches.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix
 * @param {string} prefix - Prefix to match
 */
export function invalidateCachePrefix(prefix) {
  for (const key of caches.keys()) {
    if (key.startsWith(prefix)) {
      caches.delete(key);
    }
  }
}

/**
 * Clear the entire cache
 */
export function clearCache() {
  caches.clear();
}
