/**
 * LMS Publish Router Helpers
 * @module server/routers/lms/publish-helpers
 *
 * Helper functions extracted from publish.router.ts to reduce file size
 * and function complexity. Contains business logic for:
 * - Publishing course to LMS
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import {
  type OpenEdXConfig,
  LMSTimeoutError,
  isLMSError,
  LMS_ERROR_CODES,
} from '@megacampus/shared-types/lms';
import { lmsLogger } from '../../../integrations/lms/logger';
import { createLMSAdapter } from '../../../integrations/lms';
import { mapCourseToInput } from '../../../integrations/lms/course-mapper';
import { nanoid } from 'nanoid';
import { throwOnSupabaseError } from '../../utils/supabase-query-guard';

/**
 * Publish course input type
 */
export interface PublishCourseInput {
  courseId: string;
  lmsConfigId: string;
}

/**
 * Publish course result type
 */
export interface PublishCourseResult {
  jobId: string;
  lmsCourseId: string;
  lmsUrl: string;
  studioUrl?: string;
  message: string;
}

/**
 * Get user-friendly error message based on LMS error type
 */
function getUserFriendlyErrorMessage(error: unknown): string {
  if (!isLMSError(error)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred';
  }

  switch (error.code) {
    case LMS_ERROR_CODES.NETWORK_CONNECTION_LOST:
      return 'Upload failed due to network connection loss. Please check your internet connection and try again.';
    case LMS_ERROR_CODES.LMS_UNREACHABLE:
      return 'Cannot connect to the LMS. Please verify the LMS configuration and network connectivity.';
    case LMS_ERROR_CODES.TIMEOUT_ERROR:
    case LMS_ERROR_CODES.UPLOAD_TIMEOUT:
    case LMS_ERROR_CODES.LMS_TIMEOUT:
      if (error instanceof LMSTimeoutError) {
        return `Operation timed out after ${Math.round(error.duration / 1000)}s. The course may be too large or the LMS may be slow to respond. Try again later.`;
      }
      return 'Operation timed out. The course may be too large or the LMS may be slow to respond. Try again later.';
    case LMS_ERROR_CODES.NETWORK_ERROR:
    case LMS_ERROR_CODES.CONNECTION_REFUSED:
    case LMS_ERROR_CODES.DNS_ERROR:
      return 'Network error occurred. Please check your connection and LMS configuration.';
    case LMS_ERROR_CODES.AUTH_ERROR:
    case LMS_ERROR_CODES.TOKEN_EXPIRED:
    case LMS_ERROR_CODES.INVALID_CREDENTIALS:
      return 'Authentication failed. Please verify LMS credentials in configuration settings.';
    case LMS_ERROR_CODES.PERMISSION_ERROR:
    case LMS_ERROR_CODES.INSUFFICIENT_ROLE:
      return 'Insufficient permissions. Please verify your LMS account has course creation privileges.';
    default:
      return error.message;
  }
}

/**
 * Handle publish course operation
 *
 * This function:
 * 1. Verifies course ownership
 * 2. Validates LMS configuration access
 * 3. Maps course to LMS-agnostic CourseInput
 * 4. Publishes to LMS via adapter
 * 5. Creates import job record for tracking
 *
 * @param supabase - Supabase admin client
 * @param input - Publish course input
 * @param userId - Current user ID
 * @param organizationId - Current user's organization ID
 * @param requestId - Request ID for logging
 * @returns Publish course result
 */
export async function handlePublishCourse(
  supabase: SupabaseClient<Database>,
  input: PublishCourseInput,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<PublishCourseResult> {
  const { courseId, lmsConfigId } = input;

  lmsLogger.info({ requestId, userId, courseId, lmsConfigId }, 'Starting course publish operation');

  // Step 1: Verify course ownership
  await verifyCourseOwnership(supabase, courseId, userId, requestId);

  // Step 2: Fetch and validate LMS configuration
  const config = await fetchAndValidateLMSConfig(supabase, lmsConfigId, organizationId, requestId);

  // Step 3: Check for active import job
  await checkActiveJobs(supabase, courseId, requestId);

  // Step 4: Map course to CourseInput
  const courseInput = await mapCourse(supabase, courseId, requestId);

  // Step 5: Validate Studio URL
  validateStudioUrl(config, lmsConfigId, requestId);

  // Step 6: Create adapter
  const adapter = createAdapter(config);

  // Step 7: Create import job record
  const jobId = await createJobRecord(
    supabase,
    courseId,
    lmsConfigId,
    userId,
    config,
    courseInput,
    requestId
  );

  // Step 8: Publish course to LMS
  const publishResult = await publishToLMS(
    supabase,
    adapter,
    courseInput,
    courseId,
    lmsConfigId,
    jobId,
    requestId
  );

  // Step 9: Return success response
  return {
    jobId,
    lmsCourseId: publishResult.lmsCourseId,
    lmsUrl: publishResult.lmsUrl,
    studioUrl: publishResult.studioUrl,
    message: 'Course published successfully to LMS',
  };
}

/**
 * Verify course ownership
 */
async function verifyCourseOwnership(
  supabase: SupabaseClient<Database>,
  courseId: string,
  userId: string,
  requestId: string
): Promise<void> {
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, user_id, organization_id')
    .eq('id', courseId)
    .single();

  throwOnSupabaseError(courseError, 'Course', { requestId, courseId });
  if (!course) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  if (course.user_id !== userId) {
    lmsLogger.warn(
      { requestId, userId, courseId, courseOwnerId: course.user_id },
      'Course ownership violation'
    );
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this course',
    });
  }
}

/**
 * Fetch and validate LMS configuration
 */
async function fetchAndValidateLMSConfig(
  supabase: SupabaseClient<Database>,
  lmsConfigId: string,
  organizationId: string,
  requestId: string
): Promise<Database['public']['Tables']['lms_configurations']['Row']> {
  const { data: config, error: configError } = await supabase
    .from('lms_configurations')
    .select('*')
    .eq('id', lmsConfigId)
    .eq('organization_id', organizationId)
    .single();

  throwOnSupabaseError(configError, 'LMS configuration', {
    requestId,
    lmsConfigId,
    organizationId,
  });
  if (!config) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'LMS configuration not found or access denied',
    });
  }

  if (!config.is_active) {
    lmsLogger.warn({ requestId, lmsConfigId }, 'LMS configuration is inactive');
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'LMS configuration is inactive. Please activate it before publishing.',
    });
  }

  lmsLogger.debug(
    { requestId, courseId: '', lmsConfigId, lmsName: config.name },
    'Course and config validated'
  );

  return config;
}

/**
 * Check for active import jobs
 */
async function checkActiveJobs(
  supabase: SupabaseClient<Database>,
  courseId: string,
  requestId: string
): Promise<void> {
  const { data: activeJob, error: activeJobError } = await supabase
    .from('lms_import_jobs')
    .select('id, status, created_at')
    .eq('course_id', courseId)
    .in('status', ['pending', 'uploading', 'processing'])
    .maybeSingle();

  if (activeJobError) {
    lmsLogger.error(
      { requestId, courseId, error: activeJobError },
      'Failed to check for active jobs'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to check for existing import jobs',
    });
  }

  if (activeJob) {
    lmsLogger.warn(
      { requestId, courseId, activeJobId: activeJob.id, activeJobStatus: activeJob.status },
      'Course already has an active import job'
    );
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Course already has an active import job (status: ${activeJob.status}, job ID: ${activeJob.id}). Please wait for it to complete or cancel it first.`,
    });
  }

  lmsLogger.debug({ requestId, courseId }, 'No active import jobs found, proceeding');
}

/**
 * Map course to CourseInput
 */
async function mapCourse(
  supabase: SupabaseClient<Database>,
  courseId: string,
  requestId: string
): Promise<Awaited<ReturnType<typeof mapCourseToInput>>> {
  try {
    return await mapCourseToInput(courseId, supabase);
  } catch (mapError) {
    lmsLogger.error({ requestId, courseId, error: mapError }, 'Failed to map course');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        mapError instanceof Error ? mapError.message : 'Failed to prepare course for publishing',
    });
  }
}

/**
 * Validate Studio URL
 */
function validateStudioUrl(
  config: Database['public']['Tables']['lms_configurations']['Row'],
  lmsConfigId: string,
  requestId: string
): void {
  if (!config.studio_url || config.studio_url.trim().length === 0) {
    lmsLogger.error({ requestId, lmsConfigId }, 'LMS configuration missing Studio URL');
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'LMS configuration is missing Studio URL. Please update the configuration.',
    });
  }

  try {
    new URL(config.studio_url);
  } catch {
    lmsLogger.warn(
      { requestId, lmsConfigId, studioUrl: config.studio_url },
      'Invalid Studio URL format'
    );
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'LMS configuration has invalid Studio URL format. Please enter a valid URL starting with https://',
    });
  }
}

/**
 * Create LMS adapter
 */
function createAdapter(
  config: Database['public']['Tables']['lms_configurations']['Row']
): ReturnType<typeof createLMSAdapter> {
  const adapterConfig: OpenEdXConfig = {
    instanceId: config.id,
    name: config.name,
    type: 'openedx' as const,
    organization: config.default_org,
    lmsUrl: config.lms_url,
    cmsUrl: config.studio_url!,
    clientId: config.client_id,
    clientSecret: config.client_secret,
    timeout: config.import_timeout_seconds * 1000,
    maxRetries: config.max_retries,
    pollInterval: config.poll_interval_seconds * 1000,
    enabled: config.is_active,
    autoCreateCourse: true,
  };

  return createLMSAdapter('openedx', adapterConfig);
}

/**
 * Create import job record
 */
async function createJobRecord(
  supabase: SupabaseClient<Database>,
  courseId: string,
  lmsConfigId: string,
  userId: string,
  config: Database['public']['Tables']['lms_configurations']['Row'],
  courseInput: Awaited<ReturnType<typeof mapCourseToInput>>,
  requestId: string
): Promise<string> {
  const jobId = nanoid();
  const startedAt = new Date().toISOString();

  lmsLogger.info(
    { requestId, courseId, jobId, status: 'pending', progress: 0 },
    'Status transition: Creating job record with pending status'
  );

  const configWithRun = config as typeof config & { default_run?: string };

  const { error: createJobError } = await supabase.from('lms_import_jobs').insert({
    id: jobId,
    course_id: courseId,
    lms_config_id: lmsConfigId,
    user_id: userId,
    edx_course_key: `course-v1:${config.default_org}+${courseInput.courseId}+${courseInput.run || configWithRun.default_run || 'self_paced'}`,
    edx_task_id: null,
    status: 'pending',
    progress_percent: 0,
    started_at: startedAt,
    completed_at: null,
    course_url: null,
    studio_url: null,
    error_code: null,
    error_message: null,
  });

  if (createJobError) {
    lmsLogger.error({ requestId, jobId, error: createJobError }, 'Failed to create job record');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create import job record',
    });
  }

  lmsLogger.info(
    { requestId, courseId, jobId, status: 'pending' },
    'Job record created with pending status'
  );

  return jobId;
}

/**
 * Publish course to LMS
 */
async function publishToLMS(
  supabase: SupabaseClient<Database>,
  adapter: ReturnType<typeof createLMSAdapter>,
  courseInput: Awaited<ReturnType<typeof mapCourseToInput>>,
  courseId: string,
  lmsConfigId: string,
  jobId: string,
  requestId: string
): Promise<{ lmsCourseId: string; lmsUrl: string; studioUrl?: string; taskId?: string }> {
  try {
    lmsLogger.info(
      { requestId, courseId, lmsConfigId, courseTitle: courseInput.title },
      'Publishing course to LMS'
    );

    lmsLogger.info(
      { requestId, jobId, previousStatus: 'pending', newStatus: 'uploading' },
      'Status transition: pending -> uploading'
    );

    await supabase
      .from('lms_import_jobs')
      .update({ status: 'uploading', progress_percent: 25 })
      .eq('id', jobId);

    const publishResult = await adapter.publishCourse(courseInput);

    if (!publishResult.success) {
      await handlePublishFailure(supabase, jobId, publishResult.error, requestId);
    }

    lmsLogger.info(
      {
        requestId,
        courseId,
        lmsCourseId: publishResult.lmsCourseId,
        duration: publishResult.duration,
      },
      'Course published successfully'
    );

    await updateJobSuccess(supabase, jobId, publishResult, requestId, courseId);

    return publishResult;
  } catch (error) {
    await handlePublishError(supabase, jobId, error, requestId);
    throw error;
  }
}

/**
 * Handle publish failure
 */
async function handlePublishFailure(
  supabase: SupabaseClient<Database>,
  jobId: string,
  error: string | undefined,
  requestId: string
): Promise<void> {
  lmsLogger.error({ requestId, courseId: '', error }, 'LMS publish failed');

  lmsLogger.info(
    { requestId, jobId, previousStatus: 'uploading', newStatus: 'failed' },
    'Status transition: uploading -> failed'
  );

  await supabase
    .from('lms_import_jobs')
    .update({
      status: 'failed',
      error_code: 'LMS_IMPORT_FAILED',
      error_message: error || 'Failed to publish course to LMS',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error || 'Failed to publish course to LMS',
  });
}

/**
 * Update job success
 */
async function updateJobSuccess(
  supabase: SupabaseClient<Database>,
  jobId: string,
  publishResult: { taskId?: string; lmsUrl: string; studioUrl?: string },
  requestId: string,
  courseId: string
): Promise<void> {
  const completedAt = new Date().toISOString();

  lmsLogger.info(
    { requestId, jobId, previousStatus: 'uploading', newStatus: 'succeeded' },
    'Status transition: uploading -> succeeded'
  );

  const { error: updateJobError } = await supabase
    .from('lms_import_jobs')
    .update({
      edx_task_id: publishResult.taskId || null,
      status: 'succeeded',
      progress_percent: 100,
      completed_at: completedAt,
      course_url: publishResult.lmsUrl,
      studio_url: publishResult.studioUrl || null,
    })
    .eq('id', jobId);

  if (updateJobError) {
    lmsLogger.error({ requestId, jobId, error: updateJobError }, 'Failed to update job record');
  } else {
    lmsLogger.info(
      { requestId, courseId, jobId, status: 'succeeded', lmsUrl: publishResult.lmsUrl },
      'Job record updated with succeeded status'
    );
  }
}

/**
 * Handle publish error
 */
async function handlePublishError(
  supabase: SupabaseClient<Database>,
  jobId: string,
  error: unknown,
  requestId: string
): Promise<void> {
  let errorCode: string;
  let errorMessage: string;
  let userMessage: string;

  if (isLMSError(error)) {
    errorCode = error.code;
    errorMessage = error.message;
    userMessage = getUserFriendlyErrorMessage(error);

    lmsLogger.error(
      {
        requestId,
        jobId,
        errorCode,
        errorMessage,
        lmsType: error.lmsType,
        metadata: error.metadata,
        cause: error.cause?.message,
      },
      'LMS error during publish operation'
    );
  } else if (error instanceof TRPCError) {
    errorCode = error.code;
    errorMessage = error.message;
    userMessage = error.message;

    lmsLogger.error(
      { requestId, jobId, errorCode, errorMessage, trpcCode: error.code },
      'tRPC error during publish operation'
    );
  } else {
    errorCode = 'INTERNAL_SERVER_ERROR';
    errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during publish';
    userMessage = 'An unexpected error occurred while publishing course. Please try again later.';

    lmsLogger.error(
      { requestId, jobId, error, errorMessage },
      'Unknown error during publish operation'
    );
  }

  lmsLogger.info(
    { requestId, jobId, errorCode, newStatus: 'failed' },
    'Status transition: Updating job to failed due to error'
  );

  await supabase
    .from('lms_import_jobs')
    .update({
      status: 'failed',
      error_code: errorCode,
      error_message: userMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}
