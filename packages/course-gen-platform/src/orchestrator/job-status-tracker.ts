/**
 * Job Status Tracker
 *
 * Persists BullMQ job status updates to Supabase database.
 * Provides centralized job status management for monitoring and debugging.
 *
 * @module orchestrator/job-status-tracker
 */

import { Job } from 'bullmq';
import { getSupabaseAdmin } from '../shared/supabase/admin';
import logger from '../shared/logger';
import { JobData, Database } from '@megacampus/shared-types';
import { getJobCourseId } from './job-data-fields';

// Re-export mutation functions from extracted module
export {
  markJobActive,
  markJobCompleted,
  markJobCancelled,
  markJobFailed,
} from './job-status-mutations';

/**
 * Legacy job data may contain snake_case keys from older job producers (e.g. Stage 3).
 * This type represents the possible snake_case variants that can appear at the boundary.
 */
interface LegacyJobDataFields {
  organization_id?: string;
  course_id?: string;
  user_id?: string;
}

/**
 * Extract organization_id from job data, handling both camelCase (current) and
 * snake_case (legacy Stage 3) property names at the boundary.
 */
function extractOrganizationId(data: JobData): string | undefined {
  return data.organizationId || (data as unknown as LegacyJobDataFields).organization_id;
}

/**
 * Extract user_id from job data, handling both camelCase and snake_case variants.
 */
function extractUserId(data: JobData): string | null {
  return data.userId || (data as unknown as LegacyJobDataFields).user_id || null;
}

/**
 * Job status enum matching database enum
 */
export enum JobStatus {
  PENDING = 'pending',
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
}

/**
 * Job status update interface for updateJobStatus function
 * Accepts Date objects which are converted to ISO strings before database write
 */
interface JobStatusUpdate {
  status?: JobStatus | 'failed'; // Allow both enum and literal for flexibility
  attempts?: number;
  started_at?: Date;
  completed_at?: Date;
  failed_at?: Date;
  cancelled?: boolean;
  cancelled_at?: string;
  cancelled_by?: string;
  error_message?: string | null;
  error_stack?: string | null;
  progress?: Record<string, unknown>;
  updated_at?: string;
}

/**
 * Create job status record in database
 *
 * @param {Job<JobData>} job - BullMQ job instance
 * @returns {Promise<void>}
 */
export async function createJobStatus(job: Job<JobData>): Promise<void> {
  try {
    // Validate job.name is defined to prevent NOT NULL constraint violation
    if (!job.name) {
      logger.debug(
        {
          jobId: job.id,
          jobData: job.data,
        },
        'Skipping job status creation: job.name is undefined (corrupted or test job)'
      );
      return;
    }

    const supabase = getSupabaseAdmin();

    // Handle both camelCase and snake_case field names at the boundary.
    // Stage 3 jobs use snake_case (organization_id) while other jobs use camelCase (organizationId).
    const organizationId = extractOrganizationId(job.data);

    if (!organizationId) {
      logger.debug(
        {
          jobId: job.id,
          jobData: job.data,
        },
        'Skipping job status creation: organizationId is missing from job data'
      );
      return;
    }

    // Use upsert to handle BullMQ job retries gracefully
    // When a job is retried, it keeps the same job_id, so we need to update existing record
    // instead of failing on duplicate key constraint
    const { data, error } = await supabase
      .from('job_status')
      .upsert(
        {
          job_id: job.id!,
          job_type: job.name,
          organization_id: organizationId,
          course_id: getJobCourseId(job.data) ?? null,
          user_id: extractUserId(job.data),
          status: JobStatus.PENDING,
          progress: {},
          attempts: 0,
          max_attempts: job.opts.attempts || 3,
        },
        {
          onConflict: 'job_id',
        }
      )
      .select()
      .single();

    if (error) {
      logger.error(
        {
          jobId: job.id,
          jobType: job.name,
          err: error.message,
        },
        'Failed to upsert job status'
      );
      return;
    }

    if (data) {
      logger.debug(
        {
          jobId: job.id,
          jobType: job.name,
          statusId: (data as Database['public']['Tables']['job_status']['Row']).id,
        },
        'Job status upserted'
      );
    }
  } catch (error) {
    logger.error(
      {
        jobId: job.id,
        jobType: job.name,
        err: error,
      },
      'Exception upserting job status'
    );
  }
}

/**
 * Update job status in database
 *
 * @param {string} jobId - Job ID
 * @param {Partial<JobStatusUpdate>} updates - Status updates
 * @param {object} options - Additional update options
 * @param {boolean} options.onlyIfNotCompleted - Only update if completed_at is NULL
 * @returns {Promise<void>}
 */
export async function updateJobStatus(
  jobId: string,
  updates: JobStatusUpdate,
  options?: {
    onlyIfNotCompleted?: boolean;
  }
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // Convert Date objects to ISO strings for Supabase
    const dbUpdates: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.started_at) {
      dbUpdates.started_at = updates.started_at.toISOString();
    }
    if (updates.completed_at) {
      dbUpdates.completed_at = updates.completed_at.toISOString();
    }
    if (updates.failed_at) {
      dbUpdates.failed_at = updates.failed_at.toISOString();
    }

    logger.debug(
      {
        jobId,
        dbUpdates,
        options,
      },
      'Updating job status in database'
    );

    // Build the update query with conditional where clauses
    let query = supabase.from('job_status').update(dbUpdates).eq('job_id', jobId);

    // Add condition to only update if not in terminal state
    // This prevents markJobActive from overwriting completed/failed/cancelled jobs
    if (options?.onlyIfNotCompleted) {
      query = query.is('completed_at', null).is('failed_at', null).eq('cancelled', false);
    }

    const { data, error } = await query.select();

    if (error) {
      logger.error(
        {
          jobId,
          err: error,
          errorDetails: error.message,
          updates,
          dbUpdates,
          options,
        },
        'Failed to update job status'
      );
      return;
    }

    if (!data || data.length === 0) {
      logger.debug(
        {
          jobId,
          updates,
          dbUpdates,
          options,
        },
        'Job status update returned no data - job may have already been completed'
      );
      return;
    }

    logger.debug(
      {
        jobId,
        updates,
        updatedRow: data[0],
      },
      'Job status updated successfully'
    );
  } catch (error) {
    logger.error(
      {
        jobId,
        err: error,
        updates,
      },
      'Exception updating job status'
    );
  }
}

/**
 * Update job progress
 *
 * @param {string} jobId - Job ID
 * @param {Record<string, unknown>} progress - Progress data
 * @returns {Promise<void>}
 */
export async function updateJobProgress(
  jobId: string,
  progress: Record<string, unknown>
): Promise<void> {
  await updateJobStatus(jobId, { progress });
}

/**
 * Get job status from database
 *
 * @param {string} jobId - Job ID
 * @returns {Promise<object | null>} Job status record or null if not found
 */
export async function getJobStatus(jobId: string): Promise<object | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('job_status')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (error) {
      logger.error(
        {
          jobId,
          err: error.message,
        },
        'Failed to get job status'
      );
      return null;
    }

    return data;
  } catch (error) {
    logger.error(
      { jobId, err: error instanceof Error ? error.message : String(error) },
      'Exception getting job status'
    );
    return null;
  }
}
