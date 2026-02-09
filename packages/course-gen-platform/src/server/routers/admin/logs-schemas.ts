/**
 * Admin Logs Schemas and Types
 * @module server/routers/admin/logs-schemas
 *
 * Contains all Zod validation schemas and TypeScript types for the admin logs router.
 * Extracted from logs.ts to keep file sizes manageable.
 */

import { z } from 'zod';

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
  courseId: string | null; // course_id from latest log
  courseName: string | null; // course name (fetched separately)
};

/**
 * List grouped response shape
 */
export type GroupedLogListResponse = {
  items: ErrorGroupItem[];
  total: number;
  page: number;
};
