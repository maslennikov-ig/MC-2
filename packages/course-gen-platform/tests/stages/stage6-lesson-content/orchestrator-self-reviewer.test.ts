/**
 * Integration Tests for Self-Reviewer Orchestrator Routing
 * @module stages/stage6-lesson-content/orchestrator-self-reviewer.test
 *
 * Tests the conditional edge routing from selfReviewer node to either:
 * - 'judge': Content passed or needs judge attention (PASS, PASS_WITH_FLAGS, FIXED, FLAG_TO_JUDGE)
 * - 'sectionRegenerator': Specific sections need regeneration (sectionsToRegenerate populated)
 * - 'generator': Content needs regeneration (REGENERATE status)
 *
 * This tests the shouldProceedToJudge routing function from orchestrator.ts
 * which implements Fail-Fast architecture to reduce Judge token costs.
 *
 * Test coverage:
 * - REGENERATE → planner routing
 * - sectionsToRegenerate → sectionRegenerator routing
 * - PASS → judge routing
 * - PASS_WITH_FLAGS → judge routing
 * - FIXED → judge routing (if implemented)
 * - FLAG_TO_JUDGE → judge routing (if implemented)
 * - No selfReviewResult → judge routing (backward compatibility)
 * - Max retries handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LessonGraphStateType } from '../../../src/stages/stage6-lesson-content/state.js';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { SelfReviewResult } from '@megacampus/shared-types/judge-types';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger to avoid console noise during tests
vi.mock('@/shared/logger', () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock trace logger
vi.mock('@/shared/trace-logger', () => ({
  logTrace: vi.fn(),
}));

// ============================================================================
// IMPORT AFTER MOCKS
// ============================================================================

// Import routing function from orchestrator (exported for testing)
import { shouldProceedToJudge } from '../../../src/stages/stage6-lesson-content/orchestrator.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create minimal valid lesson specification
 */
function createMockLessonSpec(overrides: Partial<LessonSpecificationV2> = {}): LessonSpecificationV2 {
  return {
    lesson_id: 'test-lesson-1',
    title: 'Test Lesson Title',
    learning_objectives: [
      {
        id: 'obj_1',
        objective: 'Understand the basics of TypeScript',
        level: 'Remember',
      },
    ],
    sections: [
      {
        id: 'sec_intro',
        title: 'Introduction',
        type: 'lecture',
        required: true,
        constraints: {},
      },
    ],
    metadata: {
      lesson_duration_minutes: 30,
      difficulty_level: 'beginner',
      prerequisites: [],
      key_concepts: ['TypeScript', 'Types'],
      content_archetype: 'conceptual',
      tone: 'professional',
    },
    rag_context: {
      required: false,
      priority: 0,
    },
    ...overrides,
  } as LessonSpecificationV2;
}

/**
 * Create minimal valid state for testing
 */
function createMockState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lessonSpec: createMockLessonSpec(),
    courseId: 'course-123',
    language: 'ru',
    lessonUuid: null,
    ragChunks: [],
    ragContextId: null,
    userRefinementPrompt: null,
    modelOverride: null,
    generatedContent: 'Test content',
    sectionProgress: 0,
    selfReviewResult: null,
    sectionRegenerationResult: null,
    progressSummary: null,
    lessonContent: null,
    currentNode: 'selfReviewer',
    errors: [],
    retryCount: 0,
    modelUsed: null,
    tokensUsed: 0,
    durationMs: 0,
    totalCostUsd: 0,
    nodeCosts: [],
    temperature: 0.7,
    qualityScore: null,
    judgeVerdict: null,
    judgeRecommendation: null,
    needsRegeneration: false,
    needsHumanReview: false,
    previousScores: [],
    refinementIterationCount: 0,
    targetedRefinementMode: 'full-auto',
    arbiterOutput: null,
    targetedRefinementStatus: null,
    lockedSections: [],
    sectionEditCount: {},
    targetedRefinementTokensUsed: 0,
    ...overrides,
  } as LessonGraphStateType;
}

/**
 * Create mock SelfReviewResult
 */
function createMockSelfReviewResult(
  status: 'PASS' | 'PASS_WITH_FLAGS' | 'REGENERATE' | 'FIXED' | 'FLAG_TO_JUDGE',
  overrides: Partial<SelfReviewResult> = {}
): SelfReviewResult {
  return {
    status,
    heuristicsPassed: status !== 'REGENERATE',
    issues: [],
    reasoning: `Content ${status.toLowerCase()}`,
    patchedContent: null,
    durationMs: 100,
    tokensUsed: 0,
    heuristicDetails: {
      languageCheck: {
        passed: true,
        foreignCharacters: 0,
        scriptsFound: ['Cyrillic'],
      },
      truncationCheck: {
        passed: true,
        issues: [],
      },
    },
    ...overrides,
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Self-Reviewer Orchestrator Routing', () => {
  describe('shouldProceedToJudge - REGENERATE status', () => {
    it('should route to planner when status is REGENERATE', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE', {
          heuristicsPassed: false,
          issues: [
            {
              type: 'TRUNCATION',
              severity: 'CRITICAL',
              description: 'Content is severely truncated',
              location: 'end',
            },
          ],
          reasoning: 'Fatal errors detected: severely truncated content',
        }),
        retryCount: 0,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator');
    });

    it('should route to planner when REGENERATE with language issues', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE', {
          heuristicsPassed: false,
          issues: [
            {
              type: 'LANGUAGE',
              severity: 'CRITICAL',
              description: 'Content contains >20 foreign characters',
              location: 'global',
            },
          ],
          reasoning: 'Fatal errors detected: language mixing (50+ foreign chars)',
        }),
        retryCount: 1,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator');
    });

    it('should route to __end__ when REGENERATE but max retries exceeded', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE', {
          heuristicsPassed: false,
          issues: [
            {
              type: 'EMPTY',
              severity: 'CRITICAL',
              description: 'No content available',
              location: 'global',
            },
          ],
        }),
        retryCount: 2, // MAX_REGENERATION_RETRIES = 2
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('__end__');
    });

    it('should route to planner when REGENERATE at retry limit minus 1', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE'),
        retryCount: 1, // One retry left (MAX_REGENERATION_RETRIES = 2)
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator');
    });
  });

  describe('shouldProceedToJudge - Section Regeneration', () => {
    it('should route to sectionRegenerator when sectionsToRegenerate is populated', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          heuristicsPassed: true,
          sectionsToRegenerate: ['introduction', 'section_2'],
          issues: [
            {
              type: 'TRUNCATION',
              severity: 'INFO',
              description: 'Section introduction needs regeneration',
              location: 'introduction',
            },
            {
              type: 'TRUNCATION',
              severity: 'INFO',
              description: 'Section section_2 needs regeneration',
              location: 'section_2',
            },
          ],
          reasoning: 'Specific sections need regeneration',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('sectionRegenerator');
    });

    it('should route to sectionRegenerator with single section', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          heuristicsPassed: true,
          sectionsToRegenerate: ['conclusion'],
          issues: [
            {
              type: 'TRUNCATION',
              severity: 'INFO',
              description: 'Conclusion section is incomplete',
              location: 'conclusion',
            },
          ],
          reasoning: 'Conclusion section needs regeneration',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('sectionRegenerator');
    });

    it('should route to judge when sectionsToRegenerate is empty array', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS', {
          heuristicsPassed: true,
          sectionsToRegenerate: [],
          issues: [],
          reasoning: 'Content passed all checks',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should prioritize REGENERATE over sectionsToRegenerate', () => {
      // If status is REGENERATE, full regeneration takes priority
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE', {
          heuristicsPassed: false,
          sectionsToRegenerate: ['section_1'], // This should be ignored
          issues: [
            {
              type: 'EMPTY',
              severity: 'CRITICAL',
              description: 'No content available',
              location: 'global',
            },
          ],
          reasoning: 'Fatal errors require full regeneration',
        }),
        retryCount: 0,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator'); // Should route to generator, not sectionRegenerator
    });
  });

  describe('shouldProceedToJudge - PASS status', () => {
    it('should route to judge when status is PASS', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS', {
          heuristicsPassed: true,
          issues: [],
          reasoning: 'Content passed all heuristic pre-checks',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to judge when PASS with zero issues', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS', {
          heuristicsPassed: true,
          issues: [],
          heuristicDetails: {
            languageCheck: {
              passed: true,
              foreignCharacters: 0,
              scriptsFound: ['Cyrillic'],
            },
            truncationCheck: {
              passed: true,
              issues: [],
            },
          },
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to judge when PASS regardless of retry count', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS'),
        retryCount: 2,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });
  });

  describe('shouldProceedToJudge - PASS_WITH_FLAGS status', () => {
    it('should route to judge when status is PASS_WITH_FLAGS', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          heuristicsPassed: true,
          issues: [
            {
              type: 'LANGUAGE',
              severity: 'INFO',
              description: 'Minor language observations (1-5 foreign chars)',
              location: 'section_1',
            },
          ],
          reasoning: 'Content passed heuristics with minor observations',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to judge when PASS_WITH_FLAGS has multiple INFO issues', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          heuristicsPassed: true,
          issues: [
            {
              type: 'LANGUAGE',
              severity: 'INFO',
              description: 'Found 3 foreign characters',
              location: 'section_2',
            },
            {
              type: 'TRUNCATION',
              severity: 'INFO',
              description: 'Minor truncation indicator detected',
              location: 'end',
            },
          ],
          reasoning: 'Content passed with 2 minor observations',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to judge when PASS_WITH_FLAGS regardless of retry count', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          issues: [
            {
              type: 'TRUNCATION',
              severity: 'INFO',
              description: 'Minor issue',
              location: 'end',
            },
          ],
        }),
        retryCount: 1,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });
  });

  describe('shouldProceedToJudge - FIXED status (future)', () => {
    it('should route to judge when status is FIXED', () => {
      // FIXED status means selfReviewer auto-patched the content
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('FIXED', {
          heuristicsPassed: true,
          issues: [
            {
              type: 'TRUNCATION',
              severity: 'INFO',
              description: 'Fixed incomplete code block',
              location: 'section_3',
            },
          ],
          reasoning: 'Content patched successfully',
          patchedContent: 'Fixed content here',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });
  });

  describe('shouldProceedToJudge - FLAG_TO_JUDGE status (future)', () => {
    it('should route to judge when status is FLAG_TO_JUDGE', () => {
      // FLAG_TO_JUDGE means semantic issues that need Judge LLM attention
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('FLAG_TO_JUDGE', {
          heuristicsPassed: true,
          issues: [
            {
              type: 'LANGUAGE',
              severity: 'INFO',
              description: 'Semantic issue: possible factual error',
              location: 'section_1',
            },
          ],
          reasoning: 'Flagged semantic issues for Judge review',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });
  });

  describe('shouldProceedToJudge - Backward compatibility', () => {
    it('should route to judge when no selfReviewResult exists', () => {
      const state = createMockState({
        selfReviewResult: null,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to judge when selfReviewResult is undefined', () => {
      const state = createMockState();
      delete (state as any).selfReviewResult;

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });
  });

  describe('shouldProceedToJudge - Edge cases', () => {
    it('should handle REGENERATE with empty issues array', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE', {
          heuristicsPassed: false,
          issues: [],
          reasoning: 'Failed heuristics but no specific issues logged',
        }),
        retryCount: 0,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator');
    });

    it('should handle PASS_WITH_FLAGS with empty issues array', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          heuristicsPassed: true,
          issues: [],
          reasoning: 'Passed but flagged for some reason',
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to planner for REGENERATE even with retryCount=0', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE'),
        retryCount: 0,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator');
    });

    it('should route to __end__ when REGENERATE at exactly max retries', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE'),
        retryCount: 2, // Exactly at limit (MAX_REGENERATION_RETRIES = 2)
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('__end__');
    });

    it('should route to __end__ when REGENERATE exceeds max retries', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE'),
        retryCount: 3, // Over limit (MAX_REGENERATION_RETRIES = 2)
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('__end__');
    });
  });

  describe('shouldProceedToJudge - State consistency', () => {
    it('should route to judge when PASS with high-quality heuristic details', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS', {
          heuristicsPassed: true,
          issues: [],
          heuristicDetails: {
            languageCheck: {
              passed: true,
              foreignCharacters: 0,
              scriptsFound: ['Cyrillic'],
            },
            truncationCheck: {
              passed: true,
              issues: [],
            },
          },
        }),
        generatedContent: `
## Введение в TypeScript

TypeScript является типизированным расширением JavaScript. Он добавляет статическую типизацию к языку.

## Заключение

Мы изучили основы TypeScript и готовы применять их на практике.
        `.trim(),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });

    it('should route to planner when REGENERATE with critical language issue', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('REGENERATE', {
          heuristicsPassed: false,
          issues: [
            {
              type: 'LANGUAGE',
              severity: 'CRITICAL',
              description: 'Found 50+ foreign characters',
              location: 'global',
            },
          ],
          heuristicDetails: {
            languageCheck: {
              passed: false,
              foreignCharacters: 52,
              scriptsFound: ['Cyrillic', 'Han', 'Hiragana'],
            },
            truncationCheck: {
              passed: true,
              issues: [],
            },
          },
        }),
        retryCount: 1,
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('generator');
    });

    it('should route to judge when PASS_WITH_FLAGS with minor language issue', () => {
      const state = createMockState({
        selfReviewResult: createMockSelfReviewResult('PASS_WITH_FLAGS', {
          heuristicsPassed: true,
          issues: [
            {
              type: 'LANGUAGE',
              severity: 'INFO',
              description: 'Found 3 foreign characters',
              location: 'section_1',
            },
          ],
          heuristicDetails: {
            languageCheck: {
              passed: true,
              foreignCharacters: 3,
              scriptsFound: ['Cyrillic', 'Han'],
            },
            truncationCheck: {
              passed: true,
              issues: [],
            },
          },
        }),
      });

      const result = shouldProceedToJudge(state);

      expect(result).toBe('judge');
    });
  });
});
