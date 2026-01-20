/**
 * Unit Tests for Iteration Controller (T033, T034, T035)
 *
 * Tests iteration control logic for targeted refinement:
 *
 * T033 - detectConvergence tests:
 * 1. Returns false for less than 3 scores
 * 2. Returns false when scores vary more than threshold
 * 3. Returns true when last 3 scores are within threshold
 * 4. Returns true for identical scores
 * 5. Handles edge case: exactly 3 scores with plateau
 *
 * T034 - updateSectionLocks tests:
 * 1. Returns empty array when no sections at limit
 * 2. Returns sections at exactly maxEdits
 * 3. Returns sections exceeding maxEdits
 * 4. Handles multiple sections reaching limit
 * 5. Uses default maxEdits=2
 *
 * T035 - shouldContinueIteration tests:
 * 1. Continues when no stopping conditions met
 * 2. Stops when score threshold met (full-auto 0.85)
 * 3. Stops when score threshold met (semi-auto 0.90)
 * 4. Stops when max iterations (3) reached
 * 5. Stops when token budget (15000) exceeded
 * 6. Stops when timeout (5 min) exceeded
 * 7. Stops when convergence detected
 * 8. Stops when all sections locked
 * 9. Returns newlyLockedSections based on edit counts
 * 10. Calculates remainingTaskCount correctly
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/spec.md (FR-021 to FR-028)
 * - packages/shared-types/src/judge-types.ts (REFINEMENT_CONFIG)
 *
 * @module tests/unit/judge/iteration-controller.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldContinueIteration,
  updateSectionLocks,
  detectConvergence,
} from '../../../src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller';
import type { IterationControllerInput } from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Helper to create IterationControllerInput with sensible defaults
 */
function createInput(
  overrides?: Partial<{
    iteration: number;
    scoreHistory: number[];
    lockedSections: string[];
    sectionEditCount: Record<string, number>;
    tokensUsed: number;
    startTime: number;
    latestScore: number;
    operationMode: 'full-auto' | 'semi-auto';
  }>,
): IterationControllerInput {
  const defaults = {
    iteration: 1,
    scoreHistory: [0.70, 0.75],
    lockedSections: [] as string[],
    sectionEditCount: { sec_intro: 1, sec_body: 1, sec_conclusion: 0 },
    tokensUsed: 5000,
    startTime: Date.now() - 60000, // 1 minute ago
    latestScore: 0.75,
    operationMode: 'full-auto' as const,
  };

  const merged = { ...defaults, ...overrides };

  return {
    currentState: {
      iteration: merged.iteration,
      scoreHistory: merged.scoreHistory,
      contentHistory: [], // Not used in iteration controller
      lockedSections: merged.lockedSections,
      sectionEditCount: merged.sectionEditCount,
      qualityLocks: {},
      tokensUsed: merged.tokensUsed,
      startTime: merged.startTime,
    },
    latestScore: merged.latestScore,
    operationMode: merged.operationMode,
  };
}

// ============================================================================
// T033 - DETECT CONVERGENCE TESTS
// ============================================================================

describe('T033 - detectConvergence', () => {
  it('should return false for less than 3 scores', () => {
    expect(detectConvergence([], 0.02)).toBe(false);
    expect(detectConvergence([0.70], 0.02)).toBe(false);
    expect(detectConvergence([0.70, 0.75], 0.02)).toBe(false);
  });

  it('should return false when scores vary more than threshold', () => {
    // Delta between 0.75 and 0.80 is 0.05 > 0.02
    const divergentScores = [0.70, 0.75, 0.80];
    expect(detectConvergence(divergentScores, 0.02)).toBe(false);

    // Steady improvement - deltas are 0.05 each
    const improvingScores = [0.60, 0.65, 0.70, 0.75];
    expect(detectConvergence(improvingScores, 0.02)).toBe(false);
  });

  it('should return true when last 3 scores are within threshold', () => {
    // Last 3 scores: 0.78, 0.79, 0.79
    // Deltas: 0.01, 0.00 - both < 0.02
    const plateauScores = [0.70, 0.78, 0.79, 0.79];
    expect(detectConvergence(plateauScores, 0.02)).toBe(true);

    // Last 3 scores: 0.82, 0.83, 0.84
    // Deltas: 0.01, 0.01 - both < 0.02
    const slowImprovement = [0.70, 0.75, 0.82, 0.83, 0.84];
    expect(detectConvergence(slowImprovement, 0.02)).toBe(true);
  });

  it('should return true for identical scores', () => {
    // Perfect plateau
    const identicalScores = [0.75, 0.80, 0.80, 0.80];
    expect(detectConvergence(identicalScores, 0.02)).toBe(true);
  });

  it('should handle edge case: exactly 3 scores with plateau', () => {
    // Exactly 3 scores, all within threshold
    const exactlyThree = [0.78, 0.79, 0.79];
    expect(detectConvergence(exactlyThree, 0.02)).toBe(true);
  });

  it('should use custom threshold correctly', () => {
    // With threshold 0.05, this should converge
    const scores = [0.70, 0.73, 0.76, 0.78];
    expect(detectConvergence(scores, 0.05)).toBe(true);

    // But not with threshold 0.01
    expect(detectConvergence(scores, 0.01)).toBe(false);
  });
});

// ============================================================================
// T034 - UPDATE SECTION LOCKS TESTS
// ============================================================================

describe('T034 - updateSectionLocks', () => {
  it('should return empty array when no sections at limit', () => {
    const editCount = {
      sec_intro: 0,
      sec_body: 1,
      sec_conclusion: 1,
    };

    const result = updateSectionLocks(editCount, 2);
    expect(result).toEqual([]);
  });

  it('should return sections at exactly maxEdits', () => {
    const editCount = {
      sec_intro: 2,
      sec_body: 1,
      sec_conclusion: 0,
    };

    const result = updateSectionLocks(editCount, 2);
    expect(result).toContain('sec_intro');
    expect(result).toHaveLength(1);
  });

  it('should return sections exceeding maxEdits', () => {
    const editCount = {
      sec_intro: 3,
      sec_body: 4,
      sec_conclusion: 1,
    };

    const result = updateSectionLocks(editCount, 2);
    expect(result).toContain('sec_intro');
    expect(result).toContain('sec_body');
    expect(result).toHaveLength(2);
  });

  it('should handle multiple sections reaching limit', () => {
    const editCount = {
      sec_1: 2,
      sec_2: 2,
      sec_3: 2,
      sec_4: 1,
    };

    const result = updateSectionLocks(editCount, 2);
    expect(result).toEqual(expect.arrayContaining(['sec_1', 'sec_2', 'sec_3']));
    expect(result).toHaveLength(3);
  });

  it('should use default maxEdits=2 from REFINEMENT_CONFIG', () => {
    const editCount = {
      sec_intro: 2,
      sec_body: 1,
    };

    const configMaxEdits = REFINEMENT_CONFIG.quality.sectionLockAfterEdits;
    expect(configMaxEdits).toBe(2);

    const result = updateSectionLocks(editCount, configMaxEdits);
    expect(result).toContain('sec_intro');
  });

  it('should handle empty edit count', () => {
    const result = updateSectionLocks({}, 2);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// T035 - SHOULD CONTINUE ITERATION TESTS
// ============================================================================

describe('T035 - shouldContinueIteration', () => {
  beforeEach(() => {
    // Use real timers by default
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should continue when no stopping conditions met', () => {
    const input = createInput({
      iteration: 1,
      scoreHistory: [0.70, 0.75],
      latestScore: 0.75,
      tokensUsed: 3000,
      operationMode: 'full-auto',
      sectionEditCount: { sec_intro: 1, sec_body: 0 },
      lockedSections: [],
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toBe('continue_more_tasks');
    expect(result.remainingTaskCount).toBeGreaterThan(0);
  });

  it('should stop when score threshold met (full-auto 0.85)', () => {
    const input = createInput({
      latestScore: 0.85,
      operationMode: 'full-auto',
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_score_threshold_met');
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should stop when score threshold met (semi-auto 0.90)', () => {
    const input = createInput({
      latestScore: 0.90,
      operationMode: 'semi-auto',
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_score_threshold_met');
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should not stop at 0.85 in semi-auto mode', () => {
    const input = createInput({
      latestScore: 0.85,
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 3000,
    });

    const result = shouldContinueIteration(input);

    // 0.85 < 0.90 (semi-auto threshold), so should continue
    expect(result.shouldContinue).toBe(true);
  });

  it('should stop when max iterations (3) reached', () => {
    const input = createInput({
      iteration: 3,
      latestScore: 0.70,
      operationMode: 'full-auto',
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_max_iterations');
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should continue at iteration 2 (below max)', () => {
    const input = createInput({
      iteration: 2,
      latestScore: 0.70,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    // iteration 2 < maxIterations (3)
    expect(result.shouldContinue).toBe(true);
  });

  it('should stop when token budget (15000) exceeded', () => {
    const input = createInput({
      tokensUsed: 15000,
      latestScore: 0.70,
      iteration: 1,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_token_budget');
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should continue when below token budget', () => {
    const input = createInput({
      tokensUsed: 10000,
      latestScore: 0.70,
      iteration: 1,
    });

    const result = shouldContinueIteration(input);

    // 10000 < 15000
    expect(result.shouldContinue).toBe(true);
  });

  it('should stop when timeout (5 min) exceeded', () => {
    vi.useFakeTimers();
    const startTime = Date.now();

    // Advance time by 5 minutes + 1 second
    vi.advanceTimersByTime(300000 + 1000);

    const input = createInput({
      startTime,
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_timeout');
    expect(result.remainingTaskCount).toBe(0);

    vi.useRealTimers();
  });

  it('should continue when timeout not reached', () => {
    vi.useFakeTimers();
    const startTime = Date.now();

    // Advance time by 2 minutes (below 5 min timeout)
    vi.advanceTimersByTime(120000);

    const input = createInput({
      startTime,
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    // 2 min < 5 min timeout
    expect(result.shouldContinue).toBe(true);

    vi.useRealTimers();
  });

  it('should stop when convergence detected', () => {
    const input = createInput({
      scoreHistory: [0.70, 0.78, 0.79, 0.79], // Plateau: last 3 deltas < 0.02
      latestScore: 0.79,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_converged');
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should continue when no convergence detected', () => {
    const input = createInput({
      scoreHistory: [0.60, 0.70, 0.80], // Improving: deltas = 0.10 each
      latestScore: 0.80,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(true);
  });

  it('should stop when all sections locked', () => {
    const input = createInput({
      sectionEditCount: {
        sec_intro: 2,
        sec_body: 2,
        sec_conclusion: 2,
      },
      lockedSections: [],
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_all_sections_locked');
    expect(result.newlyLockedSections).toEqual(
      expect.arrayContaining(['sec_intro', 'sec_body', 'sec_conclusion']),
    );
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should continue when some sections remain unlocked', () => {
    const input = createInput({
      sectionEditCount: {
        sec_intro: 2, // Will be locked
        sec_body: 1, // Still available
        sec_conclusion: 0, // Still available
      },
      lockedSections: [],
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toBe('continue_more_tasks');
    expect(result.newlyLockedSections).toContain('sec_intro');
    expect(result.remainingTaskCount).toBe(2); // sec_body, sec_conclusion
  });

  it('should return newlyLockedSections based on edit counts', () => {
    const input = createInput({
      sectionEditCount: {
        sec_intro: 2,
        sec_body: 3,
        sec_conclusion: 1,
      },
      lockedSections: [],
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.newlyLockedSections).toContain('sec_intro');
    expect(result.newlyLockedSections).toContain('sec_body');
    expect(result.newlyLockedSections).toHaveLength(2);
  });

  it('should return all sections at lock threshold in newlyLockedSections', () => {
    const input = createInput({
      sectionEditCount: {
        sec_intro: 2,
        sec_body: 2,
      },
      lockedSections: ['sec_intro'], // Already locked
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    // newlyLockedSections returns ALL sections at threshold (doesn't filter existing locks)
    // The Set deduplication happens internally for remainingTaskCount calculation
    expect(result.newlyLockedSections).toContain('sec_intro');
    expect(result.newlyLockedSections).toContain('sec_body');
    expect(result.newlyLockedSections).toHaveLength(2);

    // remainingTaskCount should correctly account for deduplication
    // Total sections: 2, all locked (1 existing + 1 new, deduplicated to 2 total) = 0 remaining
    expect(result.remainingTaskCount).toBe(0);
  });

  it('should calculate remainingTaskCount correctly', () => {
    const input = createInput({
      sectionEditCount: {
        sec_1: 0,
        sec_2: 1,
        sec_3: 2, // Will be locked
        sec_4: 1,
      },
      lockedSections: [],
      latestScore: 0.70,
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    // Total sections: 4
    // Newly locked: 1 (sec_3)
    // Remaining: 3
    expect(result.remainingTaskCount).toBe(3);
  });

  it('should prioritize stopping conditions in correct order', () => {
    // Score threshold should take priority over max iterations
    const input = createInput({
      latestScore: 0.90,
      iteration: 3,
      tokensUsed: 15000,
      operationMode: 'semi-auto',
    });

    const result = shouldContinueIteration(input);

    // Should stop at score threshold, not max iterations
    expect(result.reason).toBe('stop_score_threshold_met');
  });

  it('should verify REFINEMENT_CONFIG constants', () => {
    // Verify hardcoded values match config
    expect(REFINEMENT_CONFIG.limits.maxIterations).toBe(3);
    expect(REFINEMENT_CONFIG.limits.maxTokens).toBe(15000);
    expect(REFINEMENT_CONFIG.limits.timeoutMs).toBe(300000); // 5 min
    expect(REFINEMENT_CONFIG.quality.sectionLockAfterEdits).toBe(2);
    expect(REFINEMENT_CONFIG.quality.convergenceThreshold).toBe(0.02);
    expect(REFINEMENT_CONFIG.modes['full-auto'].acceptThreshold).toBe(0.85);
    expect(REFINEMENT_CONFIG.modes['semi-auto'].acceptThreshold).toBe(0.90);
  });
});

// ============================================================================
// T061 - SEMI-AUTO STOPPING CONDITIONS TESTS (US2)
// ============================================================================

describe('T061 - Semi-Auto Stopping Conditions', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should continue in semi-auto when score is between goodEnough (0.85) and accept (0.90)', () => {
    const input = createInput({
      latestScore: 0.87, // Above goodEnough (0.85) but below accept (0.90)
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    // Should continue because score < acceptThreshold (0.90)
    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toBe('continue_more_tasks');
  });

  it('should stop in semi-auto when score meets accept threshold (0.90)', () => {
    const input = createInput({
      latestScore: 0.90,
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_score_threshold_met');
  });

  it('should stop in semi-auto when score exceeds accept threshold', () => {
    const input = createInput({
      latestScore: 0.95,
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_score_threshold_met');
  });

  it('should have different stopping behavior for semi-auto vs full-auto at 0.85', () => {
    // Full-auto at 0.85 should STOP (meets acceptThreshold)
    const fullAutoInput = createInput({
      latestScore: 0.85,
      operationMode: 'full-auto',
      iteration: 1,
      tokensUsed: 5000,
    });

    const fullAutoResult = shouldContinueIteration(fullAutoInput);
    expect(fullAutoResult.shouldContinue).toBe(false);
    expect(fullAutoResult.reason).toBe('stop_score_threshold_met');

    // Semi-auto at 0.85 should CONTINUE (below acceptThreshold 0.90)
    const semiAutoInput = createInput({
      latestScore: 0.85,
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 5000,
    });

    const semiAutoResult = shouldContinueIteration(semiAutoInput);
    expect(semiAutoResult.shouldContinue).toBe(true);
    expect(semiAutoResult.reason).toBe('continue_more_tasks');
  });

  it('should verify semi-auto config thresholds', () => {
    // Verify semi-auto specific config values
    expect(REFINEMENT_CONFIG.modes['semi-auto'].acceptThreshold).toBe(0.90);
    expect(REFINEMENT_CONFIG.modes['semi-auto'].goodEnoughThreshold).toBe(0.85);
    expect(REFINEMENT_CONFIG.modes['semi-auto'].onMaxIterations).toBe('escalate');
    expect(REFINEMENT_CONFIG.modes['semi-auto'].escalationEnabled).toBe(true);
  });

  it('should stop with max_iterations in semi-auto when limit reached (escalation scenario)', () => {
    const input = createInput({
      latestScore: 0.75, // Below both thresholds
      operationMode: 'semi-auto',
      iteration: 3, // At max iterations
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_max_iterations');
    // Note: The actual escalation decision is made in best-effort-selector,
    // iteration-controller just reports stop_max_iterations
  });

  it('should continue in semi-auto at iteration 2 with low score', () => {
    const input = createInput({
      latestScore: 0.70, // Below goodEnough threshold
      operationMode: 'semi-auto',
      iteration: 2, // Below max iterations
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    // Should continue because we haven't hit max iterations yet
    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toBe('continue_more_tasks');
  });

  it('should stop semi-auto on convergence even when score is below threshold', () => {
    const input = createInput({
      scoreHistory: [0.70, 0.78, 0.79, 0.79], // Plateau detected
      latestScore: 0.79, // Below semi-auto accept (0.90)
      operationMode: 'semi-auto',
      iteration: 2,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_converged');
  });

  it('should handle semi-auto timeout correctly', () => {
    vi.useFakeTimers();
    const startTime = Date.now();

    // Advance time beyond timeout
    vi.advanceTimersByTime(300001); // 5 min + 1ms

    const input = createInput({
      startTime,
      latestScore: 0.85, // Above goodEnough but below accept
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 5000,
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_timeout');

    vi.useRealTimers();
  });

  it('should handle semi-auto token budget exhaustion', () => {
    const input = createInput({
      latestScore: 0.85, // Above goodEnough but below accept
      operationMode: 'semi-auto',
      iteration: 1,
      tokensUsed: 15000, // At limit
    });

    const result = shouldContinueIteration(input);

    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toBe('stop_token_budget');
  });
});

// ============================================================================
// T062 - ESCALATION TRIGGER LOGIC TESTS (US2)
// ============================================================================

describe('T062 - Escalation Trigger Logic', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Escalation trigger tests for semi-auto mode
   *
   * Escalation is triggered when:
   * 1. Semi-auto mode reaches max iterations with score < acceptThreshold (0.90)
   * 2. Semi-auto mode converges with score < acceptThreshold
   * 3. Any hard limit is hit with score < goodEnoughThreshold (0.85)
   *
   * The iteration controller returns stopping reasons, while the actual
   * escalation decision is made in best-effort-selector based on:
   * - operationMode === 'semi-auto'
   * - qualityStatus === 'below_standard' (score < goodEnoughThreshold)
   */

  describe('max iterations trigger scenarios', () => {
    it('should stop at max iterations in semi-auto with below_standard score (escalation scenario)', () => {
      const input = createInput({
        latestScore: 0.70, // Below goodEnough (0.85)
        operationMode: 'semi-auto',
        iteration: 3, // At max iterations
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_max_iterations');
      // Note: This will result in 'escalated' status in best-effort-selector
      // because operationMode='semi-auto' and score < goodEnoughThreshold
    });

    it('should stop at max iterations in semi-auto with acceptable score (no escalation)', () => {
      const input = createInput({
        latestScore: 0.87, // Above goodEnough (0.85), below accept (0.90)
        operationMode: 'semi-auto',
        iteration: 3, // At max iterations
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_max_iterations');
      // Note: This will result in 'accepted_warning' status in best-effort-selector
      // because score >= goodEnoughThreshold
    });
  });

  describe('convergence trigger scenarios', () => {
    it('should stop on convergence in semi-auto with below_standard score (escalation scenario)', () => {
      const input = createInput({
        scoreHistory: [0.68, 0.70, 0.70, 0.70], // Plateau below goodEnough
        latestScore: 0.70,
        operationMode: 'semi-auto',
        iteration: 2,
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_converged');
      // Convergence with low score → escalation in semi-auto
    });

    it('should stop on convergence in semi-auto with acceptable score (no escalation)', () => {
      const input = createInput({
        scoreHistory: [0.85, 0.86, 0.86, 0.86], // Plateau at acceptable level
        latestScore: 0.86,
        operationMode: 'semi-auto',
        iteration: 2,
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_converged');
      // Convergence at acceptable level → accepted_warning (no escalation)
    });
  });

  describe('hard limit trigger scenarios', () => {
    it('should stop on timeout in semi-auto with below_standard score (escalation scenario)', () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.advanceTimersByTime(300001);

      const input = createInput({
        startTime,
        latestScore: 0.70, // Below goodEnough
        operationMode: 'semi-auto',
        iteration: 1,
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_timeout');
      // Timeout with low score → escalation in semi-auto

      vi.useRealTimers();
    });

    it('should stop on token budget in semi-auto with below_standard score (escalation scenario)', () => {
      const input = createInput({
        latestScore: 0.70, // Below goodEnough
        operationMode: 'semi-auto',
        iteration: 1,
        tokensUsed: 15000, // At limit
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_token_budget');
      // Token budget exhausted with low score → escalation in semi-auto
    });
  });

  describe('section lock trigger scenarios', () => {
    it('should stop when all sections locked in semi-auto with below_standard score', () => {
      const input = createInput({
        sectionEditCount: {
          sec_intro: 2,
          sec_body: 2,
        },
        lockedSections: [],
        latestScore: 0.70, // Below goodEnough
        operationMode: 'semi-auto',
        iteration: 1,
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_all_sections_locked');
      // All sections locked with low score → escalation in semi-auto
    });

    it('should stop when all sections locked in semi-auto with acceptable score', () => {
      const input = createInput({
        sectionEditCount: {
          sec_intro: 2,
          sec_body: 2,
        },
        lockedSections: [],
        latestScore: 0.87, // Above goodEnough
        operationMode: 'semi-auto',
        iteration: 1,
        tokensUsed: 5000,
      });

      const result = shouldContinueIteration(input);

      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toBe('stop_all_sections_locked');
      // All sections locked at acceptable level → accepted_warning
    });
  });

  describe('compare semi-auto vs full-auto escalation behavior', () => {
    it('should have different escalation behavior for same stopping scenario', () => {
      // Both modes stop at max iterations with low score
      const semiAutoInput = createInput({
        latestScore: 0.70, // Below both goodEnough thresholds
        operationMode: 'semi-auto',
        iteration: 3,
        tokensUsed: 5000,
      });

      const fullAutoInput = createInput({
        latestScore: 0.70, // Below both goodEnough thresholds
        operationMode: 'full-auto',
        iteration: 3,
        tokensUsed: 5000,
      });

      const semiAutoResult = shouldContinueIteration(semiAutoInput);
      const fullAutoResult = shouldContinueIteration(fullAutoInput);

      // Both stop with same reason
      expect(semiAutoResult.reason).toBe('stop_max_iterations');
      expect(fullAutoResult.reason).toBe('stop_max_iterations');

      // But downstream behavior differs:
      // - semi-auto: escalated (requires human review)
      // - full-auto: best_effort (auto-select best iteration)
      // This is verified in best-effort-selector tests
    });
  });

  describe('escalation threshold verification', () => {
    it('should verify REFINEMENT_CONFIG has escalation settings for semi-auto', () => {
      // Semi-auto mode should have escalation enabled
      expect(REFINEMENT_CONFIG.modes['semi-auto'].escalationEnabled).toBe(true);
      expect(REFINEMENT_CONFIG.modes['semi-auto'].onMaxIterations).toBe('escalate');
      expect(REFINEMENT_CONFIG.modes['semi-auto'].goodEnoughThreshold).toBe(0.85);

      // Full-auto mode should not escalate
      expect(REFINEMENT_CONFIG.modes['full-auto'].escalationEnabled).toBe(false);
      expect(REFINEMENT_CONFIG.modes['full-auto'].onMaxIterations).toBe('best_effort');
      expect(REFINEMENT_CONFIG.modes['full-auto'].goodEnoughThreshold).toBe(0.75);
    });

    it('should return score-based escalation info correctly', () => {
      // Score exactly at goodEnough threshold (0.85 for semi-auto)
      const atThreshold = createInput({
        latestScore: 0.85,
        operationMode: 'semi-auto',
        iteration: 3,
      });

      const atResult = shouldContinueIteration(atThreshold);
      expect(atResult.reason).toBe('stop_max_iterations');
      // At threshold → acceptable (no escalation)

      // Score just below goodEnough threshold
      const belowThreshold = createInput({
        latestScore: 0.8499,
        operationMode: 'semi-auto',
        iteration: 3,
      });

      const belowResult = shouldContinueIteration(belowThreshold);
      expect(belowResult.reason).toBe('stop_max_iterations');
      // Below threshold → below_standard → escalation
    });
  });
});
