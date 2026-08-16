import { DelayedError, type Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  createStage6BatchProcessor,
  type Stage6BatchCoordinatorInput,
} from '@/stages/stage6-lesson-content/batch/batch-processor';
import type { OpenRouterBatch } from '@/shared/llm/openrouter-batch-client';

function validatingBatch(): OpenRouterBatch {
  return {
    id: 'batch_123',
    object: 'batch',
    endpoint: '/v1/chat/completions',
    model: 'google/gemini-3.7-flash',
    completion_window: '24h',
    status: 'validating',
    created_at: 1,
    finalized_at: null,
    request_counts: { total: 10, completed: 0, failed: 0 },
    usage: null,
    results: null,
    error: null,
  };
}

function coordinatorInput(): Stage6BatchCoordinatorInput {
  return {
    kind: 'stage6_batch_coordinator',
    courseId: '00000000-0000-4000-8000-000000000001',
    language: 'en',
    lessonJobs: Array.from({ length: 10 }, (_, position) => ({
      position,
      lessonJobId: `stage6:course:lesson-${position}`,
      jobData: {
        courseId: '00000000-0000-4000-8000-000000000001',
        language: 'en',
        lessonSpec: { lesson_id: `2.${position + 1}` } as never,
      },
    })),
    state: null,
  };
}

function createCoordinatorJob(data = coordinatorInput()) {
  const job = {
    id: 'stage6-batch:course',
    name: 'course-batch',
    data,
    updateData: vi.fn(async (next: Stage6BatchCoordinatorInput) => {
      job.data = next;
    }),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
  return job;
}

describe('Stage 6 Batch processor', () => {
  it('submits ten compatible lesson generations in one batch, saves its id, and releases the worker', async () => {
    const job = createCoordinatorJob();
    const submitChatBatch = vi.fn().mockResolvedValue(validatingBatch());
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(async item => ({
        ...item,
        prompt: `Prompt ${item.position}`,
        baseModelId: 'google/gemini-3.7-flash',
        maxTokens: 8_000,
        reasoning: { enabled: true, effort: 'low', maxTokens: null },
      })),
      eligibilityResolver: {
        resolve: vi.fn().mockResolvedValue({
          eligible: true,
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          inputDiscountRatio: 0.5,
          outputDiscountRatio: 0.5,
          supportedParameters: new Set(['max_tokens', 'reasoning']),
        }),
      },
      createClient: vi.fn().mockResolvedValue({ submitChatBatch, getBatch: vi.fn() }),
      getLessonJob: vi.fn(),
      now: () => 1_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 2 * 60 * 60 * 1000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).rejects.toBeInstanceOf(
      DelayedError
    );

    expect(submitChatBatch).toHaveBeenCalledTimes(1);
    expect(submitChatBatch).toHaveBeenCalledWith({
      model: 'google/gemini-3.7-flash',
      requests: expect.arrayContaining([
        expect.objectContaining({ customId: 'lesson-0' }),
        expect.objectContaining({ customId: 'lesson-9' }),
      ]),
    });
    expect(submitChatBatch.mock.calls[0][0].requests).toHaveLength(10);
    expect(job.data.state?.groups[0]).toMatchObject({ batchId: 'batch_123' });
    expect(job.moveToDelayed).toHaveBeenCalledWith(61_000, 'lock-token');
  });

  it('routes a failed item to synchronous generation without failing successful lessons', async () => {
    const data = coordinatorInput();
    data.state = {
      startedAt: 1_000,
      groups: [
        {
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          batchId: 'batch_123',
          status: 'validating',
          items: data.lessonJobs.map(item => ({
            ...item,
            customId: `lesson-${item.position}`,
            prompt: `Prompt ${item.position}`,
            maxTokens: 8_000,
            reasoning: { enabled: true, effort: 'low', maxTokens: null },
          })),
        },
      ],
    };
    const job = createCoordinatorJob(data);
    const lessonJobs = new Map(
      data.lessonJobs.map(item => {
        const lessonJob = {
          data: item.jobData,
          updateData: vi.fn(async next => {
            lessonJob.data = next;
          }),
          promote: vi.fn().mockResolvedValue(undefined),
          getState: vi.fn().mockResolvedValue('delayed'),
        };
        return [item.lessonJobId, lessonJob];
      })
    );
    const results = data.lessonJobs.map(item =>
      item.position === 4
        ? {
            custom_id: `lesson-${item.position}`,
            response: null,
            error: { code: 'provider_error', message: 'temporary failure' },
          }
        : {
            custom_id: `lesson-${item.position}`,
            response: {
              status_code: 200,
              request_id: `request-${item.position}`,
              body: {
                choices: [{ message: { role: 'assistant', content: `Lesson ${item.position}` } }],
                usage: { total_tokens: 100 + item.position, cost: 0.001 },
              },
            },
            error: null,
          }
    );
    const completed = { ...validatingBatch(), status: 'completed', results } as OpenRouterBatch;
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(),
      eligibilityResolver: { resolve: vi.fn() },
      createClient: vi.fn().mockResolvedValue({
        submitChatBatch: vi.fn(),
        getBatch: vi.fn().mockResolvedValue(completed),
      }),
      getLessonJob: vi.fn(async id => lessonJobs.get(id) ?? null),
      now: () => 2_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 2 * 60 * 60 * 1000,
    });

    const result = await processor(job as unknown as Job, 'lock-token');

    expect(result).toMatchObject({ success: true, releasedLessons: 10, syncFallbacks: 1 });
    for (const [id, lessonJob] of lessonJobs) {
      expect(lessonJob.promote).toHaveBeenCalledTimes(1);
      if (id.endsWith('lesson-4')) {
        expect(lessonJob.data.prefetchedGeneratorResponse).toBeUndefined();
      } else {
        expect(lessonJob.data.prefetchedGeneratorResponse).toMatchObject({
          modelUsed: 'google/gemini-3.7-flash:batch',
          baseModelUsed: 'google/gemini-3.7-flash',
        });
      }
    }
  });

  it('keeps polling through delayed states without occupying the worker', async () => {
    const data = coordinatorInput();
    data.state = {
      startedAt: 1_000,
      groups: [
        {
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          batchId: 'batch_123',
          status: 'validating',
          items: data.lessonJobs.map(item => ({
            ...item,
            customId: `lesson-${item.position}`,
            prompt: `Prompt ${item.position}`,
            baseModelId: 'google/gemini-3.7-flash',
            maxTokens: 8_000,
            reasoning: { enabled: false, effort: null, maxTokens: null },
          })),
        },
      ],
    };
    const job = createCoordinatorJob(data);
    const getBatch = vi.fn().mockResolvedValue({
      ...validatingBatch(),
      status: 'in_progress',
      request_counts: { total: 10, completed: 3, failed: 0 },
    });
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(),
      eligibilityResolver: { resolve: vi.fn() },
      createClient: vi.fn().mockResolvedValue({ submitChatBatch: vi.fn(), getBatch }),
      getLessonJob: vi.fn(),
      now: () => 2_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 7_200_000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).rejects.toBeInstanceOf(
      DelayedError
    );
    expect(getBatch).toHaveBeenCalledWith('batch_123');
    expect(job.moveToDelayed).toHaveBeenCalledWith(62_000, 'lock-token');
  });

  it('falls back all unresolved lessons after the user-facing deadline', async () => {
    const data = coordinatorInput();
    data.state = {
      startedAt: 1_000,
      groups: [
        {
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          batchId: 'batch_123',
          status: 'in_progress',
          items: data.lessonJobs.map(item => ({
            ...item,
            customId: `lesson-${item.position}`,
            prompt: `Prompt ${item.position}`,
            baseModelId: 'google/gemini-3.7-flash',
            maxTokens: 8_000,
            reasoning: { enabled: false, effort: null, maxTokens: null },
          })),
        },
      ],
    };
    const job = createCoordinatorJob(data);
    const lessonJobs = data.lessonJobs.map(item => ({
      data: item.jobData,
      updateData: vi.fn(),
      promote: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('delayed'),
    }));
    const getBatch = vi.fn();
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(),
      eligibilityResolver: { resolve: vi.fn() },
      createClient: vi.fn().mockResolvedValue({ submitChatBatch: vi.fn(), getBatch }),
      getLessonJob: vi.fn(async id => {
        const index = data.lessonJobs.findIndex(item => item.lessonJobId === id);
        return lessonJobs[index] ?? null;
      }),
      now: () => 1_000 + 7_200_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 7_200_000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).resolves.toMatchObject({
      success: true,
      releasedLessons: 10,
      syncFallbacks: 10,
    });
    expect(getBatch).not.toHaveBeenCalled();
    expect(lessonJobs.every(lessonJob => lessonJob.promote.mock.calls.length === 1)).toBe(true);
  });

  it('automatically retries an ambiguous submission instead of failing the course', async () => {
    const data = coordinatorInput();
    data.state = {
      startedAt: 1_000,
      groups: [
        {
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          batchId: null,
          status: 'pending_submission',
          submissionAttempts: 0,
          items: data.lessonJobs.map(item => ({
            ...item,
            customId: `lesson-${item.position}`,
            prompt: `Prompt ${item.position}`,
            baseModelId: 'google/gemini-3.7-flash',
            maxTokens: 8_000,
            reasoning: { enabled: false, effort: null, maxTokens: null },
          })),
        },
      ],
    };
    const job = createCoordinatorJob(data);
    const submitChatBatch = vi.fn().mockRejectedValue(new Error('socket closed after upload'));
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(),
      eligibilityResolver: { resolve: vi.fn() },
      createClient: vi.fn().mockResolvedValue({ submitChatBatch, getBatch: vi.fn() }),
      getLessonJob: vi.fn(),
      now: () => 2_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 7_200_000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).rejects.toBeInstanceOf(
      DelayedError
    );
    expect(data.state.groups[0]).toMatchObject({
      batchId: null,
      status: 'pending_submission',
      submissionAttempts: 1,
    });
    expect(job.moveToDelayed).toHaveBeenCalledWith(62_000, 'lock-token');
  });

  it('falls back synchronously when the provider marks the whole batch failed', async () => {
    const data = coordinatorInput();
    data.state = {
      startedAt: 1_000,
      groups: [
        {
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          batchId: 'batch_123',
          status: 'in_progress',
          items: data.lessonJobs.map(item => ({
            ...item,
            customId: `lesson-${item.position}`,
            prompt: `Prompt ${item.position}`,
            baseModelId: 'google/gemini-3.7-flash',
            maxTokens: 8_000,
            reasoning: { enabled: false, effort: null, maxTokens: null },
          })),
        },
      ],
    };
    const job = createCoordinatorJob(data);
    const lessonJobs = data.lessonJobs.map(item => ({
      data: item.jobData,
      updateData: vi.fn(),
      promote: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('delayed'),
    }));
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(),
      eligibilityResolver: { resolve: vi.fn() },
      createClient: vi.fn().mockResolvedValue({
        submitChatBatch: vi.fn(),
        getBatch: vi.fn().mockResolvedValue({
          ...validatingBatch(),
          status: 'failed',
          error: { code: 'provider_error', message: 'batch rejected' },
        }),
      }),
      getLessonJob: vi.fn(async id => {
        const index = data.lessonJobs.findIndex(item => item.lessonJobId === id);
        return lessonJobs[index] ?? null;
      }),
      now: () => 2_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 7_200_000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).resolves.toMatchObject({
      success: true,
      releasedLessons: 10,
      syncFallbacks: 10,
    });
    expect(lessonJobs.every(lessonJob => lessonJob.promote.mock.calls.length === 1)).toBe(true);
  });

  it('stops resubmitting after three ambiguous outcomes and resumes synchronously', async () => {
    const data = coordinatorInput();
    data.state = {
      startedAt: 1_000,
      groups: [
        {
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          batchId: null,
          status: 'pending_submission',
          submissionAttempts: 2,
          items: data.lessonJobs.map(item => ({
            ...item,
            customId: `lesson-${item.position}`,
            prompt: `Prompt ${item.position}`,
            baseModelId: 'google/gemini-3.7-flash',
            maxTokens: 8_000,
            reasoning: { enabled: false, effort: null, maxTokens: null },
          })),
        },
      ],
    };
    const job = createCoordinatorJob(data);
    const lessonJobs = data.lessonJobs.map(item => ({
      data: item.jobData,
      updateData: vi.fn(),
      promote: vi.fn().mockResolvedValue(undefined),
      getState: vi.fn().mockResolvedValue('delayed'),
    }));
    const submitChatBatch = vi.fn().mockRejectedValue(new Error('socket closed after upload'));
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(),
      eligibilityResolver: { resolve: vi.fn() },
      createClient: vi.fn().mockResolvedValue({ submitChatBatch, getBatch: vi.fn() }),
      getLessonJob: vi.fn(async id => {
        const index = data.lessonJobs.findIndex(item => item.lessonJobId === id);
        return lessonJobs[index] ?? null;
      }),
      now: () => 2_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 7_200_000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).resolves.toMatchObject({
      success: true,
      releasedLessons: 10,
      syncFallbacks: 10,
    });
    expect(submitChatBatch).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it('asks a mandatory-reasoning model for the lowest effort rather than none', async () => {
    // `google/gemini-3.7-flash` answers 400 to `reasoning: {enabled: false}`,
    // and here that would waste a whole 24h window instead of one call.
    const job = createCoordinatorJob();
    const submitChatBatch = vi.fn().mockResolvedValue(validatingBatch());
    const processor = createStage6BatchProcessor({
      prepareLesson: vi.fn(async item => ({
        ...item,
        prompt: `Prompt ${item.position}`,
        baseModelId: 'google/gemini-3.7-flash',
        maxTokens: 8_000,
        reasoning: { enabled: false, effort: null, maxTokens: null },
      })),
      eligibilityResolver: {
        resolve: vi.fn().mockResolvedValue({
          eligible: true,
          baseModelId: 'google/gemini-3.7-flash',
          batchModelId: 'google/gemini-3.7-flash:batch',
          inputDiscountRatio: 0.5,
          outputDiscountRatio: 0.5,
          supportedParameters: new Set(['max_tokens', 'reasoning']),
        }),
      },
      createClient: vi.fn().mockResolvedValue({ submitChatBatch, getBatch: vi.fn() }),
      getLessonJob: vi.fn(),
      now: () => 1_000,
      pollIntervalMs: 60_000,
      maxWaitMs: 2 * 60 * 60 * 1000,
    });

    await expect(processor(job as unknown as Job, 'lock-token')).rejects.toBeInstanceOf(
      DelayedError
    );

    const [request] = submitChatBatch.mock.calls[0][0].requests;
    expect(request.body.reasoning).toEqual({ effort: 'low' });
    expect(request.body.max_tokens).toBe(8_000 + 4_096);
  });
});
