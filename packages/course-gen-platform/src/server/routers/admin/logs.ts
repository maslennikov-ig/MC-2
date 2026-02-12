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

import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { ErrorMessages } from '../../utils/error-messages.js';

// Re-export schemas and types so external consumers don't break
export * from './logs-schemas';

import type { LogListResponse, LogDetails, GroupedLogListResponse } from './logs-schemas';
import {
  listLogsInputSchema,
  getLogByIdInputSchema,
  updateStatusInputSchema,
  bulkUpdateStatusInputSchema,
  listGroupedInputSchema,
  getGroupLogsInputSchema,
  updateGroupStatusInputSchema,
} from './logs-schemas';

// Re-export helpers that were previously exported from this file
export { fetchAllLogStatuses } from './logs-helpers';

import {
  buildErrorLogsQuery,
  buildGenerationTraceQuery,
  buildGroupedErrorLogsQuery,
} from './logs-query-builders';

import {
  fetchErrorLogById,
  fetchGenerationTraceById,
  fetchLogStatuses,
  verifyLogExists,
  validateStatusTransition,
  fetchCurrentLogStatus,
} from './logs-helpers';

import type { UnifiedLogItem, LogType } from './logs-schemas';

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
        const [errorLogsResult, generationTraceResult] = await Promise.all([
          buildErrorLogsQuery(supabase, filters, sort, limit, offset),
          buildGenerationTraceQuery(supabase, filters, sort, limit, offset),
        ]);

        // Combine results based on source filter
        const allItems = combineLogResults(
          errorLogsResult.items,
          generationTraceResult.items,
          filters?.source,
          sort
        );

        // Apply pagination to combined results
        const paginatedItems = allItems.slice(0, limit);

        // Calculate total count from both sources
        const totalCount =
          (filters?.source === 'generation_trace' ? 0 : errorLogsResult.total) +
          (filters?.source === 'error_log' ? 0 : generationTraceResult.total);

        return { items: paginatedItems, total: totalCount, page };
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
        if (input.logType === 'error_log') {
          return fetchErrorLogById(supabase, input.logId);
        }
        return fetchGenerationTraceById(supabase, input.logId);
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
   * Validates status transitions and warns on reopening without notes.
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

      // Fetch current status and validate transition
      const currentStatus = await fetchCurrentLogStatus(supabase, logType, logId);
      const validation = validateStatusTransition(currentStatus, status, !!notes);

      // Log warning for reopening transitions
      if (validation.warning) {
        logger.warn(
          {
            logType,
            logId,
            fromStatus: currentStatus,
            toStatus: status,
            hasNotes: !!notes,
            requiresNotes: validation.requiresNotes,
            updatedBy: userId,
          },
          validation.warning
        );
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
        { onConflict: 'log_type,log_id' }
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
          fromStatus: currentStatus,
          toStatus: status,
          updatedBy: userId,
          isReopening: validation.requiresNotes,
        },
        'Log status updated'
      );

      return {
        success: true,
        warning: validation.warning,
        requiresNotes: validation.requiresNotes,
      };
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

        logger.info({ count: items.length, status, updatedBy: userId }, 'Bulk log status updated');

        return { success: true, updatedCount: items.length };
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

        const result = await buildGroupedErrorLogsQuery(supabase, filters, limit, offset);

        return { items: result.items, total: result.total, page };
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

        return { items, total: count || 0, page };
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
        const { error } = await supabase.from('log_issue_status').upsert(
          {
            log_type: 'error_log',
            log_id: latestLog?.id || fingerprint,
            fingerprint,
            status,
            notes: notes || null,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'fingerprint' }
        );

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: ErrorMessages.databaseError('Group status update', error.message),
          });
        }

        logger.info(
          { fingerprint, status, logsCount: count, updatedBy: userId },
          'Group log status updated'
        );

        return { success: true, updatedCount: count };
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
 * Combine and sort log results from both tables.
 * Applies source filter and sorts by the specified field/direction.
 */
function combineLogResults(
  errorItems: UnifiedLogItem[],
  traceItems: UnifiedLogItem[],
  sourceFilter: string | undefined,
  sort: { field: string; direction: string } | undefined
): UnifiedLogItem[] {
  let allItems: UnifiedLogItem[] = [];

  if (!sourceFilter || sourceFilter === 'error_log') {
    allItems = allItems.concat(errorItems);
  }

  if (!sourceFilter || sourceFilter === 'generation_trace') {
    allItems = allItems.concat(traceItems);
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

  return allItems;
}

export type LogsRouter = typeof logsRouter;
