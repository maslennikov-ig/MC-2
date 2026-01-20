/**
 * Admin Logs Router
 * @module server/routers/admin/logs
 *
 * Provides admin procedures for viewing and managing error logs and generation traces.
 * Supports unified log viewing, status management, and bulk operations.
 *
 * Tables used:
 * - error_logs: System and file processing errors
 * - generation_trace: LLM generation traces (when error_data is not null)
 * - log_issue_status: Admin review status for logs
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';

// ============================================================================
// Constants
// ============================================================================

/** MD5 fingerprint length (32 hex characters) */
const FINGERPRINT_LENGTH = 32;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Log type enum for polymorphic references
 */
export const logTypeSchema = z.enum(['error_log', 'generation_trace']);
export type LogType = z.infer<typeof logTypeSchema>;

/**
 * Log issue status enum
 */
export const logStatusSchema = z.enum([
  'new',
  'in_progress',
  'to_verify',
  'resolved',
  'ignored',
  'auto_muted',
]);
export type LogStatus = z.infer<typeof logStatusSchema>;

/**
 * Log severity/level filter
 */
export const logLevelSchema = z.enum(['WARNING', 'ERROR', 'CRITICAL']);

/**
 * Sort direction
 */
export const sortDirectionSchema = z.enum(['asc', 'desc']);

/**
 * Input schema for list procedure filters
 */
export const logFiltersSchema = z.object({
  level: logLevelSchema.optional(),
  source: logTypeSchema.optional(),
  status: logStatusSchema.optional(),
  search: z.string().min(2).max(200).trim().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  courseId: z.string().uuid().optional(),
  environment: z.enum(['dev', 'stage']).optional(),
});

/**
 * Input schema for list procedure
 */
export const listLogsInputSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  filters: logFiltersSchema.optional(),
  sort: z
    .object({
      field: z.enum(['created_at', 'severity']).default('created_at'),
      direction: sortDirectionSchema.default('desc'),
    })
    .optional(),
});

/**
 * Input schema for getById procedure
 */
export const getLogByIdInputSchema = z.object({
  logType: logTypeSchema,
  logId: z.string().uuid(),
});

/**
 * Input schema for updateStatus procedure
 */
export const updateStatusInputSchema = z.object({
  logType: logTypeSchema,
  logId: z.string().uuid(),
  status: logStatusSchema,
  notes: z.string().max(2000).optional(),
});

/**
 * Input schema for bulkUpdateStatus procedure
 */
export const bulkUpdateStatusInputSchema = z.object({
  items: z
    .array(
      z.object({
        logType: logTypeSchema,
        logId: z.string().uuid(),
      })
    )
    .min(1)
    .max(100),
  status: logStatusSchema,
});

/**
 * Input schema for listGrouped procedure - list errors grouped by fingerprint
 */
export const listGroupedInputSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  filters: logFiltersSchema.optional(),
});

/**
 * Input schema for getGroupLogs procedure - get individual logs within a fingerprint group
 */
export const getGroupLogsInputSchema = z.object({
  fingerprint: z.string().length(FINGERPRINT_LENGTH), // MD5 hash
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(10),
});

/**
 * Input schema for updateGroupStatus procedure - update status for all logs in a fingerprint group
 */
export const updateGroupStatusInputSchema = z.object({
  fingerprint: z.string().length(FINGERPRINT_LENGTH), // MD5 hash
  status: logStatusSchema,
  notes: z.string().max(2000).optional(),
});

// ============================================================================
// Response Types
// ============================================================================

/**
 * Unified log item shape for list response
 */
export type UnifiedLogItem = {
  id: string;
  logType: LogType;
  createdAt: string;
  severity: string;
  message: string;
  source: string | null;
  courseId: string | null;
  lessonId: string | null;
  stage: string | null;
  phase: string | null;
  status: LogStatus;
  metadata: Record<string, unknown> | null;
  problemId: string | null;
  environment: string | null;
  courseName: string | null;
};

/**
 * Full log details for getById response
 */
export type LogDetails = UnifiedLogItem & {
  stackTrace: string | null;
  errorData: Record<string, unknown> | null;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  costUsd: number | null;
  durationMs: number | null;
  statusNotes: string | null;
  statusUpdatedBy: string | null;
  statusUpdatedAt: string | null;
  // Enhanced context fields
  requestId: string | null;
  trpcPath: string | null;
  trpcInput: Record<string, unknown> | null;
  attemptedValue: string | null;
};

/**
 * List response shape
 */
export type LogListResponse = {
  items: UnifiedLogItem[];
  total: number;
  page: number;
};

/**
 * Grouped error item for listGrouped response
 * Represents a single fingerprint group with aggregated data
 */
export type ErrorGroupItem = {
  fingerprint: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  severity: string;
  message: string;
  source: string | null; // 'error_log' | 'generation_trace' - job_type for error_logs
  status: LogStatus; // from log_issue_status by fingerprint
  environments: string[]; // unique environments in group
  latestLogId: string;
  latestProblemId: string | null;
  jobType: string | null;
};

/**
 * List grouped response shape
 */
export type GroupedLogListResponse = {
  items: ErrorGroupItem[];
  total: number;
  page: number;
};

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
// Router Implementation
// ============================================================================

export const logsRouter = router({
  /**
   * List paginated logs with filters
   *
   * Queries both error_logs and generation_trace tables (where error_data is not null),
   * joining with log_issue_status for status information.
   *
   * Authorization: admin or superadmin only
   */
  list: adminProcedure
    .input(listLogsInputSchema)
    .query(async ({ input }): Promise<LogListResponse> => {
      try {
        const supabase = getSupabaseAdmin();
        const { page, limit, filters, sort } = input;
        const offset = (page - 1) * limit;

        // Build separate queries for each table and combine results
        const errorLogsPromise = buildErrorLogsQuery(supabase, filters, sort, limit, offset);
        const generationTracePromise = buildGenerationTraceQuery(
          supabase,
          filters,
          sort,
          limit,
          offset
        );

        // Execute both queries in parallel
        const [errorLogsResult, generationTraceResult] = await Promise.all([
          errorLogsPromise,
          generationTracePromise,
        ]);

        // Combine and deduplicate results
        let allItems: UnifiedLogItem[] = [];

        if (!filters?.source || filters.source === 'error_log') {
          allItems = allItems.concat(errorLogsResult.items);
        }

        if (!filters?.source || filters.source === 'generation_trace') {
          allItems = allItems.concat(generationTraceResult.items);
        }

        // Sort combined results
        const sortField = sort?.field || 'created_at';
        const sortDir = sort?.direction || 'desc';

        allItems.sort((a, b) => {
          if (sortField === 'created_at') {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return sortDir === 'desc' ? dateB - dateA : dateA - dateB;
          }
          // severity sort
          const severityOrder = { CRITICAL: 3, ERROR: 2, WARNING: 1 };
          const sevA = severityOrder[a.severity as keyof typeof severityOrder] || 0;
          const sevB = severityOrder[b.severity as keyof typeof severityOrder] || 0;
          return sortDir === 'desc' ? sevB - sevA : sevA - sevB;
        });

        // Apply pagination to combined results
        // Note: Since each table is already paginated, we take the combined items
        // and slice to limit. For proper cross-table pagination, consider using
        // a database view with UNION or fetching more data initially.
        const paginatedItems = allItems.slice(0, limit);

        // Calculate total count from both sources
        const totalCount =
          (filters?.source === 'generation_trace' ? 0 : errorLogsResult.total) +
          (filters?.source === 'error_log' ? 0 : generationTraceResult.total);

        return {
          items: paginatedItems,
          total: totalCount,
          page,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in admin logs list'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Log listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Get single log with full details
   *
   * Fetches complete log data from either error_logs or generation_trace,
   * including status information from log_issue_status.
   *
   * Authorization: admin or superadmin only
   */
  getById: adminProcedure
    .input(getLogByIdInputSchema)
    .query(async ({ input }): Promise<LogDetails> => {
      try {
        const supabase = getSupabaseAdmin();
        const { logType, logId } = input;

        // Fetch log based on type
        if (logType === 'error_log') {
          const { data: log, error } = await supabase
            .from('error_logs')
            .select('*')
            .eq('id', logId)
            .single();

          if (error || !log) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: ErrorMessages.notFound('Error log', logId),
            });
          }

          // Fetch status
          const status = await fetchLogStatus(supabase, logType, logId);

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
            status: status?.status || 'new',
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
            statusNotes: status?.notes || null,
            statusUpdatedBy: status?.updatedByEmail || null,
            statusUpdatedAt: status?.updated_at || null,
            // Enhanced context fields
            requestId: log.request_id || null,
            trpcPath: log.trpc_path || null,
            trpcInput: log.trpc_input as Record<string, unknown> | null,
            attemptedValue: log.attempted_value || null,
          };
        } else {
          // generation_trace
          const { data: log, error } = await supabase
            .from('generation_trace')
            .select('*, courses(title)')
            .eq('id', logId)
            .single();

          if (error || !log) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: ErrorMessages.notFound('Generation trace', logId),
            });
          }

          // Fetch status
          const status = await fetchLogStatus(supabase, logType, logId);

          // Determine severity from error_data
          const errorData = log.error_data as Record<string, unknown> | null;
          const severity = errorData ? 'ERROR' : 'WARNING';

          // Get course name from JOIN
          const courseData = log.courses as { title: string } | null;

          return {
            id: log.id,
            logType: 'generation_trace',
            createdAt: log.created_at,
            severity,
            message: (errorData?.message as string) || log.step_name || 'Unknown',
            source: `${log.stage}/${log.phase}`,
            courseId: log.course_id,
            lessonId: log.lesson_id || null,
            stage: log.stage,
            phase: log.phase,
            status: status?.status || 'new',
            metadata: null,
            problemId: null,
            environment: null,
            courseName: courseData?.title || null,
            stackTrace: (errorData?.stack as string) || null,
            errorData,
            inputData: log.input_data as Record<string, unknown> | null,
            outputData: log.output_data as Record<string, unknown> | null,
            modelUsed: log.model_used,
            tokensUsed: log.tokens_used,
            costUsd: log.cost_usd ? Number(log.cost_usd) : null,
            durationMs: log.duration_ms,
            statusNotes: status?.notes || null,
            statusUpdatedBy: status?.updatedByEmail || null,
            statusUpdatedAt: status?.updated_at || null,
            // Enhanced context fields (not applicable for generation_trace)
            requestId: null,
            trpcPath: null,
            trpcInput: null,
            attemptedValue: null,
          };
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in admin logs getById'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Log retrieval',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Update log status
   *
   * Upserts status into log_issue_status table.
   *
   * Authorization: admin or superadmin only
   */
  updateStatus: adminProcedure.input(updateStatusInputSchema).mutation(async ({ ctx, input }) => {
    try {
      const supabase = getSupabaseAdmin();
      const { logType, logId, status, notes } = input;

      // ctx.user is guaranteed non-null by adminProcedure
      const userId = ctx.user!.id;

      // Verify log exists
      const logExists = await verifyLogExists(supabase, logType, logId);
      if (!logExists) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: ErrorMessages.notFound(
            logType === 'error_log' ? 'Error log' : 'Generation trace',
            logId
          ),
        });
      }

      // Upsert status
      const { error } = await supabase.from('log_issue_status').upsert(
        {
          log_type: logType,
          log_id: logId,
          status,
          notes: notes || null,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'log_type,log_id',
        }
      );

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.databaseError('Status update', error.message),
        });
      }

      logger.info(
        {
          logType,
          logId,
          status,
          updatedBy: userId,
        },
        'Log status updated'
      );

      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;

      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          input,
        },
        'Unexpected error in admin logs updateStatus'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: ErrorMessages.internalError(
          'Status update',
          error instanceof Error ? error.message : undefined
        ),
      });
    }
  }),

  /**
   * Bulk update status
   *
   * Updates status for multiple logs in a single operation.
   *
   * Authorization: admin or superadmin only
   */
  bulkUpdateStatus: adminProcedure
    .input(bulkUpdateStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const supabase = getSupabaseAdmin();
        const { items, status } = input;

        // ctx.user is guaranteed non-null by adminProcedure
        const userId = ctx.user!.id;
        const now = new Date().toISOString();

        // Prepare upsert data
        const upsertData = items.map(item => ({
          log_type: item.logType,
          log_id: item.logId,
          status,
          updated_by: userId,
          updated_at: now,
        }));

        // Bulk upsert
        const { error } = await supabase.from('log_issue_status').upsert(upsertData, {
          onConflict: 'log_type,log_id',
        });

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Bulk status update', error.message),
          });
        }

        logger.info(
          {
            count: items.length,
            status,
            updatedBy: userId,
          },
          'Bulk log status updated'
        );

        return {
          success: true,
          updatedCount: items.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in admin logs bulkUpdateStatus'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Bulk status update',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * List grouped errors by fingerprint
   *
   * Aggregates error_logs by fingerprint, showing count, first/last seen,
   * and worst severity for each group. Only includes logs that have a fingerprint.
   *
   * Authorization: admin or superadmin only
   */
  listGrouped: adminProcedure
    .input(listGroupedInputSchema)
    .query(async ({ input }): Promise<GroupedLogListResponse> => {
      try {
        const supabase = getSupabaseAdmin();
        const { page, limit, filters } = input;
        const offset = (page - 1) * limit;

        // Build and execute the grouped query
        const result = await buildGroupedErrorLogsQuery(supabase, filters, limit, offset);

        return {
          items: result.items,
          total: result.total,
          page,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in admin logs listGrouped'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Grouped log listing',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Get individual logs within a fingerprint group
   *
   * Returns paginated list of error_logs that share the same fingerprint.
   *
   * Authorization: admin or superadmin only
   */
  getGroupLogs: adminProcedure
    .input(getGroupLogsInputSchema)
    .query(async ({ input }): Promise<LogListResponse> => {
      try {
        const supabase = getSupabaseAdmin();
        const { fingerprint, page, limit } = input;
        const offset = (page - 1) * limit;

        // Query error_logs with matching fingerprint
        const { data, count, error } = await supabase
          .from('error_logs')
          .select(
            'id, created_at, severity, error_message, job_type, metadata, problem_id, environment',
            { count: 'exact' }
          )
          .eq('fingerprint', fingerprint)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          logger.error({ error }, 'Error querying error_logs by fingerprint');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Group logs query', error.message),
          });
        }

        if (!data || data.length === 0) {
          return { items: [], total: 0, page };
        }

        // Fetch statuses for these logs
        const logIds = data.map(log => log.id);
        const statuses = await fetchLogStatuses(supabase, 'error_log', logIds);

        const items: UnifiedLogItem[] = data.map(log => ({
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
          status: statuses.get(log.id) || 'new',
          metadata: log.metadata as Record<string, unknown> | null,
          problemId: log.problem_id || null,
          environment: log.environment || null,
          courseName: null,
        }));

        return {
          items,
          total: count || 0,
          page,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in admin logs getGroupLogs'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Group logs retrieval',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),

  /**
   * Update status for all logs in a fingerprint group
   *
   * Upserts a status record keyed by fingerprint. This allows tracking
   * group-level status without updating each individual log.
   *
   * Authorization: admin or superadmin only
   */
  updateGroupStatus: adminProcedure
    .input(updateGroupStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const supabase = getSupabaseAdmin();
        const { fingerprint, status, notes } = input;

        // ctx.user is guaranteed non-null by adminProcedure
        const userId = ctx.user!.id;

        // Verify at least one log exists with this fingerprint
        const { count, error: countError } = await supabase
          .from('error_logs')
          .select('id', { count: 'exact', head: true })
          .eq('fingerprint', fingerprint);

        if (countError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Fingerprint verification', countError.message),
          });
        }

        if (!count || count === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `No error logs found with fingerprint: ${fingerprint}`,
          });
        }

        // Get the latest log ID for this fingerprint (for reference)
        const { data: latestLog } = await supabase
          .from('error_logs')
          .select('id')
          .eq('fingerprint', fingerprint)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Upsert status using fingerprint as the key
        // We use log_type='error_log' and set fingerprint for group-level status
        const { error } = await supabase.from('log_issue_status').upsert(
          {
            log_type: 'error_log',
            log_id: latestLog?.id || fingerprint, // Use latest log ID if available
            fingerprint,
            status,
            notes: notes || null,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'fingerprint',
          }
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Group status update', error.message),
          });
        }

        logger.info(
          {
            fingerprint,
            status,
            logsCount: count,
            updatedBy: userId,
          },
          'Group log status updated'
        );

        return {
          success: true,
          updatedCount: count,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            err: error instanceof Error ? error.message : String(error),
            input,
          },
          'Unexpected error in admin logs updateGroupStatus'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: ErrorMessages.internalError(
            'Group status update',
            error instanceof Error ? error.message : undefined
          ),
        });
      }
    }),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build and execute query for error_logs table
 */
async function buildErrorLogsQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: z.infer<typeof logFiltersSchema> | undefined,
  sort: { field: string; direction: string } | undefined,
  limit: number,
  offset: number
): Promise<{ items: UnifiedLogItem[]; total: number }> {
  // Status filter: pre-fetch log IDs with matching status
  // IMPORTANT: Filter BEFORE pagination for correct results
  let statusFilteredIds: string[] | null = null;

  if (filters?.status) {
    if (filters.status === 'new') {
      // "new" means logs WITHOUT any status record (individual OR fingerprint-based)
      // FIX: Use get_error_logs_without_status to get IDs BEFORE pagination
      const { data: newLogsData, error: newLogsError } = await supabase.rpc(
        'get_error_logs_without_status' as any
      );

      if (newLogsError) {
        // Fallback: query logs that don't have status via log_id AND don't have fingerprint-based status
        logger.warn(
          { error: newLogsError },
          'RPC get_error_logs_without_status not available, falling back to complex query'
        );

        // Get all fingerprints that have status
        const { data: fingerprintsWithStatus } = await supabase
          .from('log_issue_status')
          .select('fingerprint')
          .eq('log_type', 'error_log')
          .not('fingerprint', 'is', null);

        const fingerprintSet = new Set(
          (fingerprintsWithStatus || []).map(r => r.fingerprint).filter(Boolean)
        );

        // Get all log_ids that have individual status
        const { data: logIdsWithStatus } = await supabase
          .from('log_issue_status')
          .select('log_id')
          .eq('log_type', 'error_log');

        const logIdSet = new Set((logIdsWithStatus || []).map(r => r.log_id));

        // Get all error_logs and filter out those with status
        const { data: allLogs } = await supabase
          .from('error_logs')
          .select('id, fingerprint');

        statusFilteredIds = (allLogs || [])
          .filter(log => {
            // Exclude if log has individual status
            if (logIdSet.has(log.id)) return false;
            // Exclude if log's fingerprint has group status
            if (log.fingerprint && fingerprintSet.has(log.fingerprint)) return false;
            return true;
          })
          .map(log => log.id);
      } else {
        statusFilteredIds = (newLogsData || []).map((row: { id: string }) => row.id);
      }

      // If no logs without status, return empty
      if (!statusFilteredIds || statusFilteredIds.length === 0) {
        return { items: [], total: 0 };
      }
    } else {
      // Get IDs with specific status (via individual log_id OR fingerprint)
      const { data: statusData, error: statusError } = await supabase.rpc(
        'get_error_logs_by_status' as any,
        { p_status: filters.status }
      );

      if (statusError) {
        // Fallback: query with fingerprint support
        logger.warn(
          { error: statusError },
          'RPC get_error_logs_by_status not available, falling back to complex query'
        );

        // Get fingerprints with this status
        const { data: fingerprintsWithStatus } = await supabase
          .from('log_issue_status')
          .select('fingerprint')
          .eq('log_type', 'error_log')
          .eq('status', filters.status)
          .not('fingerprint', 'is', null);

        const fingerprints = (fingerprintsWithStatus || [])
          .map(r => r.fingerprint)
          .filter(Boolean) as string[];

        // Get log_ids with this status (individual)
        const { data: logIdsWithStatus } = await supabase
          .from('log_issue_status')
          .select('log_id')
          .eq('log_type', 'error_log')
          .eq('status', filters.status);

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
        statusFilteredIds = [...new Set([...logIds, ...fingerprintLogIds])];
      } else {
        statusFilteredIds = (statusData || []).map((row: { id: string }) => row.id);
      }

      if (!statusFilteredIds || statusFilteredIds.length === 0) {
        return { items: [], total: 0 };
      }
    }
  }

  let query = supabase
    .from('error_logs')
    .select(
      'id, created_at, severity, error_message, job_type, metadata, problem_id, environment, fingerprint',
      { count: 'exact' }
    );

  // Apply status filter if we have specific IDs (now includes 'new' status too)
  if (statusFilteredIds !== null) {
    query = query.in('id', statusFilteredIds);
  }

  // Apply filters
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

  // Note: error_logs doesn't have course_id, so skip that filter
  // Note: source filter is handled at combine level

  // Apply sorting
  const sortField = sort?.field === 'severity' ? 'severity' : 'created_at';
  const ascending = sort?.direction === 'asc';
  query = query.order(sortField, { ascending });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    // Extract all PostgrestError fields for better debugging
    const errorDetails = {
      message: error.message || 'Unknown error',
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      isTruncated: error.message?.startsWith('{') && !error.message?.endsWith('}'),
    };
    logger.error({ errorDetails, rawError: String(error) }, 'Error querying error_logs');
    return { items: [], total: 0 };
  }

  // All filtering now happens BEFORE pagination, so no post-filter needed
  const filteredData = data || [];

  // Fetch statuses for these logs (individual status by log_id)
  const logIds = filteredData.map(log => log.id);
  const statuses = await fetchLogStatuses(supabase, 'error_log', logIds);

  // Fetch fingerprint-based statuses as fallback
  const fingerprints = filteredData
    .map(log => (log as { fingerprint?: string }).fingerprint)
    .filter((fp): fp is string => !!fp);
  const fingerprintStatuses = await fetchGroupStatuses(supabase, fingerprints);

  const items: UnifiedLogItem[] = filteredData.map(log => {
    const fp = (log as { fingerprint?: string }).fingerprint;
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
  });

  return { items, total: count || 0 };
}

/**
 * Build and execute query for generation_trace table (with error_data)
 */
async function buildGenerationTraceQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: z.infer<typeof logFiltersSchema> | undefined,
  sort: { field: string; direction: string } | undefined,
  limit: number,
  offset: number
): Promise<{ items: UnifiedLogItem[]; total: number }> {
  // generation_trace with error_data are always ERROR severity
  // Skip query entirely if filtering for WARNING or CRITICAL
  if (filters?.level && filters.level !== 'ERROR') {
    return { items: [], total: 0 };
  }

  // Status filter: pre-fetch log IDs with matching status
  // IMPORTANT: Filter BEFORE pagination for correct results
  let statusFilteredIds: string[] | null = null;

  if (filters?.status) {
    if (filters.status === 'new') {
      // "new" means logs WITHOUT any status record
      // FIX: Get IDs of logs WITHOUT status to filter BEFORE pagination
      const allWithStatus = await supabase
        .from('log_issue_status')
        .select('log_id')
        .eq('log_type', 'generation_trace');

      const idsWithStatus = new Set((allWithStatus.data || []).map(row => row.log_id));

      // Get all generation_trace with error_data and filter out those with status
      const { data: allTraces } = await supabase
        .from('generation_trace')
        .select('id')
        .not('error_data', 'is', null);

      statusFilteredIds = (allTraces || [])
        .filter(trace => !idsWithStatus.has(trace.id))
        .map(trace => trace.id);

      if (statusFilteredIds.length === 0) {
        return { items: [], total: 0 };
      }
    } else {
      // Get IDs with specific status
      const statusQuery = await supabase
        .from('log_issue_status')
        .select('log_id')
        .eq('log_type', 'generation_trace')
        .eq('status', filters.status);

      if (statusQuery.error) {
        logger.error({ error: statusQuery.error }, 'Error fetching status-filtered IDs');
        return { items: [], total: 0 };
      }

      statusFilteredIds = (statusQuery.data || []).map(row => row.log_id);
      if (statusFilteredIds.length === 0) {
        return { items: [], total: 0 };
      }
    }
  }

  let query = supabase
    .from('generation_trace')
    .select(
      'id, created_at, stage, phase, step_name, course_id, lesson_id, error_data, courses(title)',
      {
        count: 'exact',
      }
    )
    .not('error_data', 'is', null); // Only traces with errors

  // Apply status filter (now includes 'new' status too - all filtering before pagination)
  if (statusFilteredIds !== null) {
    query = query.in('id', statusFilteredIds);
  }

  // Apply filters
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

  // Apply sorting
  const ascending = sort?.direction === 'asc';
  query = query.order('created_at', { ascending });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    // Extract all PostgrestError fields for better debugging
    const errorDetails = {
      message: error.message || 'Unknown error',
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      // Detect truncated/malformed error messages
      isTruncated: error.message?.startsWith('{') && !error.message?.endsWith('}'),
    };
    logger.error({ errorDetails, rawError: String(error) }, 'Error querying generation_trace');
    return { items: [], total: 0 };
  }

  // All filtering now happens BEFORE pagination, so no post-filter needed
  const filteredData = data || [];

  // Fetch statuses for these logs
  const logIds = filteredData.map(log => log.id);
  const statuses = await fetchLogStatuses(supabase, 'generation_trace', logIds);

  const items: UnifiedLogItem[] = filteredData.map(log => {
    const errorData = log.error_data as Record<string, unknown> | null;
    // Get course name from JOIN
    const courseData = log.courses as { title: string } | null;
    return {
      id: log.id,
      logType: 'generation_trace' as LogType,
      createdAt: log.created_at,
      severity: 'ERROR', // Traces with error_data are errors
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
  });

  return { items, total: count || 0 };
}

/**
 * Build and execute grouped query for error_logs by fingerprint
 *
 * Groups error_logs by fingerprint, returning aggregated data for each group.
 * Uses PostgreSQL RPC function for efficient server-side grouping.
 */
async function buildGroupedErrorLogsQuery(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: z.infer<typeof logFiltersSchema> | undefined,
  limit: number,
  offset: number
): Promise<{ items: ErrorGroupItem[]; total: number }> {
  // Type for RPC function result
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
    issue_status: string | null; // Status returned from RPC (matches filter)
  };

  // Prepare filter parameters (use undefined for omitted values, as Supabase types expect)
  const searchParam = filters?.search ? sanitizeSearchInput(filters.search) : undefined;

  // Call RPC function for grouped data
  const { data: groupedData, error } = (await supabase.rpc('get_grouped_error_logs', {
    p_limit: limit,
    p_offset: offset,
    p_severity: filters?.level ?? undefined,
    p_environment: filters?.environment ?? undefined,
    p_search: searchParam,
    p_date_from: filters?.dateFrom ?? undefined,
    p_date_to: filters?.dateTo ?? undefined,
    p_status: filters?.status ?? undefined,
  })) as { data: GroupedErrorLogRow[] | null; error: Error | null };

  if (error) {
    logger.error({ error }, 'Error calling get_grouped_error_logs RPC');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: ErrorMessages.databaseError('Grouped logs query', error.message),
    });
  }

  // Get total count for pagination
  const { data: countData, error: countError } = (await supabase.rpc(
    'get_grouped_error_logs_count',
    {
      p_severity: filters?.level ?? undefined,
      p_environment: filters?.environment ?? undefined,
      p_search: searchParam,
      p_date_from: filters?.dateFrom ?? undefined,
      p_date_to: filters?.dateTo ?? undefined,
      p_status: filters?.status ?? undefined,
    }
  )) as { data: number | null; error: Error | null };

  if (countError) {
    logger.error({ error: countError }, 'Error calling get_grouped_error_logs_count RPC');
  }

  const total = countData ?? 0;

  if (!groupedData || groupedData.length === 0) {
    return { items: [], total: 0 };
  }

  // Map RPC result to ErrorGroupItem
  // NOTE: Use issue_status from RPC directly to ensure consistency with filtering
  // Previously we fetched statuses separately which caused mismatch when status changed
  const items: ErrorGroupItem[] = groupedData.map(g => ({
    fingerprint: g.fingerprint,
    count: g.count,
    firstSeen: g.first_seen,
    lastSeen: g.last_seen,
    severity: g.severity,
    message: g.message,
    source: 'error_log',
    status: (g.issue_status as LogStatus) || 'new', // Use status from RPC
    environments: g.environments || [],
    latestLogId: g.latest_log_id,
    latestProblemId: g.latest_problem_id,
    jobType: g.job_type,
  }));

  return { items, total };
}

/**
 * Fetch statuses for fingerprint groups
 * Note: fingerprint column added by migration, using type assertion until types regenerated
 */
async function fetchGroupStatuses(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fingerprints: string[]
): Promise<Map<string, LogStatus>> {
  if (fingerprints.length === 0) return new Map();

  // Type for status with fingerprint column (added by migration)
  // TODO: Remove after regenerating database types
  type StatusWithFingerprint = {
    fingerprint: string | null;
    status: string;
  };

  const result = await supabase
    .from('log_issue_status')
    .select('fingerprint, status')
    .in('fingerprint', fingerprints);

  // Cast to expected type since fingerprint column exists but types not regenerated
  const { data } = result as unknown as { data: StatusWithFingerprint[] | null };

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
  supabase: ReturnType<typeof getSupabaseAdmin>,
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
async function fetchLogStatuses(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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
async function fetchLogStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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
async function verifyLogExists(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  logType: LogType,
  logId: string
): Promise<boolean> {
  const table = logType === 'error_log' ? 'error_logs' : 'generation_trace';

  const { data } = await supabase.from(table).select('id').eq('id', logId).single();

  return !!data;
}

export type LogsRouter = typeof logsRouter;
