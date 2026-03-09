/**
 * Tests for shared/validation — locale-validator, enum-synonyms, preprocessing
 */

import { describe, it, expect } from 'vitest';
import {
  isValidLocale,
  validateLocale,
  DEFAULT_LOCALE,
} from '@/shared/validation/locale-validator';
import { ENUM_SYNONYMS } from '@/shared/validation/enum-synonyms';
import { preprocessValue, preprocessObject } from '@/shared/validation/preprocessing';

// ─────────────────────────────────────────────────────────────────────────────
// locale-validator
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidLocale', () => {
  it('returns true for valid locale "ru"', () => {
    expect(isValidLocale('ru')).toBe(true);
  });

  it('returns true for valid locale "en"', () => {
    expect(isValidLocale('en')).toBe(true);
  });

  it('returns false for unknown locale', () => {
    expect(isValidLocale('fr')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isValidLocale(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidLocale(undefined)).toBe(false);
  });

  it('returns false for number', () => {
    expect(isValidLocale(42)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidLocale('')).toBe(false);
  });

  it('returns false for uppercase locale', () => {
    expect(isValidLocale('RU')).toBe(false);
  });
});

describe('validateLocale', () => {
  it('returns valid locale unchanged', () => {
    expect(validateLocale('ru')).toBe('ru');
    expect(validateLocale('en')).toBe('en');
  });

  it('returns default (ru) for null', () => {
    expect(validateLocale(null)).toBe('ru');
  });

  it('returns default (ru) for undefined', () => {
    expect(validateLocale(undefined)).toBe('ru');
  });

  it('returns default (ru) for invalid locale', () => {
    expect(validateLocale('fr')).toBe('ru');
  });

  it('uses custom fallback when specified', () => {
    expect(validateLocale('invalid', 'en')).toBe('en');
  });

  it('DEFAULT_LOCALE is "ru"', () => {
    expect(DEFAULT_LOCALE).toBe('ru');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enum-synonyms
// ─────────────────────────────────────────────────────────────────────────────

describe('ENUM_SYNONYMS', () => {
  it('has target_audience mappings for beginner synonyms', () => {
    expect(ENUM_SYNONYMS.target_audience['entry-level']).toBe('beginner');
    expect(ENUM_SYNONYMS.target_audience['entry_level']).toBe('beginner');
    expect(ENUM_SYNONYMS.target_audience['novice']).toBe('beginner');
  });

  it('has target_audience mappings for advanced synonyms', () => {
    expect(ENUM_SYNONYMS.target_audience['expert']).toBe('advanced');
    expect(ENUM_SYNONYMS.target_audience['professional']).toBe('advanced');
  });

  it('has difficulty_level mappings', () => {
    expect(ENUM_SYNONYMS.difficulty_level['easy']).toBe('beginner');
    expect(ENUM_SYNONYMS.difficulty_level['medium']).toBe('intermediate');
    expect(ENUM_SYNONYMS.difficulty_level['hard']).toBe('advanced');
  });

  it('has importance mappings', () => {
    expect(ENUM_SYNONYMS.importance['high']).toBe('complex');
    expect(ENUM_SYNONYMS.importance['low']).toBe('simple');
    expect(ENUM_SYNONYMS.importance['medium']).toBe('normal');
  });

  it('is a non-empty object', () => {
    expect(Object.keys(ENUM_SYNONYMS).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// preprocessing: preprocessValue
// ─────────────────────────────────────────────────────────────────────────────

describe('preprocessValue', () => {
  it('returns unchanged value when no transformation needed', () => {
    const result = preprocessValue('beginner', 'target_audience');
    expect(result.transformed).toBe(false);
    expect(result.value).toBe('beginner');
  });

  it('applies lowercase normalization', () => {
    const result = preprocessValue('Beginner', 'target_audience');
    expect(result.transformed).toBe(true);
    expect(result.value).toBe('beginner'); // lowercased → matches 'beginner' already canonical
  });

  it('applies synonym mapping for target_audience', () => {
    const result = preprocessValue('entry-level', 'target_audience');
    expect(result.transformed).toBe(true);
    expect(result.value).toBe('beginner');
    expect(result.originalValue).toBe('entry-level');
  });

  it('converts hyphens to underscores then checks synonym', () => {
    const result = preprocessValue('entry-level', 'target_audience');
    expect(result.transformed).toBe(true);
    expect(result.value).toBe('beginner');
  });

  it('converts spaces to underscores', () => {
    // "entry level" → "entry_level" → synonyms lookup
    const result = preprocessValue('entry level', 'target_audience');
    expect(result.transformed).toBe(true);
    expect(result.value).toBe('beginner');
  });

  it('handles difficulty_level synonym mapping', () => {
    const result = preprocessValue('hard', 'difficulty_level');
    expect(result.transformed).toBe(true);
    expect(result.value).toBe('advanced');
  });

  it('handles unknown field (no synonym mapping)', () => {
    const result = preprocessValue('someValue', 'unknown_field');
    expect(result.value).toBe('somevalue'); // lowercased
    expect(result.transformed).toBe(true); // transformed to lowercase
  });

  it('sets transformation description', () => {
    const result = preprocessValue('entry-level', 'target_audience');
    expect(result.transformation).toContain('entry-level');
    expect(result.transformation).toContain('beginner');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// preprocessing: preprocessObject
// ─────────────────────────────────────────────────────────────────────────────

describe('preprocessObject', () => {
  it('transforms enum fields according to schema', () => {
    const obj = { difficulty_level: 'hard', title: 'Some Title' };
    const schema = { difficulty_level: 'enum' as const, title: 'other' as const };
    const result = preprocessObject(obj, schema);
    expect(result.difficulty_level).toBe('advanced');
    expect(result.title).toBe('Some Title'); // non-enum unchanged
  });

  it('does not transform "other" typed fields', () => {
    const obj = { title: 'Expert Course' }; // "Expert" would be a synonym for some fields
    const schema = { title: 'other' as const };
    const result = preprocessObject(obj, schema);
    expect(result.title).toBe('Expert Course'); // unchanged, it's "other" type
  });

  it('does not modify non-string enum fields', () => {
    const obj = { difficulty_level: 3 }; // number, not string
    const schema = { difficulty_level: 'enum' as const };
    const result = preprocessObject(obj, schema);
    expect(result.difficulty_level).toBe(3); // unchanged
  });

  it('preserves keys not in schema', () => {
    const obj = { known: 'expert', extra: 'keep me' };
    const schema = { known: 'enum' as const };
    const result = preprocessObject(obj, schema);
    expect(result.extra).toBe('keep me');
  });

  it('handles empty object', () => {
    const result = preprocessObject({}, {});
    expect(result).toEqual({});
  });
});
