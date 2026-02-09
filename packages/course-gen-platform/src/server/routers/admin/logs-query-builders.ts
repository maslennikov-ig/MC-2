/**
 * Admin Logs Query Builders
 * @module server/routers/admin/logs-query-builders
 *
 * Contains query builder functions for the admin logs router.
 * Builds and executes queries for error_logs, generation_trace,
 * and grouped error logs.
 *
 * Tables used:
 * - error_logs: System and file processing errors
 * - generation_trace: LLM generation traces (when error_data is not null)
 * - log_issue_status: Admin review status for logs
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';
import type { LogType, LogStatus, UnifiedLogItem, ErrorGroupItem } from './logs-schemas';
import { logFiltersSchema } from './logs-schemas';
import {
  withRetry,
  executeSupabaseQuery,
  logQueryError,
  fetchLogStatuses,
  fetchGroupStatuses,
} from './logs-helpers';

// Re-export from logs-helpers for backwards compatibility
export {
  withRetry,
  isTransientError,
  fetchGroupStatuses,
  fetchAllLogStatuses,
  fetchLogStatuses,
  fetchLogStatus,
  verifyLogExists,
  validateStatusTransition,
  fetchCurrentLogStatus,
  fetchErrorLogById,
  fetchGenerationTraceById,
} from './logs-helpers';

// ============================================================================
// Supabase Client Type
// ============================================================================

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

// ============================================================================
// Security Helpers
// ============================================================================

/**
 * Sanitize search input to prevent SQL injection via LIKE pattern characters.
 * Escapes %, _, and \ which have special meaning in LIKE patterns.
 */
function sanitizeSearchInput(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}

// ============================================================================
// Query Data Types
// ============================================================================

/** Row type returned from get_grouped_error_logs RPC function */
type GroupedErrorLogRow = {
  fingerprint: string;
  count: number;
  first_seen: string;
  last_seen: string;
  severity: string;
  message: string;
  environments: string[] | null;
  latest_log_id: string;
  latest_problem_id: string | null;
  job_type: string | null;
  issue_status: string | null;
  latest_course_id: string | null;
};

type ErrorLogQueryData = {
  id: string;
  created_at: string;
  severity: string;
  error_message: string;
  job_type: string | null;
  metadata: unknown;
  problem_id: string | null;
  environment: string | null;
  fingerprint: string | null;
};

type TraceQueryData = {
  id: string;
  created_at: string;
  stage: string;
  phase: string;
  step_name: string;
  course_id: string;
  lesson_id: string | null;
  error_data: unknown;
  courses: { title: string } | null;
};

type LogFilters = z.infer<typeof logFiltersSchema>;

// ============================================================================
// Error Logs Status Filter Helpers
// ============================================================================

/**
 * Pre-fetch error log IDs matching the "new" status filter.
 * "New" means logs without any status record or with explicit status='new'.
 */
async function fetchNewErrorLogIds(supabase: SupabaseAdminClient): Promise<string[] | null> {
  const { data: newLogIds, error: rpcError } = await supabase.rpc('get_new_error_log_ids');

  if (rpcError) {
    logger.error({ error: rpcError }, 'RPC get_new_error_log_ids failed');
    return null;
  }

  const ids = (newLogIds as { id: string }[] | null) || [];
  return ids.map(row => row.id);
}

/**
 * Pre-fetch error log IDs matching a specific non-new status filter.
 * Tries RPC first, falls back to multi-query approach with fingerprint support.
 */
async function fetchErrorLogIdsByStatus(
  supabase: SupabaseAdminClient,
  status: string
): Promise<string[]> {
  const { data: statusData, error: statusError } = await supabase.rpc('get_error_logs_by_status', {
    p_status: status,
  });

  if (!statusError) {
    const ids = (statusData as { id: string }[] | null) || [];
    return ids.map(row => row.id);
  }

  // Fallback: query with fingerprint support
  logger.warn({ error: statusError }, 'RPC get_error_logs_by_status not available, falling back');

  return fetchErrorLogIdsByStatusFallback(supabase, status);
}

/**
 * Fallback implementation for fetching error log IDs by status.
 * Queries both fingerprint-based and individual log_id-based statuses.
 */
async function fetchErrorLogIdsByStatusFallback(
  supabase: SupabaseAdminClient,
  status: string
): Promise<string[]> {
  // Get fingerprints with this status
  const { data: fingerprintsWithStatus } = await supabase
    .from('log_issue_status')
    .select('fingerprint')
    .eq('log_type', 'error_log')
    .eq('status', status)
    .not('fingerprint', 'is', null);

  const fingerprints = (fingerprintsWithStatus || [])
    .map(r => r.fingerprint)
    .filter(Boolean) as string[];

  // Get log_ids with this status (individual)
  const { data: logIdsWithStatus } = await supabase
    .from('log_issue_status')
    .select('log_id')
    .eq('log_type', 'error_log')
    .eq('status', status);

  const logIds = (logIdsWithStatus || []).map(r => r.log_id);

  // Get logs by fingerprint
  let fingerprintLogIds: string[] = [];
  if (fingerprints.length > 0) {
    const { data: logsByFingerprint } = await supabase
      .from('error_logs')
      .select('id')
      .in('fingerprint', fingerprints);
    fingerprintLogIds = (logsByFingerprint || []).map(r => r.id);
  }

  // Combine both sets
  return [...new Set([...logIds, ...fingerprintLogIds])];
}

/**
 * Resolve status-filtered IDs for error_logs.
 * Returns null if no status filter is set, empty array if filter matches nothing.
 */
async function resolveErrorLogsStatusFilter(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined
): Promise<string[] | null> {
  if (!filters?.status) return null;

  if (filters.status === 'new') {
    const ids = await fetchNewErrorLogIds(supabase);
    return ids ?? [];
  }

  return fetchErrorLogIdsByStatus(supabase, filters.status);
}

// ============================================================================
// Error Logs Row Mapping
// ============================================================================

/**
 * Map error_logs DB row to UnifiedLogItem.
 * Resolves status from individual map, fingerprint map, or defaults to 'new'.
 */
function mapErrorLogToUnifiedItem(
  log: ErrorLogQueryData,
  statuses: Map<string, LogStatus>,
  fingerprintStatuses: Map<string, LogStatus>
): UnifiedLogItem {
  const fp = log.fingerprint ?? undefined;
  // Priority: individual status > fingerprint status > 'new'
  const status = statuses.get(log.id) || (fp ? fingerprintStatuses.get(fp) : undefined) || 'new';
  return {
    id: log.id,
    logType: 'error_log' as LogType,
    createdAt: log.created_at,
    severity: log.severity,
    message: log.error_message,
    source: log.job_type || null,
    courseId: null,
    lessonId: null,
    stage: null,
    phase: null,
    status,
    metadata: log.metadata as Record<string, unknown> | null,
    problemId: log.problem_id || null,
    environment: log.environment || null,
    courseName: null,
  };
}

// ============================================================================
// Build Error Logs Query
// ============================================================================

/**
 * Build and execute query for error_logs table.
 * Pre-filters by status, applies other filters, retries on transient errors,
 * then maps results to UnifiedLogItem.
 */
export async function buildErrorLogsQuery(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined,
  sort: { field: string; direction: string } | undefined,
  limit: number,
  offset: number
): Promise<{ items: UnifiedLogItem[]; total: number }> {
  // Status filter: pre-fetch log IDs with matching status
  const statusFilteredIds = await resolveErrorLogsStatusFilter(supabase, filters);

  // Short-circuit if status filter matched nothing
  if (statusFilteredIds !== null && statusFilteredIds.length === 0) {
    return { items: [], total: 0 };
  }

  // Build and execute query
  const query = buildErrorLogsSelectQuery(
    supabase,
    filters,
    statusFilteredIds,
    sort,
    limit,
    offset
  );

  // Execute query with retry for transient errors
  let data: ErrorLogQueryData[] | null = null;
  let count: number | null = null;

  try {
    const result = await withRetry(() => executeSupabaseQuery(query), {
      operationName: 'buildErrorLogsQuery',
    });
    data = result.data as ErrorLogQueryData[] | null;
    count = result.count;
  } catch (error) {
    logQueryError(error, 'error_logs');
    return { items: [], total: 0 };
  }

  // Map results to UnifiedLogItem
  return mapErrorLogsResults(supabase, data || [], count || 0);
}

/**
 * Build the SELECT query for error_logs with all filters applied.
 */
function buildErrorLogsSelectQuery(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined,
  statusFilteredIds: string[] | null,
  sort: { field: string; direction: string } | undefined,
  limit: number,
  offset: number
) {
  let query = supabase
    .from('error_logs')
    .select(
      'id, created_at, severity, error_message, job_type, metadata, problem_id, environment, fingerprint',
      { count: 'exact' }
    );

  // Apply status filter if we have specific IDs
  if (statusFilteredIds !== null) {
    query = query.in('id', statusFilteredIds);
  }

  if (filters?.level) {
    query = query.eq('severity', filters.level);
  }

  if (filters?.search && filters.search.length >= 2) {
    const sanitized = sanitizeSearchInput(filters.search);
    query = query.ilike('error_message', `%${sanitized}%`);
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  if (filters?.environment) {
    query = query.eq('environment', filters.environment);
  }

  // Apply sorting
  const sortField = sort?.field === 'severity' ? 'severity' : 'created_at';
  const ascending = sort?.direction === 'asc';
  query = query.order(sortField, { ascending });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  return query;
}

/**
 * Map error_logs query results to UnifiedLogItem array.
 * Fetches individual and fingerprint-based statuses.
 */
async function mapErrorLogsResults(
  supabase: SupabaseAdminClient,
  data: ErrorLogQueryData[],
  count: number
): Promise<{ items: UnifiedLogItem[]; total: number }> {
  // Fetch statuses for these logs (individual status by log_id)
  const logIds = data.map(log => log.id);
  const statuses = await fetchLogStatuses(supabase, 'error_log', logIds);

  // Fetch fingerprint-based statuses as fallback
  const fingerprints = data
    .map(log => log.fingerprint ?? undefined)
    .filter((fp): fp is string => !!fp);
  const fingerprintStatuses = await fetchGroupStatuses(supabase, fingerprints);

  const items = data.map(log => mapErrorLogToUnifiedItem(log, statuses, fingerprintStatuses));

  return { items, total: count };
}

// ============================================================================
// Generation Trace Status Filter Helpers
// ============================================================================

/**
 * Pre-fetch generation trace IDs matching the "new" status filter.
 * "New" means traces without any status record or with explicit status='new'.
 */
async function fetchNewTraceIds(supabase: SupabaseAdminClient): Promise<string[]> {
  // Get log_ids with explicit 'new' status
  const { data: logsWithNewStatus } = await supabase
    .from('log_issue_status')
    .select('log_id')
    .eq('log_type', 'generation_trace')
    .eq('status', 'new');

  const newStatusLogIds = new Set((logsWithNewStatus || []).map(r => r.log_id));

  // Get log_ids with non-new status (to exclude)
  const { data: logsWithOtherStatus } = await supabase
    .from('log_issue_status')
    .select('log_id')
    .eq('log_type', 'generation_trace')
    .neq('status', 'new');

  const otherStatusLogIds = new Set((logsWithOtherStatus || []).map(r => r.log_id));

  // Get all generation_trace with error_data
  const { data: allTraces } = await supabase
    .from('generation_trace')
    .select('id')
    .not('error_data', 'is', null);

  return (allTraces || [])
    .filter(trace => {
      if (newStatusLogIds.has(trace.id)) return true;
      if (otherStatusLogIds.has(trace.id)) return false;
      return true;
    })
    .map(trace => trace.id);
}

/**
 * Pre-fetch generation trace IDs matching a specific non-new status filter.
 */
async function fetchTraceIdsByStatus(
  supabase: SupabaseAdminClient,
  status: string
): Promise<string[]> {
  const statusQuery = await supabase
    .from('log_issue_status')
    .select('log_id')
    .eq('log_type', 'generation_trace')
    .eq('status', status);

  if (statusQuery.error) {
    logger.error({ error: statusQuery.error }, 'Error fetching status-filtered IDs');
    return [];
  }

  return (statusQuery.data || []).map(row => row.log_id);
}

/**
 * Resolve status-filtered IDs for generation_trace.
 * Returns null if no status filter is set.
 */
async function resolveTraceStatusFilter(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined
): Promise<string[] | null> {
  if (!filters?.status) return null;

  if (filters.status === 'new') {
    return fetchNewTraceIds(supabase);
  }

  return fetchTraceIdsByStatus(supabase, filters.status);
}

// ============================================================================
// Generation Trace Row Mapping
// ============================================================================

/**
 * Map generation_trace DB row to UnifiedLogItem.
 */
function mapTraceToUnifiedItem(
  log: TraceQueryData,
  statuses: Map<string, LogStatus>
): UnifiedLogItem {
  const errorData = log.error_data as Record<string, unknown> | null;
  const courseData = log.courses as { title: string } | null;
  return {
    id: log.id,
    logType: 'generation_trace' as LogType,
    createdAt: log.created_at,
    severity: 'ERROR',
    message: (errorData?.message as string) || log.step_name || 'Unknown error',
    source: `${log.stage}/${log.phase}`,
    courseId: log.course_id,
    lessonId: log.lesson_id || null,
    stage: log.stage,
    phase: log.phase,
    status: statuses.get(log.id) || 'new',
    metadata: null,
    problemId: null,
    environment: null,
    courseName: courseData?.title || null,
  };
}

// ============================================================================
// Build Generation Trace Query
// ============================================================================

/**
 * Build and execute query for generation_trace table (with error_data).
 */
export async function buildGenerationTraceQuery(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined,
  sort: { field: string; direction: string } | undefined,
  limit: number,
  offset: number
): Promise<{ items: UnifiedLogItem[]; total: number }> {
  // Skip query entirely if filtering for WARNING or CRITICAL
  if (filters?.level && filters.level !== 'ERROR') {
    return { items: [], total: 0 };
  }

  // Status filter: pre-fetch log IDs with matching status
  const statusFilteredIds = await resolveTraceStatusFilter(supabase, filters);

  if (statusFilteredIds !== null && statusFilteredIds.length === 0) {
    return { items: [], total: 0 };
  }

  // Build and execute query
  const query = buildTraceSelectQuery(supabase, filters, statusFilteredIds, sort, limit, offset);

  let data: TraceQueryData[] | null = null;
  let count: number | null = null;

  try {
    const result = await withRetry(() => executeSupabaseQuery(query), {
      operationName: 'buildGenerationTraceQuery',
    });
    data = result.data as TraceQueryData[] | null;
    count = result.count;
  } catch (error) {
    logQueryError(error, 'generation_trace');
    return { items: [], total: 0 };
  }

  // Map results
  return mapTraceResults(supabase, data || [], count || 0);
}

/**
 * Build the SELECT query for generation_trace with all filters applied.
 */
function buildTraceSelectQuery(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined,
  statusFilteredIds: string[] | null,
  sort: { field: string; direction: string } | undefined,
  limit: number,
  offset: number
) {
  let query = supabase
    .from('generation_trace')
    .select(
      'id, created_at, stage, phase, step_name, course_id, lesson_id, error_data, courses(title)',
      { count: 'exact' }
    )
    .not('error_data', 'is', null);

  if (statusFilteredIds !== null) {
    query = query.in('id', statusFilteredIds);
  }

  if (filters?.search && filters.search.length >= 2) {
    const sanitized = sanitizeSearchInput(filters.search);
    query = query.ilike('step_name', `%${sanitized}%`);
  }

  if (filters?.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters?.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  if (filters?.courseId) {
    query = query.eq('course_id', filters.courseId);
  }

  const ascending = sort?.direction === 'asc';
  query = query.order('created_at', { ascending });
  query = query.range(offset, offset + limit - 1);

  return query;
}

/**
 * Map generation_trace query results to UnifiedLogItem array.
 */
async function mapTraceResults(
  supabase: SupabaseAdminClient,
  data: TraceQueryData[],
  count: number
): Promise<{ items: UnifiedLogItem[]; total: number }> {
  const logIds = data.map(log => log.id);
  const statuses = await fetchLogStatuses(supabase, 'generation_trace', logIds);

  const items = data.map(log => mapTraceToUnifiedItem(log, statuses));
  return { items, total: count };
}

// ============================================================================
// Build Grouped Error Logs Query
// ============================================================================

/**
 * Build and execute grouped query for error_logs by fingerprint.
 * Uses PostgreSQL RPC function for efficient server-side grouping.
 */
export async function buildGroupedErrorLogsQuery(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined,
  limit: number,
  offset: number
): Promise<{ items: ErrorGroupItem[]; total: number }> {
  const searchParam = filters?.search ? sanitizeSearchInput(filters.search) : undefined;

  // Call RPC function for grouped data
  const { data: groupedDataRaw, error } = await supabase.rpc('get_grouped_error_logs', {
    p_limit: limit,
    p_offset: offset,
    p_severity: filters?.level ?? undefined,
    p_environment: filters?.environment ?? undefined,
    p_search: searchParam,
    p_date_from: filters?.dateFrom ?? undefined,
    p_date_to: filters?.dateTo ?? undefined,
    p_status: filters?.status ?? undefined,
  });

  const groupedData = groupedDataRaw as GroupedErrorLogRow[] | null;

  if (error) {
    logger.error({ error }, 'Error calling get_grouped_error_logs RPC');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: ErrorMessages.databaseError('Grouped logs query', error.message),
    });
  }

  const total = await fetchGroupedCount(supabase, filters, searchParam);

  if (!groupedData || groupedData.length === 0) {
    return { items: [], total: 0 };
  }

  const courseNameMap = await fetchCourseNames(supabase, groupedData);
  const items = groupedData.map(g => mapGroupedRow(g, courseNameMap));

  return { items, total };
}

/**
 * Fetch total count for grouped error logs pagination.
 */
async function fetchGroupedCount(
  supabase: SupabaseAdminClient,
  filters: LogFilters | undefined,
  searchParam: string | undefined
): Promise<number> {
  const { data: countDataRaw, error: countError } = await supabase.rpc(
    'get_grouped_error_logs_count',
    {
      p_severity: filters?.level ?? undefined,
      p_environment: filters?.environment ?? undefined,
      p_search: searchParam,
      p_date_from: filters?.dateFrom ?? undefined,
      p_date_to: filters?.dateTo ?? undefined,
      p_status: filters?.status ?? undefined,
    }
  );

  if (countError) {
    logger.error({ error: countError }, 'Error calling get_grouped_error_logs_count RPC');
  }

  return (countDataRaw as number) ?? 0;
}

/**
 * Fetch course names for grouped error log rows.
 */
async function fetchCourseNames(
  supabase: SupabaseAdminClient,
  groupedData: GroupedErrorLogRow[]
): Promise<Map<string, string>> {
  const courseIds = [
    ...new Set(groupedData.map(g => g.latest_course_id).filter(Boolean) as string[]),
  ];

  const courseNameMap = new Map<string, string>();
  if (courseIds.length === 0) return courseNameMap;

  const { data: courses } = await supabase.from('courses').select('id, title').in('id', courseIds);

  (courses || []).forEach(c => {
    courseNameMap.set(c.id, c.title);
  });

  return courseNameMap;
}

/**
 * Map a grouped RPC row to ErrorGroupItem.
 */
function mapGroupedRow(g: GroupedErrorLogRow, courseNameMap: Map<string, string>): ErrorGroupItem {
  return {
    fingerprint: g.fingerprint,
    count: g.count,
    firstSeen: g.first_seen,
    lastSeen: g.last_seen,
    severity: g.severity,
    message: g.message,
    source: 'error_log',
    status: (g.issue_status as LogStatus) || 'new',
    environments: g.environments || [],
    latestLogId: g.latest_log_id,
    latestProblemId: g.latest_problem_id,
    jobType: g.job_type,
    courseId: g.latest_course_id,
    courseName: g.latest_course_id ? (courseNameMap.get(g.latest_course_id) ?? null) : null,
  };
}
