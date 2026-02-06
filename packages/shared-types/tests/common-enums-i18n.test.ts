/**
 * Unit tests for i18n content labels functionality
 * Tests getContentLabels, validateLanguageCode, and CONTENT_LABELS completeness
 *
 * Coverage:
 * - getContentLabels(code) - Returns correct labels for known languages, falls back to English
 * - validateLanguageCode(code) - Validates and normalizes language codes
 * - CONTENT_LABELS completeness - All 19 languages have all required fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getContentLabels,
  validateLanguageCode,
  CONTENT_LABELS,
  SUPPORTED_LANGUAGES,
  type Language,
} from '../src/common-enums';

// ==================== Mock console.warn ====================

// Save original console.warn
const originalWarn = console.warn;

beforeEach(() => {
  // Mock console.warn before each test
  console.warn = vi.fn();
});

afterEach(() => {
  // Restore original console.warn after each test
  console.warn = originalWarn;
  vi.clearAllMocks();
});

// ==================== getContentLabels Tests ====================

describe('getContentLabels', () => {
  describe('Valid language codes', () => {
    it('should return correct labels for Russian (ru)', () => {
      const labels = getContentLabels('ru');

      expect(labels).toBeDefined();
      expect(labels.introduction).toBe('Введение');
      expect(labels.summary).toBe('Заключение');
      expect(labels.examples).toBe('Примеры');
      expect(labels.exercises).toBe('Упражнения');
      expect(labels.exercise).toBe('Упражнение');
      expect(labels.task).toBe('Задание');
      expect(labels.scenario).toBe('Сценарий');
      expect(labels.yourAnswer).toBe('Ваш ответ');
      expect(labels.hint).toBe('Подсказка');
      expect(labels.hints).toBe('Подсказки');
      expect(labels.sampleAnswer).toBe('Образец ответа');
    });

    it('should return correct labels for English (en)', () => {
      const labels = getContentLabels('en');

      expect(labels).toBeDefined();
      expect(labels.introduction).toBe('Introduction');
      expect(labels.summary).toBe('Summary');
      expect(labels.examples).toBe('Examples');
      expect(labels.exercises).toBe('Exercises');
      expect(labels.exercise).toBe('Exercise');
      expect(labels.task).toBe('Task');
      expect(labels.scenario).toBe('Scenario');
      expect(labels.yourAnswer).toBe('Your Answer');
      expect(labels.hint).toBe('Hint');
      expect(labels.hints).toBe('Hints');
      expect(labels.sampleAnswer).toBe('Sample Answer');
    });

    it('should return correct labels for Chinese (zh)', () => {
      const labels = getContentLabels('zh');

      expect(labels).toBeDefined();
      expect(labels.introduction).toBe('引言');
      expect(labels.summary).toBe('总结');
      expect(labels.examples).toBe('示例');
      expect(labels.exercises).toBe('练习');
      expect(labels.exercise).toBe('练习');
      expect(labels.task).toBe('任务');
      expect(labels.scenario).toBe('场景');
      expect(labels.yourAnswer).toBe('你的答案');
      expect(labels.hint).toBe('提示');
      expect(labels.hints).toBe('提示');
      expect(labels.sampleAnswer).toBe('参考答案');
    });

    it('should return correct labels for Spanish (es)', () => {
      const labels = getContentLabels('es');

      expect(labels).toBeDefined();
      expect(labels.introduction).toBe('Introducción');
      expect(labels.summary).toBe('Resumen');
      expect(labels.examples).toBe('Ejemplos');
      expect(labels.exercises).toBe('Ejercicios');
      expect(labels.exercise).toBe('Ejercicio');
      expect(labels.task).toBe('Tarea');
      expect(labels.scenario).toBe('Escenario');
      expect(labels.yourAnswer).toBe('Tu respuesta');
      expect(labels.hint).toBe('Pista');
      expect(labels.hints).toBe('Pistas');
      expect(labels.sampleAnswer).toBe('Respuesta de ejemplo');
    });

    it('should have examples and hints fields for all returned labels', () => {
      const testLanguages: Language[] = ['ru', 'en', 'zh', 'es', 'fr', 'de'];

      for (const lang of testLanguages) {
        const labels = getContentLabels(lang);

        // Verify examples field exists
        expect(labels.examples).toBeDefined();
        expect(typeof labels.examples).toBe('string');
        expect(labels.examples.length).toBeGreaterThan(0);

        // Verify hints field exists
        expect(labels.hints).toBeDefined();
        expect(typeof labels.hints).toBe('string');
        expect(labels.hints.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Fallback to English for unknown language codes', () => {
    it('should fall back to English for unknown language code "xx"', () => {
      const labels = getContentLabels('xx');

      expect(labels).toBeDefined();
      expect(labels).toEqual(CONTENT_LABELS.en);
      expect(labels.introduction).toBe('Introduction');
    });

    it('should fall back to English for empty string', () => {
      const labels = getContentLabels('');

      expect(labels).toBeDefined();
      expect(labels).toEqual(CONTENT_LABELS.en);
    });

    it('should fall back to English for null (cast as string)', () => {
      const labels = getContentLabels(null as unknown as string);

      expect(labels).toBeDefined();
      expect(labels).toEqual(CONTENT_LABELS.en);
    });

    it('should fall back to English for undefined (cast as string)', () => {
      const labels = getContentLabels(undefined as unknown as string);

      expect(labels).toBeDefined();
      expect(labels).toEqual(CONTENT_LABELS.en);
    });

    it('should fall back to English for numeric input (cast as string)', () => {
      const labels = getContentLabels(123 as unknown as string);

      expect(labels).toBeDefined();
      expect(labels).toEqual(CONTENT_LABELS.en);
    });

    it('should fall back to English for invalid language code "zz"', () => {
      const labels = getContentLabels('zz');

      expect(labels).toBeDefined();
      expect(labels).toEqual(CONTENT_LABELS.en);
    });

    it('should log warning in development mode for unknown code', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        getContentLabels('xx');
        expect(console.warn).toHaveBeenCalledWith(
          '[getContentLabels] Unknown language code: "xx", falling back to English'
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});

// ==================== validateLanguageCode Tests ====================

describe('validateLanguageCode', () => {
  describe('Valid language codes', () => {
    it('should return valid Language for known code "ru"', () => {
      const result = validateLanguageCode('ru');

      expect(result).toBe('ru');
      expect(SUPPORTED_LANGUAGES).toContain(result);
    });

    it('should return valid Language for known code "en"', () => {
      const result = validateLanguageCode('en');

      expect(result).toBe('en');
      expect(SUPPORTED_LANGUAGES).toContain(result);
    });

    it('should return valid Language for known code "zh"', () => {
      const result = validateLanguageCode('zh');

      expect(result).toBe('zh');
      expect(SUPPORTED_LANGUAGES).toContain(result);
    });

    it('should return valid Language for known code "es"', () => {
      const result = validateLanguageCode('es');

      expect(result).toBe('es');
      expect(SUPPORTED_LANGUAGES).toContain(result);
    });

    it('should return valid Language for all 19 supported languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const result = validateLanguageCode(lang);

        expect(result).toBe(lang);
        expect(SUPPORTED_LANGUAGES).toContain(result);
      }
    });
  });

  describe('Fallback to "en" for invalid inputs', () => {
    it('should return "en" for unknown string "xx"', () => {
      const result = validateLanguageCode('xx');

      expect(result).toBe('en');
    });

    it('should return "en" for undefined', () => {
      const result = validateLanguageCode(undefined);

      expect(result).toBe('en');
    });

    it('should return "en" for null', () => {
      const result = validateLanguageCode(null);

      expect(result).toBe('en');
    });

    it('should return "en" for empty string', () => {
      const result = validateLanguageCode('');

      expect(result).toBe('en');
    });

    it('should return "en" for number input', () => {
      const result = validateLanguageCode(123);

      expect(result).toBe('en');
    });

    it('should return "en" for object input', () => {
      const result = validateLanguageCode({ code: 'ru' });

      expect(result).toBe('en');
    });

    it('should return "en" for array input', () => {
      const result = validateLanguageCode(['ru', 'en']);

      expect(result).toBe('en');
    });

    it('should return "en" for boolean input', () => {
      const result = validateLanguageCode(true);

      expect(result).toBe('en');
    });
  });
});

// ==================== CONTENT_LABELS Completeness Tests ====================

describe('CONTENT_LABELS completeness', () => {
  describe('All 19 languages present', () => {
    it('should have all 19 supported languages in CONTENT_LABELS', () => {
      expect(Object.keys(CONTENT_LABELS)).toHaveLength(19);

      for (const lang of SUPPORTED_LANGUAGES) {
        expect(CONTENT_LABELS[lang]).toBeDefined();
      }
    });

    it('should verify SUPPORTED_LANGUAGES array has 19 languages', () => {
      expect(SUPPORTED_LANGUAGES).toHaveLength(19);
      expect(SUPPORTED_LANGUAGES).toEqual([
        'ru',
        'en',
        'zh',
        'es',
        'fr',
        'de',
        'ja',
        'ko',
        'ar',
        'pt',
        'it',
        'tr',
        'vi',
        'th',
        'id',
        'ms',
        'hi',
        'bn',
        'pl',
      ]);
    });
  });

  describe('All required fields present for each language', () => {
    const requiredFields = [
      'introduction',
      'summary',
      'examples',
      'exercises',
      'exercise',
      'task',
      'scenario',
      'yourAnswer',
      'hint',
      'hints',
      'sampleAnswer',
    ] as const;

    it('should have all 11 required fields for each language', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const labels = CONTENT_LABELS[lang];

        for (const field of requiredFields) {
          expect(labels[field]).toBeDefined();
          expect(typeof labels[field]).toBe('string');
        }
      }
    });

    it('should have examples field for all 19 languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const labels = CONTENT_LABELS[lang];

        expect(labels.examples).toBeDefined();
        expect(typeof labels.examples).toBe('string');
        expect(labels.examples.length).toBeGreaterThan(0);
      }
    });

    it('should have hints field for all 19 languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const labels = CONTENT_LABELS[lang];

        expect(labels.hints).toBeDefined();
        expect(typeof labels.hints).toBe('string');
        expect(labels.hints.length).toBeGreaterThan(0);
      }
    });

    it('should verify recently added fields (examples, hints) are not empty', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const labels = CONTENT_LABELS[lang];

        // Verify examples field is not empty string
        expect(labels.examples).toBeTruthy();
        expect(labels.examples.trim()).not.toBe('');

        // Verify hints field is not empty string
        expect(labels.hints).toBeTruthy();
        expect(labels.hints.trim()).not.toBe('');
      }
    });
  });

  describe('No label value is empty string', () => {
    it('should have no empty string values for any language', () => {
      const requiredFields = [
        'introduction',
        'summary',
        'examples',
        'exercises',
        'exercise',
        'task',
        'scenario',
        'yourAnswer',
        'hint',
        'hints',
        'sampleAnswer',
      ] as const;

      for (const lang of SUPPORTED_LANGUAGES) {
        const labels = CONTENT_LABELS[lang];

        for (const field of requiredFields) {
          expect(labels[field]).toBeTruthy();
          expect(labels[field].trim()).not.toBe('');
          expect(labels[field].length).toBeGreaterThan(0);
        }
      }
    });

    it('should have meaningful content for all label values', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const labels = CONTENT_LABELS[lang];
        const values = Object.values(labels);

        for (const value of values) {
          // Each label should have at least 1 character
          expect(value.length).toBeGreaterThan(0);

          // Each label should not be just whitespace
          expect(value.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Specific language validation', () => {
    it('should have correct structure for Russian labels', () => {
      const labels = CONTENT_LABELS.ru;

      expect(labels.introduction).toBe('Введение');
      expect(labels.summary).toBe('Заключение');
      expect(labels.examples).toBe('Примеры');
      expect(labels.hints).toBe('Подсказки');
    });

    it('should have correct structure for English labels', () => {
      const labels = CONTENT_LABELS.en;

      expect(labels.introduction).toBe('Introduction');
      expect(labels.summary).toBe('Summary');
      expect(labels.examples).toBe('Examples');
      expect(labels.hints).toBe('Hints');
    });

    it('should have correct structure for Chinese labels', () => {
      const labels = CONTENT_LABELS.zh;

      expect(labels.introduction).toBe('引言');
      expect(labels.summary).toBe('总结');
      expect(labels.examples).toBe('示例');
      expect(labels.hints).toBe('提示');
    });

    it('should have correct structure for Arabic labels (RTL language)', () => {
      const labels = CONTENT_LABELS.ar;

      expect(labels.introduction).toBe('مقدمة');
      expect(labels.summary).toBe('ملخص');
      expect(labels.examples).toBe('أمثلة');
      expect(labels.hints).toBe('تلميحات');
    });

    it('should have correct structure for Japanese labels', () => {
      const labels = CONTENT_LABELS.ja;

      expect(labels.introduction).toBe('はじめに');
      expect(labels.summary).toBe('まとめ');
      expect(labels.examples).toBe('例');
      expect(labels.hints).toBe('ヒント');
    });
  });
});
