/**
 * Test Helpers Index
 *
 * Centralized exports for test helper utilities.
 * Import from this file for clean, consistent imports across test files.
 *
 * Usage:
 *   import { getAuthToken, clearTokenCache, getTestSupabaseClient } from '../helpers';
 */

// Auth token helper with caching and mock JWT support
export { getAuthToken, clearTokenCache, getTokenCacheStats } from './auth-token';

// Mock JWT generation (for direct use when email→userId mapping is known)
export { createTestJWT } from './mock-auth-token';

// Shared Supabase client singleton
export {
  getTestSupabaseClient,
  closeTestSupabaseClient,
  resetTestSupabaseClient,
  type Database,
} from './shared-supabase';
