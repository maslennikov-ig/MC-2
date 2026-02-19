import { describe, it, expect } from 'vitest';
import {
  buildRegenerateTelemetryUpdate,
  isCriticalTruncationOnly,
} from '@/stages/stage6-lesson-content/nodes/self-reviewer-node';
import type { LessonGraphStateType } from '@/stages/stage6-lesson-content/state';
import type { SelfReviewIssue } from '@megacampus/shared-types/judge-types';

// ============================================================================
// HELPERS
// ============================================================================

function buildState(overrides: Partial<LessonGraphStateType> = {}): LessonGraphStateType {
  return {
    lastGenerationTokens: 500,
    rejectedTokens: 0,
    regenerateCount: 0,
    truncationCount: 0,
    ...overrides,
  } as LessonGraphStateType;
}

function makeIssue(
  type: SelfReviewIssue['type'],
  severity: SelfReviewIssue['severity']
): SelfReviewIssue {
  return {
    type,
    severity,
    location: 'global',
    description: `${severity} ${type} issue`,
  };
}

// ============================================================================
// isCriticalTruncationOnly
// ============================================================================

describe('isCriticalTruncationOnly', () => {
  it('returns true when only CRITICAL TRUNCATION issues exist', () => {
    const issues: SelfReviewIssue[] = [makeIssue('TRUNCATION', 'CRITICAL')];

    expect(isCriticalTruncationOnly(issues)).toBe(true);
  });

  it('returns false when no critical issues at all', () => {
    const issues: SelfReviewIssue[] = [
      makeIssue('TRUNCATION', 'MAJOR'),
      makeIssue('STRUCTURAL', 'MINOR'),
    ];

    expect(isCriticalTruncationOnly(issues)).toBe(false);
  });

  it('returns false when critical issues include non-TRUNCATION types', () => {
    const issues: SelfReviewIssue[] = [
      makeIssue('TRUNCATION', 'CRITICAL'),
      makeIssue('STRUCTURAL', 'CRITICAL'),
    ];

    expect(isCriticalTruncationOnly(issues)).toBe(false);
  });

  it('returns false for empty issues array', () => {
    expect(isCriticalTruncationOnly([])).toBe(false);
  });

  it('returns true for multiple CRITICAL TRUNCATION issues', () => {
    const issues: SelfReviewIssue[] = [
      makeIssue('TRUNCATION', 'CRITICAL'),
      makeIssue('TRUNCATION', 'CRITICAL'),
      makeIssue('TRUNCATION', 'CRITICAL'),
    ];

    expect(isCriticalTruncationOnly(issues)).toBe(true);
  });

  it('returns true for mix of CRITICAL TRUNCATION and MINOR non-truncation (only criticals count)', () => {
    const issues: SelfReviewIssue[] = [
      makeIssue('TRUNCATION', 'CRITICAL'),
      makeIssue('CONTENT', 'MINOR'),
      makeIssue('LANGUAGE', 'MINOR'),
    ];

    expect(isCriticalTruncationOnly(issues)).toBe(true);
  });
});

// ============================================================================
// buildRegenerateTelemetryUpdate
// ============================================================================

describe('buildRegenerateTelemetryUpdate', () => {
  it('truncation-only: sets mode=truncation_continuation, regenerateCount unchanged, truncationCount+1', () => {
    const state = buildState({ regenerateCount: 2, truncationCount: 1 });
    const issues: SelfReviewIssue[] = [makeIssue('TRUNCATION', 'CRITICAL')];

    const result = buildRegenerateTelemetryUpdate(state, issues);

    expect(result.regenerationMode).toBe('truncation_continuation');
    expect(result.regenerateCount).toBe(2);
    expect(result.truncationCount).toBe(2);
  });

  it('non-truncation: sets mode=full_regenerate, regenerateCount+1, truncationCount unchanged', () => {
    const state = buildState({ regenerateCount: 1, truncationCount: 3 });
    const issues: SelfReviewIssue[] = [makeIssue('STRUCTURAL', 'CRITICAL')];

    const result = buildRegenerateTelemetryUpdate(state, issues);

    expect(result.regenerationMode).toBe('full_regenerate');
    expect(result.regenerateCount).toBe(2);
    expect(result.truncationCount).toBe(3);
  });

  it('accumulates rejectedTokens: state.rejectedTokens=100, lastGenerationTokens=500 → rejectedTokens=600', () => {
    const state = buildState({ rejectedTokens: 100, lastGenerationTokens: 500 });
    const issues: SelfReviewIssue[] = [makeIssue('CONTENT', 'CRITICAL')];

    const result = buildRegenerateTelemetryUpdate(state, issues);

    expect(result.rejectedTokens).toBe(600);
  });

  it('zero lastGenerationTokens: rejectedTokens = state.rejectedTokens + 0', () => {
    const state = buildState({ rejectedTokens: 200, lastGenerationTokens: 0 });
    const issues: SelfReviewIssue[] = [makeIssue('LANGUAGE', 'CRITICAL')];

    const result = buildRegenerateTelemetryUpdate(state, issues);

    expect(result.rejectedTokens).toBe(200);
  });

  it('negative lastGenerationTokens clamped to 0: rejectedTokens = state.rejectedTokens only', () => {
    const state = buildState({ rejectedTokens: 150, lastGenerationTokens: -100 });
    const issues: SelfReviewIssue[] = [makeIssue('LOGIC', 'CRITICAL')];

    const result = buildRegenerateTelemetryUpdate(state, issues);

    expect(result.rejectedTokens).toBe(150);
  });

  it('nullish state fields default to 0', () => {
    const state = buildState({
      regenerateCount: undefined as unknown as number,
      truncationCount: undefined as unknown as number,
      rejectedTokens: undefined as unknown as number,
      lastGenerationTokens: undefined as unknown as number,
    });
    const issues: SelfReviewIssue[] = [makeIssue('TRUNCATION', 'CRITICAL')];

    const result = buildRegenerateTelemetryUpdate(state, issues);

    expect(result.regenerationMode).toBe('truncation_continuation');
    expect(result.regenerateCount).toBe(0);
    expect(result.truncationCount).toBe(1);
    expect(result.rejectedTokens).toBe(0);
  });
});
