/**
 * Error logging types for permanent failure tracking
 * @module shared/logger/types
 *
 * This module provides TypeScript types for the error_logs table.
 * Schema matches: specs/003-stage-2-implementation/data-model.md lines 32-105
 */

/**
 * Error severity levels
 */
export type ErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * Complete error_logs table record
 */
export interface ErrorLog {
  /** UUID primary key */
  id: string;
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
  metadata: Record<string, unknown> | null;
}

/**
 * Parameters for creating a new error_logs entry
 */
export interface CreateErrorLogParams {
  /** User ID (optional) */
  user_id?: string;
  /** Organization ID (required for multi-tenancy) */
  organization_id: string;
  /** Human-readable error message (required) */
  error_message: string;
  /** Stack trace for debugging (optional) */
  stack_trace?: string;
  /** Error severity level (required) */
  severity: ErrorSeverity;
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
  metadata?: Record<string, unknown>;
}
