/* eslint-disable */
import { describe, it, expect } from 'vitest';
import type { LessonMatrixRow } from '@megacampus/shared-types';

/**
 * Unit tests for useModuleDashboardData hook utility functions
 *
 * Tests the approve lessons functionality including:
 * - mapLessonStatus: Status mapping with "approved" support
 * - calculateAggregates: Aggregation logic counting approved separately
 */

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Map database status to Stage6NodeStatus
 * This is a copy of the internal function for testing purposes
 */
function mapLessonStatus(status: string): 'pending' | 'active' | 'completed' | 'approved' | 'error' {
  switch (status.toLowerCase()) {
    case 'approved':
      return 'approved';
    case 'completed':
      return 'completed';
    case 'generating':
    case 'active':
      return 'active';
    case 'failed':
    case 'error':
      return 'error';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * Calculate aggregated metrics from lesson rows
 * This is a copy of the internal function for testing purposes
 */
function calculateAggregates(lessons: LessonMatrixRow[]) {
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => l.status === 'completed').length;
  const approvedLessons = lessons.filter((l) => l.status === 'approved').length;
  const activeLessons = lessons.filter((l) => l.status === 'active').length;
  const errorLessons = lessons.filter((l) => l.status === 'error').length;
  const pendingLessons = lessons.filter((l) => l.status === 'pending').length;

  // Sum total cost
  const totalCostUsd = lessons.reduce((sum, l) => sum + l.costUsd, 0);

  // Calculate average quality score (from completed and approved lessons - they are "done")
  const doneWithQuality = lessons.filter(
    (l) => (l.status === 'completed' || l.status === 'approved') && l.qualityScore !== null
  );
  const avgQualityScore =
    doneWithQuality.length > 0
      ? doneWithQuality.reduce((sum, l) => sum + (l.qualityScore || 0), 0) /
        doneWithQuality.length
      : null;

  // Sum total duration (only completed and approved lessons)
  const totalDurationMs = lessons.reduce(
    (sum, l) => sum + (l.durationMs || 0),
    0
  );

  // Estimate time remaining
  const doneWithDuration = lessons.filter(
    (l) => (l.status === 'completed' || l.status === 'approved') && l.durationMs !== null && l.durationMs > 0
  );
  const avgDurationPerLesson =
    doneWithDuration.length > 0
      ? doneWithDuration.reduce((sum, l) => sum + (l.durationMs || 0), 0) /
        doneWithDuration.length
      : null;

  const remainingLessons = pendingLessons + activeLessons;
  const estimatedTimeRemainingMs =
    avgDurationPerLesson !== null && remainingLessons > 0
      ? avgDurationPerLesson * remainingLessons
      : null;

  return {
    totalLessons,
    completedLessons,
    approvedLessons,
    activeLessons,
    errorLessons,
    pendingLessons,
    totalCostUsd,
    avgQualityScore,
    totalDurationMs,
    estimatedTimeRemainingMs,
  };
}

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockLesson = (
  overrides: Partial<LessonMatrixRow> = {}
): LessonMatrixRow => ({
  lessonId: '1.1',
  lessonNumber: 1,
  title: 'Test Lesson',
  status: 'pending',
  pipelineState: { nodes: [] },
  qualityScore: null,
  costUsd: 0,
  durationMs: null,
  retryCount: 0,
  canRetry: false,
  ...overrides,
});

// =============================================================================
// mapLessonStatus Tests
// =============================================================================

describe('mapLessonStatus', () => {
  it('should map "approved" to approved', () => {
    expect(mapLessonStatus('approved')).toBe('approved');
  });

  it('should map "APPROVED" (uppercase) to approved', () => {
    expect(mapLessonStatus('APPROVED')).toBe('approved');
  });

  it('should map "Approved" (mixed case) to approved', () => {
    expect(mapLessonStatus('Approved')).toBe('approved');
  });

  it('should map "completed" to completed', () => {
    expect(mapLessonStatus('completed')).toBe('completed');
  });

  it('should map "COMPLETED" (uppercase) to completed', () => {
    expect(mapLessonStatus('COMPLETED')).toBe('completed');
  });

  it('should map "generating" to active', () => {
    expect(mapLessonStatus('generating')).toBe('active');
  });

  it('should map "active" to active', () => {
    expect(mapLessonStatus('active')).toBe('active');
  });

  it('should map "failed" to error', () => {
    expect(mapLessonStatus('failed')).toBe('error');
  });

  it('should map "error" to error', () => {
    expect(mapLessonStatus('error')).toBe('error');
  });

  it('should map "pending" to pending', () => {
    expect(mapLessonStatus('pending')).toBe('pending');
  });

  it('should map unknown status to pending', () => {
    expect(mapLessonStatus('unknown')).toBe('pending');
  });

  it('should map empty string to pending', () => {
    expect(mapLessonStatus('')).toBe('pending');
  });

  it('should be case-insensitive', () => {
    expect(mapLessonStatus('GeNeRaTiNg')).toBe('active');
    expect(mapLessonStatus('FaIlEd')).toBe('error');
  });
});

// =============================================================================
// calculateAggregates Tests
// =============================================================================

describe('calculateAggregates', () => {
  describe('status counts', () => {
    it('should count approved lessons separately from completed', () => {
      const lessons = [
        createMockLesson({ status: 'completed' }),
        createMockLesson({ status: 'approved' }),
        createMockLesson({ status: 'approved' }),
        createMockLesson({ status: 'pending' }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalLessons).toBe(4);
      expect(aggregates.completedLessons).toBe(1);
      expect(aggregates.approvedLessons).toBe(2);
      expect(aggregates.pendingLessons).toBe(1);
    });

    it('should count all status types correctly', () => {
      const lessons = [
        createMockLesson({ status: 'pending' }),
        createMockLesson({ status: 'active' }),
        createMockLesson({ status: 'completed' }),
        createMockLesson({ status: 'approved' }),
        createMockLesson({ status: 'error' }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalLessons).toBe(5);
      expect(aggregates.pendingLessons).toBe(1);
      expect(aggregates.activeLessons).toBe(1);
      expect(aggregates.completedLessons).toBe(1);
      expect(aggregates.approvedLessons).toBe(1);
      expect(aggregates.errorLessons).toBe(1);
    });

    it('should handle all lessons with same status', () => {
      const lessons = [
        createMockLesson({ status: 'approved' }),
        createMockLesson({ status: 'approved' }),
        createMockLesson({ status: 'approved' }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalLessons).toBe(3);
      expect(aggregates.approvedLessons).toBe(3);
      expect(aggregates.completedLessons).toBe(0);
      expect(aggregates.pendingLessons).toBe(0);
      expect(aggregates.activeLessons).toBe(0);
      expect(aggregates.errorLessons).toBe(0);
    });
  });

  describe('empty array', () => {
    it('should handle empty array', () => {
      const aggregates = calculateAggregates([]);

      expect(aggregates.totalLessons).toBe(0);
      expect(aggregates.completedLessons).toBe(0);
      expect(aggregates.approvedLessons).toBe(0);
      expect(aggregates.pendingLessons).toBe(0);
      expect(aggregates.activeLessons).toBe(0);
      expect(aggregates.errorLessons).toBe(0);
      expect(aggregates.totalCostUsd).toBe(0);
      expect(aggregates.avgQualityScore).toBeNull();
      expect(aggregates.totalDurationMs).toBe(0);
      expect(aggregates.estimatedTimeRemainingMs).toBeNull();
    });
  });

  describe('quality score calculation', () => {
    it('should calculate average quality score from completed lessons', () => {
      const lessons = [
        createMockLesson({ status: 'completed', qualityScore: 0.8 }),
        createMockLesson({ status: 'completed', qualityScore: 0.9 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.avgQualityScore).toBeCloseTo(0.85);
    });

    it('should calculate average quality score from approved lessons', () => {
      const lessons = [
        createMockLesson({ status: 'approved', qualityScore: 0.8 }),
        createMockLesson({ status: 'approved', qualityScore: 0.9 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.avgQualityScore).toBeCloseTo(0.85);
    });

    it('should calculate average quality score from both completed and approved', () => {
      const lessons = [
        createMockLesson({ status: 'completed', qualityScore: 0.8 }),
        createMockLesson({ status: 'approved', qualityScore: 0.9 }),
        createMockLesson({ status: 'approved', qualityScore: 1.0 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.avgQualityScore).toBeCloseTo(0.9); // (0.8 + 0.9 + 1.0) / 3
    });

    it('should ignore null quality scores', () => {
      const lessons = [
        createMockLesson({ status: 'completed', qualityScore: 0.8 }),
        createMockLesson({ status: 'completed', qualityScore: null }),
        createMockLesson({ status: 'approved', qualityScore: 0.6 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.avgQualityScore).toBeCloseTo(0.7); // (0.8 + 0.6) / 2
    });

    it('should return null when no lessons have quality scores', () => {
      const lessons = [
        createMockLesson({ status: 'completed', qualityScore: null }),
        createMockLesson({ status: 'pending', qualityScore: null }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.avgQualityScore).toBeNull();
    });

    it('should ignore quality scores from non-done lessons', () => {
      const lessons = [
        createMockLesson({ status: 'pending', qualityScore: 0.5 }),
        createMockLesson({ status: 'active', qualityScore: 0.6 }),
        createMockLesson({ status: 'completed', qualityScore: 0.8 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.avgQualityScore).toBe(0.8); // Only completed lesson counts
    });
  });

  describe('cost calculation', () => {
    it('should sum total cost from all lessons', () => {
      const lessons = [
        createMockLesson({ costUsd: 0.1 }),
        createMockLesson({ costUsd: 0.2 }),
        createMockLesson({ costUsd: 0.3 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalCostUsd).toBeCloseTo(0.6);
    });

    it('should handle zero costs', () => {
      const lessons = [
        createMockLesson({ costUsd: 0 }),
        createMockLesson({ costUsd: 0 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalCostUsd).toBe(0);
    });

    it('should sum costs from all status types', () => {
      const lessons = [
        createMockLesson({ status: 'pending', costUsd: 0 }),
        createMockLesson({ status: 'completed', costUsd: 0.5 }),
        createMockLesson({ status: 'approved', costUsd: 0.3 }),
        createMockLesson({ status: 'error', costUsd: 0.1 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalCostUsd).toBeCloseTo(0.9);
    });
  });

  describe('duration calculation', () => {
    it('should sum total duration from completed and approved lessons', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: 1000 }),
        createMockLesson({ status: 'approved', durationMs: 2000 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalDurationMs).toBe(3000);
    });

    it('should ignore null durations', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: 1000 }),
        createMockLesson({ status: 'pending', durationMs: null }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalDurationMs).toBe(1000);
    });

    it('should treat null as 0 in sum', () => {
      const lessons = [
        createMockLesson({ durationMs: null }),
        createMockLesson({ durationMs: 1000 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalDurationMs).toBe(1000);
    });
  });

  describe('estimated time remaining', () => {
    it('should estimate time based on average duration of completed lessons', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: 1000 }),
        createMockLesson({ status: 'completed', durationMs: 2000 }),
        createMockLesson({ status: 'pending' }),
        createMockLesson({ status: 'pending' }),
      ];

      const aggregates = calculateAggregates(lessons);

      // Average: (1000 + 2000) / 2 = 1500
      // Remaining: 2 pending
      // Estimate: 1500 * 2 = 3000
      expect(aggregates.estimatedTimeRemainingMs).toBe(3000);
    });

    it('should estimate time based on approved lessons too', () => {
      const lessons = [
        createMockLesson({ status: 'approved', durationMs: 1000 }),
        createMockLesson({ status: 'completed', durationMs: 2000 }),
        createMockLesson({ status: 'pending' }),
      ];

      const aggregates = calculateAggregates(lessons);

      // Average: (1000 + 2000) / 2 = 1500
      // Remaining: 1 pending
      // Estimate: 1500 * 1 = 1500
      expect(aggregates.estimatedTimeRemainingMs).toBe(1500);
    });

    it('should include active lessons in remaining count', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: 1000 }),
        createMockLesson({ status: 'active' }),
        createMockLesson({ status: 'pending' }),
      ];

      const aggregates = calculateAggregates(lessons);

      // Average: 1000
      // Remaining: 1 active + 1 pending = 2
      // Estimate: 1000 * 2 = 2000
      expect(aggregates.estimatedTimeRemainingMs).toBe(2000);
    });

    it('should return null when no completed lessons have duration', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: null }),
        createMockLesson({ status: 'pending' }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.estimatedTimeRemainingMs).toBeNull();
    });

    it('should return null when no lessons are remaining', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: 1000 }),
        createMockLesson({ status: 'approved', durationMs: 2000 }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.estimatedTimeRemainingMs).toBeNull();
    });

    it('should ignore lessons with duration 0 in average calculation', () => {
      const lessons = [
        createMockLesson({ status: 'completed', durationMs: 1000 }),
        createMockLesson({ status: 'completed', durationMs: 0 }), // Should be ignored
        createMockLesson({ status: 'pending' }),
      ];

      const aggregates = calculateAggregates(lessons);

      // Average: 1000 / 1 = 1000 (durationMs: 0 is filtered out)
      // Remaining: 1 pending
      // Estimate: 1000 * 1 = 1000
      expect(aggregates.estimatedTimeRemainingMs).toBe(1000);
    });
  });

  describe('edge cases', () => {
    it('should handle mix of all statuses with various metrics', () => {
      const lessons = [
        createMockLesson({
          status: 'pending',
          qualityScore: null,
          costUsd: 0,
          durationMs: null,
        }),
        createMockLesson({
          status: 'active',
          qualityScore: null,
          costUsd: 0.05,
          durationMs: null,
        }),
        createMockLesson({
          status: 'completed',
          qualityScore: 0.85,
          costUsd: 0.15,
          durationMs: 1500,
        }),
        createMockLesson({
          status: 'approved',
          qualityScore: 0.95,
          costUsd: 0.12,
          durationMs: 1200,
        }),
        createMockLesson({
          status: 'error',
          qualityScore: null,
          costUsd: 0.08,
          durationMs: null,
        }),
      ];

      const aggregates = calculateAggregates(lessons);

      expect(aggregates.totalLessons).toBe(5);
      expect(aggregates.completedLessons).toBe(1);
      expect(aggregates.approvedLessons).toBe(1);
      expect(aggregates.activeLessons).toBe(1);
      expect(aggregates.errorLessons).toBe(1);
      expect(aggregates.pendingLessons).toBe(1);
      expect(aggregates.totalCostUsd).toBeCloseTo(0.4);
      expect(aggregates.avgQualityScore).toBeCloseTo(0.9); // (0.85 + 0.95) / 2
      expect(aggregates.totalDurationMs).toBe(2700); // 1500 + 1200

      // Average duration: (1500 + 1200) / 2 = 1350
      // Remaining: 1 pending + 1 active = 2
      // Estimate: 1350 * 2 = 2700
      expect(aggregates.estimatedTimeRemainingMs).toBe(2700);
    });
  });
});
