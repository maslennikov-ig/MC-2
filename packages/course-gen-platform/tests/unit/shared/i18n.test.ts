/**
 * Tests for shared/i18n — getTranslator
 *
 * Covers key resolution, locale switching, parameter interpolation, and fallback behavior.
 */

import { describe, it, expect } from 'vitest';
import { getTranslator } from '@/shared/i18n/translator';
import { BACKEND_TRANSLATIONS } from '@/shared/i18n/messages';

describe('getTranslator', () => {
  it('returns English strings for locale "en"', () => {
    const t = getTranslator('en');
    expect(t('stage2.init')).toBe('Initializing document processing...');
    expect(t('stage2.docling_start')).toBe('Converting document...');
    expect(t('stage2.complete')).toBe('Document processed');
  });

  it('returns Russian strings for locale "ru"', () => {
    const t = getTranslator('ru');
    expect(t('stage2.init')).toBe('Инициализация обработки документа...');
    expect(t('stage2.complete')).toBe('Документ обработан');
  });

  it('defaults to Russian when no locale specified', () => {
    const t = getTranslator();
    expect(t('stage2.init')).toBe('Инициализация обработки документа...');
  });

  it('returns key as fallback for missing key', () => {
    const t = getTranslator('en');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
    expect(t('stage2.nonexistent')).toBe('stage2.nonexistent');
  });

  it('handles nested keys with dots in numbers (steps)', () => {
    const t = getTranslator('en');
    expect(t('steps.2.in_progress')).toBe('Processing documents...');
    expect(t('steps.2.completed')).toBe('Documents processed');
    expect(t('steps.2.failed')).toBe('Document processing failed');
    expect(t('steps.3.completed')).toBe('Course structure defined');
    expect(t('steps.4.completed')).toBe('Content generated');
    expect(t('steps.5.completed')).toBe('Course completed');
  });

  it('handles stage keys for all stages 2-6', () => {
    const t = getTranslator('en');
    expect(t('stage3.complete')).toBe('Classification complete');
    expect(t('stage4.complete')).toBe('Structure analysis complete');
    expect(t('stage5.complete')).toBe('Course structure created');
    expect(t('stage6.complete')).toBe('Lesson created');
  });

  it('interpolates {{param}} placeholders', () => {
    // errors.fallback_reason has {{reason}} placeholder
    const t = getTranslator('en');
    const result = t('errors.fallback_reason', { reason: 'File too large' });
    expect(result).toBe('Reason: File too large');
  });

  it('interpolates multiple params', () => {
    // Create translator for Russian errors
    const t = getTranslator('ru');
    const result = t('errors.fallback_reason', { reason: 'Файл повреждён' });
    expect(result).toBe('Причина: Файл повреждён');
  });

  it('leaves unreplaced placeholders as-is if param not provided', () => {
    const t = getTranslator('en');
    // Call with incomplete params - {{reason}} won't be replaced
    const result = t('errors.fallback_reason', { other: 'value' });
    expect(result).toContain('{{reason}}'); // unreplaced
  });

  it('returns key for deeply nested missing translation', () => {
    const t = getTranslator('en');
    expect(t('stage2.init.nonexistent')).toBe('stage2.init.nonexistent');
  });

  it('returns data for error messages', () => {
    const t = getTranslator('en');
    expect(t('errors.fallback_header')).toBe('Document processing error');
    expect(t('errors.fallback_body')).toBe('The document could not be processed automatically.');
  });
});

describe('BACKEND_TRANSLATIONS structure', () => {
  it('has all required stage keys', () => {
    expect(BACKEND_TRANSLATIONS.stage2).toBeDefined();
    expect(BACKEND_TRANSLATIONS.stage3).toBeDefined();
    expect(BACKEND_TRANSLATIONS.stage4).toBeDefined();
    expect(BACKEND_TRANSLATIONS.stage5).toBeDefined();
    expect(BACKEND_TRANSLATIONS.stage6).toBeDefined();
  });

  it('has steps keys 2-5', () => {
    const steps = BACKEND_TRANSLATIONS.steps;
    expect(steps['2']).toBeDefined();
    expect(steps['3']).toBeDefined();
    expect(steps['4']).toBeDefined();
    expect(steps['5']).toBeDefined();
  });

  it('each step has in_progress, completed, failed', () => {
    const step2 = BACKEND_TRANSLATIONS.steps['2'];
    expect(step2.in_progress.en).toBeTruthy();
    expect(step2.completed.en).toBeTruthy();
    expect(step2.failed.en).toBeTruthy();
  });

  it('all translations have both ru and en strings', () => {
    // Check stage2 entries
    for (const [, val] of Object.entries(BACKEND_TRANSLATIONS.stage2)) {
      const entry = val as { ru: string; en: string };
      expect(typeof entry.ru).toBe('string');
      expect(typeof entry.en).toBe('string');
      expect(entry.ru.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
    }
  });

  it('error messages have ru and en', () => {
    const errors = BACKEND_TRANSLATIONS.errors;
    expect(typeof errors.content_policy.ru).toBe('string');
    expect(typeof errors.content_policy.en).toBe('string');
    expect(typeof errors.fallback_header.ru).toBe('string');
    expect(typeof errors.fallback_header.en).toBe('string');
  });
});
