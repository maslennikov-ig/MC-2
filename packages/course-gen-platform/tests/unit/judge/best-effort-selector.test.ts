/**
 * Unit tests for Best-Effort Selector (T036 - Best-Effort Selector Tests)
 * @module tests/unit/judge/best-effort-selector
 *
 * Tests the best-effort selector module for targeted refinement fallback.
 * When max iterations reached, selects the best iteration from history.
 *
 * Test Coverage:
 * - selectBestIteration: finds highest-scoring iteration, determines quality status
 * - determineQualityStatus: maps score to quality status based on operation mode
 * - generateImprovementHints: extracts actionable hints from unresolved issues
 *
 * Functions tested:
 * 1. selectBestIteration(input) - finds best iteration, generates selection reason
 * 2. determineQualityStatus(score, mode) - maps score to quality status
 * 3. generateImprovementHints(issues, maxHints) - formats improvement hints
 */

import { describe, it, expect } from 'vitest';
import {
  selectBestIteration,
  determineQualityStatus,
  generateImprovementHints,
} from '../../../src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector';
import type {
  BestEffortSelectorInput,
  JudgeIssue,
  IterationResult,
  QualityStatus,
  OperationMode,
  RefinementStatus,
} from '@megacampus/shared-types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock IterationResult for testing
 */
function createMockIterationResult(
  score: number,
  iteration: number = 0,
  content: any = { lesson_title: 'Test Lesson', sections: [] }
): IterationResult {
  return {
    iteration,
    score,
    content,
    remainingIssues: [],
  };
}

/**
 * Create mock JudgeIssue for testing
 */
function createMockJudgeIssue(overrides: Partial<JudgeIssue> = {}): JudgeIssue {
  return {
    criterion: 'clarity_readability',
    severity: 'major',
    location: 'section 2, paragraph 3',
    description: 'Sentence structure is too complex',
    suggestedFix: 'Simplify the sentence structure',
    quotedText: 'This is the problematic text',
    ...overrides,
  };
}

/**
 * Create mock BestEffortSelectorInput for testing
 */
function createBestEffortInput(
  overrides: Partial<BestEffortSelectorInput> = {}
): BestEffortSelectorInput {
  return {
    iterationHistory: [
      createMockIterationResult(0.70, 0),
      createMockIterationResult(0.82, 1),
      createMockIterationResult(0.78, 2),
    ],
    unresolvedIssues: [
      createMockJudgeIssue({ severity: 'minor', criterion: 'engagement_examples' }),
    ],
    operationMode: 'full-auto',
    ...overrides,
  };
}

// ============================================================================
// DETERMINE QUALITY STATUS TESTS
// ============================================================================

describe('determineQualityStatus', () => {
  describe('full-auto mode', () => {
    const mode: OperationMode = 'full-auto';

    it('should return "good" for score >= 0.85', () => {
      expect(determineQualityStatus(0.85, mode)).toBe('good');
      expect(determineQualityStatus(0.90, mode)).toBe('good');
      expect(determineQualityStatus(0.95, mode)).toBe('good');
      expect(determineQualityStatus(1.00, mode)).toBe('good');
    });

    it('should return "acceptable" for score >= 0.75 and < 0.85', () => {
      expect(determineQualityStatus(0.75, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.80, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.84, mode)).toBe('acceptable');
    });

    it('should return "below_standard" for score < 0.75', () => {
      expect(determineQualityStatus(0.74, mode)).toBe('below_standard');
      expect(determineQualityStatus(0.70, mode)).toBe('below_standard');
      expect(determineQualityStatus(0.60, mode)).toBe('below_standard');
      expect(determineQualityStatus(0.50, mode)).toBe('below_standard');
    });

    it('should handle edge cases at exact thresholds', () => {
      expect(determineQualityStatus(0.85, mode)).toBe('good');
      expect(determineQualityStatus(0.8499, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.75, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.7499, mode)).toBe('below_standard');
    });
  });

  describe('semi-auto mode', () => {
    const mode: OperationMode = 'semi-auto';

    it('should return "good" for score >= 0.90', () => {
      expect(determineQualityStatus(0.90, mode)).toBe('good');
      expect(determineQualityStatus(0.95, mode)).toBe('good');
      expect(determineQualityStatus(1.00, mode)).toBe('good');
    });

    it('should return "acceptable" for score >= 0.85 and < 0.90', () => {
      expect(determineQualityStatus(0.85, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.87, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.89, mode)).toBe('acceptable');
    });

    it('should return "below_standard" for score < 0.85', () => {
      expect(determineQualityStatus(0.84, mode)).toBe('below_standard');
      expect(determineQualityStatus(0.80, mode)).toBe('below_standard');
      expect(determineQualityStatus(0.70, mode)).toBe('below_standard');
      expect(determineQualityStatus(0.60, mode)).toBe('below_standard');
    });

    it('should handle edge cases at exact thresholds', () => {
      expect(determineQualityStatus(0.90, mode)).toBe('good');
      expect(determineQualityStatus(0.8999, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.85, mode)).toBe('acceptable');
      expect(determineQualityStatus(0.8499, mode)).toBe('below_standard');
    });
  });

  describe('boundary conditions', () => {
    it('should handle minimum score (0)', () => {
      expect(determineQualityStatus(0, 'full-auto')).toBe('below_standard');
      expect(determineQualityStatus(0, 'semi-auto')).toBe('below_standard');
    });

    it('should handle maximum score (1)', () => {
      expect(determineQualityStatus(1, 'full-auto')).toBe('good');
      expect(determineQualityStatus(1, 'semi-auto')).toBe('good');
    });
  });
});

// ============================================================================
// GENERATE IMPROVEMENT HINTS TESTS
// ============================================================================

describe('generateImprovementHints', () => {
  it('should return empty array for empty issues', () => {
    const result = generateImprovementHints([]);

    expect(result).toEqual([]);
  });

  it('should sort issues by severity (critical first)', () => {
    const issues: JudgeIssue[] = [
      createMockJudgeIssue({
        severity: 'minor',
        criterion: 'engagement_examples',
        suggestedFix: 'Add more examples',
      }),
      createMockJudgeIssue({
        severity: 'critical',
        criterion: 'factual_accuracy',
        suggestedFix: 'Fix incorrect statement',
      }),
      createMockJudgeIssue({
        severity: 'major',
        criterion: 'pedagogical_structure',
        suggestedFix: 'Improve structure',
      }),
    ];

    const result = generateImprovementHints(issues, 3);

    expect(result).toHaveLength(3);
    expect(result[0]).toContain('factual accuracy'); // critical first
    expect(result[1]).toContain('pedagogical structure'); // major second
    expect(result[2]).toContain('engagement examples'); // minor last
  });

  it('should limit to maxHints (default 5)', () => {
    const issues: JudgeIssue[] = Array.from({ length: 10 }, (_, i) =>
      createMockJudgeIssue({
        severity: 'minor',
        criterion: 'clarity_readability',
        suggestedFix: `Fix ${i + 1}`,
      })
    );

    const result = generateImprovementHints(issues);

    expect(result).toHaveLength(5);
  });

  it('should respect custom maxHints parameter', () => {
    const issues: JudgeIssue[] = Array.from({ length: 10 }, (_, i) =>
      createMockJudgeIssue({
        severity: 'minor',
        criterion: 'clarity_readability',
        suggestedFix: `Fix ${i + 1}`,
      })
    );

    const result = generateImprovementHints(issues, 3);

    expect(result).toHaveLength(3);
  });

  it('should use suggestedFix when available', () => {
    const issues: JudgeIssue[] = [
      createMockJudgeIssue({
        criterion: 'clarity_readability',
        description: 'Text is unclear',
        suggestedFix: 'Simplify the sentence structure',
      }),
    ];

    const result = generateImprovementHints(issues);

    expect(result[0]).toBe('Improve clarity readability: Simplify the sentence structure');
  });

  it('should fall back to description when no suggestedFix', () => {
    const issues: JudgeIssue[] = [
      createMockJudgeIssue({
        criterion: 'engagement_examples',
        description: 'Missing practical examples',
        suggestedFix: undefined as any,
      }),
    ];

    const result = generateImprovementHints(issues);

    expect(result[0]).toBe('Improve engagement examples: Missing practical examples');
  });

  it('should format criterion correctly (replace underscores)', () => {
    const issues: JudgeIssue[] = [
      createMockJudgeIssue({
        criterion: 'learning_objective_alignment',
        suggestedFix: 'Align with learning objectives',
      }),
    ];

    const result = generateImprovementHints(issues);

    expect(result[0]).toContain('learning objective alignment');
    expect(result[0]).not.toContain('learning_objective_alignment');
  });

  it('should handle multiple critical issues correctly', () => {
    const issues: JudgeIssue[] = [
      createMockJudgeIssue({
        severity: 'critical',
        criterion: 'factual_accuracy',
        suggestedFix: 'Fix fact 1',
      }),
      createMockJudgeIssue({
        severity: 'critical',
        criterion: 'learning_objective_alignment',
        suggestedFix: 'Fix alignment',
      }),
      createMockJudgeIssue({
        severity: 'minor',
        criterion: 'engagement_examples',
        suggestedFix: 'Add example',
      }),
    ];

    const result = generateImprovementHints(issues, 3);

    expect(result).toHaveLength(3);
    // First two should be critical issues
    expect(result[0]).toMatch(/factual accuracy|learning objective alignment/);
    expect(result[1]).toMatch(/factual accuracy|learning objective alignment/);
    // Last should be minor
    expect(result[2]).toContain('engagement examples');
  });
});

// ============================================================================
// SELECT BEST ITERATION TESTS
// ============================================================================

describe('selectBestIteration', () => {
  describe('iteration selection', () => {
    it('should select iteration with highest score', () => {
      const input = createBestEffortInput({
        iterationHistory: [
          createMockIterationResult(0.70, 0),
          createMockIterationResult(0.85, 1),
          createMockIterationResult(0.78, 2),
        ],
      });

      const result = selectBestIteration(input);

      expect(result.selectedIteration).toBe(1);
      expect(result.bestResult.bestScore).toBe(0.85);
    });

    it('should handle single iteration', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.75, 0)],
      });

      const result = selectBestIteration(input);

      expect(result.selectedIteration).toBe(0);
      expect(result.bestResult.bestScore).toBe(0.75);
    });

    it('should handle tied scores (takes first occurrence)', () => {
      const input = createBestEffortInput({
        iterationHistory: [
          createMockIterationResult(0.80, 0),
          createMockIterationResult(0.85, 1),
          createMockIterationResult(0.85, 2),
        ],
      });

      const result = selectBestIteration(input);

      expect(result.selectedIteration).toBe(1);
      expect(result.bestResult.bestScore).toBe(0.85);
    });

    it('should throw error for empty iteration history', () => {
      const input = createBestEffortInput({
        iterationHistory: [],
      });

      expect(() => selectBestIteration(input)).toThrow('No valid iterations in history');
    });
  });

  describe('quality status determination', () => {
    it('should return correct qualityStatus for full-auto mode', () => {
      // good: >= 0.85
      const goodInput = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.90, 0)],
        operationMode: 'full-auto',
      });
      expect(selectBestIteration(goodInput).bestResult.qualityStatus).toBe('good');

      // acceptable: 0.75-0.84
      const acceptableInput = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.80, 0)],
        operationMode: 'full-auto',
      });
      expect(selectBestIteration(acceptableInput).bestResult.qualityStatus).toBe('acceptable');

      // below_standard: < 0.75
      const belowInput = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.70, 0)],
        operationMode: 'full-auto',
      });
      expect(selectBestIteration(belowInput).bestResult.qualityStatus).toBe('below_standard');
    });

    it('should return correct qualityStatus for semi-auto mode', () => {
      // good: >= 0.90
      const goodInput = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.92, 0)],
        operationMode: 'semi-auto',
      });
      expect(selectBestIteration(goodInput).bestResult.qualityStatus).toBe('good');

      // acceptable: 0.85-0.89
      const acceptableInput = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.87, 0)],
        operationMode: 'semi-auto',
      });
      expect(selectBestIteration(acceptableInput).bestResult.qualityStatus).toBe('acceptable');

      // below_standard: < 0.85
      const belowInput = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.82, 0)],
        operationMode: 'semi-auto',
      });
      expect(selectBestIteration(belowInput).bestResult.qualityStatus).toBe('below_standard');
    });
  });

  describe('final status determination', () => {
    it('should return "accepted" for good quality', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.90, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.finalStatus).toBe('accepted');
    });

    it('should return "accepted_warning" for acceptable quality', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.80, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.finalStatus).toBe('accepted_warning');
    });

    it('should return "best_effort" for below_standard in full-auto mode', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.70, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.finalStatus).toBe('best_effort');
    });

    it('should return "escalated" for below_standard in semi-auto mode', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.82, 0)],
        operationMode: 'semi-auto',
      });

      const result = selectBestIteration(input);

      expect(result.finalStatus).toBe('escalated');
    });
  });

  describe('improvement hints integration', () => {
    it('should include improvement hints in result', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.75, 0)],
        unresolvedIssues: [
          createMockJudgeIssue({
            severity: 'critical',
            criterion: 'factual_accuracy',
            suggestedFix: 'Fix incorrect statement',
          }),
          createMockJudgeIssue({
            severity: 'major',
            criterion: 'clarity_readability',
            suggestedFix: 'Simplify language',
          }),
        ],
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.improvementHints).toBeDefined();
      expect(result.bestResult.improvementHints).toHaveLength(2);
      expect(result.bestResult.improvementHints[0]).toContain('factual accuracy');
    });

    it('should limit improvement hints to 5', () => {
      const issues = Array.from({ length: 10 }, (_, i) =>
        createMockJudgeIssue({
          severity: 'minor',
          criterion: 'clarity_readability',
          suggestedFix: `Fix ${i + 1}`,
        })
      );

      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.75, 0)],
        unresolvedIssues: issues,
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.improvementHints).toHaveLength(5);
    });

    it('should return empty hints for empty unresolvedIssues', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.85, 0)],
        unresolvedIssues: [],
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.improvementHints).toEqual([]);
    });
  });

  describe('selection reason', () => {
    it('should provide meaningful selectionReason for iteration 0', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.80, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.selectionReason).toContain('initial');
      expect(result.selectionReason).toContain('80.0%');
      expect(result.selectionReason).toContain('acceptable');
    });

    it('should provide meaningful selectionReason for iteration > 0', () => {
      const input = createBestEffortInput({
        iterationHistory: [
          createMockIterationResult(0.70, 0),
          createMockIterationResult(0.85, 1),
        ],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.selectionReason).toContain('iteration 1');
      expect(result.selectionReason).toContain('85.0%');
      expect(result.selectionReason).toContain('good');
    });

    it('should mention refinement attempts when multiple iterations', () => {
      const input = createBestEffortInput({
        iterationHistory: [
          createMockIterationResult(0.70, 0),
          createMockIterationResult(0.75, 1),
          createMockIterationResult(0.80, 2),
        ],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.selectionReason).toContain('after 3 refinement attempts');
    });

    it('should include mode-specific notes for full-auto below_standard', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.70, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.selectionReason).toContain('below standard');
      expect(result.selectionReason).toContain('best available result');
    });

    it('should include mode-specific notes for full-auto acceptable', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.80, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.selectionReason).toContain('acceptable with minor issues');
    });

    it('should recommend manual review for semi-auto below_standard', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.82, 0)],
        operationMode: 'semi-auto',
      });

      const result = selectBestIteration(input);

      expect(result.selectionReason).toContain('Manual review recommended');
      expect(result.selectionReason).toContain('below-standard quality');
    });
  });

  describe('result structure', () => {
    it('should return correct result structure', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.85, 0)],
        unresolvedIssues: [],
      });

      const result = selectBestIteration(input);

      expect(result).toHaveProperty('bestResult');
      expect(result).toHaveProperty('selectedIteration');
      expect(result).toHaveProperty('selectionReason');
      expect(result).toHaveProperty('finalStatus');

      expect(result.bestResult).toHaveProperty('content');
      expect(result.bestResult).toHaveProperty('bestScore');
      expect(result.bestResult).toHaveProperty('qualityStatus');
      expect(result.bestResult).toHaveProperty('unresolvedIssues');
      expect(result.bestResult).toHaveProperty('improvementHints');
    });

    it('should preserve content from selected iteration', () => {
      const customContent = {
        lesson_title: 'Custom Lesson',
        sections: [{ title: 'Section 1', body: 'Content' }],
      };

      const input = createBestEffortInput({
        iterationHistory: [
          createMockIterationResult(0.70, 0),
          createMockIterationResult(0.85, 1, customContent),
        ],
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.content).toEqual(customContent);
    });

    it('should include unresolvedIssues in bestResult', () => {
      const issues: JudgeIssue[] = [
        createMockJudgeIssue({ severity: 'minor', criterion: 'engagement_examples' }),
      ];

      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.80, 0)],
        unresolvedIssues: issues,
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.unresolvedIssues).toEqual(issues);
    });
  });

  describe('edge cases', () => {
    it('should handle perfect score (1.0)', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(1.0, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.qualityStatus).toBe('good');
      expect(result.finalStatus).toBe('accepted');
      expect(result.bestResult.bestScore).toBe(1.0);
    });

    it('should handle very low score (0.0)', () => {
      const input = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.0, 0)],
        operationMode: 'full-auto',
      });

      const result = selectBestIteration(input);

      expect(result.bestResult.qualityStatus).toBe('below_standard');
      expect(result.finalStatus).toBe('best_effort');
    });

    it('should handle threshold boundary for full-auto acceptThreshold', () => {
      const inputJustBelow = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.8499, 0)],
        operationMode: 'full-auto',
      });

      const inputJustAt = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.85, 0)],
        operationMode: 'full-auto',
      });

      expect(selectBestIteration(inputJustBelow).bestResult.qualityStatus).toBe('acceptable');
      expect(selectBestIteration(inputJustAt).bestResult.qualityStatus).toBe('good');
    });

    it('should handle threshold boundary for semi-auto acceptThreshold', () => {
      const inputJustBelow = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.8999, 0)],
        operationMode: 'semi-auto',
      });

      const inputJustAt = createBestEffortInput({
        iterationHistory: [createMockIterationResult(0.90, 0)],
        operationMode: 'semi-auto',
      });

      expect(selectBestIteration(inputJustBelow).bestResult.qualityStatus).toBe('acceptable');
      expect(selectBestIteration(inputJustAt).bestResult.qualityStatus).toBe('good');
    });
  });
});
