/**
 * QueueEvents Backup Layer - Layer 2 Defense-in-Depth
 *
 * @module orchestrator/queue-events-backup
 *
 * This module implements the second layer of defense for FSM initialization:
 * Layer 1: API endpoint uses Transactional Outbox (primary path)
 * Layer 2: QueueEvents listener (this file) catches edge cases
 * Layer 3: Worker validation (last resort)
 *
 * Purpose:
 * - Catch jobs created outside normal API flow (admin tools, retries, tests)
 * - Initialize FSM state before workers process the job
 * - Prevent "FSM not found" errors in production
 *
 * Design:
 * - Listen to 'added' events on course-generation queue
 * - Filter by job type (DOCUMENT_PROCESSING, STRUCTURE_ANALYSIS, STRUCTURE_GENERATION)
 * - Check if FSM exists and is initialized
 * - If missing or pending → initialize via InitializeFSMCommandHandler
 * - Map job type to correct initial state
 * - Non-fatal errors (log only, don't crash)
 *
 * Reference: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md (Task 6)
 *
 * @see packages/course-gen-platform/src/shared/fsm/fsm-initialization-command-handler.ts
 * @see packages/course-gen-platform/src/orchestrator/queue.ts
 */

import { QueueEvents } from 'bullmq';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { InitializeFSMCommandHandler } from '@/shared/fsm/fsm-initialization-command-handler';
import logger from '@/shared/logger';
import { getQueue, QUEUE_NAME } from './queue';
import { JobType } from '@megacampus/shared-types';
import { getRedisClient } from '@/shared/cache/redis';
import { metricsStore } from './metrics';

const commandHandler = new InitializeFSMCommandHandler();
const supabase = getSupabaseAdmin();

/**
 * Job types that require FSM initialization
 * These are the entry points for course generation workflows
 */
const FSM_REQUIRED_JOB_TYPES = [
  JobType.DOCUMENT_PROCESSING,
  JobType.STRUCTURE_ANALYSIS,
  JobType.STRUCTURE_GENERATION,
];

/**
 * Map job type to FSM initial state
 *
 * Based on course generation workflow:
 * - DOCUMENT_PROCESSING: Stage 2 (document processing → embeddings)
 * - STRUCTURE_ANALYSIS: Stage 4 (analysis-only, no documents)
 * - STRUCTURE_GENERATION: Stage 5 (structure generation from analysis)
 *
 * @param jobType - The BullMQ job type
 * @returns Initial FSM state for the job type
 */
function getInitialStateForJobType(jobType: JobType): string {
  switch (jobType) {
    case JobType.DOCUMENT_PROCESSING:
      return 'stage_2_init';
    case JobType.STRUCTURE_ANALYSIS:
      return 'stage_4_init';
    case JobType.STRUCTURE_GENERATION:
      return 'stage_5_init';
    default:
      // Fallback - should never happen due to FSM_REQUIRED_JOB_TYPES filter
      logger.warn({ jobType }, 'Unknown job type for FSM initialization, defaulting to stage_2_init');
      return 'stage_2_init';
  }
}

/**
 * Initialize QueueEvents listener for backup FSM initialization
 *
 * This listener monitors the course-generation queue and ensures FSM state
 * exists before workers process jobs. It catches edge cases where jobs are
 * created outside the normal API flow (admin tools, retries, tests).
 *
 * Non-fatal design: All errors are logged but don't crash the application.
 * If this layer fails, Layer 3 (worker validation) will catch it.
 */
export function initializeQueueEventsBackup(): void {
  try {
    const redisClient = getRedisClient();
    const queueEvents = new QueueEvents(QUEUE_NAME, {
      connection: redisClient,
    });

    queueEvents.on('added', ({ jobId, name }) => {
      void (async () => {
      // Filter: Only process job types that require FSM initialization
      const jobType = name as JobType;
      if (!FSM_REQUIRED_JOB_TYPES.includes(jobType)) {
        logger.debug({
          jobId,
          jobType,
        }, 'QueueEvents backup: skipping job type (no FSM required)');
        return;
      }

      // Get job data to extract courseId
      const queue = getQueue();
      const job = await queue.getJob(jobId);

      if (!job) {
        logger.warn({
          jobId,
          jobType,
        }, 'QueueEvents backup: job not found in queue (race condition?)');
        return;
      }

      const { courseId, userId, organizationId } = job.data;

      if (!courseId) {
        logger.warn({
          jobId,
          jobType,
          jobData: job.data,
        }, 'QueueEvents backup: courseId missing in job data');
        return;
      }

      // Check if FSM state exists and is initialized
      const { data: course, error: queryError } = await supabase
        .from('courses')
        .select('generation_status')
        .eq('id', courseId)
        .single();

      if (queryError && queryError.code !== 'PGRST116') {
        // PGRST116 = not found (expected for new courses)
        // Any other error is unexpected
        logger.warn({
          error: queryError.message,
          code: queryError.code,
          courseId,
          jobId,
        }, 'QueueEvents backup: failed to query FSM state (non-fatal)');
        return;
      }

      // FSM already initialized with non-pending state? Skip backup initialization
      if (course && course.generation_status !== 'pending') {
        logger.debug({
          courseId,
          jobId,
          jobType,
          currentState: course.generation_status,
        }, 'QueueEvents backup: FSM already initialized, skipping');
        return;
      }

      // FSM missing or still pending → initialize as backup
      const initialState = getInitialStateForJobType(jobType);

      logger.warn({
        courseId,
        jobId,
        jobType,
        initialState,
      }, 'QueueEvents backup: initializing FSM (job created outside normal flow)');

      try {
        await commandHandler.handle({
          entityId: courseId,
          userId: userId || 'system',
          organizationId: organizationId || 'unknown',
          idempotencyKey: `queue-backup-${jobType}-${jobId}`,
          initiatedBy: 'QUEUE',
          initialState,
          data: {
            trigger: 'queue_events_backup',
            jobType,
            jobId,
          },
          jobs: [], // Job already exists, no outbox entries needed
        });

        // Track Layer 2 success
        metricsStore.recordLayer2Activation(true, courseId);

        logger.info({
          courseId,
          jobId,
          jobType,
          initialState,
        }, 'QueueEvents backup: FSM initialized successfully');

      } catch (error) {
        // Track Layer 2 failure
        metricsStore.recordLayer2Activation(false, courseId);

        // Non-fatal: worker will catch this too (Layer 3)
        logger.warn({
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          jobId,
          jobType: name,
          courseId,
        }, 'QueueEvents backup initialization failed (non-fatal, Layer 3 will handle)');
      }
      })();
    });

    // Handle QueueEvents errors (non-fatal)
    queueEvents.on('error', (error: Error) => {
      logger.warn({
        error: error.message,
        stack: error.stack,
        queueName: QUEUE_NAME,
      }, 'QueueEvents error (non-fatal, continuing)');
    });

    logger.info({
      queueName: QUEUE_NAME,
      monitoredJobTypes: FSM_REQUIRED_JOB_TYPES,
    }, 'QueueEvents backup layer started successfully');

  } catch (error) {
    // Non-fatal: application continues without backup layer
    // Layer 1 (API) and Layer 3 (worker) are still active
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      queueName: QUEUE_NAME,
    }, 'Failed to initialize QueueEvents backup layer (non-fatal, Layers 1 and 3 still active)');
  }
}

// Auto-initialize on module load (will be called when importing this module)
// This ensures the backup layer starts when the application boots
logger.info('QueueEvents backup layer module loaded, initializing...');
initializeQueueEventsBackup();
