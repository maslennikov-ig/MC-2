/**
 * Tests for stage4-analysis/utils/validators.ts
 *
 * Pure function tests (no Supabase/external deps):
 * - formatErrorMessage: error code → i18n key mapping
 * - validateJobInput: input validation rules
 * - PROGRESS_MESSAGES / PROGRESS_RANGES: constants integrity
 */

import { describe, it, expect } from 'vitest';
import {
  formatErrorMessage,
  validateJobInput,
  PROGRESS_MESSAGES,
  PROGRESS_RANGES,
} from '../../../../../src/stages/stage4-analysis/utils/validators';

// ─────────────────────────────────────────────────────────────────────────────
// formatErrorMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('formatErrorMessage', () => {
  it('returns errors.barrier_failed for BARRIER_FAILED prefix', () => {
    expect(formatErrorMessage(new Error('BARRIER_FAILED: 2 docs incomplete'))).toBe(
      'errors.barrier_failed'
    );
  });

  it('returns errors.barrier_failed for plain BARRIER_FAILED string', () => {
    expect(formatErrorMessage('BARRIER_FAILED: something')).toBe('errors.barrier_failed');
  });

  it('returns errors.insufficient_scope for insufficient scope error', () => {
    expect(formatErrorMessage(new Error('Insufficient scope for minimum 10 lessons'))).toBe(
      'errors.insufficient_scope'
    );
  });

  it('returns errors.llm_error for LLM_ERROR prefix', () => {
    expect(formatErrorMessage(new Error('LLM_ERROR: model timeout'))).toBe('errors.llm_error');
  });

  it('returns errors.analysis_generic for unknown errors', () => {
    expect(formatErrorMessage(new Error('Something unexpected happened'))).toBe(
      'errors.analysis_generic'
    );
  });

  it('returns errors.analysis_generic for generic string', () => {
    expect(formatErrorMessage('random error plain text')).toBe('errors.analysis_generic');
  });

  it('handles Error objects vs plain strings consistently', () => {
    const fromError = formatErrorMessage(new Error('LLM_ERROR: timeout'));
    const fromString = formatErrorMessage('LLM_ERROR: timeout');
    expect(fromError).toBe(fromString);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateJobInput
// ─────────────────────────────────────────────────────────────────────────────

function validInput(overrides = {}) {
  return {
    topic: 'Machine Learning Fundamentals',
    language: 'ru',
    lesson_duration_minutes: 30,
    ...overrides,
  };
}

describe('validateJobInput', () => {
  it('does not throw for valid input', () => {
    expect(() => validateJobInput(validInput())).not.toThrow();
  });

  it('throws when topic is too short (< 3 chars)', () => {
    expect(() => validateJobInput(validInput({ topic: 'ML' }))).toThrow(
      'Topic must be between 3 and 200 characters'
    );
  });

  it('throws when topic is too long (> 200 chars)', () => {
    expect(() => validateJobInput(validInput({ topic: 'A'.repeat(201) }))).toThrow(
      'Topic must be between 3 and 200 characters'
    );
  });

  it('accepts topic at boundary (exactly 3 chars)', () => {
    expect(() => validateJobInput(validInput({ topic: 'Art' }))).not.toThrow();
  });

  it('accepts topic at boundary (exactly 200 chars)', () => {
    expect(() => validateJobInput(validInput({ topic: 'A'.repeat(200) }))).not.toThrow();
  });

  it('throws when language code is not 2 chars', () => {
    expect(() => validateJobInput(validInput({ language: 'eng' }))).toThrow(
      'Language must be a 2-character ISO 639-1 code'
    );
  });

  it('accepts 2-char language codes (ru, en, de)', () => {
    expect(() => validateJobInput(validInput({ language: 'en' }))).not.toThrow();
    expect(() => validateJobInput(validInput({ language: 'de' }))).not.toThrow();
  });

  it('throws when lesson_duration_minutes < 3', () => {
    expect(() => validateJobInput(validInput({ lesson_duration_minutes: 2 }))).toThrow(
      'Lesson duration must be between 3 and 45 minutes'
    );
  });

  it('throws when lesson_duration_minutes > 45', () => {
    expect(() => validateJobInput(validInput({ lesson_duration_minutes: 46 }))).toThrow(
      'Lesson duration must be between 3 and 45 minutes'
    );
  });

  it('accepts lesson_duration_minutes at boundaries (3 and 45)', () => {
    expect(() => validateJobInput(validInput({ lesson_duration_minutes: 3 }))).not.toThrow();
    expect(() => validateJobInput(validInput({ lesson_duration_minutes: 45 }))).not.toThrow();
  });

  it('throws for invalid document_summaries (missing fields)', () => {
    const input = validInput({
      document_summaries: [{ document_id: 'doc-1', file_name: 'file.pdf', processed_content: '' }],
    });
    expect(() => validateJobInput(input)).toThrow('Invalid document summary format');
  });

  it('accepts valid document_summaries', () => {
    const input = validInput({
      document_summaries: [
        {
          document_id: 'doc-1',
          file_name: 'file.pdf',
          processed_content: 'Summary content here',
        },
      ],
    });
    expect(() => validateJobInput(input)).not.toThrow();
  });

  it('accepts missing document_summaries (optional field)', () => {
    const input = { topic: 'Art', language: 'en', lesson_duration_minutes: 30 };
    expect(() => validateJobInput(input)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS_MESSAGES constant integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('PROGRESS_MESSAGES', () => {
  it('has start and complete messages for each step', () => {
    const steps = ['step_0', 'step_1', 'step_2', 'step_3', 'step_4', 'step_5'];
    for (const step of steps) {
      expect(PROGRESS_MESSAGES).toHaveProperty(`${step}_start`);
      expect(PROGRESS_MESSAGES).toHaveProperty(`${step}_complete`);
    }
  });

  it('all messages are non-empty strings', () => {
    for (const value of Object.values(PROGRESS_MESSAGES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS_RANGES constant integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('PROGRESS_RANGES', () => {
  it('starts at 0 and ends at 100', () => {
    const allStarts = Object.values(PROGRESS_RANGES).map((r: any) => r.start);
    const allEnds = Object.values(PROGRESS_RANGES).map((r: any) => r.end);
    expect(Math.min(...allStarts)).toBe(0);
    expect(Math.max(...allEnds)).toBe(100);
  });

  it('start is always less than end for each range', () => {
    for (const range of Object.values(PROGRESS_RANGES)) {
      expect(range.start).toBeLessThan(range.end);
    }
  });

  it('all values are between 0 and 100', () => {
    for (const range of Object.values(PROGRESS_RANGES)) {
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(100);
    }
  });
});
