/**
 * Shared Supabase Client for Tests
 *
 * Purpose: Provide a singleton Supabase client to prevent connection pooling
 * exhaustion in CI/CD environments when running multiple test files.
 *
 * Problem: Each test file creating its own client leads to connection pool
 * exhaustion, causing "Database error querying schema" errors.
 *
 * Solution: Single shared client instance reused across all test files.
 *
 * Usage:
 *   import { getTestSupabaseClient, closeTestSupabaseClient } from '../helpers/shared-supabase';
 *
 *   const supabase = getTestSupabaseClient();
 *
 *   afterAll(async () => {
 *     // Optional: only in top-level test file
 *     await closeTestSupabaseClient();
 *   });
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';

let sharedClient: SupabaseClient<Database> | null = null;

/**
 * Get shared Supabase client for tests
 *
 * Creates singleton client on first call, reuses on subsequent calls.
 * Uses service role key for full access (bypasses RLS).
 *
 * @returns Typed Supabase client
 * @throws Error if environment variables are missing
 */
export function getTestSupabaseClient(): SupabaseClient<Database> {
  if (!sharedClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        'Missing Supabase credentials in environment variables. ' +
        'Required: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)'
      );
    }

    sharedClient = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Increase timeout for CI environments
      global: {
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            // @ts-expect-error - signal type mismatch
            signal: AbortSignal.timeout(30000), // 30 second timeout
          });
        },
      },
    });

    console.log('[SharedSupabase] Test client initialized');
  }

  return sharedClient;
}

/**
 * Close shared Supabase client
 *
 * Resets the singleton. Call in afterAll() of top-level test file only.
 * Note: Supabase JS client doesn't have explicit close method,
 * but this resets the singleton to allow garbage collection.
 */
export function closeTestSupabaseClient(): void {
  if (sharedClient) {
    // Note: Supabase client doesn't have explicit close/disconnect
    // We just null the reference to allow GC
    sharedClient = null;
    console.log('[SharedSupabase] Test client closed');
  }
}

/**
 * Reset shared client (for test isolation if needed)
 *
 * Creates a fresh client instance. Use sparingly as creating
 * many clients defeats the purpose of the singleton.
 */
export function resetTestSupabaseClient(): void {
  sharedClient = null;
}

// Re-export for convenience
export { type Database };
