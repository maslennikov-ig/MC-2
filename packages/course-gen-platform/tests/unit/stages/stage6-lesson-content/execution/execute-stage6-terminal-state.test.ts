/**
 * Tests for terminal state detection in executeStage6.
 *
 * Verifies that when LangGraph conditional edges set review_required
 * via direct state mutation (which bypasses the channel/reducer system),
 * executeStage6 still detects the terminal condition from graph output
 * signals (retryCount, truncationCount, errors) and returns correct
 * reviewInfo + success=true so the job processor persists a terminal row.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HANDLER_CONFIG } from '@/stages/stage6-lesson-content/config';

// Mock the graph module
const mockInvoke = vi.fn();
vi.mock('@/stages/stage6-lesson-content/graph', () => ({
  getGraph: () => ({
    invoke: mockInvoke,
  }),
  resetGraph: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const logger = {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger, default: logger };
});

import { executeStage6 } from '@/stages/stage6-lesson-content/execution/execute-stage6';
import type { Stage6Input } from '@/stages/stage6-lesson-content/types';

const baseInput: Stage6Input = {
  lessonSpec: {
    lesson_id: '1.2',
    title: 'Test lesson',
    sections: [],
    learning_objectives: [],
    metadata: {
      target_audience: 'students',
      tone: 'educational',
      content_archetype: 'concept_explainer',
    },
    difficulty_level: 'intermediate',
    estimated_duration_minutes: 10,
    intro_blueprint: { hook_strategy: 'challenge', hook_topic: 'Test' },
    description: 'Test description',
  } as Stage6Input['lessonSpec'],
  courseId: 'course-1',
  language: 'ru',
  ragChunks: [],
};

describe('executeStage6 terminal state detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects review_required when retryCount >= MAX and needsHumanReview was lost in LangGraph channels', async () => {
    // Simulate what LangGraph returns when conditional edge mutations are lost:
    // - retryCount was incremented by self-reviewer node (goes through reducer) ✓
    // - errors were pushed in conditional edge (array mutation persists) ✓
    // - needsHumanReview was set in conditional edge (property assignment lost) ✗
    // - reviewInfo was set in conditional edge (property assignment lost) ✗
    mockInvoke.mockResolvedValueOnce({
      lessonSpec: baseInput.lessonSpec,
      courseId: baseInput.courseId,
      lessonContent: null, // judge never ran
      generatedContent: null,
      needsHumanReview: false, // LOST — should have been true
      reviewInfo: null, // LOST — should have been set
      needsRegeneration: false,
      retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES, // at cap
      regenerateCount: 0,
      truncationCount: 0,
      errors: ['Self-review regeneration retries exceeded (2). Last status: REGENERATE.'],
      tokensUsed: 3000,
      modelUsed: 'qwen/qwen3.5-plus-02-15',
      qualityScore: null,
      currentNode: 'selfReviewer',
    });

    const result = await executeStage6(baseInput);

    // CRITICAL: must be success=true with reviewInfo so job processor persists terminal row
    expect(result.success).toBe(true);
    expect(result.reviewInfo).toBeDefined();
    expect(result.reviewInfo?.needsReview).toBe(true);
    expect(result.reviewInfo!.reasons.length).toBeGreaterThan(0);
  });

  it('detects review_required when truncationCount > MAX and needsHumanReview was lost', async () => {
    mockInvoke.mockResolvedValueOnce({
      lessonSpec: baseInput.lessonSpec,
      courseId: baseInput.courseId,
      lessonContent: null,
      generatedContent: null,
      needsHumanReview: false, // LOST
      reviewInfo: null, // LOST
      needsRegeneration: false,
      retryCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
      regenerateCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
      truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1, // past cap
      errors: [
        'Truncation continuation attempts exceeded (2). Marked as review_required (fail-open).',
      ],
      tokensUsed: 5000,
      modelUsed: 'qwen/qwen3.5-plus-02-15',
      qualityScore: null,
      currentNode: 'selfReviewer',
    });

    const result = await executeStage6(baseInput);

    expect(result.success).toBe(true);
    expect(result.reviewInfo).toBeDefined();
    expect(result.reviewInfo?.needsReview).toBe(true);
  });

  it('does NOT flag review when retryCount is below MAX (normal in-progress retry)', async () => {
    mockInvoke.mockResolvedValueOnce({
      lessonSpec: baseInput.lessonSpec,
      courseId: baseInput.courseId,
      lessonContent: null,
      generatedContent: null,
      needsHumanReview: false,
      reviewInfo: null,
      needsRegeneration: false,
      retryCount: 0, // no retries yet
      regenerateCount: 0,
      truncationCount: 0,
      errors: ['Generator failed: some transient error'],
      tokensUsed: 0,
      modelUsed: null,
      qualityScore: null,
      currentNode: 'generator',
    });

    const result = await executeStage6(baseInput);

    expect(result.success).toBe(false);
    expect(result.reviewInfo).toBeUndefined();
  });

  it('preserves existing reviewInfo when graph correctly set it', async () => {
    const existingReviewInfo = {
      needsReview: true,
      reasons: ['Max regeneration retries exceeded'],
    };

    mockInvoke.mockResolvedValueOnce({
      lessonSpec: baseInput.lessonSpec,
      courseId: baseInput.courseId,
      lessonContent: null,
      generatedContent: null,
      needsHumanReview: true,
      reviewInfo: existingReviewInfo,
      needsRegeneration: false,
      retryCount: 2,
      regenerateCount: 0,
      truncationCount: 0,
      errors: [],
      tokensUsed: 3000,
      modelUsed: 'test-model',
      qualityScore: null,
      currentNode: 'selfReviewer',
    });

    const result = await executeStage6(baseInput);

    expect(result.success).toBe(true);
    expect(result.reviewInfo).toEqual(existingReviewInfo);
  });

  it('detects review_required when sectionsToRegenerate exceeds MAX and needsHumanReview was lost', async () => {
    // Section-cap exceeded: self-reviewer found too many sections to regenerate.
    // The node should set terminal state, but if it's lost in LangGraph channels,
    // the safety net must catch it via selfReviewResult.sectionsToRegenerate.
    mockInvoke.mockResolvedValueOnce({
      lessonSpec: baseInput.lessonSpec,
      courseId: baseInput.courseId,
      lessonContent: null,
      generatedContent: 'some markdown content',
      needsHumanReview: false, // LOST
      reviewInfo: null, // LOST
      needsRegeneration: false,
      retryCount: 0,
      regenerateCount: 0,
      truncationCount: 0,
      selfReviewResult: {
        status: 'PASS_WITH_FLAGS',
        reasoning: 'Too many sections need regeneration',
        issues: [],
        patchedContent: null,
        tokensUsed: 500,
        durationMs: 100,
        heuristicsPassed: true,
        sectionsToRegenerate: ['section_1', 'section_2', 'section_3', 'section_4'],
      },
      errors: ['Section regeneration request exceeds cap (3). Requested 4 sections, skipped 1.'],
      tokensUsed: 500,
      modelUsed: 'test-model',
      qualityScore: null,
      currentNode: 'selfReviewer',
    });

    const result = await executeStage6(baseInput);

    expect(result.success).toBe(true);
    expect(result.reviewInfo).toBeDefined();
    expect(result.reviewInfo?.needsReview).toBe(true);
  });

  describe('safety net preserves node-authored reviewInfo (BLOCKER 1 regression)', () => {
    it('does NOT overwrite specific terminal reason with generic one', async () => {
      // Scenario: node correctly set reviewInfo with specific reason.
      // retryCount is at MAX (would trigger safety net), but since node
      // already set needsHumanReview, safety net must NOT re-fire.
      const nodeAuthoredReason =
        'Truncation continuation attempts exceeded (2). Marked as review_required (fail-open).';

      mockInvoke.mockResolvedValueOnce({
        lessonSpec: baseInput.lessonSpec,
        courseId: baseInput.courseId,
        lessonContent: null,
        generatedContent: null,
        needsHumanReview: true,
        reviewInfo: { needsReview: true, reasons: [nodeAuthoredReason] },
        needsRegeneration: false,
        retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES, // hits safety-net cap
        regenerateCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
        truncationCount: HANDLER_CONFIG.MAX_TRUNCATION_CONTINUATION_ATTEMPTS + 1,
        errors: [nodeAuthoredReason],
        tokensUsed: 3000,
        modelUsed: 'test-model',
        qualityScore: null,
        currentNode: 'selfReviewer',
      });

      const result = await executeStage6(baseInput);

      // Node's specific terminal reason MUST survive — no generic overwrite
      expect(result.reviewInfo?.reasons).toEqual([nodeAuthoredReason]);
      expect(result.reviewInfo?.reasons[0]).toContain('Truncation continuation attempts exceeded');
      expect(result.reviewInfo?.reasons[0]).not.toContain('Generation retries exhausted');
    });

    it('uses safety-net generic reason only when node did not set reviewInfo', async () => {
      mockInvoke.mockResolvedValueOnce({
        lessonSpec: baseInput.lessonSpec,
        courseId: baseInput.courseId,
        lessonContent: null,
        generatedContent: null,
        needsHumanReview: false, // node failed to set
        reviewInfo: null, // node failed to set
        needsRegeneration: false,
        retryCount: HANDLER_CONFIG.MAX_REGENERATION_RETRIES,
        regenerateCount: 0,
        truncationCount: 0,
        errors: [], // no prior reasons
        tokensUsed: 3000,
        modelUsed: 'test-model',
        qualityScore: null,
        currentNode: 'selfReviewer',
      });

      const result = await executeStage6(baseInput);

      expect(result.reviewInfo?.needsReview).toBe(true);
      // Falls back to generic when no specific reason available
      expect(result.reviewInfo?.reasons[0]).toContain('Generation retries exhausted');
    });
  });
});
