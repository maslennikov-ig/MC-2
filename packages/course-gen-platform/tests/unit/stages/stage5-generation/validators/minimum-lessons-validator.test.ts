/**
 * Tests for stage5-generation/validators/minimum-lessons-validator.ts
 *
 * MinimumLessonsValidator: FR-015 minimum lessons validation
 * - validateSections (Section[] format)
 * - validateV2Specs (LessonSpecificationV2[] format)
 * - getRecommendations
 * - maxLessons tolerance warning
 * - strictMode
 */
import { describe, it, expect } from 'vitest';
import { MinimumLessonsValidator } from '../../../../../src/stages/stage5-generation/validators/minimum-lessons-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSections(lessonCounts: number[]) {
  return lessonCounts.map((count, i) => ({
    section_number: i + 1,
    section_title: `Section ${i + 1}`,
    lessons: Array.from({ length: count }, (_, j) => ({
      lesson_id: `${i + 1}.${j + 1}`,
      lesson_title: `Lesson ${i + 1}.${j + 1}`,
    })),
  }));
}

function makeV2Specs(lessonIds: string[]) {
  return lessonIds.map(id => ({
    lesson_id: id,
    title: `Lesson ${id}`,
    section_number: parseInt(id.split('.')[0]),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructor defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('MinimumLessonsValidator — defaults', () => {
  it('defaults to 10 minimum lessons', () => {
    const validator = new MinimumLessonsValidator();
    const sections = makeSections([3, 3, 3]);
    const result = validator.validateSections(sections as any);
    expect(result.minimumRequired).toBe(10);
    expect(result.passed).toBe(false);
    expect(result.deficit).toBe(1);
  });

  it('accepts custom minimum', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 5 });
    const sections = makeSections([3, 3]);
    const result = validator.validateSections(sections as any);
    expect(result.minimumRequired).toBe(5);
    expect(result.passed).toBe(true);
    expect(result.deficit).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateSections
// ─────────────────────────────────────────────────────────────────────────────

describe('MinimumLessonsValidator.validateSections', () => {
  it('passes when total >= minimum', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
    const sections = makeSections([4, 3, 3]);
    const result = validator.validateSections(sections as any);
    expect(result.passed).toBe(true);
    expect(result.totalLessons).toBe(10);
    expect(result.deficit).toBe(0);
  });

  it('fails when total < minimum', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
    const sections = makeSections([2, 2, 2]);
    const result = validator.validateSections(sections as any);
    expect(result.passed).toBe(false);
    expect(result.totalLessons).toBe(6);
    expect(result.deficit).toBe(4);
  });

  it('provides section breakdown', () => {
    const validator = new MinimumLessonsValidator();
    const sections = makeSections([5, 3, 2]);
    const result = validator.validateSections(sections as any);
    expect(result.sectionBreakdown).toHaveLength(3);
    expect(result.sectionBreakdown[0].lessonCount).toBe(5);
    expect(result.sectionBreakdown[1].lessonCount).toBe(3);
    expect(result.sectionBreakdown[2].lessonCount).toBe(2);
  });

  it('provides recommendations on failure', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
    const sections = makeSections([2, 2, 2]);
    const result = validator.validateSections(sections as any);
    expect(result.recommendations).toBeDefined();
    expect(result.recommendations!.length).toBeGreaterThan(0);
    expect(result.recommendations![0]).toContain('Add 4 more lessons');
  });

  it('no recommendations on success', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 5 });
    const sections = makeSections([3, 3]);
    const result = validator.validateSections(sections as any);
    expect(result.recommendations).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateV2Specs
// ─────────────────────────────────────────────────────────────────────────────

describe('MinimumLessonsValidator.validateV2Specs', () => {
  it('passes for enough V2 specs', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 5 });
    const specs = makeV2Specs(['1.1', '1.2', '2.1', '2.2', '3.1']);
    const result = validator.validateV2Specs(specs as any);
    expect(result.passed).toBe(true);
    expect(result.totalLessons).toBe(5);
  });

  it('fails for insufficient V2 specs', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 10 });
    const specs = makeV2Specs(['1.1', '1.2', '2.1']);
    const result = validator.validateV2Specs(specs as any);
    expect(result.passed).toBe(false);
    expect(result.deficit).toBe(7);
  });

  it('groups specs by section in breakdown', () => {
    const validator = new MinimumLessonsValidator({ minimumLessons: 3 });
    const specs = makeV2Specs(['1.1', '1.2', '2.1', '2.2', '2.3']);
    const result = validator.validateV2Specs(specs as any);
    expect(result.sectionBreakdown).toHaveLength(2);
    const sec1 = result.sectionBreakdown.find((s: any) => s.sectionId === 'section-1');
    const sec2 = result.sectionBreakdown.find((s: any) => s.sectionId === 'section-2');
    expect(sec1?.lessonCount).toBe(2);
    expect(sec2?.lessonCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// maxLessons tolerance
// ─────────────────────────────────────────────────────────────────────────────

describe('MinimumLessonsValidator — maxLessons tolerance', () => {
  it('sets maxExceeded when lessons exceed max with tolerance', () => {
    const validator = new MinimumLessonsValidator({
      minimumLessons: 5,
      maxLessons: 10,
      maxLessonsTolerancePercent: 20, // warn if > 12
    });
    const sections = makeSections([5, 5, 5]); // 15 > 12
    const result = validator.validateSections(sections as any);
    expect(result.maxExceeded).toBe(true);
    expect(result.excessPercentage).toBe(50);
    expect(result.maximumAllowed).toBe(10);
  });

  it('does not set maxExceeded when within tolerance', () => {
    const validator = new MinimumLessonsValidator({
      minimumLessons: 5,
      maxLessons: 10,
      maxLessonsTolerancePercent: 20,
    });
    const sections = makeSections([4, 4, 3]); // 11 <= 12
    const result = validator.validateSections(sections as any);
    expect(result.maxExceeded).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// strictMode
// ─────────────────────────────────────────────────────────────────────────────

describe('MinimumLessonsValidator — strictMode', () => {
  it('throws in strictMode on failure', () => {
    const validator = new MinimumLessonsValidator({
      minimumLessons: 10,
      strictMode: true,
    });
    const sections = makeSections([2, 2]);
    expect(() => validator.validateSections(sections as any)).toThrow('FR-015 validation failed');
  });

  it('does not throw in strictMode on success', () => {
    const validator = new MinimumLessonsValidator({
      minimumLessons: 5,
      strictMode: true,
    });
    const sections = makeSections([3, 3]);
    expect(() => validator.validateSections(sections as any)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRecommendations
// ─────────────────────────────────────────────────────────────────────────────

describe('MinimumLessonsValidator.getRecommendations', () => {
  it('recommends expanding low-lesson sections', () => {
    const validator = new MinimumLessonsValidator();
    const result = validator.getRecommendations({
      passed: false,
      totalLessons: 6,
      minimumRequired: 10,
      deficit: 4,
      sectionBreakdown: [
        { sectionId: 'section-1', sectionTitle: 'Intro', lessonCount: 2 },
        { sectionId: 'section-2', sectionTitle: 'Main', lessonCount: 4 },
      ],
    });
    expect(result.some((r: string) => r.includes('"Intro"'))).toBe(true);
  });

  it('warns about empty sections', () => {
    const validator = new MinimumLessonsValidator();
    const result = validator.getRecommendations({
      passed: false,
      totalLessons: 3,
      minimumRequired: 10,
      deficit: 7,
      sectionBreakdown: [
        { sectionId: 'section-1', sectionTitle: 'Intro', lessonCount: 3 },
        { sectionId: 'section-2', sectionTitle: 'Empty', lessonCount: 0 },
      ],
    });
    expect(result.some((r: string) => r.includes('no lessons'))).toBe(true);
  });
});
