/**
 * Tests for stage6-lesson-content/judge/cascade/text-utils.ts
 *
 * Covers syllable counting and Flesch-Kincaid readability scoring.
 */
import { describe, it, expect } from 'vitest';
import {
  countSyllables,
  calculateFleschKincaid,
} from '@/stages/stage6-lesson-content/judge/cascade/text-utils';

describe('countSyllables', () => {
  it('returns 0 for empty string', () => {
    expect(countSyllables('')).toBe(0);
  });

  it('returns 0 for string with no letters', () => {
    expect(countSyllables('123 !@#')).toBe(0);
  });

  it('returns 1 for short words <= 3 letters', () => {
    expect(countSyllables('a')).toBe(1);
    expect(countSyllables('to')).toBe(1);
    expect(countSyllables('the')).toBe(1);
  });

  it('counts vowel groups properly', () => {
    expect(countSyllables('reading')).toBe(2);
    expect(countSyllables('book')).toBe(1);
  });

  it('handles silent e', () => {
    expect(countSyllables('make')).toBe(1);
    expect(countSyllables('outside')).toBe(2);
  });

  it('handles le endings', () => {
    expect(countSyllables('apple')).toBe(2);
    expect(countSyllables('bottle')).toBe(2);
  });

  it('handles es and ed endings', () => {
    expect(countSyllables('passed')).toBe(1);
    expect(countSyllables('glasses')).toBe(1);
  });

  it('returns minimum 1 for words with letters', () => {
    expect(countSyllables('rhythm')).toBe(1);
  });
});

describe('calculateFleschKincaid', () => {
  it('calculates score correctly for simple sentence', () => {
    const text = 'The cat sat on the mat.';
    const score = calculateFleschKincaid(text);
    // Result is clamped to at least 1
    expect(score).toBe(1);
  });

  it('calculates score correctly for complex sentence', () => {
    const text = 'Australian platypus is seemingly a hybrid of a mammal and reptilian creature.';
    const score = calculateFleschKincaid(text);
    expect(score).toBeGreaterThan(5);
    expect(score).toBeLessThan(15);
  });

  it('handles empty string without NaN', () => {
    expect(calculateFleschKincaid('')).toBe(1);
  });

  it('handles text without punctuation', () => {
    const score = calculateFleschKincaid('This is a simple test without proper ending');
    expect(score).toBeGreaterThan(0);
  });

  it('maxes out at 20', () => {
    const text =
      'Supercalifragilisticexpialidocious pseudopseudohypoparathyroidism pneumonoultramicroscopicsilicovolcanoconiosis. Floccinaucinihilipilification incomprehensibilities uncharacteristically.';
    const score = calculateFleschKincaid(text);
    expect(score).toBe(20);
  });
});
