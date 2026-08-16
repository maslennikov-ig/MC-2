/**
 * Contract: every worker that spends money on a course refreshes what the
 * course has cost.
 *
 * The live run (mc2-2pplo) finished a course for USD 0.042368 by the trace and
 * showed the owner USD 0.0131 — Stage 4 plus Stage 5, to the last digit. The
 * refresh lives in the general sandboxed processor, and Stage 6 and Stage 7 run
 * on their own queues in their own containers, so it never ran for them. The
 * stage 6 worker's log had the line "Course estimated cost updated" zero times
 * in 48 hours (mc2-gmab0).
 *
 * Stage 6 is 69% of a course's spend, and Stage 7 was worse off still: its
 * phases fell outside `stageOfPhase`, so its calls were never priced at all.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateCourseEstimatedCost: vi.fn(async () => 0),
  processStage6Job: vi.fn(async () => ({ lessonId: 'lesson-1', success: true })),
  processStage7Job: vi.fn(async () => ({ enrichmentId: 'enr-1', success: true })),
  capturedProcessors: [] as Array<(job: unknown, token?: string) => Promise<unknown>>,
}));

vi.mock('bullmq', () => ({
  Worker: class {
    on() {
      return this;
    }
    constructor(_name: string, processor: (job: unknown, token?: string) => Promise<unknown>) {
      mocks.capturedProcessors.push(processor);
    }
  },
  Queue: class {
    on() {
      return this;
    }
  },
}));

vi.mock('@/services/token-tracking-service', () => ({
  updateCourseEstimatedCost: mocks.updateCourseEstimatedCost,
}));

vi.mock('@/shared/cache/redis', () => ({ getRedisClient: () => ({}) }));
vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/orchestrator/job-status-tracker', () => ({
  createJobStatus: vi.fn(),
  markJobCompleted: vi.fn(),
  markJobFailed: vi.fn(),
}));
vi.mock('@/stages/stage6-lesson-content/services/job-processor', () => ({
  processStage6Job: mocks.processStage6Job,
}));
vi.mock('@/stages/stage7-enrichments/services/job-processor', () => ({
  processStage7Job: mocks.processStage7Job,
}));
vi.mock('@/stages/stage6-lesson-content/batch/production', () => ({
  createProductionStage6BatchProcessor: () => vi.fn(),
}));
vi.mock('@/stages/stage7-enrichments/services/database-service', () => ({
  updateEnrichmentStatus: vi.fn(),
}));

import { createStage6Worker } from '@/stages/stage6-lesson-content/factory';
import { createStage7Worker } from '@/stages/stage7-enrichments/factory';
import { stageOfPhase } from '@/shared/llm/model-cost-callbacks';

function processorOf(create: () => unknown): (job: unknown, token?: string) => Promise<unknown> {
  mocks.capturedProcessors.length = 0;
  create();
  const processor = mocks.capturedProcessors.at(-1);
  if (!processor) throw new Error('the worker was built without a processor');
  return processor;
}

describe('course cost refresh', () => {
  beforeEach(() => {
    mocks.updateCourseEstimatedCost.mockClear();
    mocks.processStage6Job.mockReset().mockResolvedValue({ lessonId: 'l', success: true });
    mocks.processStage7Job.mockReset().mockResolvedValue({ enrichmentId: 'e', success: true });
  });

  it('refreshes the course cost when a Stage 6 lesson finishes', async () => {
    const process = processorOf(() => createStage6Worker());

    await process({ data: { courseId: 'course-1', lessonSpec: {} } });

    expect(mocks.updateCourseEstimatedCost).toHaveBeenCalledWith('course-1');
  });

  it('refreshes it after a Stage 6 lesson that failed, which also spent money', async () => {
    const process = processorOf(() => createStage6Worker());
    mocks.processStage6Job.mockRejectedValue(new Error('model refused'));

    await expect(process({ data: { courseId: 'course-1' } })).rejects.toThrow('model refused');

    expect(mocks.updateCourseEstimatedCost).toHaveBeenCalledWith('course-1');
  });

  it('refreshes the course cost when a Stage 7 enrichment finishes', async () => {
    const process = processorOf(() => createStage7Worker());

    await process({ data: { courseId: 'course-2', enrichmentId: 'enr-1' } });

    expect(mocks.updateCourseEstimatedCost).toHaveBeenCalledWith('course-2');
  });

  it('refreshes it after a Stage 7 enrichment that failed', async () => {
    const process = processorOf(() => createStage7Worker());
    mocks.processStage7Job.mockRejectedValue(new Error('provider down'));

    await expect(process({ data: { courseId: 'course-2' } })).rejects.toThrow('provider down');

    expect(mocks.updateCourseEstimatedCost).toHaveBeenCalledWith('course-2');
  });

  it('prices Stage 7 calls instead of dropping them', () => {
    expect(stageOfPhase('stage_7_cover')).toBe('stage_7');
    expect(stageOfPhase('stage_6_complex')).toBe('stage_6');
    // Still not a stage: a phase that only starts with the word.
    expect(stageOfPhase('stage_8_future')).toBeUndefined();
  });
});
