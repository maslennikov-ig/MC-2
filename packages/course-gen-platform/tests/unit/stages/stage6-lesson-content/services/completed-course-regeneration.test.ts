/**
 * Regression tests for completed-course Stage 6 regeneration.
 *
 * Covers:
 * 1. completed course + partialGenerate produces a real Stage 6 run
 * 2. no-op precondition path throws UnrecoverableError (not silent "completed")
 * 3. existing in-flight Stage 6 completion checks still work for normal generation
 * 4. isStage6CourseActive allows remediation contexts on completed courses
 * 5. shouldSkipCompletionCheckForPartialGeneration covers 'completed' status
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';

// ============================================================================
// MOCKS — hoisted before imports
// ============================================================================
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
  mockLoadStage6EvidenceForCourse,
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
  mockLoadStage6EvidenceForCourse: vi.fn(),
}));

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

vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/database/lesson-resolver', () => ({
  resolveLessonUuid: vi.fn().mockResolvedValue('lesson-uuid-123'),
}));

vi.mock('@/shared/pause-check', () => ({
  checkPauseAndDelay: vi.fn().mockResolvedValue(undefined),
  isCoursePaused: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/stages/stage6-lesson-content/orchestrator', () => ({
  executeStage6: mockExecuteStage6Orchestrator,
}));

vi.mock('@/stages/stage6-lesson-content/utils/lesson-rag-retriever', () => ({
  retrieveLessonContext: mockRetrieveLessonContext,
  extractSourceDocuments: mockExtractSourceDocuments,
}));

vi.mock('@/stages/stage6-lesson-content/rag/evidence-loader', () => ({
  loadStage6EvidenceForCourse: mockLoadStage6EvidenceForCourse,
}));

vi.mock('@/stages/stage6-lesson-content/utils/sanity-check', () => ({
  quickSanityCheck: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock('@/stages/stage6-lesson-content/services/database-service', () => ({
  handlePartialSuccess: mockHandlePartialSuccess,
  markForReview: mockMarkForReview,
  failStage6Course: mockFailStage6Course,
  isStage6CourseActive: mockIsStage6CourseActive,
  saveLessonContent: mockSaveLessonContent,
  saveSourceDocuments: mockSaveSourceDocuments,
  checkAndSetStage6Complete: mockCheckAndSetStage6Complete,
}));

vi.mock('@/stages/stage6-lesson-content/services/content-utils', () => ({
  extractContentMarkdown: vi.fn().mockReturnValue('# Mock Markdown'),
}));

vi.mock('@/stages/stage6-lesson-content/nodes/generator/model-selector', () => ({
  selectStage6ModelTier: mockSelectStage6ModelTier,
}));

vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: vi.fn(() => ({
    getModelForPhase: mockGetModelForPhase,
  })),
}));

import { processStage6Job } from '@/stages/stage6-lesson-content/services/job-processor';
import { shouldSkipCompletionCheckForPartialGeneration } from '@/server/routers/lesson-content/helpers';
import { buildPartialGenerateJobData } from '@/server/routers/lesson-content/helpers/build-partial-generate-job-data';
import type { Stage6JobInput, Stage6JobResult } from '@/stages/stage6-lesson-content/types';
import type { Job } from 'bullmq';

// ============================================================================
// HELPERS
// ============================================================================

function createMockJob(
  overrides: Partial<Stage6JobInput> = {}
): Job<Stage6JobInput, Stage6JobResult> {
  const defaultInput: Stage6JobInput = {
    lessonSpec: {
      lesson_id: '1.1',
      title: 'Test Lesson',
      description: 'A test lesson',
      sections: [
        {
          title: 'Section 1',
          content_archetype: 'conceptual_explanation',
          rag_context_id: '1',
          constraints: { depth: 'standard', required_keywords: [], prohibited_terms: [] },
          key_points_to_cover: ['Point 1'],
        },
      ],
      learning_objectives: [
        { id: 'LO-1', objective: 'Learn something', bloom_level: 'understand' },
      ],
      metadata: {
        target_audience: 'professional',
        tone: 'professional',
        compliance_level: 'standard',
        content_archetype: 'conceptual_explanation',
      },
      intro_blueprint: {
        hook_strategy: 'question',
        hook_topic: 'Test',
        key_learning_objectives: 'Learn something',
      },
      exercises: [],
      rag_context: { primary_documents: [], search_queries: ['test'], expected_chunks: 5 },
      estimated_duration_minutes: 15,
      difficulty_level: 'intermediate',
    },
    courseId: 'course-123',
    language: 'en',
    ...overrides,
  };

  return {
    id: 'job-1',
    data: defaultInput,
    attemptsMade: 0,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<Stage6JobInput, Stage6JobResult>;
}

function createSuccessOrchestratorResult() {
  return {
    lessonContent: {
      content: { sections: [{ title: 'S', body: 'B' }] },
      metadata: { qa_signals: undefined },
    },
    success: true,
    errors: [],
    metrics: {
      tokensUsed: 100,
      durationMs: 500,
      modelUsed: 'test-model',
      selectedModel: 'test-model',
      fallbackModel: 'fallback-model',
      selectedModelTier: 'normal',
      selectedModelTierReason: 'test',
      selectedModelPhase: 'stage_6_normal',
      selectedModelSource: 'config',
      qualityScore: 0.8,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      regenerationMode: null,
      attemptLadder: [],
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Completed-course Stage 6 regeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRetrieveLessonContext.mockResolvedValue({
      chunks: [],
      lessonId: '1.1',
      cached: false,
      coverageScore: 0,
      retrievalDurationMs: 10,
    });
    mockExtractSourceDocuments.mockReturnValue([]);
    mockLoadStage6EvidenceForCourse.mockResolvedValue({
      organizationId: 'organization-1',
      evidenceContext: undefined,
    });

    mockSelectStage6ModelTier.mockResolvedValue({
      tier: 'normal',
      reason: 'test-tier',
      model: 'test-model',
      fallback: 'fallback-model',
    });

    mockGetModelForPhase.mockResolvedValue({
      modelId: 'test-model',
      fallbackModelId: 'fallback-model',
      source: 'config',
    });
  });

  describe('isStage6CourseActive with executionContext', () => {
    it('rejects full_generation when course is completed', async () => {
      mockIsStage6CourseActive.mockResolvedValue(false);

      const job = createMockJob({ executionContext: 'full_generation' });

      await expect(processStage6Job(job)).rejects.toThrow(UnrecoverableError);
      expect(mockIsStage6CourseActive).toHaveBeenCalledWith('course-123', 'full_generation');
    });

    it('passes executionContext=partial_regeneration to isStage6CourseActive', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({ executionContext: 'partial_regeneration' });
      await processStage6Job(job);

      expect(mockIsStage6CourseActive).toHaveBeenCalledWith('course-123', 'partial_regeneration');
    });

    it('defaults executionContext to full_generation when not set', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({});
      // Ensure executionContext is not set
      delete job.data.executionContext;

      await processStage6Job(job);

      expect(mockIsStage6CourseActive).toHaveBeenCalledWith('course-123', 'full_generation');
    });
  });

  describe('no-op precondition throws UnrecoverableError', () => {
    it('throws UnrecoverableError when course is not active (not silent return)', async () => {
      mockIsStage6CourseActive.mockResolvedValue(false);

      const job = createMockJob({ executionContext: 'full_generation' });

      // Must throw UnrecoverableError — BullMQ will mark this as "failed", not "completed"
      await expect(processStage6Job(job)).rejects.toThrow(UnrecoverableError);
      await expect(processStage6Job(job)).rejects.toThrow(/no longer active/);
    });

    it('does NOT call saveLessonContent or orchestrator when precondition fails', async () => {
      mockIsStage6CourseActive.mockResolvedValue(false);

      const job = createMockJob();

      try {
        await processStage6Job(job);
      } catch {
        // expected
      }

      expect(mockExecuteStage6Orchestrator).not.toHaveBeenCalled();
      expect(mockSaveLessonContent).not.toHaveBeenCalled();
    });
  });

  describe('partial_regeneration on completed course produces real run', () => {
    it('processes job successfully with partial_regeneration context', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({
        executionContext: 'partial_regeneration',
        skipCompletionCheck: true,
      });

      const result = await processStage6Job(job);

      expect(result.success).toBe(true);
      expect(result.lessonContent).not.toBeNull();
      expect(mockSaveLessonContent).toHaveBeenCalled();
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalled();
    });

    it('processes job successfully with manual_regeneration context', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({
        executionContext: 'manual_regeneration',
        executionPolicy: { mode: 'manual_top_regeneration' },
        skipCompletionCheck: true,
      });

      const result = await processStage6Job(job);

      expect(result.success).toBe(true);
      expect(mockExecuteStage6Orchestrator).toHaveBeenCalled();
    });

    it('processes job successfully with generate_missing context', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({
        executionContext: 'generate_missing',
        skipCompletionCheck: true,
      });

      const result = await processStage6Job(job);

      expect(result.success).toBe(true);
    });
  });

  describe('existing in-flight Stage 6 completion checks still work', () => {
    it('runs completion check for full_generation jobs', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({
        executionContext: 'full_generation',
        skipCompletionCheck: false,
      });

      await processStage6Job(job);

      // checkAndSetStage6Complete is called asynchronously via runCompletionCheck
      // Wait a tick to allow the async call to be scheduled
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockCheckAndSetStage6Complete).toHaveBeenCalledWith('course-123');
    });

    it('skips completion check when skipCompletionCheck is true', async () => {
      mockIsStage6CourseActive.mockResolvedValue(true);
      mockExecuteStage6Orchestrator.mockResolvedValue(createSuccessOrchestratorResult());

      const job = createMockJob({
        executionContext: 'partial_regeneration',
        skipCompletionCheck: true,
      });

      await processStage6Job(job);

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(mockCheckAndSetStage6Complete).not.toHaveBeenCalled();
    });
  });
});

describe('shouldSkipCompletionCheckForPartialGeneration', () => {
  it('returns true for stage_6_complete', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration('stage_6_complete')).toBe(true);
  });

  it('returns true for completed (finalized course)', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration('completed')).toBe(true);
  });

  it('returns false for stage_6_generating', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration('stage_6_generating')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(shouldSkipCompletionCheckForPartialGeneration(null)).toBe(false);
    expect(shouldSkipCompletionCheckForPartialGeneration(undefined)).toBe(false);
  });
});

describe('buildPartialGenerateJobData executionContext', () => {
  it('sets partial_regeneration context by default', () => {
    const result = buildPartialGenerateJobData({
      spec: { lesson_id: '1.1' } as never,
      courseId: 'c-1',
      language: 'en',
      skipCompletionCheck: true,
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result.executionContext).toBe('partial_regeneration');
  });

  it('sets manual_regeneration context when manualTopRegeneration is true', () => {
    const result = buildPartialGenerateJobData({
      spec: { lesson_id: '1.1' } as never,
      courseId: 'c-1',
      language: 'en',
      skipCompletionCheck: true,
      organizationId: 'org-1',
      userId: 'user-1',
      manualTopRegeneration: true,
    });

    expect(result.executionContext).toBe('manual_regeneration');
  });

  it('respects explicit executionContext override', () => {
    const result = buildPartialGenerateJobData({
      spec: { lesson_id: '1.1' } as never,
      courseId: 'c-1',
      language: 'en',
      skipCompletionCheck: true,
      organizationId: 'org-1',
      userId: 'user-1',
      executionContext: 'generate_missing',
    });

    expect(result.executionContext).toBe('generate_missing');
  });
});
