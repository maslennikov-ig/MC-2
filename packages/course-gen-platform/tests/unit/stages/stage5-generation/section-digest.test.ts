/**
 * Unit Tests for Stage 5 Section Digest (anti-duplication)
 *
 * Tests buildSectionDigest() and sanitizeDigest() — pure functions
 * that build text digests of previously generated sections for
 * cross-section context in sequential generation.
 *
 * @module tests/unit/stage5/section-digest.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildSectionDigest,
  sanitizeDigest,
} from '@/stages/stage5-generation/phases/generation-phases';
import type { Section } from '@megacampus/shared-types';

// ============================================================================
// HELPERS
// ============================================================================

/** Create a minimal Section for testing */
function createSection(overrides: Partial<Section> = {}): Section {
  return {
    section_title: 'Test Section',
    section_number: 1,
    lessons: [
      {
        lesson_number: 1,
        lesson_title: 'Introduction',
        key_topics: ['topic A', 'topic B'],
        learning_objectives: ['Understand basics'],
        estimated_duration_minutes: 15,
      },
    ],
    estimated_duration_minutes: 15,
    ...overrides,
  } as Section;
}

// ============================================================================
// sanitizeDigest
// ============================================================================

describe('sanitizeDigest', () => {
  it('should return plain text unchanged', () => {
    expect(sanitizeDigest('Hello World')).toBe('Hello World');
  });

  it('should strip newlines', () => {
    expect(sanitizeDigest('Line1\nLine2\rLine3')).toBe('Line1 Line2 Line3');
  });

  it('should strip consecutive newlines as single replacement', () => {
    // Regex [\n\r]+ replaces each run of newlines/CRs with one space
    expect(sanitizeDigest('A\n\n\nB\r\n\rC')).toBe('A B C');
  });

  it('should trim whitespace', () => {
    expect(sanitizeDigest('  hello  ')).toBe('hello');
  });

  it('should limit length to default 200', () => {
    const longStr = 'A'.repeat(300);
    expect(sanitizeDigest(longStr)).toHaveLength(200);
  });

  it('should limit length to custom maxLen', () => {
    const longStr = 'A'.repeat(300);
    expect(sanitizeDigest(longStr, 50)).toHaveLength(50);
  });

  it('should handle empty string', () => {
    expect(sanitizeDigest('')).toBe('');
  });

  it('should handle string with only whitespace/newlines', () => {
    expect(sanitizeDigest('\n\r  \n')).toBe('');
  });

  it('should sanitize Cyrillic text correctly', () => {
    expect(sanitizeDigest('Хронотипы\nи биоритмы')).toBe('Хронотипы и биоритмы');
  });
});

// ============================================================================
// buildSectionDigest — normal cases
// ============================================================================

describe('buildSectionDigest', () => {
  it('should format digest with section title and lessons', () => {
    const section = createSection({
      section_title: 'Основы хронотипов',
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Что такое хронотипы',
          key_topics: ['определение', 'биологические ритмы', 'циркадный цикл'],
          learning_objectives: ['obj1'],
          estimated_duration_minutes: 15,
        },
        {
          lesson_number: 2,
          lesson_title: 'Классификация хронотипов',
          key_topics: ['совы', 'жаворонки', 'промежуточный тип'],
          learning_objectives: ['obj2'],
          estimated_duration_minutes: 15,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);

    expect(digest).toContain('Section 1 "Основы хронотипов"');
    expect(digest).toContain('Что такое хронотипы');
    expect(digest).toContain('Topics: определение, биологические ритмы, циркадный цикл');
    expect(digest).toContain('Классификация хронотипов');
    expect(digest).toContain('Topics: совы, жаворонки, промежуточный тип');
  });

  it('should use 1-indexed section number from sectionIndex', () => {
    const section = createSection({ section_title: 'Third Section' });
    const digest = buildSectionDigest(section, 2);
    expect(digest).toContain('Section 3 "Third Section"');
  });

  it('should limit key_topics to 3', () => {
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson',
          key_topics: ['A', 'B', 'C', 'D', 'E'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).toContain('Topics: A, B, C');
    expect(digest).not.toContain('D');
    expect(digest).not.toContain('E');
  });

  it('should handle lesson with single topic', () => {
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson',
          key_topics: ['only one'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).toContain('Topics: only one');
  });

  it('should handle lesson with no topics', () => {
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'No Topics Lesson',
          key_topics: [],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).toContain('No Topics Lesson');
    expect(digest).not.toContain('Topics:');
  });

  // ============================================================================
  // buildSectionDigest — edge cases
  // ============================================================================

  it('should return empty string for section with no lessons', () => {
    const section = createSection({ lessons: [] });
    expect(buildSectionDigest(section, 0)).toBe('');
  });

  it('should return empty string for undefined lessons', () => {
    const section = createSection();
    // Force undefined lessons
    (section as Record<string, unknown>).lessons = undefined;
    expect(buildSectionDigest(section, 0)).toBe('');
  });

  it('should use fallback title when section_title is empty', () => {
    const section = createSection({ section_title: '' });
    const digest = buildSectionDigest(section, 3);
    expect(digest).toContain('Section 4');
  });

  it('should use "Untitled Lesson" for empty lesson title', () => {
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: '',
          key_topics: ['topic'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).toContain('Untitled Lesson');
  });

  // ============================================================================
  // buildSectionDigest — sanitization
  // ============================================================================

  it('should sanitize newlines in lesson titles', () => {
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Title with\nnewline\rand\r\nCRLF',
          key_topics: [],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).not.toMatch(/Title with\n/);
    expect(digest).toContain('Title with newline and CRLF');
  });

  it('should sanitize newlines in section title', () => {
    const section = createSection({
      section_title: 'Section\nWith\rNewlines',
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).toContain('"Section With Newlines"');
  });

  it('should sanitize newlines in key_topics', () => {
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson',
          key_topics: ['topic\nwith\nnewlines'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    expect(digest).toContain('topic with newlines');
  });

  it('should truncate very long lesson titles to 200 chars', () => {
    const longTitle = 'A'.repeat(300);
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: longTitle,
          key_topics: [],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    // Lesson line: "  - <title>" — title should be max 200 chars
    const lessonLine = digest.split('\n').find(l => l.includes('  - '));
    const titleInLine = lessonLine?.replace('  - ', '');
    expect(titleInLine!.length).toBeLessThanOrEqual(200);
  });

  it('should truncate very long topics to 100 chars each', () => {
    const longTopic = 'B'.repeat(200);
    const section = createSection({
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson',
          key_topics: [longTopic],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const digest = buildSectionDigest(section, 0);
    // Extract topics portion
    const topicsMatch = digest.match(/Topics: (.+)\)/);
    expect(topicsMatch).toBeTruthy();
    expect(topicsMatch![1].length).toBeLessThanOrEqual(100);
  });

  // ============================================================================
  // buildSectionDigest — accumulation simulation
  // ============================================================================

  it('should produce correct accumulated digest for multiple sections', () => {
    const section1 = createSection({
      section_title: 'Section One',
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson 1A',
          key_topics: ['alpha'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    const section2 = createSection({
      section_title: 'Section Two',
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson 2A',
          key_topics: ['beta', 'gamma'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
        {
          lesson_number: 2,
          lesson_title: 'Lesson 2B',
          key_topics: ['delta'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    // Simulate accumulation as in generateSections()
    let accumulated = '';
    const digest1 = buildSectionDigest(section1, 0);
    if (digest1) accumulated += digest1;

    const digest2 = buildSectionDigest(section2, 1);
    if (digest2) accumulated += digest2;

    // Verify structure
    expect(accumulated).toContain('Section 1 "Section One"');
    expect(accumulated).toContain('Lesson 1A');
    expect(accumulated).toContain('Section 2 "Section Two"');
    expect(accumulated).toContain('Lesson 2A');
    expect(accumulated).toContain('Lesson 2B');

    // Verify ordering — Section 1 before Section 2
    const idx1 = accumulated.indexOf('Section 1');
    const idx2 = accumulated.indexOf('Section 2');
    expect(idx1).toBeLessThan(idx2);
  });

  it('should skip empty sections in accumulation', () => {
    const emptySection = createSection({ lessons: [] });
    const normalSection = createSection({
      section_title: 'Normal',
      lessons: [
        {
          lesson_number: 1,
          lesson_title: 'Lesson',
          key_topics: ['topic'],
          learning_objectives: ['obj'],
          estimated_duration_minutes: 10,
        },
      ],
    });

    let accumulated = '';

    const digest1 = buildSectionDigest(emptySection, 0);
    if (digest1) accumulated += digest1;

    const digest2 = buildSectionDigest(normalSection, 1);
    if (digest2) accumulated += digest2;

    // Should only contain Section 2 (Section 1 was empty)
    expect(accumulated).not.toContain('Section 1');
    expect(accumulated).toContain('Section 2 "Normal"');
  });
});
