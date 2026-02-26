/**
 * Admin Logs Helpers
 * @module server/routers/admin/logs-helpers
 *
 * Contains status management helpers, getById handlers, retry utilities,
 * and validation logic for the admin logs router.
 * Extracted from logs-query-builders.ts to keep file sizes manageable.
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import { throwOnSupabaseError } from '../../utils/supabase-query-guard';
import type { LogType, LogStatus, LogDetails } from './logs-schemas';

// ============================================================================
// Supabase Client Type
// ============================================================================

type SupabaseAdminClient = SupabaseClient<Database>;

// ============================================================================
// Retry Utilities
// ============================================================================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 100;

/**
 * Retry wrapper for transient database errors.
 * Implements exponential backoff for network/timeout issues.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; operationName: string }
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    operationName,
  } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isRetryable = isTransientError(error);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        {
          attempt,
          maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        },
        `${operationName}: Retrying after transient error`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Determines if an error is transient and worth retrying
 */
export function isTransientError(error: unknown): boolean {
  if (!(error && typeof error === 'object')) return false;

  const errorObj = error as Record<string, unknown>;
  const transientCodes = ['PGRST', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
  const transientPatterns = [
    /timeout/i,
    /connection.*reset/i,
    /network/i,
    /truncated/i,
    /malformed/i,
  ];

  // Check error code
  const code = typeof errorObj.code === 'string' ? errorObj.code : undefined;
  if (code && transientCodes.some(c => code.includes(c))) {
    return true;
  }

  // Check error message patterns
  const message = typeof errorObj.message === 'string' ? errorObj.message : '';
  return transientPatterns.some(pattern => pattern.test(message));
}

// ============================================================================
// Supabase Query Execution
// ============================================================================

/**
 * Execute a Supabase query and throw on error.
 * Detects truncated/malformed responses as transient errors for retry.
 */
export async function executeSupabaseQuery(
  query: PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>
): Promise<{ data: unknown; count: number | null }> {
  const response = await query;
  if (response.error) {
    const isTruncated =
      response.error.message?.startsWith('{') && !response.error.message?.endsWith('}');
    if (isTruncated) {
      throw new Error(`Truncated response: ${response.error.message}`);
    }
    throw new Error(response.error.message);
  }
  return { data: response.data, count: response.count };
}

/**
 * Log query error details in a consistent format
 */
export function logQueryError(error: unknown, tableName: string): void {
  const errorDetails = {
    message: error instanceof Error ? error.message : 'Unknown error',
    code: (error as { code?: string }).code || null,
    details: (error as { details?: string }).details || null,
    hint: (error as { hint?: string }).hint || null,
  };
  logger.error({ errorDetails }, `Error querying ${tableName} after retries`);
}

// ============================================================================
// Status Constants
// ============================================================================

/** Terminal statuses - considered "closed" issues */
const TERMINAL_STATUSES: LogStatus[] = ['resolved', 'ignored', 'auto_muted'];

/** Active statuses - issues being worked on */
const ACTIVE_STATUSES: LogStatus[] = ['new', 'in_progress', 'to_verify'];

// ============================================================================
// Status Fetch Helpers
// ============================================================================

/**
 * Fetch statuses for fingerprint groups.
 * Note: fingerprint column added by migration, using type assertion until types regenerated.
 */
export async function fetchGroupStatuses(
  supabase: SupabaseAdminClient,
  fingerprints: string[]
): Promise<Map<string, LogStatus>> {
  if (fingerprints.length === 0) return new Map();

  const result = await supabase
    .from('log_issue_status')
    .select('fingerprint, status')
    .in('fingerprint', fingerprints);

  const { data } = result;

  const statusMap = new Map<string, LogStatus>();
  (data || []).forEach(row => {
    if (row.fingerprint) {
      statusMap.set(row.fingerprint, row.status as LogStatus);
    }
  });

  return statusMap;
}

/**
 * Fetch statuses for multiple logs of different types in a single query.
 * Optimized to avoid N+1 queries when fetching from both error_logs and generation_trace.
 * @internal Exported for potential future optimization of list procedure
 */
export async function fetchAllLogStatuses(
  supabase: SupabaseAdminClient,
  errorLogIds: string[],
  traceLogIds: string[]
): Promise<{ errorLogs: Map<string, LogStatus>; traces: Map<string, LogStatus> }> {
  const allIds = [...errorLogIds, ...traceLogIds];
  if (allIds.length === 0) {
    return { errorLogs: new Map(), traces: new Map() };
  }

  const { data } = await supabase
    .from('log_issue_status')
    .select('log_id, log_type, status')
    .in('log_id', allIds);

  const errorLogs = new Map<string, LogStatus>();
  const traces = new Map<string, LogStatus>();

  (data || []).forEach(row => {
    if (row.log_type === 'error_log') {
      errorLogs.set(row.log_id, row.status as LogStatus);
    } else {
      traces.set(row.log_id, row.status as LogStatus);
    }
  });

  return { errorLogs, traces };
}

/**
 * Fetch statuses for multiple logs (single type)
 * @deprecated Use fetchAllLogStatuses for batch operations
 */
export async function fetchLogStatuses(
  supabase: SupabaseAdminClient,
  logType: LogType,
  logIds: string[]
): Promise<Map<string, LogStatus>> {
  if (logIds.length === 0) return new Map();

  const { data } = await supabase
    .from('log_issue_status')
    .select('log_id, status')
    .eq('log_type', logType)
    .in('log_id', logIds);

  const statusMap = new Map<string, LogStatus>();
  (data || []).forEach(row => {
    statusMap.set(row.log_id, row.status as LogStatus);
  });

  return statusMap;
}

/**
 * Fetch single log status with user info
 */
export async function fetchLogStatus(
  supabase: SupabaseAdminClient,
  logType: LogType,
  logId: string
): Promise<{
  status: LogStatus;
  notes: string | null;
  updated_at: string | null;
  updatedByEmail: string | null;
} | null> {
  // Query status without join first (to avoid relationship ambiguity)
  const { data } = await supabase
    .from('log_issue_status')
    .select('status, notes, updated_at, updated_by')
    .eq('log_type', logType)
    .eq('log_id', logId)
    .single();

  if (!data) return null;

  // Fetch user email separately if updated_by exists
  let updatedByEmail: string | null = null;
  if (data.updated_by) {
    const { data: userData } = await supabase
      .from('users')
      .select('email')
      .eq('id', data.updated_by)
      .single();
    updatedByEmail = userData?.email || null;
  }

  return {
    status: data.status as LogStatus,
    notes: data.notes,
    updated_at: data.updated_at,
    updatedByEmail,
  };
}

/**
 * Verify that a log exists in the appropriate table
 */
export async function verifyLogExists(
  supabase: SupabaseAdminClient,
  logType: LogType,
  logId: string
): Promise<boolean> {
  const table = logType === 'error_log' ? 'error_logs' : 'generation_trace';

  const { data } = await supabase.from(table).select('id').eq('id', logId).single();

  return !!data;
}

/**
 * Validate status transition and return warning if reopening.
 *
 * Transitioning from terminal states (resolved, ignored, auto_muted)
 * back to active states (new, in_progress, to_verify) is a "reopening"
 * and should require notes to explain why.
 *
 * @param fromStatus - Current status (or null if no status set)
 * @param toStatus - Target status
 * @param hasNotes - Whether notes are provided
 * @returns Object with isValid flag and optional warning message
 */
export function validateStatusTransition(
  fromStatus: LogStatus | null,
  toStatus: LogStatus,
  hasNotes: boolean
): { isValid: boolean; warning?: string; requiresNotes: boolean } {
  // No current status - any transition is valid (initial assignment)
  if (!fromStatus || fromStatus === 'new') {
    return { isValid: true, requiresNotes: false };
  }

  // Same status - valid but pointless
  if (fromStatus === toStatus) {
    return { isValid: true, requiresNotes: false };
  }

  // Check if this is a "reopening" transition
  const isFromTerminal = TERMINAL_STATUSES.includes(fromStatus);
  const isToActive = ACTIVE_STATUSES.includes(toStatus);

  if (isFromTerminal && isToActive) {
    return buildReopeningResult(fromStatus, toStatus, hasNotes);
  }

  // All other transitions are valid
  return { isValid: true, requiresNotes: false };
}

/**
 * Build validation result for reopening transitions.
 */
function buildReopeningResult(
  fromStatus: LogStatus,
  toStatus: LogStatus,
  hasNotes: boolean
): { isValid: boolean; warning: string; requiresNotes: boolean } {
  if (!hasNotes) {
    return {
      isValid: true,
      warning: `Reopening issue from '${fromStatus}' to '${toStatus}' without notes. Consider adding explanation.`,
      requiresNotes: true,
    };
  }
  return {
    isValid: true,
    warning: `Issue reopened from '${fromStatus}' to '${toStatus}'`,
    requiresNotes: false,
  };
}

/**
 * Fetch current status for a log
 */
export async function fetchCurrentLogStatus(
  supabase: SupabaseAdminClient,
  logType: LogType,
  logId: string
): Promise<LogStatus | null> {
  const { data } = await supabase
    .from('log_issue_status')
    .select('status')
    .eq('log_type', logType)
    .eq('log_id', logId)
    .single();

  return data?.status as LogStatus | null;
}

// ============================================================================
// GetById Helpers
// ============================================================================

/**
 * Fetch a single error_log by ID and return full LogDetails.
 */
export async function fetchErrorLogById(
  supabase: SupabaseAdminClient,
  logId: string
): Promise<LogDetails> {
  const { data: log, error } = await supabase
    .from('error_logs')
    .select('*')
    .eq('id', logId)
    .single();

  throwOnSupabaseError(error, 'Error log', { logId });
  if (!log) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: ErrorMessages.notFound('Error log', logId),
    });
  }

  const status = await fetchLogStatus(supabase, 'error_log', logId);

  return mapErrorLogToDetails(log, status);
}

/**
 * Map an error_log DB row and status to LogDetails.
 */
function mapErrorLogToDetails(
  log: {
    id: string;
    created_at: string;
    severity: string;
    error_message: string;
    job_type: string | null;
    course_id: string | null;
    lesson_id: string | null;
    metadata: unknown;
    problem_id: string | null;
    environment: string | null;
    stack_trace: string | null;
    request_id: string | null;
    trpc_path: string | null;
    trpc_input: unknown;
    attempted_value: string | null;
  },
  status: {
    status: LogStatus;
    notes: string | null;
    updated_at: string | null;
    updatedByEmail: string | null;
  } | null
): LogDetails {
  const baseFields = buildStatusFields(status);
  return {
    id: log.id,
    logType: 'error_log',
    createdAt: log.created_at,
    severity: log.severity,
    message: log.error_message,
    source: log.job_type || null,
    courseId: log.course_id || null,
    lessonId: log.lesson_id || null,
    stage: null,
    phase: null,
    ...baseFields,
    metadata: log.metadata as Record<string, unknown> | null,
    problemId: log.problem_id || null,
    environment: log.environment || null,
    courseName: null,
    stackTrace: log.stack_trace,
    errorData: null,
    inputData: null,
    outputData: null,
    modelUsed: null,
    tokensUsed: null,
    costUsd: null,
    durationMs: null,
    requestId: log.request_id || null,
    trpcPath: log.trpc_path || null,
    trpcInput: log.trpc_input as Record<string, unknown> | null,
    attemptedValue: log.attempted_value || null,
  };
}

/**
 * Fetch a single generation_trace by ID and return full LogDetails.
 */
export async function fetchGenerationTraceById(
  supabase: SupabaseAdminClient,
  logId: string
): Promise<LogDetails> {
  const { data: log, error } = await supabase
    .from('generation_trace')
    .select('*, courses(title)')
    .eq('id', logId)
    .single();

  throwOnSupabaseError(error, 'Generation trace', { logId });
  if (!log) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: ErrorMessages.notFound('Generation trace', logId),
    });
  }

  const status = await fetchLogStatus(supabase, 'generation_trace', logId);

  return mapGenerationTraceToDetails(log, status);
}

/**
 * Map a generation_trace DB row and status to LogDetails.
 */
function mapGenerationTraceToDetails(
  log: {
    id: string;
    created_at: string;
    stage: string | null;
    phase: string | null;
    step_name: string;
    course_id: string;
    lesson_id: string | null;
    error_data: unknown;
    input_data: unknown;
    output_data: unknown;
    model_used: string | null;
    tokens_used: number | null;
    cost_usd: string | number | null;
    duration_ms: number | null;
    courses: unknown;
  },
  status: {
    status: LogStatus;
    notes: string | null;
    updated_at: string | null;
    updatedByEmail: string | null;
  } | null
): LogDetails {
  const errorData = log.error_data as Record<string, unknown> | null;
  const courseData = log.courses as { title: string } | null;
  const costUsd = log.cost_usd ? Number(log.cost_usd) : null;
  const message = (errorData?.message as string) || log.step_name || 'Unknown';
  const stackTrace = (errorData?.stack as string) || null;
  const source = `${log.stage ?? ''}/${log.phase ?? ''}`;
  const baseFields = buildStatusFields(status);

  return {
    id: log.id,
    logType: 'generation_trace',
    createdAt: log.created_at,
    severity: errorData ? 'ERROR' : 'WARNING',
    message,
    source,
    courseId: log.course_id,
    lessonId: log.lesson_id || null,
    stage: log.stage,
    phase: log.phase,
    ...baseFields,
    metadata: null,
    problemId: null,
    environment: null,
    courseName: courseData?.title || null,
    stackTrace,
    errorData,
    inputData: log.input_data as Record<string, unknown> | null,
    outputData: log.output_data as Record<string, unknown> | null,
    modelUsed: log.model_used,
    tokensUsed: log.tokens_used,
    costUsd,
    durationMs: log.duration_ms,
    requestId: null,
    trpcPath: null,
    trpcInput: null,
    attemptedValue: null,
  };
}

/**
 * Build common status fields from a log status record.
 */
function buildStatusFields(
  status: {
    status: LogStatus;
    notes: string | null;
    updated_at: string | null;
    updatedByEmail: string | null;
  } | null
): {
  status: LogStatus;
  statusNotes: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedAt: string | null;
} {
  return {
    status: status?.status || 'new',
    statusNotes: status?.notes || null,
    statusUpdatedBy: status?.updatedByEmail || null,
    statusUpdatedAt: status?.updated_at || null,
  };
}
