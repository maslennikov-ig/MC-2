/**
 * Supabase authenticated client factory for course-gen-platform (Node.js backend)
 * @module supabase/authenticated
 *
 * Creates a Supabase client that operates with RLS context using the user's JWT token.
 * This is the preferred method for user-facing operations as it enforces Row-Level Security
 * policies at the database level, providing an additional layer of security.
 *
 * Use cases:
 * - Reading user-owned resources (courses, projects, etc.)
 * - Operations where RLS policies should enforce access control
 *
 * When NOT to use (use getSupabaseAdmin instead):
 * - Insert operations to tables without user-facing RLS (e.g., chat_messages, logs)
 * - Background jobs and workers without user context
 * - Admin operations that bypass RLS intentionally
 *
 * See CLAUDE.md "Supabase" section for architecture details.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import logger from '../logger';

/**
 * Creates a Supabase client with the user's JWT for RLS enforcement
 *
 * @param accessToken - The user's JWT access token (from Authorization header)
 * @returns Supabase client configured with user context for RLS
 *
 * @example
 * ```typescript
 * // In a tRPC procedure with access to the request
 * const token = ctx.req.headers.get('Authorization')?.replace('Bearer ', '');
 * if (!token) throw new TRPCError({ code: 'UNAUTHORIZED' });
 *
 * const supabase = createAuthenticatedClient(token);
 * const { data: course } = await supabase
 *   .from('courses')
 *   .select('*')
 *   .eq('id', courseId)
 *   .single();
 * // RLS policy automatically filters by user_id = auth.uid()
 * ```
 */
export function createAuthenticatedClient(accessToken: string): SupabaseClient<Database> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error(
      {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseAnonKey,
      },
      '[SupabaseAuthenticated] Missing configuration'
    );
    throw new Error('Missing Supabase configuration: SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  // Create a client with the user's JWT in the Authorization header
  // This enables RLS policies to use auth.uid() to identify the user
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  logger.debug({ url: supabaseUrl }, '[SupabaseAuthenticated] Client created with user context');

  return client;
}

/**
 * Extracts the access token from a Request object's Authorization header
 *
 * @param req - The request object (from tRPC context)
 * @returns The access token string or null if not found
 *
 * @example
 * ```typescript
 * const token = extractAccessToken(ctx.req);
 * if (!token) throw new TRPCError({ code: 'UNAUTHORIZED' });
 * const supabase = createAuthenticatedClient(token);
 * ```
 */
export function extractAccessToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

export default createAuthenticatedClient;
