/**
 * Stage 5 permanent-failure error-log tests
 * @module tests/unit/orchestrator/stage5-failure-error-log.test
 *
 * Regression cover for the bug found while aligning StructureGenerationJobData:
 * the five Stage 5 producers enqueued a bare snake_case GenerationJobInput with
 * no camelCase BullMQ envelope, so handleJobFailure() read
 * `jobData.organizationId` as undefined and wrote an error_logs row with no
 * organization. course_id survived only because getJobCourseId() already
 * carried a snake_case fallback, which is exactly why nobody noticed.
 */

import type { Job } from 'bullmq';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildStructureGenerationJobData,
  JobType,
  type GenerationJobInput,
  type JobData,
} from '@megacampus/shared-types';

const mocks = vi.hoisted(() => ({
  logPermanentFailure: vi.fn(() => Promise.resolve()),
  silentLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock('@/shared/logger', () => ({
  default: mocks.silentLogger,
  logger: mocks.silentLogger,
  logPermanentFailure: mocks.logPermanentFailure,
}));

vi.mock('@/shared/logger/shared-logger-runtime', () => ({
  baseLogger: mocks.silentLogger,
}));

vi.mock('@/orchestrator/metrics', () => ({
  metricsStore: { recordJobRetry: vi.fn() },
}));

import { handleJobFailure } from '@/orchestrator/handlers/error-handler';

const ORGANIZATION_ID = '550e8400-e29b-41d4-a716-446655440000';
const COURSE_ID = '3f8e1cd4-0c6e-43cf-8264-57c470a6c102';
const USER_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

/** What every Stage 5 producer builds before enqueueing. */
const GENERATION_INPUT: GenerationJobInput = {
  course_id: COURSE_ID,
  organization_id: ORGANIZATION_ID,
  user_id: USER_ID,
  analysis_result: null,
  frontend_parameters: {
    course_title: 'Основы машинного обучения',
    language: 'ru',
    difficulty: 'intermediate',
  },
  vectorized_documents: false,
  document_summaries: [],
};

/** 'validation' classifies as PERMANENT, so the job will not be retried. */
const PERMANENT_ERROR = new Error('Course structure validation failed');

function createStage5Job(data: JobData): Job<JobData> {
  return {
    id: 'job-stage5-1',
    name: JobType.STRUCTURE_GENERATION,
    data,
    attemptsMade: 3,
    opts: { attempts: 3 },
  } as Job<JobData>;
}

function singleErrorLogWrite(): Record<string, unknown> {
  expect(mocks.logPermanentFailure).toHaveBeenCalledTimes(1);
  return mocks.logPermanentFailure.mock.calls[0][0] as unknown as Record<string, unknown>;
}

describe('Stage 5 permanent failure reaches the error log with its identifiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the real organizationId for a job built by the producer helper', () => {
    const job = createStage5Job(buildStructureGenerationJobData(GENERATION_INPUT));

    handleJobFailure(job, PERMANENT_ERROR);

    expect(singleErrorLogWrite().organization_id).toBe(ORGANIZATION_ID);
  });

  it('writes the user and course alongside it', () => {
    const job = createStage5Job(buildStructureGenerationJobData(GENERATION_INPUT));

    handleJobFailure(job, PERMANENT_ERROR);

    const params = singleErrorLogWrite();
    expect(params.user_id).toBe(USER_ID);
    expect(params.course_id).toBe(COURSE_ID);
  });

  it('records the failure as permanent rather than retryable', () => {
    const job = createStage5Job(buildStructureGenerationJobData(GENERATION_INPUT));

    handleJobFailure(job, PERMANENT_ERROR);

    const params = singleErrorLogWrite();
    expect(params.severity).toBe('CRITICAL');
    expect(params.job_type).toBe(JobType.STRUCTURE_GENERATION);
  });

  describe('the shape that caused the bug', () => {
    // Pinning the old behaviour so a producer that stops calling
    // buildStructureGenerationJobData fails here rather than in production.
    it('loses the organization when the bare payload is enqueued', () => {
      const job = createStage5Job(GENERATION_INPUT as unknown as JobData);

      handleJobFailure(job, PERMANENT_ERROR);

      expect(singleErrorLogWrite().organization_id).toBeUndefined();
    });

    it('still resolves the course, which is why the gap stayed hidden', () => {
      const job = createStage5Job(GENERATION_INPUT as unknown as JobData);

      handleJobFailure(job, PERMANENT_ERROR);

      expect(singleErrorLogWrite().course_id).toBe(COURSE_ID);
    });
  });
});
