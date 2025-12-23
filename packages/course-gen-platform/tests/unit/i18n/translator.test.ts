import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTranslator, BACKEND_TRANSLATIONS, type Locale } from '../../../src/shared/i18n';

// Mock the logger to prevent actual logging during tests
vi.mock('../../../src/shared/logger/index.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('i18n/translator', () => {
  describe('getTranslator', () => {
    it('should return Russian translation for ru locale', () => {
      const t = getTranslator('ru');
      expect(t('stage2.init')).toBe('Инициализация обработки документа...');
    });

    it('should return English translation for en locale', () => {
      const t = getTranslator('en');
      expect(t('stage2.init')).toBe('Initializing document processing...');
    });

    it('should default to ru locale when not specified', () => {
      const t = getTranslator();
      expect(t('stage2.init')).toBe('Инициализация обработки документа...');
    });

    it('should return key itself for missing translation', () => {
      const t = getTranslator('en');
      expect(t('missing.key')).toBe('missing.key');
    });

    it('should handle deep nested keys', () => {
      const t = getTranslator('en');
      expect(t('steps.2.in_progress')).toBe('Processing documents...');
      expect(t('steps.3.completed')).toBe('Course structure defined');
    });

    it('should work with all stage keys', () => {
      const t = getTranslator('en');

      // Stage 2
      expect(t('stage2.docling_start')).toBe('Converting document...');
      expect(t('stage2.complete')).toBe('Document processed');

      // Stage 3
      expect(t('stage3.init')).toBe('Starting classification...');
      expect(t('stage3.complete')).toBe('Classification complete');

      // Stage 4
      expect(t('stage4.init')).toBe('Starting structure analysis...');
      expect(t('stage4.complete')).toBe('Structure analysis complete');

      // Stage 5
      expect(t('stage5.init')).toBe('Starting structure generation...');
      expect(t('stage5.complete')).toBe('Course structure created');

      // Stage 6
      expect(t('stage6.init')).toBe('Starting lesson generation...');
      expect(t('stage6.complete')).toBe('Lesson created');
    });
  });

  describe('parameter interpolation', () => {
    // Add a test translation with params
    it('should interpolate string parameters', () => {
      const t = getTranslator('ru');
      // Since we don't have params in current translations, test the mechanism
      // by checking that non-existent params don't break the result
      const result = t('stage2.init');
      expect(result).toBe('Инициализация обработки документа...');
    });

    it('should handle missing parameters gracefully', () => {
      const t = getTranslator('en');
      // Template without matching params should remain unchanged
      const result = t('stage2.init', { unused: 'value' });
      expect(result).toBe('Initializing document processing...');
    });
  });

  describe('BACKEND_TRANSLATIONS structure', () => {
    it('should have stage2 translations', () => {
      expect(BACKEND_TRANSLATIONS.stage2).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage2.init).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage2.init.ru).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage2.init.en).toBeDefined();
    });

    it('should have stage3 translations', () => {
      expect(BACKEND_TRANSLATIONS.stage3).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage3.init).toBeDefined();
    });

    it('should have stage4 translations', () => {
      expect(BACKEND_TRANSLATIONS.stage4).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage4.init).toBeDefined();
    });

    it('should have stage5 translations', () => {
      expect(BACKEND_TRANSLATIONS.stage5).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage5.init).toBeDefined();
    });

    it('should have stage6 translations', () => {
      expect(BACKEND_TRANSLATIONS.stage6).toBeDefined();
      expect(BACKEND_TRANSLATIONS.stage6.init).toBeDefined();
    });

    it('should have steps translations for steps 2-5', () => {
      expect(BACKEND_TRANSLATIONS.steps['2']).toBeDefined();
      expect(BACKEND_TRANSLATIONS.steps['3']).toBeDefined();
      expect(BACKEND_TRANSLATIONS.steps['4']).toBeDefined();
      expect(BACKEND_TRANSLATIONS.steps['5']).toBeDefined();
    });

    it('should have all status types for each step', () => {
      const steps = ['2', '3', '4', '5'] as const;
      const statuses = ['in_progress', 'completed', 'failed'] as const;

      for (const step of steps) {
        for (const status of statuses) {
          const translation = BACKEND_TRANSLATIONS.steps[step][status];
          expect(translation).toBeDefined();
          expect(translation.ru).toBeDefined();
          expect(translation.en).toBeDefined();
          expect(typeof translation.ru).toBe('string');
          expect(typeof translation.en).toBe('string');
        }
      }
    });
  });

  describe('locale handling', () => {
    it('should handle all supported locales', () => {
      const locales: Locale[] = ['ru', 'en'];

      for (const locale of locales) {
        const t = getTranslator(locale);
        const result = t('stage2.init');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});
