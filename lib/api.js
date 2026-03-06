/**
 * fetchWithRetry — Wraps the native fetch API with:
 * - Automatic retry on network failures (1 retry by default)
 * - Consistent error handling
 * - Timeout support
 * 
 * Usage:
 *   import { apiFetch } from '@/lib/api';
 *   const data = await apiFetch('/api/orders');
 *   const data = await apiFetch('/api/orders', { method: 'POST', body: JSON.stringify({...}) });
 */

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 1;

export async function apiFetch(url, options = {}, retries = DEFAULT_RETRIES) {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  // Add default headers for JSON requests
  if (!fetchOptions.headers) fetchOptions.headers = {};
  if (fetchOptions.body && typeof fetchOptions.body === 'string' && !fetchOptions.headers['Content-Type']) {
    fetchOptions.headers['Content-Type'] = 'application/json';
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new ApiError(
          errorData.error || errorData.message || `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      return await response.json();
    } catch (error) {
      // Don't retry on client errors (4xx) or AbortError (timeout)
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Retry on network errors and server errors
      if (attempt < retries) {
        const delay = Math.min(1000 * (attempt + 1), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // All retries exhausted
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        error.name === 'AbortError' ? 'Request timed out' : 'Network error — please check your connection',
        0,
        { originalError: error.message }
      );
    }
  }
}

/**
 * Custom API error class with status code and response data
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}
