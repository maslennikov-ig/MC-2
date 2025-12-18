/**
 * LMS Import Job Schemas
 * @module lms/import-job
 *
 * Zod schemas for LMS course import jobs.
 * Tracks course publishing operations to LMS platforms.
 */

import { z } from 'zod';

/**
 * LMS Import Status Enum
 *
 * State transitions:
 * pending → uploading → processing → succeeded
 *     │         │           │
 *     └─────────┴───────────┴──────→ failed
 *
 * Valid transitions:
 * - pending → uploading (upload started)
 * - uploading → processing (upload complete, LMS processing)
 * - processing → succeeded (import complete)
 * - pending → failed (pre-upload validation failed)
 * - uploading → failed (upload failed)
 * - processing → failed (LMS import failed)
 */
export const LmsImportStatusSchema = z.enum([
  'pending',      // Job created, not yet started
  'uploading',    // Uploading tar.gz to LMS
  'processing',   // LMS is processing the import
  'succeeded',    // Import completed successfully
  'failed',       // Import failed
]);

/** LMS Import Status type (inferred from schema) */
export type LmsImportStatus = z.infer<typeof LmsImportStatusSchema>;

/**
 * LMS Import Job Schema
 *
 * Tracks a single course publishing operation to LMS.
 * Stored in `lms_import_jobs` table.
 *
 * Constraints:
 * - Cannot create new job if active job exists for same course
 * - progress_percent must be 0-100
 * - edx_course_key format: "course-v1:Org+Course+Run"
 */
export const LmsImportJobSchema = z.object({
  /** Import job UUID */
  id: z.string().uuid(),

  // References
  /** Course UUID (foreign key to courses table) */
  course_id: z.string().uuid(),
  /** LMS configuration UUID (foreign key to lms_configurations table) */
  lms_configuration_id: z.string().uuid(),

  // Open edX Identifiers
  /** Open edX course key (e.g., "course-v1:MegaCampus+AI101+self_paced") */
  edx_course_key: z.string(),
  /** Open edX async task ID (for polling status) */
  edx_task_id: z.string().nullable(),

  // Status
  /** Current import status */
  status: LmsImportStatusSchema,
  /** Import progress percentage (0-100) */
  progress_percent: z.number().int().min(0).max(100),

  // Timing
  /** Import start timestamp */
  started_at: z.coerce.date().nullable(),
  /** Import completion timestamp */
  completed_at: z.coerce.date().nullable(),
  /** Import duration in milliseconds */
  duration_ms: z.number().int().nullable(),

  // Results
  /** Error code (from LMS_ERROR_CODES) */
  error_code: z.string().nullable(),
  /** Human-readable error message */
  error_message: z.string().nullable(),
  /** Structured error details (JSON) */
  error_details: z.record(z.unknown()).nullable(),

  // Links (populated on success)
  /** LMS student view URL */
  course_url: z.string().url().nullable(),
  /** Studio authoring URL */
  studio_url: z.string().url().nullable(),

  // Metadata
  /** Additional information (version, stats, etc.) */
  metadata: z.record(z.unknown()).default({}),

  // Audit
  /** Job creation timestamp */
  created_at: z.coerce.date(),
  /** User who created the job */
  created_by: z.string().uuid().nullable(),
});

/** LMS Import Job type (inferred from schema) */
export type LmsImportJob = z.infer<typeof LmsImportJobSchema>;
