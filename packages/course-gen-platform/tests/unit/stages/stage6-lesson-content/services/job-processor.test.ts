/**
 * Unit tests for stage6/services/job-processor.ts
 *
 * Tests the Stage 6 lesson content job processor with extensive mocking
 * of all external dependencies (Supabase, orchestrator, RAG, logger, etc.).
 *
 * @module tests/unit/stages/stage6-lesson-content/services/job-processor
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ============================================================================
// MOCKS — all hoisted before imports
// ============================================================================

// vi.hoisted() ensures these are available when vi.mock() factories run (hoisted to top)
const {
  mockExecuteStage6Orchestrator,
  mockRetrieveLessonContext,
  mockExtractSourceDocuments,
  mockSelectStage6ModelTier,
  mockHandlePartialSuccess,
  mockMarkForReview,
  mockFailStage6Course,
  mockIsStage6CourseActive,
  mockSaveLessonContent,
  mockSaveSourceDocuments,
  mockCheckAndSetStage6Complete,
  mockGetModelForPhase,
} = vi.hoisted(() => ({
  mockExecuteStage6Orchestrator: vi.fn(),
  mockRetrieveLessonContext: vi.fn(),
  mockExtractSourceDocuments: vi.fn(),
  mockSelectStage6ModelTier: vi.fn(),
  mockHandlePartialSuccess: vi.fn().mockResolvedValue(undefined),
  mockMarkForReview: vi.fn().mockResolvedValue(undefined),
  mockFailStage6Course: vi.fn().mockResolvedValue(true),
  mockIsStage6CourseActive: vi.fn().mockResolvedValue(true),
  mockSaveLessonContent: vi.fn().mockResolvedValue(undefined),
  mockSaveSourceDocuments: vi.fn().mockResolvedValue(undefined),
  mockCheckAndSetStage6Complete: vi.fn().mockResolvedValue(undefined),
  mockGetModelForPhase: vi.fn(),
}));

// Mock Supabase
const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
};
vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

// Mock logger
vi.mock('@/shared/logger', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child = vi.fn(() => logger);
  return { logger, default: logger };
});

// Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

// Mock lesson resolver
vi.mock('@/shared/database/lesson-resolver', () => ({
  resolveLessonUuid: vi.fn().mockResolvedValue('lesson-uuid-123'),
}));

// Mock pause check
vi.mock('@/shared/pause-check', () => ({
  checkPauseAndDelay: vi.fn().mockResolvedValue(undefined),
  isCoursePaused: vi.fn().mockResolvedValue(false),
}));

// Mock the orchestrator — the SUT imports `executeStage6 as executeStage6Orchestrator`
vi.mock('@/stages/stage6-lesson-content/orchestrator', () => ({
  executeStage6: mockExecuteStage6Orchestrator,
}));

// Mock RAG retriever
vi.mock('@/stages/stage6-lesson-content/utils/lesson-rag-retriever', () => ({
  retrieveLessonContext: mockRetrieveLessonContext,
  extractSourceDocuments: mockExtractSourceDocuments,
}));

// Mock sanity check
vi.mock('@/stages/stage6-lesson-content/utils/sanity-check', () => ({
  quickSanityCheck: vi.fn().mockReturnValue({ ok: true }),
}));

// Mock database-service
vi.mock('@/stages/stage6-lesson-content/services/database-service', () => ({
  handlePartialSuccess: mockHandlePartialSuccess,
  markForReview: mockMarkForReview,
  failStage6Course: mockFailStage6Course,
  isStage6CourseActive: mockIsStage6CourseActive,
  saveLessonContent: mockSaveLessonContent,
  saveSourceDocuments: mockSaveSourceDocuments,
  checkAndSetStage6Complete: mockCheckAndSetStage6Complete,
}));

// Mock content utils
vi.mock('@/stages/stage6-lesson-content/services/content-utils', () => ({
  extractContentMarkdown: vi.fn().mockReturnValue('# Mock Markdown'),
}));

// Mock model selector
vi.mock('@/stages/stage6-lesson-content/nodes/generator/model-selector', () => ({
  selectStage6ModelTier: mockSelectStage6ModelTier,
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(() => ({
    getModelForPhase: mockGetModelForPhase,
  })),
}));

// Mock config
vi.mock('@/stages/stage6-lesson-content/config', () => ({
  MODEL_FALLBACK: {
    primary: { ru: 'test-primary-model', en: 'test-primary-model' },
    fallback: 'test-fallback-model',
    maxPrimaryAttempts: 2,
  },
  HANDLER_CONFIG: {
    QUALITY_THRESHOLD: 0.75,
    MAX_REGENERATION_RETRIES: 2,
    MAX_TRUNCATION_CONTINUATION_ATTEMPTS: 2,
  },
  STAGE6_AUTOMATIC_QUALITY_RUNGS: [
    'stage_6_simple',
    'stage_6_normal',
    'stage_6_complex',
    'stage_6_auto_last_chance',
  ],
  STAGE6_MANUAL_QUALITY_RUNG: 'stage_6_manual_regeneration',
  STAGE6_QUALITY_RUNG_CONFIGS: {
    stage_6_simple: {
      phaseName: 'stage_6_simple',
      mode: 'automatic',
      initialMaxRegenerationRetries: 1,
      promotedMaxRegenerationRetries: 0,
    },
    stage_6_normal: {
      phaseName: 'stage_6_normal',
      mode: 'automatic',
      initialMaxRegenerationRetries: 1,
      promotedMaxRegenerationRetries: 0,
    },
    stage_6_complex: {
      phaseName: 'stage_6_complex',
      mode: 'automatic',
      initialMaxRegenerationRetries: 1,
      promotedMaxRegenerationRetries: 0,
    },
    stage_6_auto_last_chance: {
      phaseName: 'stage_6_auto_last_chance',
      mode: 'automatic',
      initialMaxRegenerationRetries: 0,
      promotedMaxRegenerationRetries: 0,
    },
    stage_6_manual_regeneration: {
      phaseName: 'stage_6_manual_regeneration',
      mode: 'manual',
      initialMaxRegenerationRetries: 0,
      promotedMaxRegenerationRetries: 0,
    },
  },
}));

// Mock shared-types createLessonLabel (must allow the existing label format)
vi.mock('@megacampus/shared-types', async importOriginal => {
  const original = await importOriginal<typeof import('@megacampus/shared-types')>();
  return {
    ...original,
  };
});

// ============================================================================
// IMPORTS
// ============================================================================
import {
  updateJobProgress,
  processWithFallback,
  processStage6Job,
} from '@/stages/stage6-lesson-content/services/job-processor';
import type { Job } from 'bullmq';
import type {
  Stage6JobInput,
  Stage6JobResult,
  Stage6Output,
} from '@/stages/stage6-lesson-content/types';

// ============================================================================
// HELPERS
// ============================================================================

/** Valid lesson_id format: section.lesson (e.g. '1.1') */
function createMockJob(
  overrides: Partial<Stage6JobInput> = {}
): Job<Stage6JobInput, Stage6JobResult> {
  const defaultData: Stage6JobInput = {
    lessonSpec: {
      lesson_id: '1.1',
      title: 'Test Lesson',
      sections: [
        {
          id: 'sec-1',
          title: 'Section 1',
          learning_objectives: ['Objective 1'],
          content_guidelines: 'Test guidelines',
        },
      ],
      lesson_context: {},
      depth: 'standard',
      difficulty: 'intermediate',
      learning_objectives: ['Learn testing'],
    },
    courseId: 'course-uuid',
    language: 'en',
    ...overrides,
  } as Stage6JobInput;

  return {
    id: 'job-stage6-123',
    name: 'LESSON_CONTENT',
    data: defaultData,
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
  } as unknown as Job<Stage6JobInput, Stage6JobResult>;
}

function createSuccessOutput(): Stage6Output {
  return {
    success: true,
    lessonContent: {
      lesson_id: '1.1',
      title: 'Test Lesson',
      sections: [],
    } as unknown as Stage6Output['lessonContent'],
    errors: [],
    metrics: {
      tokensUsed: 5000,
      durationMs: 3000,
      modelUsed: 'test-primary-model',
      selectedModel: 'test-primary-model',
      fallbackModel: 'test-fallback-model',
      selectedModelTier: 'normal',
      selectedModelTierReason: 'standard difficulty',
      qualityScore: 0.85,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      regenerationMode: null,
    },
  };
}

function createFailOutput(errors: string[] = ['LLM timeout']): Stage6Output {
  return {
    success: false,
    lessonContent: null,
    errors,
    metrics: {
      tokensUsed: 0,
      durationMs: 0,
      modelUsed: null,
      selectedModel: null,
      fallbackModel: null,
      selectedModelTier: null,
      selectedModelTierReason: null,
      qualityScore: 0,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      regenerationMode: null,
    },
  };
}

function createReviewOutput(reason: string = 'Low quality score'): Stage6Output {
  return {
    ...createFailOutput([]),
    success: true,
    lessonContent: {
      lesson_id: '1.1',
      title: 'Needs Review',
      sections: [],
    } as unknown as Stage6Output['lessonContent'],
    reviewInfo: {
      needsReview: true,
      reasons: [reason],
    },
    metrics: {
      ...createFailOutput([]).metrics,
      qualityScore: 0.42,
    },
  };
}

const LESSON_SPEC_MISMATCH_MESSAGE =
  'Max regeneration retries (2) exceeded. Latest quality score: 73.5%. Review LessonSpecification for key_topics/lesson_objectives mismatch.';

// ============================================================================
// TESTS
// ============================================================================

describe('stage6/services/job-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default RAG mock
    mockRetrieveLessonContext.mockResolvedValue({
      chunks: [],
      lessonId: '1.1',
      cached: false,
      coverageScore: 0,
      retrievalDurationMs: 100,
    });
    mockExtractSourceDocuments.mockReturnValue([]);

    // Default model tier selection
    mockSelectStage6ModelTier.mockResolvedValue({
      model: 'test-primary-model',
      fallback: 'test-fallback-model',
      tier: 'normal' as const,
      reason: 'standard difficulty',
    });
    mockGetModelForPhase.mockImplementation((phaseName: string) => ({
      modelId: `${phaseName}-primary`,
      fallbackModelId: `${phaseName}-fallback`,
      maxTokens: phaseName === 'stage_6_auto_last_chance' ? 12000 : 8000,
      source: 'database',
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // updateJobProgress
  // --------------------------------------------------------------------------
  describe('updateJobProgress', () => {
    it('should call job.updateProgress with progress data', async () => {
      const job = createMockJob();
      await updateJobProgress(job, {
        lessonId: '1.1',
        phase: 'planner',
        progress: 50,
        message: 'Generating content',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(job.updateProgress).toHaveBeenCalledWith({
        lessonId: '1.1',
        phase: 'planner',
        progress: 50,
        message: 'Generating content',
      });
    });

    it('should handle updateProgress failure gracefully', async () => {
      const job = createMockJob();
      (job.updateProgress as Mock).mockRejectedValueOnce(new Error('Redis down'));

      // Should not throw
      await expect(
        updateJobProgress(job, {
          lessonId: '1.1',
          phase: 'complete',
          progress: 100,
          message: 'Done',
        })
      ).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // processWithFallback
  // --------------------------------------------------------------------------
  describe('processWithFallback', () => {
    it('should return success on primary model first attempt', async () => {
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(createSuccessOutput());

      const job = createMockJob();
      const result = await processWithFallback(
        job,
        { primary: 'test-primary', fallback: 'test-fallback' },
        'lesson-uuid-123',
        [],
        null
      );

      expect(result.success).toBe(true);
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
    });

    it('should retry primary then fall back to secondary model', async () => {
      const fail = createFailOutput();
      const success = createSuccessOutput();

      // Primary: 2 failures (maxPrimaryAttempts=2), then fallback: success
      mockExecuteStage6Orchestrator
        .mockResolvedValueOnce(fail) // attempt 1
        .mockResolvedValueOnce(fail) // attempt 2
        .mockResolvedValueOnce(success); // fallback

      const job = createMockJob();
      const resultPromise = processWithFallback(
        job,
        { primary: 'test-primary', fallback: 'test-fallback' },
        'lesson-uuid-123',
        [],
        null
      );
      // Advance past sleep() between retries: 1000ms (2^0) backoff
      await vi.advanceTimersByTimeAsync(5000);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      // 2 primary attempts + 1 fallback = 3
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(3);
    });

    it('should throw when both primary and fallback fail', async () => {
      const fail = createFailOutput();
      // All fail
      mockExecuteStage6Orchestrator.mockResolvedValue(fail);

      const job = createMockJob();
      const resultPromise = processWithFallback(
        job,
        { primary: 'test-primary', fallback: 'test-fallback' },
        'lesson-uuid-123',
        [],
        null
      );
      // Add catch handler to prevent unhandled rejection while timers advance
      const handledPromise = resultPromise.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await handledPromise;

      expect(result).toBeInstanceOf(Error);
    });

    it('should bail immediately on non-retryable error', async () => {
      mockExecuteStage6Orchestrator.mockRejectedValueOnce(
        new Error('invalid job input: missing field')
      );

      const job = createMockJob();

      await expect(
        processWithFallback(
          job,
          { primary: 'test-primary', fallback: 'test-fallback' },
          'lesson-uuid-123',
          [],
          null
        )
      ).rejects.toThrow('invalid job input');

      // Should only try once (bail on non-retryable)
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
    });

    it('should return review_required result without retry', async () => {
      const reviewOutput: Stage6Output = {
        ...createFailOutput(),
        errors: [],
        lessonContent: { lesson_id: '1.1' } as unknown as Stage6Output['lessonContent'],
        reviewInfo: {
          needsReview: true,
          reasons: ['Low quality score'],
        },
      };

      mockExecuteStage6Orchestrator.mockResolvedValueOnce(reviewOutput);

      const job = createMockJob();
      const result = await processWithFallback(
        job,
        { primary: 'test-primary', fallback: 'test-fallback' },
        'lesson-uuid-123',
        [],
        null
      );

      expect(result.reviewInfo?.needsReview).toBe(true);
      // Should not retry when review_required
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
    });

    it('should bail on non-retryable result errors (schema validation)', async () => {
      const fail = createFailOutput(['Schema validation failed: sections mismatch']);
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(fail);

      const job = createMockJob();

      await expect(
        processWithFallback(
          job,
          { primary: 'test-primary', fallback: 'test-fallback' },
          'lesson-uuid-123',
          [],
          null
        )
      ).rejects.toThrow('Schema validation failed');

      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
    });

    it('should treat LessonSpecification mismatch exhaustion as review_required for the outer ladder', async () => {
      const fail = createFailOutput([LESSON_SPEC_MISMATCH_MESSAGE]);
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(fail);

      const job = createMockJob();
      const result = await processWithFallback(
        job,
        { primary: 'test-primary', fallback: 'test-fallback' },
        'lesson-uuid-123',
        [],
        null
      );

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([LESSON_SPEC_MISMATCH_MESSAGE]);
      expect(result.reviewInfo).toEqual({
        needsReview: true,
        reasons: [LESSON_SPEC_MISMATCH_MESSAGE],
      });
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
    });

    it('should pass maxTokensOverride from modelSelection to orchestrator input', async () => {
      const job = createMockJob();
      mockExecuteStage6Orchestrator.mockResolvedValueOnce({
        success: true,
        content: { sections: [] },
        metrics: { tokensUsed: 100, qualityScore: 0.9 },
        errors: [],
      });

      await processWithFallback(
        job,
        { primary: 'test-primary', fallback: 'test-fallback' },
        'lesson-uuid-123',
        [],
        null,
        {
          selectedModel: 'test-primary',
          fallbackModel: 'test-fallback',
          selectedModelTier: 'complex',
          selectedModelTierReason: 'test',
          selectedModelPhase: 'stage_6_auto_last_chance',
          selectedModelSource: 'database',
          maxTokensOverride: 12000,
        }
      );

      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
      const orchestratorInput = mockExecuteStage6Orchestrator.mock.calls[0][0];
      expect(orchestratorInput.maxTokensOverride).toBe(12000);
    });
  });

  // --------------------------------------------------------------------------
  // processStage6Job
  // --------------------------------------------------------------------------
  describe('processStage6Job', () => {
    it('should return error for invalid job input (missing lessonSpec)', async () => {
      const job = createMockJob({
        lessonSpec: null as unknown as Stage6JobInput['lessonSpec'],
      });

      const result = await processStage6Job(job);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid job input');
      expect(result.lessonContent).toBeNull();
    });

    it('should return error for missing sections array', async () => {
      const job = createMockJob({
        lessonSpec: {
          lesson_id: '1.1',
          title: 'Test',
          sections: undefined as unknown as Stage6JobInput['lessonSpec']['sections'],
        } as Stage6JobInput['lessonSpec'],
      });

      const result = await processStage6Job(job);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid job input');
    });

    it('should return error for invalid lesson_id format', async () => {
      const job = createMockJob({
        lessonSpec: {
          lesson_id: 'sec_1_lsn_1', // invalid — should be "1.1"
          title: 'Test',
          sections: [{ id: 's1', title: 't', learning_objectives: ['o'], content_guidelines: 'g' }],
          lesson_context: {},
          depth: 'standard',
          difficulty: 'intermediate',
          learning_objectives: ['l'],
        },
      } as Partial<Stage6JobInput>);

      const result = await processStage6Job(job);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid lesson_id');
    });

    it('stops immediately when the Stage 6 course is no longer active', async () => {
      mockIsStage6CourseActive.mockResolvedValueOnce(false);

      // Now throws UnrecoverableError so BullMQ marks job as failed, not completed
      await expect(processStage6Job(createMockJob())).rejects.toThrow(/no longer active/);
      expect(mockRetrieveLessonContext).not.toHaveBeenCalled();
      expect(mockExecuteStage6Orchestrator).not.toHaveBeenCalled();
    });

    it('should handle successful generation', async () => {
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(createSuccessOutput());

      const job = createMockJob();
      const resultPromise = processStage6Job(job, 'test-token');
      // Advance past any sleep/timer calls
      await vi.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.lessonId).toBe('1.1');
      expect(result.metrics.tokensUsed).toBe(5000);
    });

    it('stops the ladder immediately when the initial rung is accepted', async () => {
      mockSelectStage6ModelTier.mockResolvedValue({
        model: 'tier-simple-model',
        fallback: 'tier-simple-fallback',
        tier: 'simple' as const,
        reason: 'beginner lesson',
      });
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(createSuccessOutput());

      const result = await processStage6Job(createMockJob());

      expect(result.success).toBe(true);
      expect(mockGetModelForPhase).toHaveBeenCalledTimes(1);
      expect(mockGetModelForPhase).toHaveBeenCalledWith(
        'stage_6_simple',
        'course-uuid',
        undefined,
        'en'
      );
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
      expect(mockSaveLessonContent).toHaveBeenCalledTimes(1);
      const savedResult = vi.mocked(mockSaveLessonContent).mock.calls[0][2];
      expect(savedResult.qualityRecovery?.attempts).toHaveLength(1);
      expect(savedResult.qualityRecovery?.attempts[0]).toMatchObject({
        phase_name: 'stage_6_simple',
        outcome: 'accepted',
      });
      expect(mockHandlePartialSuccess).not.toHaveBeenCalled();
      expect(mockMarkForReview).not.toHaveBeenCalled();
    });

    it('retries the same tier once before promoting on quality_retryable', async () => {
      mockSelectStage6ModelTier.mockResolvedValue({
        model: 'tier-simple-model',
        fallback: 'tier-simple-fallback',
        tier: 'simple' as const,
        reason: 'beginner lesson',
      });
      mockExecuteStage6Orchestrator
        .mockResolvedValueOnce(createReviewOutput('simple first fail'))
        .mockResolvedValueOnce(createReviewOutput('simple second fail'))
        .mockResolvedValueOnce(createSuccessOutput());

      const result = await processStage6Job(createMockJob());

      expect(result.success).toBe(true);
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(3);
      expect(mockExecuteStage6Orchestrator.mock.calls[0][0]).toMatchObject({
        modelOverride: 'stage_6_simple-primary',
      });
      expect(mockExecuteStage6Orchestrator.mock.calls[1][0]).toMatchObject({
        modelOverride: 'stage_6_simple-primary',
      });
      expect(mockExecuteStage6Orchestrator.mock.calls[2][0]).toMatchObject({
        modelOverride: 'stage_6_normal-primary',
      });
      const savedResult = vi.mocked(mockSaveLessonContent).mock.calls[0][2];
      expect(savedResult.qualityRecovery?.attempts.map(attempt => attempt.phase_name)).toEqual([
        'stage_6_simple',
        'stage_6_simple',
        'stage_6_normal',
      ]);
      expect(savedResult.qualityRecovery?.attempts.map(attempt => attempt.outcome)).toEqual([
        'quality_retryable',
        'quality_retryable',
        'accepted',
      ]);
    });

    it('walks simple -> normal -> complex -> auto_last_chance before final review_required', async () => {
      mockSelectStage6ModelTier.mockResolvedValue({
        model: 'tier-simple-model',
        fallback: 'tier-simple-fallback',
        tier: 'simple' as const,
        reason: 'beginner lesson',
      });
      mockExecuteStage6Orchestrator
        .mockResolvedValueOnce(createReviewOutput('simple first fail'))
        .mockResolvedValueOnce(createReviewOutput('simple second fail'))
        .mockResolvedValueOnce(createReviewOutput('normal fail'))
        .mockResolvedValueOnce(createReviewOutput('complex fail'))
        .mockResolvedValueOnce(createReviewOutput('auto last chance fail'));

      const result = await processStage6Job(createMockJob());

      expect(result.success).toBe(true);
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(5);
      expect(mockExecuteStage6Orchestrator.mock.calls.map(call => call[0].modelOverride)).toEqual([
        'stage_6_simple-primary',
        'stage_6_simple-primary',
        'stage_6_normal-primary',
        'stage_6_complex-primary',
        'stage_6_auto_last_chance-primary',
      ]);
      expect(mockHandlePartialSuccess).toHaveBeenCalledTimes(1);
      expect(mockMarkForReview).not.toHaveBeenCalled();
      const finalReviewResult = vi.mocked(mockHandlePartialSuccess).mock.calls[0][4];
      expect(finalReviewResult.qualityRecovery?.final_disposition).toEqual({
        outcome: 'review_required',
        terminal_phase_name: 'stage_6_auto_last_chance',
        terminal_mode: 'automatic',
        human_review_required: true,
      });
      expect(
        finalReviewResult.qualityRecovery?.attempts.map(attempt => attempt.phase_name)
      ).toEqual([
        'stage_6_simple',
        'stage_6_simple',
        'stage_6_normal',
        'stage_6_complex',
        'stage_6_auto_last_chance',
      ]);
    });

    it('keeps LessonSpecification mismatch exhaustion quality-retryable across the automatic ladder', async () => {
      mockSelectStage6ModelTier.mockResolvedValue({
        model: 'tier-simple-model',
        fallback: 'tier-simple-fallback',
        tier: 'simple' as const,
        reason: 'beginner lesson',
      });
      mockExecuteStage6Orchestrator
        .mockResolvedValueOnce(createFailOutput([LESSON_SPEC_MISMATCH_MESSAGE]))
        .mockResolvedValueOnce(createFailOutput([LESSON_SPEC_MISMATCH_MESSAGE]))
        .mockResolvedValueOnce(createFailOutput([LESSON_SPEC_MISMATCH_MESSAGE]))
        .mockResolvedValueOnce(createFailOutput([LESSON_SPEC_MISMATCH_MESSAGE]))
        .mockResolvedValueOnce(createSuccessOutput());

      const result = await processStage6Job(createMockJob());

      expect(result.success).toBe(true);
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(5);
      expect(mockExecuteStage6Orchestrator.mock.calls.map(call => call[0].modelOverride)).toEqual([
        'stage_6_simple-primary',
        'stage_6_simple-primary',
        'stage_6_normal-primary',
        'stage_6_complex-primary',
        'stage_6_auto_last_chance-primary',
      ]);
      expect(mockHandlePartialSuccess).not.toHaveBeenCalled();
      expect(mockMarkForReview).not.toHaveBeenCalled();

      const savedResult = vi.mocked(mockSaveLessonContent).mock.calls[0][2];
      expect(savedResult.qualityRecovery?.attempts.map(attempt => attempt.phase_name)).toEqual([
        'stage_6_simple',
        'stage_6_simple',
        'stage_6_normal',
        'stage_6_complex',
        'stage_6_auto_last_chance',
      ]);
      expect(savedResult.qualityRecovery?.attempts.map(attempt => attempt.outcome)).toEqual([
        'quality_retryable',
        'quality_retryable',
        'quality_retryable',
        'quality_retryable',
        'accepted',
      ]);
    });

    it('uses provider fallback inside the rung before quality promotion', async () => {
      mockSelectStage6ModelTier.mockResolvedValue({
        model: 'tier-simple-model',
        fallback: 'tier-simple-fallback',
        tier: 'simple' as const,
        reason: 'beginner lesson',
      });
      mockExecuteStage6Orchestrator
        .mockResolvedValueOnce(createFailOutput(['provider timeout']))
        .mockResolvedValueOnce(createFailOutput(['provider timeout']))
        .mockResolvedValueOnce(createReviewOutput('fallback still low quality'))
        .mockResolvedValueOnce(createSuccessOutput());

      const resultPromise = processStage6Job(createMockJob());
      await vi.advanceTimersByTimeAsync(5000);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(4);
      expect(mockExecuteStage6Orchestrator.mock.calls[0][0]).toMatchObject({
        modelOverride: 'stage_6_simple-primary',
      });
      expect(mockExecuteStage6Orchestrator.mock.calls[1][0]).toMatchObject({
        modelOverride: 'stage_6_simple-primary',
      });
      expect(mockExecuteStage6Orchestrator.mock.calls[2][0]).toMatchObject({
        modelOverride: 'stage_6_simple-fallback',
      });
      expect(mockExecuteStage6Orchestrator.mock.calls[3][0]).toMatchObject({
        modelOverride: 'stage_6_simple-primary',
      });
      expect(mockGetModelForPhase.mock.calls.map(call => call[0])).not.toContain('stage_6_normal');
    });

    it('stores intermediate rung failures only in ladder history when a later rung succeeds', async () => {
      mockSelectStage6ModelTier.mockResolvedValue({
        model: 'tier-simple-model',
        fallback: 'tier-simple-fallback',
        tier: 'simple' as const,
        reason: 'beginner lesson',
      });
      mockExecuteStage6Orchestrator
        .mockResolvedValueOnce(createReviewOutput('simple first fail'))
        .mockResolvedValueOnce(createReviewOutput('simple second fail'))
        .mockResolvedValueOnce(createSuccessOutput());

      await processStage6Job(createMockJob());

      expect(mockHandlePartialSuccess).not.toHaveBeenCalled();
      expect(mockMarkForReview).not.toHaveBeenCalled();
      expect(mockSaveLessonContent).toHaveBeenCalledTimes(1);
      const savedResult = vi.mocked(mockSaveLessonContent).mock.calls[0][2];
      expect(savedResult.qualityRecovery?.attempts).toHaveLength(3);
      expect(savedResult.qualityRecovery?.final_disposition).toBeUndefined();
      expect(savedResult.qualityRecovery?.attempts[0].outcome).toBe('quality_retryable');
    });

    it('starts manual top regeneration directly on stage_6_manual_regeneration', async () => {
      mockGetModelForPhase.mockImplementation((phaseName: string) => {
        if (phaseName === 'stage_6_manual_regeneration') {
          return {
            modelId: 'openai/gpt-5.4',
            fallbackModelId: 'z-ai/glm-5',
            source: 'database',
          };
        }

        return {
          modelId: `${phaseName}-primary`,
          fallbackModelId: `${phaseName}-fallback`,
          source: 'database',
        };
      });
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(createSuccessOutput());

      const job = createMockJob({
        executionPolicy: {
          mode: 'manual_top_regeneration',
        },
      });
      const result = await processStage6Job(job);

      expect(result.success).toBe(true);
      expect(mockSelectStage6ModelTier).not.toHaveBeenCalled();
      expect(mockGetModelForPhase).toHaveBeenCalledTimes(1);
      expect(mockGetModelForPhase).toHaveBeenCalledWith(
        'stage_6_manual_regeneration',
        'course-uuid',
        undefined,
        'en'
      );
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalledTimes(1);
      expect(mockExecuteStage6Orchestrator.mock.calls[0][0]).toMatchObject({
        modelOverride: 'openai/gpt-5.4',
        selectedModel: 'openai/gpt-5.4',
        fallbackModel: 'z-ai/glm-5',
        selectedModelTier: null,
      });
      const calledPhases = mockGetModelForPhase.mock.calls.map(call => call[0]);
      expect(calledPhases).not.toContain('stage_6_simple');
      expect(calledPhases).not.toContain('stage_6_normal');
      expect(calledPhases).not.toContain('stage_6_complex');
    });

    it('should continue without RAG context if retrieval fails', async () => {
      mockRetrieveLessonContext.mockRejectedValueOnce(new Error('Qdrant unavailable'));
      mockExecuteStage6Orchestrator.mockResolvedValueOnce(createSuccessOutput());

      const job = createMockJob();
      const resultPromise = processStage6Job(job);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;

      // Should still succeed, generation proceeds without RAG
      expect(result.success).toBe(true);
    });

    it('fails the course instead of review-marking the lesson when required RAG becomes unavailable', async () => {
      const { RequiredRagUnavailableError } = await import('@/shared/rag/document-availability');

      mockRetrieveLessonContext.mockRejectedValueOnce(
        new RequiredRagUnavailableError('course-uuid', 'qdrant_timeout')
      );

      const resultPromise = processStage6Job(createMockJob());
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('RAG is required for this course');
      expect(mockFailStage6Course).toHaveBeenCalledWith(
        'course-uuid',
        expect.stringContaining('RAG is required for this course')
      );
      expect(mockMarkForReview).not.toHaveBeenCalled();
      expect(mockHandlePartialSuccess).not.toHaveBeenCalled();
      expect(mockExecuteStage6Orchestrator).not.toHaveBeenCalled();
    });

    it('should return failure result when all retries fail', async () => {
      mockExecuteStage6Orchestrator.mockRejectedValue(new Error('All models exhausted'));

      const job = createMockJob();
      const resultPromise = processStage6Job(job);
      // Advance past all sleep/retry delays
      await vi.advanceTimersByTimeAsync(30000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('All models exhausted');
      expect(result.lessonContent).toBeNull();
    });
  });
});
