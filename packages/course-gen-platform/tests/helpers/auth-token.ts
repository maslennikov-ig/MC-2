/**
 * Centralized Auth Token Helper for Tests
 *
 * Purpose: Provide a robust, cached authentication helper to prevent
 * rate limiting and "Database error querying schema" errors in CI/CD.
 *
 * Features:
 * - Token caching (50-min TTL, matches Supabase 1-hour default)
 * - Exponential backoff with jitter (1s-16s max)
 * - Rate limit detection (429, "rate limit", "Database error")
 * - 5 retries by default
 * - Singleton Supabase auth client
 *
 * Problem: 8+ different getAuthToken implementations across test files
 * with varying retry strategies cause flaky CI tests.
 *
 * Solution: Single source of truth with best practices from generation.test.ts.
 *
 * Usage:
 *   import { getAuthToken, clearTokenCache } from '../helpers/auth-token';
 *
 *   const token = await getAuthToken(email, password);
 *
 *   afterAll(() => {
 *     clearTokenCache(); // Optional: clear cache between test suites
 *   });
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Token cache: key = email, value = { token, expiresAt }
const TOKEN_CACHE = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

// Singleton Supabase auth client (anon key for sign-in)
let authClient: SupabaseClient | null = null;

/**
 * Get or create singleton auth client
 *
 * Uses anon key (not service key) because signInWithPassword
 * requires regular client authentication flow.
 */
function getAuthClient(): SupabaseClient {
  if (!authClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Missing Supabase credentials in environment variables. ' +
          'Required: SUPABASE_URL and SUPABASE_ANON_KEY'
      );
    }

    authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('[AuthToken] Singleton auth client initialized');
  }

  return authClient;
}

/**
 * Check if error is retryable (rate limit or transient)
 *
 * @param error - Supabase auth error
 * @returns true if error should trigger retry
 */
function isRetryableError(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;

  const message = (error.message || '').toLowerCase();
  const status = error.status;

  return (
    status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('database error') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('network')
  );
}

/**
 * Calculate exponential backoff delay with jitter
 *
 * @param attempt - Current attempt number (1-based)
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number): number {
  // Base delay: 1s, 2s, 4s, 8s, 16s (capped)
  const baseDelay = 1000;
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 16000);
  // Add 0-500ms jitter to prevent thundering herd
  const jitter = Math.random() * 500;
  return exponentialDelay + jitter;
}

/**
 * Sign in with Supabase and get JWT token
 *
 * Features:
 * - Token caching to avoid rate limiting (reuses tokens for 50 min)
 * - Exponential backoff with jitter (1s, 2s, 4s, 8s, 16s max)
 * - Rate limit detection (429, "rate limit" in error message)
 * - Transient error handling (database errors, connection issues)
 *
 * @param email - User email
 * @param password - User password
 * @param retries - Max retry attempts (default: 5)
 * @returns JWT access token
 * @throws Error if authentication fails after all retries
 */
export async function getAuthToken(email: string, password: string, retries = 5): Promise<string> {
  // Check cache first
  const cached = TOKEN_CACHE.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const client = getAuthClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data.session?.access_token) {
        // Cache the token
        const token = data.session.access_token;
        TOKEN_CACHE.set(email, {
          token,
          expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
        });
        return token;
      }

      // Determine if error is retryable
      const isRetryable = isRetryableError(error);

      if (!isRetryable || attempt === retries) {
        throw new Error(
          `Failed to authenticate user ${email} after ${attempt} attempts: ` +
            `${error?.message || 'No session returned'}`
        );
      }

      // Calculate delay with exponential backoff + jitter
      const delay = calculateBackoff(attempt);
      const isRateLimit =
        error?.status === 429 || error?.message?.toLowerCase().includes('rate limit');

      console.log(
        `[AuthToken] Attempt ${attempt}/${retries} failed for ${email} ` +
          `(${isRateLimit ? 'rate limited' : 'transient error'}), ` +
          `retrying in ${Math.round(delay)}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (e) {
      // Re-throw if it's our own error or last attempt
      if (e instanceof Error && e.message.includes('Failed to authenticate')) {
        throw e;
      }

      if (attempt === retries) {
        throw new Error(`Failed to authenticate user ${email} after ${retries} attempts: ${e}`);
      }

      // Exponential backoff for unexpected errors
      const delay = calculateBackoff(attempt);
      console.log(
        `[AuthToken] Attempt ${attempt}/${retries} threw unexpected error, ` +
          `retrying in ${Math.round(delay)}ms...`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed to authenticate user ${email}: unexpected error`);
}

/**
 * Clear token cache
 *
 * Call in afterAll() if you need fresh tokens between test suites.
 * Usually not necessary as tokens are cached for 50 minutes.
 */
export function clearTokenCache(): void {
  const count = TOKEN_CACHE.size;
  TOKEN_CACHE.clear();
  if (count > 0) {
    console.log(`[AuthToken] Cleared ${count} cached token(s)`);
  }
}

/**
 * Get cache statistics (for debugging)
 *
 * @returns Object with cache stats
 */
export function getTokenCacheStats(): {
  size: number;
  entries: Array<{ email: string; expiresIn: number }>;
} {
  const now = Date.now();
  const entries: Array<{ email: string; expiresIn: number }> = [];

  for (const [email, { expiresAt }] of TOKEN_CACHE.entries()) {
    entries.push({
      email,
      expiresIn: Math.max(0, Math.round((expiresAt - now) / 1000)),
    });
  }

  return { size: TOKEN_CACHE.size, entries };
}
