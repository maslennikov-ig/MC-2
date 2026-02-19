/**
 * Tests for replaceEnglishStructuralHeaders()
 * @module stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics
 *
 * Tests the ru-only heuristic that replaces English structural headers with
 * their Russian equivalents and removes LLM artifact headers entirely.
 *
 * Key behaviours:
 * - Only activates for targetLanguage === 'ru'
 * - Replaces known CONTENT_LABELS entries (Introduction → Введение, etc.)
 * - Removes LLM artifact headers (SECTION CONCLUSION, MODULE INTRODUCTION, …)
 * - Protects code blocks from modification
 * - Case-insensitive matching
 * - Returns accurate replacedCount
 */

import { describe, it, expect } from 'vitest';
import { replaceEnglishStructuralHeaders } from '@/stages/stage6-lesson-content/nodes/self-reviewer/self-reviewer-heuristics';

// No mocks needed — replaceEnglishStructuralHeaders is a pure function
// (it uses CONTENT_LABELS from shared-types and module-level lazy cache,
// but neither requires network access nor side effects under test).

describe('replaceEnglishStructuralHeaders', () => {
  describe('Russian target language — label replacement', () => {
    it('should replace "## Introduction" with "## Введение"', () => {
      const result = replaceEnglishStructuralHeaders('## Introduction\n\nSome text.', 'ru');

      expect(result.content).toContain('## Введение');
      expect(result.content).not.toContain('## Introduction');
      expect(result.replacedCount).toBe(1);
    });

    it('should replace "## Summary" with "## Заключение"', () => {
      const result = replaceEnglishStructuralHeaders('## Summary\n\nFinal thoughts.', 'ru');

      expect(result.content).toContain('## Заключение');
      expect(result.content).not.toContain('## Summary');
      expect(result.replacedCount).toBe(1);
    });

    it('should replace "### Exercise" with "### Упражнение"', () => {
      const result = replaceEnglishStructuralHeaders('### Exercise\n\nDo this task.', 'ru');

      expect(result.content).toContain('### Упражнение');
      expect(result.content).not.toContain('### Exercise');
      expect(result.replacedCount).toBe(1);
    });

    it('should replace "## Exercises" with "## Упражнения"', () => {
      const result = replaceEnglishStructuralHeaders('## Exercises\n\nMany tasks.', 'ru');

      expect(result.content).toContain('## Упражнения');
      expect(result.replacedCount).toBe(1);
    });
  });

  describe('Russian target language — LLM artifact removal', () => {
    it('should remove "## SECTION CONCLUSION" entirely', () => {
      const result = replaceEnglishStructuralHeaders(
        '## SECTION CONCLUSION\n\nNext paragraph.',
        'ru'
      );

      expect(result.content).not.toContain('SECTION CONCLUSION');
      expect(result.replacedCount).toBe(1);
      // The following paragraph should remain
      expect(result.content).toContain('Next paragraph.');
    });

    it('should remove "## MODULE INTRODUCTION" entirely', () => {
      const result = replaceEnglishStructuralHeaders(
        '## MODULE INTRODUCTION\n\nContent follows.',
        'ru'
      );

      expect(result.content).not.toContain('MODULE INTRODUCTION');
      expect(result.replacedCount).toBe(1);
    });

    it('should remove "## COURSE OVERVIEW" entirely', () => {
      const result = replaceEnglishStructuralHeaders(
        '# COURSE OVERVIEW\n\nIntroduction text.',
        'ru'
      );

      expect(result.content).not.toContain('COURSE OVERVIEW');
      expect(result.replacedCount).toBe(1);
    });

    it('should remove "### LESSON SUMMARY" entirely', () => {
      const result = replaceEnglishStructuralHeaders('### LESSON SUMMARY\n\nEnd of lesson.', 'ru');

      expect(result.content).not.toContain('LESSON SUMMARY');
      expect(result.replacedCount).toBe(1);
    });
  });

  describe('Non-Russian target languages — no changes', () => {
    it('should NOT replace headers for English target language', () => {
      const result = replaceEnglishStructuralHeaders('## Introduction\n\nText.', 'en');

      expect(result.content).toContain('## Introduction');
      expect(result.replacedCount).toBe(0);
    });

    it('should NOT replace headers for French target language', () => {
      const result = replaceEnglishStructuralHeaders('## Introduction\n\nText.', 'fr');

      expect(result.content).toContain('## Introduction');
      expect(result.replacedCount).toBe(0);
    });

    it('should NOT replace headers for Chinese target language', () => {
      const result = replaceEnglishStructuralHeaders('## Introduction\n\nText.', 'zh');

      expect(result.content).toContain('## Introduction');
      expect(result.replacedCount).toBe(0);
    });

    it('should return content unchanged and replacedCount=0 for empty language string', () => {
      const result = replaceEnglishStructuralHeaders('## Introduction', '');

      expect(result.content).toContain('## Introduction');
      expect(result.replacedCount).toBe(0);
    });
  });

  describe('False-positive prevention', () => {
    it('should NOT replace "## KPI" (not a CONTENT_LABELS entry)', () => {
      const result = replaceEnglishStructuralHeaders('## KPI\n\nText.', 'ru');

      expect(result.content).toContain('## KPI');
      expect(result.replacedCount).toBe(0);
    });

    it('should NOT replace "## Overview" if it is not in CONTENT_LABELS', () => {
      // "Overview" is not a key in CONTENT_LABELS en, so it stays
      const result = replaceEnglishStructuralHeaders('## Overview\n\nText.', 'ru');

      // replacedCount is 0 because "overview" maps to same value (not present in map)
      // Content must at least remain coherent
      expect(result.content).not.toContain('SECTION OVERVIEW');
      // The header itself is preserved since it is not in the replacement map
      expect(result.content).toContain('## Overview');
    });
  });

  describe('Case-insensitive matching', () => {
    it('should replace "## INTRODUCTION" (all caps) with "## Введение"', () => {
      const result = replaceEnglishStructuralHeaders('## INTRODUCTION\n\nText.', 'ru');

      expect(result.content).toContain('## Введение');
      expect(result.replacedCount).toBe(1);
    });

    it('should replace "## introduction" (lower case) with "## Введение"', () => {
      const result = replaceEnglishStructuralHeaders('## introduction\n\nText.', 'ru');

      expect(result.content).toContain('## Введение');
      expect(result.replacedCount).toBe(1);
    });

    it('should replace "## Summary" (mixed case) with "## Заключение"', () => {
      const result = replaceEnglishStructuralHeaders('## SUMMARY\n\nText.', 'ru');

      expect(result.content).toContain('## Заключение');
      expect(result.replacedCount).toBe(1);
    });
  });

  describe('Code block protection', () => {
    it('should leave "## Introduction" inside a code block unchanged', () => {
      const content = '```\n## Introduction\n```\n\n## Introduction';
      const result = replaceEnglishStructuralHeaders(content, 'ru');

      // The one inside the code fence stays as-is
      expect(result.content).toContain('```\n## Introduction\n```');
      // The one outside is replaced
      expect(result.content).toContain('## Введение');
      expect(result.replacedCount).toBe(1);
    });

    it('should not modify fenced mermaid diagrams', () => {
      const content =
        '```mermaid\nflowchart TD\n  A[Introduction] --> B[Summary]\n```\n\n## Introduction';
      const result = replaceEnglishStructuralHeaders(content, 'ru');

      expect(result.content).toContain(
        '```mermaid\nflowchart TD\n  A[Introduction] --> B[Summary]\n```'
      );
      expect(result.content).toContain('## Введение');
      expect(result.replacedCount).toBe(1);
    });
  });

  describe('Multiple replacements in a single document', () => {
    it('should replace Introduction, Summary and remove SECTION CONCLUSION in one pass', () => {
      const content =
        '## Introduction\n\nText.\n\n## Summary\n\nMore text.\n\n## SECTION CONCLUSION';
      const result = replaceEnglishStructuralHeaders(content, 'ru');

      expect(result.replacedCount).toBe(3);
      expect(result.content).toContain('## Введение');
      expect(result.content).toContain('## Заключение');
      expect(result.content).not.toContain('SECTION CONCLUSION');
    });

    it('should handle a full lesson document with mixed English and Russian headers', () => {
      const content = [
        '## Introduction',
        '',
        'Вводный текст.',
        '',
        '## Основные концепции',
        '',
        'Текст секции.',
        '',
        '## Exercises',
        '',
        'Задания.',
        '',
        '## Summary',
      ].join('\n');

      const result = replaceEnglishStructuralHeaders(content, 'ru');

      expect(result.content).toContain('## Введение');
      expect(result.content).toContain('## Основные концепции'); // already Russian — unchanged
      expect(result.content).toContain('## Упражнения');
      expect(result.content).toContain('## Заключение');
      expect(result.replacedCount).toBe(3);
    });
  });

  describe('Return value structure', () => {
    it('should return an object with content and replacedCount properties', () => {
      const result = replaceEnglishStructuralHeaders('## Introduction', 'ru');

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('replacedCount');
      expect(typeof result.content).toBe('string');
      expect(typeof result.replacedCount).toBe('number');
    });

    it('should return replacedCount=0 when nothing is replaced', () => {
      const result = replaceEnglishStructuralHeaders('## Введение\n\nТекст.', 'ru');

      expect(result.replacedCount).toBe(0);
      expect(result.content).toContain('## Введение');
    });

    it('should not mutate the original content string (returns a new value)', () => {
      const original = '## Introduction\n\nText.';
      const result = replaceEnglishStructuralHeaders(original, 'ru');

      expect(original).toBe('## Introduction\n\nText.'); // unchanged
      expect(result.content).not.toBe(original);
    });
  });
});
