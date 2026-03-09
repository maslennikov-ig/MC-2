/**
 * Tests for shared/utils — pure utility functions
 *
 * Covers:
 * - json-repair: stripThinkingTags, extractJSON, safeJSONParse
 * - field-name-fix: fixFieldNames, fixFieldNamesWithLogging
 * - nested-value: setNestedValue
 * - retry: retryWithBackoff
 * - generation-code: generateGenerationCode
 */

import { describe, it, expect, vi } from 'vitest';
import { stripThinkingTags, extractJSON, safeJSONParse } from '@/shared/utils/json-repair';
import { fixFieldNames, fixFieldNamesWithLogging } from '@/shared/utils/field-name-fix';
import { setNestedValue } from '@/shared/utils/nested-value';
import { retryWithBackoff } from '@/shared/utils/retry';
import { generateGenerationCode } from '@/shared/utils/generation-code';
import { ValidationError } from '@/server/errors/typed-errors';

// ─────────────────────────────────────────────────────────────────────────────
// json-repair: stripThinkingTags
// ─────────────────────────────────────────────────────────────────────────────

describe('stripThinkingTags', () => {
  it('removes <think>...</think> tags (Qwen3)', () => {
    const input = '<think>Let me analyze this carefully...</think>{"key": "value"}';
    expect(stripThinkingTags(input)).toBe('{"key": "value"}');
  });

  it('removes <thinking>...</thinking> tags', () => {
    const input = '<thinking>My internal reasoning</thinking>{"result": 42}';
    expect(stripThinkingTags(input)).toBe('{"result": 42}');
  });

  it('removes <reasoning>...</reasoning> tags', () => {
    const input = '<reasoning>Step by step...</reasoning>{"ok": true}';
    expect(stripThinkingTags(input)).toBe('{"ok": true}');
  });

  it('removes <analysis>...</analysis> tags', () => {
    const input = '<analysis>Detailed analysis</analysis>[1, 2, 3]';
    expect(stripThinkingTags(input)).toBe('[1, 2, 3]');
  });

  it('removes [THINK]...[/THINK] alternative format', () => {
    const input = '[THINK]Some thoughts[/THINK]{"data": "here"}';
    expect(stripThinkingTags(input)).toBe('{"data": "here"}');
  });

  it('is case-insensitive', () => {
    const input = '<THINK>uppercase</THINK>{"key": 1}';
    expect(stripThinkingTags(input)).toBe('{"key": 1}');
  });

  it('handles multiline thinking tags', () => {
    const input = '<think>\nLine 1\nLine 2\n</think>{"answer": true}';
    expect(stripThinkingTags(input)).toBe('{"answer": true}');
  });

  it('returns text unchanged if no thinking tags', () => {
    const input = '{"clean": "json"}';
    expect(stripThinkingTags(input)).toBe('{"clean": "json"}');
  });

  it('removes **Thinking:** markdown prefix before JSON', () => {
    const input = '**Thinking:** Let me analyze this deeply before answering.\n{"key": "value"}';
    expect(stripThinkingTags(input)).toBe('{"key": "value"}');
  });

  it('handles empty string', () => {
    expect(stripThinkingTags('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// json-repair: extractJSON
// ─────────────────────────────────────────────────────────────────────────────

describe('extractJSON', () => {
  it('extracts JSON from markdown code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON from plain code block', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON object from mixed text', () => {
    const input = 'Here is the result: {"key": "value"} and some more text';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON array from text', () => {
    const input = 'Array: [1, 2, 3] done';
    expect(extractJSON(input)).toBe('[1, 2, 3]');
  });

  it('strips thinking tags before extraction', () => {
    const input = '<think>Analyzing...</think>```json\n{"result": true}\n```';
    expect(extractJSON(input)).toBe('{"result": true}');
  });

  it('returns text as-is if no JSON structure found', () => {
    const input = 'plain text without any json';
    expect(extractJSON(input)).toBe('plain text without any json');
  });

  it('handles nested JSON objects', () => {
    const input = '{"outer": {"inner": {"deep": 42}}}';
    expect(extractJSON(input)).toBe('{"outer": {"inner": {"deep": 42}}}');
  });

  it('handles nested JSON arrays', () => {
    const input = '[[1, 2], [3, 4]]';
    expect(extractJSON(input)).toBe('[[1, 2], [3, 4]]');
  });

  it('handles escaped quotes inside strings', () => {
    const input = '{"key": "value with \\"quotes\\""}';
    expect(extractJSON(input)).toBe('{"key": "value with \\"quotes\\""}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// json-repair: safeJSONParse
// ─────────────────────────────────────────────────────────────────────────────

describe('safeJSONParse', () => {
  it('parses valid JSON directly without repair', () => {
    const result = safeJSONParse('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON array', () => {
    const result = safeJSONParse('[1, 2, 3]');
    expect(result).toEqual([1, 2, 3]);
  });

  it('repairs JSON missing closing brace', () => {
    const result = safeJSONParse('{"key": "value"');
    expect(result).toEqual({ key: 'value' });
  });

  it('repairs JSON with trailing comma', () => {
    const result = safeJSONParse('{"key": "value",}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON from markdown code block', () => {
    const result = safeJSONParse('```json\n{"answer": 42}\n```');
    expect(result).toEqual({ answer: 42 });
  });

  it('strips thinking tags before parsing', () => {
    const result = safeJSONParse('<think>Analyzing...</think>{"ok": true}');
    expect(result).toEqual({ ok: true });
  });

  it('throws ValidationError when all repair strategies fail', () => {
    // Deliberately malformed: multiple conflicting unclosed structures that
    // even jsonrepair cannot reconcile into valid JSON, with null bytes
    const broken = '\0\0\0{{{{{[[[invalid: true, "key": }])}]}';
    expect(() => safeJSONParse(broken)).toThrow(ValidationError);
  });

  it('parses nested objects', () => {
    const result = safeJSONParse('{"a": {"b": {"c": 1}}}');
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// field-name-fix: fixFieldNames
// ─────────────────────────────────────────────────────────────────────────────

describe('fixFieldNames', () => {
  it('converts camelCase fields to snake_case via explicit mapping', () => {
    const input = { courseTitle: 'ML Basics', targetAudience: 'Developers' };
    expect(fixFieldNames(input)).toEqual({
      course_title: 'ML Basics',
      target_audience: 'Developers',
    });
  });

  it('converts unmapped camelCase automatically', () => {
    const input = { someRandomField: 'value' };
    expect(fixFieldNames(input)).toEqual({ some_random_field: 'value' });
  });

  it('handles nested objects recursively', () => {
    const input = {
      courseTitle: 'Course',
      sections: [{ sectionTitle: 'Intro', lessonCount: 3 }],
    };
    const result = fixFieldNames(input) as any;
    expect(result.course_title).toBe('Course');
    expect(result.sections[0].section_title).toBe('Intro');
    expect(result.sections[0].lesson_count).toBe(3);
  });

  it('handles arrays of primitives without modification', () => {
    const input = { tags: ['a', 'b', 'c'] };
    const result = fixFieldNames(input) as any;
    expect(result.tags).toEqual(['a', 'b', 'c']);
  });

  it('returns null for null input', () => {
    expect(fixFieldNames(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(fixFieldNames(undefined)).toBeUndefined();
  });

  it('returns primitive values unchanged', () => {
    expect(fixFieldNames('string')).toBe('string');
    expect(fixFieldNames(42)).toBe(42);
    expect(fixFieldNames(true)).toBe(true);
  });

  it('handles deeply nested arrays', () => {
    const input = [{ courseTitle: 'A' }, { courseTitle: 'B' }];
    const result = fixFieldNames(input) as any[];
    expect(result[0].course_title).toBe('A');
    expect(result[1].course_title).toBe('B');
  });

  it('keeps snake_case fields unchanged', () => {
    const input = { course_title: 'Already snake' };
    expect(fixFieldNames(input)).toEqual({ course_title: 'Already snake' });
  });

  it('converts lessonObjectives (explicit mapping)', () => {
    const input = { lessonObjectives: ['learn X', 'understand Y'] };
    const result = fixFieldNames(input) as any;
    expect(result.lesson_objectives).toEqual(['learn X', 'understand Y']);
  });
});

describe('fixFieldNamesWithLogging', () => {
  it('returns same transformed result as fixFieldNames', () => {
    const input = { courseTitle: 'ML', sectionTitle: 'Intro' };
    const direct = fixFieldNames(input);
    const withLogging = fixFieldNamesWithLogging(input);
    expect(withLogging).toEqual(direct);
  });

  it('handles empty object', () => {
    expect(fixFieldNamesWithLogging({})).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nested-value: setNestedValue
// ─────────────────────────────────────────────────────────────────────────────

describe('setNestedValue', () => {
  it('sets a simple top-level key', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'title', 'Hello');
    expect(obj.title).toBe('Hello');
  });

  it('sets a nested key with dot notation', () => {
    const obj: Record<string, unknown> = { section: {} };
    setNestedValue(obj, 'section.title', 'Intro');
    expect((obj.section as any).title).toBe('Intro');
  });

  it('creates intermediate objects automatically', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'a.b.c', 42);
    expect((obj.a as any).b.c).toBe(42);
  });

  it('sets array index notation', () => {
    const obj: Record<string, unknown> = { sections: [{ title: 'old' }] };
    setNestedValue(obj, 'sections[0].title', 'new');
    expect((obj.sections as any)[0].title).toBe('new');
  });

  it('creates arrays when next key is numeric', () => {
    const obj: Record<string, unknown> = {};
    setNestedValue(obj, 'items[0]', 'first');
    expect((obj.items as any)[0]).toBe('first');
  });

  it('throws for invalid object (null)', () => {
    expect(() => setNestedValue(null, 'key', 'value')).toThrow('Invalid object');
  });

  it('throws for invalid object (string)', () => {
    expect(() => setNestedValue('not-object', 'key', 'value')).toThrow('Invalid object');
  });

  it('throws for empty path', () => {
    const obj = {};
    expect(() => setNestedValue(obj, '', 'value')).toThrow('Invalid path');
  });

  it('throws for __proto__ path (prototype pollution protection)', () => {
    const obj = {};
    expect(() => setNestedValue(obj, '__proto__.polluted', true)).toThrow('restricted property');
  });

  it('throws for constructor path (prototype pollution protection)', () => {
    const obj = {};
    expect(() => setNestedValue(obj, 'constructor', () => {})).toThrow('restricted property');
  });

  it('throws when traversing non-object intermediate', () => {
    const obj = { a: 'string' };
    expect(() => setNestedValue(obj, 'a.b', 'value')).toThrow('Cannot traverse path');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// retry: retryWithBackoff
// ─────────────────────────────────────────────────────────────────────────────

describe('retryWithBackoff', () => {
  it('returns result immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, { maxRetries: 3, delays: [0, 0] });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and returns on subsequent success', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) return Promise.reject(new Error(`fail attempt ${attempt}`));
      return Promise.resolve('ok');
    });
    const result = await retryWithBackoff(fn, { maxRetries: 3, delays: [0, 0, 0] });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(retryWithBackoff(fn, { maxRetries: 2, delays: [0, 0] })).rejects.toThrow(
      'Failed after 2 retries'
    );
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('calls onRetry callback on each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error('error'));
    await expect(
      retryWithBackoff(fn, { maxRetries: 2, delays: [0, 0], onRetry })
    ).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
  });

  it('uses last delay for attempts beyond delays array length', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(retryWithBackoff(fn, { maxRetries: 3, delays: [0] })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generation-code: generateGenerationCode
// ─────────────────────────────────────────────────────────────────────────────

describe('generateGenerationCode', () => {
  it('matches the format XXX-NNNN', () => {
    const code = generateGenerationCode();
    expect(code).toMatch(/^[A-Z]{3}-\d{4}$/);
  });

  it('does not contain I, O, or L (confusable chars)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateGenerationCode();
      const prefix = code.split('-')[0];
      expect(prefix).not.toMatch(/[IOL]/);
    }
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateGenerationCode()));
    // Very unlikely to get collisions in 100 samples with such a large space
    expect(codes.size).toBeGreaterThan(90);
  });

  it('suffix is always exactly 4 digits (zero-padded)', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateGenerationCode();
      const suffix = code.split('-')[1];
      expect(suffix).toHaveLength(4);
      expect(suffix).toMatch(/^\d{4}$/);
    }
  });

  it('prefix is always exactly 3 uppercase letters', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateGenerationCode();
      const prefix = code.split('-')[0];
      expect(prefix).toHaveLength(3);
      expect(prefix).toMatch(/^[A-Z]{3}$/);
    }
  });
});
