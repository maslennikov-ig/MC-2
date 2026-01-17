/**
 * Error logging service for permanent failure tracking
 * @module shared/logger/error-service
 *
 * This module provides helper functions for logging permanent failures
 * during document processing workflows.
 */

import { getSupabaseAdmin } from '../supabase/admin';
import { logger } from './index.js';
import type { ErrorLog, ErrorSeverity, CreateErrorLogParams } from './types';
import { detectEnvironment } from './utils';
import { applyAutoMuteStatus } from './auto-mute-service';
import { shouldAutoMute } from './auto-classification';

/**
 * Log a permanent failure to the error_logs table
 *
 * This function should be called after all retry attempts have been exhausted
 * during document processing workflows (BullMQ jobs). It provides a permanent
 * audit trail for failures.
 *
 * @param params - Error log parameters
 * @returns Promise that resolves when error is logged
 *
 * @example
 * ```typescript
 * try {
 *   await processDocument(fileId);
 * } catch (error) {
 *   await logPermanentFailure({
 *     organization_id: orgId,
 *     user_id: userId,
 *     error_message: error.message,
 *     stack_trace: error.stack,
 *     severity: 'ERROR',
 *     file_name: 'document.pdf',
 *     file_size: 1024000,
 *     file_format: 'application/pdf',
 *     job_id: job.id,
 *     job_type: 'DOCUMENT_PROCESSING',
 *     metadata: { retry_count: 3, tier: 'standard' }
 *   });
 * }
 * ```
 */
export async function logPermanentFailure(params: CreateErrorLogParams): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Auto-detect environment if not provided
  const environment = params.environment || detectEnvironment();

  const logData = {
    user_id: params.user_id || null,
    organization_id: params.organization_id,
    problem_id: params.problem_id || null,
    error_message: params.error_message,
    stack_trace: params.stack_trace || null,
    severity: params.severity,
    environment: environment,
    file_name: params.file_name || null,
    file_size: params.file_size || null,
    file_format: params.file_format || null,
    job_id: params.job_id || null,
    job_type: params.job_type || null,
    metadata: params.metadata || null,
  };

  // Use upsert when problem_id is provided to handle duplicate logging attempts
  // (e.g., during BullMQ retries where the same error is logged multiple times)
  // Otherwise use regular insert for unique errors
  let insertedLog: { id: string } | null = null;
  let error: Error | null = null;

  if (params.problem_id) {
    // Upsert: update existing record if problem_id already exists
    const result = await supabase
      .from('error_logs' as any)
      .upsert(logData, { onConflict: 'problem_id', ignoreDuplicates: false })
      .select('id')
      .single();
    insertedLog = result.data as { id: string } | null;
    error = result.error;
  } else {
    // Regular insert for errors without problem_id
    const result = await supabase
      .from('error_logs' as any)
      .insert(logData)
      .select('id')
      .single();
    insertedLog = result.data as { id: string } | null;
    error = result.error;
  }

  if (error) {
    // Fallback to Pino logger if database insert fails
    logger.error(
      {
        err: error.message,
        params,
      },
      'Failed to insert error_logs entry'
    );
    throw new Error(`Failed to log permanent failure: ${error.message}`);
  }

  // Check if this error should be auto-muted
  const logId = (insertedLog as unknown as { id: string } | null)?.id;
  const autoMuteResult = shouldAutoMute(params.error_message);
  if (logId) {
    await applyAutoMuteStatus(logId, params.error_message);
  }

  // Log successful insert
  logger.info(
    {
      organization_id: params.organization_id,
      severity: params.severity,
      job_id: params.job_id,
      auto_muted: autoMuteResult.mute,
    },
    'Permanent failure logged to error_logs table'
  );
}

/**
 * Get error logs for an organization
 *
 * Useful for admin panels to display error history.
 *
 * @param organizationId - Organization UUID
 * @param options - Query options
 * @returns Promise with error logs
 *
 * @example
 * ```typescript
 * const errors = await getOrganizationErrors(orgId, {
 *   severity: 'CRITICAL',
 *   limit: 10
 * });
 * ```
 */
export async function getOrganizationErrors(
  organizationId: string,
  options?: {
    severity?: ErrorSeverity;
    limit?: number;
    offset?: number;
  }
): Promise<ErrorLog[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('error_logs' as any)
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (options?.severity) {
    query = query.eq('severity', options.severity);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data, error } = await query;

  if (error) {
    logger.error(
      {
        err: error.message,
        organizationId,
        options,
      },
      'Failed to fetch organization errors'
    );
    throw new Error(`Failed to fetch error logs: ${error.message}`);
  }

  return (data || []) as unknown as ErrorLog[];
}

/**
 * Get critical errors across all organizations (SuperAdmin only)
 *
 * Useful for system-wide monitoring dashboards.
 *
 * @param limit - Maximum number of errors to fetch
 * @returns Promise with critical error logs
 *
 * @example
 * ```typescript
 * const criticalErrors = await getCriticalErrors(50);
 * ```
 */
export async function getCriticalErrors(limit = 100): Promise<ErrorLog[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('error_logs' as any)
    .select('*')
    .eq('severity', 'CRITICAL')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error({ err: error.message, limit }, 'Failed to fetch critical errors');
    throw new Error(`Failed to fetch critical errors: ${error.message}`);
  }

  return (data || []) as unknown as ErrorLog[];
}

/**
 * Log a warning to the error_logs table
 *
 * Convenience function for tracking important warnings that should be
 * visible in the admin logs dashboard.
 *
 * @param message - Warning message
 * @param context - Additional context (organizationId, metadata, etc.)
 * @returns Promise that resolves when warning is logged (fire-and-forget safe)
 *
 * @example
 * ```typescript
 * // Fire and forget - don't await in hot paths
 * logWarningToDb('Low quality score detected', {
 *   organization_id: orgId,
 *   job_type: 'CONTENT_GENERATION',
 *   metadata: { qualityScore: 0.4, lessonId }
 * }).catch(() => {}); // Silently ignore failures
 *
 * // Or await if you need confirmation
 * await logWarningToDb('Missing source document', {
 *   organization_id: orgId,
 *   metadata: { courseId, documentId }
 * });
 * ```
 */
export async function logWarningToDb(
  message: string,
  context: {
    organization_id?: string;
    user_id?: string;
    job_type?: string;
    job_id?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const environment = detectEnvironment();

  const { error } = await supabase.from('error_logs' as any).insert({
    error_message: message,
    severity: 'WARNING' as ErrorSeverity,
    environment: environment,
    organization_id: context.organization_id || null,
    user_id: context.user_id || null,
    job_type: context.job_type || null,
    job_id: context.job_id || null,
    metadata: context.metadata || null,
  });

  if (error) {
    // Log to console but don't throw - warnings should not break the app
    logger.warn(
      {
        err: error.message,
        message,
        context,
      },
      'Failed to log warning to database'
    );
  }
}
