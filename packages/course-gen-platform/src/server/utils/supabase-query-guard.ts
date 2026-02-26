/**
 * Supabase Query Error Guard
 * @module server/utils/supabase-query-guard
 *
 * Shared utility for distinguishing real "not found" errors (PGRST116)
 * from transient network/fetch errors in Supabase .single() queries.
 *
 * Without this guard, `if (error || !data)` treats all errors
 * (including TypeError: fetch failed during server restart) as NOT_FOUND,
 * which causes frontend polling loops to stop permanently.
 */

import { TRPCError } from '@trpc/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { logger } from '../../shared/logger/index.js';

/**
 * Handle a Supabase .single() query error, distinguishing
 * "row not found" (PGRST116) from transient/network errors.
 *
 * - PGRST116 → TRPCError NOT_FOUND
 * - Network/transient → TRPCError INTERNAL_SERVER_ERROR
 * - No error → returns void (no-op)
 *
 * @param error - PostgrestError from Supabase query (null if success)
 * @param entity - Human-readable entity name for logs (e.g. "Course", "Lesson")
 * @param context - Structured log context (requestId, ids, etc.)
 *
 * @example
 * ```typescript
 * const { data: course, error } = await supabase
 *   .from('courses').select('*').eq('id', courseId).single();
 *
 * throwOnSupabaseError(error, 'Course', { requestId, courseId, userId });
 * // If error was PGRST116 → throws NOT_FOUND
 * // If error was network  → throws INTERNAL_SERVER_ERROR
 * // If no error           → continues
 * ```
 */
export function throwOnSupabaseError(
  error: PostgrestError | null,
  entity: string,
  context: Record<string, unknown>
): void {
  if (!error) return;

  // PGRST116 = "JSON object requested, multiple (or no) rows returned"
  // This is the genuine "row not found" error from .single()
  if (error.code === 'PGRST116') {
    logger.warn({ ...context, error }, `${entity} not found`);
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${entity} not found`,
    });
  }

  // Any other error (network, timeout, connection refused, etc.)
  // Must NOT be classified as NOT_FOUND — frontend uses that to stop polling permanently
  logger.error({ ...context, error }, `${entity} lookup failed (transient)`);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Temporary error checking ${entity.toLowerCase()}`,
  });
}
