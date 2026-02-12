/**
 * Error logging types for permanent failure tracking
 * @module shared/logger/types
 *
 * This module provides TypeScript types for the error_logs table.
 * Schema matches: specs/003-stage-2-implementation/data-model.md lines 32-105
 */

import type { Json } from '@megacampus/shared-types';

/**
 * Error severity levels
 */
export type ErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * Environment type for tracking where the error occurred
 */
export type LogEnvironment = 'dev' | 'stage' | 'test';

/**
 * Complete error_logs table record
 */
export interface ErrorLog {
  /** UUID primary key */
  id: string;
  /** Human-readable problem ID (e.g., 2025-01-13#42) */
  problem_id: string | null;
  /** Timestamp when error was logged */
  created_at: string;
  /** User ID (nullable, references auth.users) */
  user_id: string | null;
  /** Organization ID (nullable, references organizations) */
  organization_id: string | null;
  /** Human-readable error message */
  error_message: string;
  /** Stack trace for debugging (nullable) */
  stack_trace: string | null;
  /** Error severity level */
  severity: ErrorSeverity;
  /** Environment where error occurred (dev/stage) */
  environment: LogEnvironment | null;
  /** File name that caused the error (nullable) */
  file_name: string | null;
  /** File size in bytes (nullable) */
  file_size: number | null;
  /** File MIME type (nullable) */
  file_format: string | null;
  /** BullMQ job ID for tracing (nullable) */
  job_id: string | null;
  /** Job type (e.g., DOCUMENT_PROCESSING) (nullable) */
  job_type: string | null;
  /** Additional metadata as JSONB (nullable) */
  metadata: Json | null;
  /** Course ID for course-related errors */
  course_id: string | null;
  /** Lesson ID for lesson-related errors */
  lesson_id: string | null;
  /** Request ID for tracing (nanoid) */
  request_id: string | null;
  /** tRPC procedure path */
  trpc_path: string | null;
  /** Sanitized tRPC input */
  trpc_input: Json | null;
  /** Value that caused error (e.g. invalid status) */
  attempted_value: string | null;
}

/**
 * Standardized error context for logging
 * Use this interface when calling logger.error() or logger.warn()
 *
 * @example
 * ```typescript
 * logger.error({
 *   ...createErrorContext({
 *     requestId: 'abc123',
 *     courseId: course.id,
 *     lessonId: lesson.id,
 *     userId: ctx.user.id,
 *     trpcPath: 'lessonContent.approveLesson',
 *     trpcInput: { courseId, lessonId },
 *     attemptedValue: 'approved',
 *   }),
 *   err: error.message,
 * }, 'Failed to approve lesson');
 * ```
 */
export interface ErrorContext {
  /** Unique request ID for tracing */
  requestId?: string;
  /** Course ID if error is course-related */
  courseId?: string;
  /** Lesson ID if error is lesson-related */
  lessonId?: string;
  /** User ID who triggered the action */
  userId?: string;
  /** Organization ID */
  organizationId?: string;
  /** tRPC procedure path */
  trpcPath?: string;
  /** Sanitized tRPC input (remove sensitive fields) */
  trpcInput?: Record<string, unknown>;
  /** Value that was attempted (for constraint violations) */
  attemptedValue?: string;
  /** Current value before change attempt */
  currentValue?: string;
  /** BullMQ job ID */
  jobId?: string;
  /** Job type */
  jobType?: string;
  /** Error object or message */
  err?: unknown;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Helper to create standardized error context
 * Ensures consistent field names across the codebase
 */
export function createErrorContext(ctx: ErrorContext): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (ctx.requestId) result.requestId = ctx.requestId;
  if (ctx.courseId) result.courseId = ctx.courseId;
  if (ctx.lessonId) result.lessonId = ctx.lessonId;
  if (ctx.userId) result.userId = ctx.userId;
  if (ctx.organizationId) result.organizationId = ctx.organizationId;
  if (ctx.trpcPath) result.trpcPath = ctx.trpcPath;
  if (ctx.trpcInput) result.trpcInput = sanitizeTrpcInput(ctx.trpcInput);
  if (ctx.attemptedValue) result.attemptedValue = ctx.attemptedValue;
  if (ctx.currentValue) result.currentValue = ctx.currentValue;
  if (ctx.jobId) result.jobId = ctx.jobId;
  if (ctx.jobType) result.jobType = ctx.jobType;
  if (ctx.err) result.err = ctx.err;

  // Copy any additional fields
  for (const [key, value] of Object.entries(ctx)) {
    if (!(key in result) && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize tRPC input by removing sensitive fields
 */
function sanitizeTrpcInput(input: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'];
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeTrpcInput(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Parameters for creating a new error_logs entry
 */
export interface CreateErrorLogParams {
  /** User ID (optional) */
  user_id?: string;
  /** Organization ID (required for multi-tenancy) */
  organization_id: string;
  /** Human-readable problem ID for grouping related errors (optional) */
  problem_id?: string;
  /** Human-readable error message (required) */
  error_message: string;
  /** Stack trace for debugging (optional) */
  stack_trace?: string;
  /** Error severity level (required) */
  severity: ErrorSeverity;
  /** Environment (auto-detected if not provided) */
  environment?: LogEnvironment;
  /** File name that caused the error (optional) */
  file_name?: string;
  /** File size in bytes (optional) */
  file_size?: number;
  /** File MIME type (optional) */
  file_format?: string;
  /** BullMQ job ID for tracing (optional) */
  job_id?: string;
  /** Job type (e.g., DOCUMENT_PROCESSING) (optional) */
  job_type?: string;
  /** Additional metadata (optional) */
  metadata?: Json;
  /** Course ID for course-related errors */
  course_id?: string;
  /** Lesson ID for lesson-related errors */
  lesson_id?: string;
  /** Request ID for tracing */
  request_id?: string;
  /** tRPC procedure path */
  trpc_path?: string;
  /** Sanitized tRPC input */
  trpc_input?: Json;
  /** Value that caused the error */
  attempted_value?: string;
}
