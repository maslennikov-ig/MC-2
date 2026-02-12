/**
 * Centralized Auth Token Helper for Tests
 *
 * Two modes:
 * 1. **Mock JWT (preferred)**: When SUPABASE_JWT_SECRET is set, generates JWT locally.
 *    No network calls, no flaky signInWithPassword(), instant and 100% reliable.
 *    Requires: user exists in public.users (for ID lookup) and auth.users (for getUser() validation).
 *
 * 2. **Real Auth (fallback)**: When SUPABASE_JWT_SECRET is NOT set, falls back to
 *    signInWithPassword() with exponential backoff. Used in local dev without JWT secret.
 *
 * Token caching applies to both modes (50-min TTL).
 *
 * Usage:
 *   import { getAuthToken, clearTokenCache } from '../helpers/auth-token';
 *   const token = await getAuthToken(email, password);
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestJWT } from './mock-auth-token';

// Token cache: key = email, value = { token, expiresAt }
const TOKEN_CACHE = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

// User ID cache: key = email, value = userId (avoids repeated DB lookups)
const USER_ID_CACHE = new Map<string, string>();

// Singleton Supabase auth client (anon key for sign-in)
let authClient: SupabaseClient | null = null;

// Singleton Supabase admin client (service role for user lookup)
let adminClient: SupabaseClient | null = null;

/**
 * Get or create singleton auth client (anon key for signInWithPassword)
 */
function getAuthClient(): SupabaseClient {
  if (!authClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase credentials. Required: SUPABASE_URL and SUPABASE_ANON_KEY');
    }

    authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return authClient;
}

/**
 * Get or create singleton admin client (service role for user ID lookup)
 */
function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'Missing Supabase credentials. Required: SUPABASE_URL and SUPABASE_SERVICE_KEY'
      );
    }

    adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return adminClient;
}

/**
 * Look up user ID by email from public.users table
 * Results are cached to avoid repeated DB lookups.
 */
async function getUserIdByEmail(email: string): Promise<string> {
  const cached = USER_ID_CACHE.get(email);
  if (cached) return cached;

  const client = getAdminClient();
  const { data, error } = await client.from('users').select('id').eq('email', email).single();

  if (error || !data) {
    throw new Error(
      `[MockAuth] User ${email} not found in public.users. ` +
        `Ensure setupTestFixtures() ran before getAuthToken(). Error: ${error?.message}`
    );
  }

  const userId = (data as { id: string }).id;
  USER_ID_CACHE.set(email, userId);
  return userId;
}

/**
 * Generate mock JWT token locally (no network call to Auth API)
 */
async function getMockAuthToken(email: string, jwtSecret: string): Promise<string> {
  // Check token cache first
  const cached = TOKEN_CACHE.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // Look up user ID from database (cached after first call)
  const userId = await getUserIdByEmail(email);
  const token = createTestJWT(userId, email, jwtSecret);

  TOKEN_CACHE.set(email, {
    token,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
  });

  return token;
}

/**
 * Get auth token for testing
 *
 * Mode selection (automatic):
 * - SUPABASE_JWT_SECRET set → local JWT generation (fast, reliable)
 * - SUPABASE_JWT_SECRET not set → signInWithPassword (real auth, can be flaky)
 *
 * @param email - User email
 * @param password - User password (ignored in mock mode)
 * @param retries - Max retry attempts for real auth mode (default: 5)
 * @returns JWT access token
 */
export async function getAuthToken(email: string, password: string, retries = 5): Promise<string> {
  // Mock mode: generate JWT locally when secret is available
  // Note: trim() guards against whitespace-only values from CI env vars
  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (jwtSecret) {
    return getMockAuthToken(email, jwtSecret);
  }

  // Real mode: signInWithPassword with retry/backoff
  return getRealAuthToken(email, password, retries);
}

/**
 * Real auth token via signInWithPassword (fallback for local dev)
 */
async function getRealAuthToken(email: string, password: string, retries: number): Promise<string> {
  // Check cache first
  const cached = TOKEN_CACHE.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const client = getAuthClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });

      if (!error && data.session?.access_token) {
        const token = data.session.access_token;
        TOKEN_CACHE.set(email, {
          token,
          expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
        });
        return token;
      }

      const isRetryable = isRetryableError(error);
      if (!isRetryable || attempt === retries) {
        throw new Error(
          `Failed to authenticate user ${email} after ${attempt} attempts: ` +
            `${error?.message || 'No session returned'}`
        );
      }

      const delay = calculateBackoff(attempt);
      console.log(
        `[AuthToken] Attempt ${attempt}/${retries} failed for ${email}, ` +
          `retrying in ${Math.round(delay)}ms...`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (e) {
      if (e instanceof Error && e.message.includes('Failed to authenticate')) {
        throw e;
      }
      if (attempt === retries) {
        throw new Error(`Failed to authenticate user ${email} after ${retries} attempts: ${e}`);
      }
      const delay = calculateBackoff(attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`Failed to authenticate user ${email}: unexpected error`);
}

function isRetryableError(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return (
    error.status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('database error') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('network')
  );
}

function calculateBackoff(attempt: number): number {
  const exponentialDelay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
  return exponentialDelay + Math.random() * 500;
}

/**
 * Clear token cache (and user ID cache)
 */
export function clearTokenCache(): void {
  const count = TOKEN_CACHE.size;
  TOKEN_CACHE.clear();
  USER_ID_CACHE.clear();
  if (count > 0) {
    console.log(`[AuthToken] Cleared ${count} cached token(s)`);
  }
}

/**
 * Get cache statistics (for debugging)
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
