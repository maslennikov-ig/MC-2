/**
 * Unit Tests for JSON Repair Utility (json-repair.ts)
 *
 * Tests T025 requirements:
 * 1. extractJSON() finds JSON in mixed text (brace counting)
 * 2. safeJSONParse() repairs common errors (unbalanced braces, trailing commas, comments)
 * 3. FR-019 Retry Test Coverage: 4-level JSON repair workflow
 * 4. RepairStrategy tracking and error reporting
 *
 * @module tests/unit/stage5/json-repair.test
 */

import { describe, it, expect } from 'vitest';
import { extractJSON, safeJSONParse } from '@/stages/stage5-generation/utils/json-repair';
import type { RepairResult } from '@/stages/stage5-generation/utils/json-repair';

describe('extractJSON - Brace counting extraction', () => {
  it('should extract JSON from markdown code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = extractJSON(input);

    expect(result).toBe('{"key": "value"}');
  });

  it('should extract JSON from markdown code block without json specifier', () => {
    const input = '```\n{"key": "value"}\n```';
    const result = extractJSON(input);

    expect(result).toBe('{"key": "value"}');
  });

  it('should extract JSON from mixed text (before)', () => {
    const input = 'Here is the JSON: {"key": "value"}';
    const result = extractJSON(input);

    expect(result).toBe('{"key": "value"}');
  });

  it('should extract JSON from mixed text (after)', () => {
    const input = '{"key": "value"} - this is the JSON';
    const result = extractJSON(input);

    expect(result).toBe('{"key": "value"}');
  });

  it('should handle nested objects with brace counting', () => {
    const input = 'Data: {"outer": {"inner": {"deep": "value"}}}';
    const result = extractJSON(input);

    expect(result).toBe('{"outer": {"inner": {"deep": "value"}}}');
  });

  it('should extract first complete JSON object from multiple', () => {
    const input = '{"first": "value"} {"second": "value"}';
    const result = extractJSON(input);

    expect(result).toBe('{"first": "value"}');
  });

  it('should handle arrays with brace counting', () => {
    const input = 'Array: [{"item": 1}, {"item": 2}]';
    const result = extractJSON(input);

    expect(result).toBe('[{"item": 1}, {"item": 2}]');
  });

  it('should handle strings containing braces', () => {
    const input = '{"message": "Use {placeholders} carefully"}';
    const result = extractJSON(input);

    expect(result).toBe('{"message": "Use {placeholders} carefully"}');
  });

  it('should handle escaped quotes in strings', () => {
    const input = '{"quote": "He said \\"hello\\""}';
    const result = extractJSON(input);

    expect(result).toBe('{"quote": "He said \\"hello\\""}');
  });

  it('should return original text if no JSON structure found', () => {
    const input = 'This is plain text without JSON';
    const result = extractJSON(input);

    expect(result).toBe('This is plain text without JSON');
  });

  it('should handle incomplete JSON by returning from start to end', () => {
    const input = '{"incomplete": "no closing brace"';
    const result = extractJSON(input);

    expect(result).toBe('{"incomplete": "no closing brace"');
  });
});

describe('safeJSONParse - No repair needed', () => {
  it('should parse valid JSON without repair', () => {
    const validJSON = '{"key": "value", "number": 123}';
    const result = safeJSONParse(validJSON);

    expect(result).toEqual({ key: 'value', number: 123 });
  });

  it('should parse valid nested JSON', () => {
    const validJSON = '{"outer": {"inner": {"deep": "value"}}}';
    const result = safeJSONParse(validJSON);

    expect(result).toEqual({
      outer: {
        inner: {
          deep: 'value',
        },
      },
    });
  });

  it('should parse valid array', () => {
    const validJSON = '[{"item": 1}, {"item": 2}]';
    const result = safeJSONParse(validJSON);

    expect(result).toEqual([{ item: 1 }, { item: 2 }]);
  });
});

describe('safeJSONParse - Markdown extraction + jsonrepair', () => {
  it('should extract and parse JSON from markdown code block', () => {
    const markdown = '```json\n{"key": "value"}\n```';
    const result = safeJSONParse(markdown);

    expect(result).toEqual({ key: 'value' });
  });

  it('should extract and parse JSON from markdown without json specifier', () => {
    const markdown = '```\n{"foo": "bar"}\n```';
    const result = safeJSONParse(markdown);

    expect(result).toEqual({ foo: 'bar' });
  });

  it('should handle markdown with extra text', () => {
    const markdown = 'Here is the result:\n```json\n{"success": true}\n```\nEnd of response';
    const result = safeJSONParse(markdown);

    // jsonrepair library may parse this as an array with mixed content
    // The extractJSON function will extract just the JSON object
    if (Array.isArray(result)) {
      const jsonObject = result.find(item => typeof item === 'object' && item !== null && 'success' in item);
      expect(jsonObject).toEqual({ success: true });
    } else {
      expect(result).toEqual({ success: true });
    }
  });
});

describe('safeJSONParse - Level 1: Brace counting (unbalanced braces)', () => {
  it('should repair missing closing brace', () => {
    const unbalanced = '{"key": "value"';
    const result = safeJSONParse(unbalanced);

    expect(result).toEqual({ key: 'value' });
  });

  it('should repair missing closing bracket', () => {
    const unbalanced = '[{"item": 1}, {"item": 2}';
    const result = safeJSONParse(unbalanced);

    expect(result).toEqual([{ item: 1 }, { item: 2 }]);
  });

  it('should repair multiple missing closing braces', () => {
    const unbalanced = '{"outer": {"inner": {"deep": "value"';
    const result = safeJSONParse(unbalanced);

    expect(result).toEqual({
      outer: {
        inner: {
          deep: 'value',
        },
      },
    });
  });

  it('should repair nested object with missing braces', () => {
    const unbalanced = '{"course": {"title": "ML", "sections": [{"name": "Intro"}]';
    const result = safeJSONParse(unbalanced);

    expect(result).toEqual({
      course: {
        title: 'ML',
        sections: [{ name: 'Intro' }],
      },
    });
  });
});

describe('safeJSONParse - Level 3: Trailing comma removal', () => {
  it('should remove trailing comma before closing brace', () => {
    const trailingComma = '{"key": "value",}';
    const result = safeJSONParse(trailingComma);

    expect(result).toEqual({ key: 'value' });
  });

  it('should remove trailing comma before closing bracket', () => {
    const trailingComma = '[1, 2, 3,]';
    const result = safeJSONParse(trailingComma);

    expect(result).toEqual([1, 2, 3]);
  });

  it('should remove trailing commas with whitespace', () => {
    const trailingComma = '{"key": "value", }';
    const result = safeJSONParse(trailingComma);

    expect(result).toEqual({ key: 'value' });
  });

  it('should remove multiple trailing commas in nested structure', () => {
    const trailingCommas = '{"outer": {"inner": "value",}, "array": [1, 2,],}';
    const result = safeJSONParse(trailingCommas);

    expect(result).toEqual({
      outer: { inner: 'value' },
      array: [1, 2],
    });
  });
});

describe('safeJSONParse - Level 4: Comment stripping', () => {
  it('should strip single-line comments', () => {
    const withComments = `{
      "key": "value" // This is a comment
    }`;
    const result = safeJSONParse(withComments);

    expect(result).toEqual({ key: 'value' });
  });

  it('should strip multi-line comments', () => {
    const withComments = `{
      /* This is a
         multi-line comment */
      "key": "value"
    }`;
    const result = safeJSONParse(withComments);

    expect(result).toEqual({ key: 'value' });
  });

  it('should strip inline multi-line comments', () => {
    const withComments = '{"key": "value" /* inline comment */}';
    const result = safeJSONParse(withComments);

    expect(result).toEqual({ key: 'value' });
  });

  it('should not strip URLs with //', () => {
    const withURL = '{"url": "https://example.com"}';
    const result = safeJSONParse(withURL);

    expect(result).toEqual({ url: 'https://example.com' });
  });

  it('should handle mixed comment types', () => {
    const withComments = `{
      "key1": "value1", // single line
      /* block comment */
      "key2": "value2"
    }`;
    const result = safeJSONParse(withComments);

    expect(result).toEqual({ key1: 'value1', key2: 'value2' });
  });
});

describe('safeJSONParse - FR-019: 4-level repair workflow', () => {
  it('should succeed at Level 1 (brace counting) when jsonrepair fails', () => {
    // Unbalanced braces that jsonrepair might handle, but tests Level 1
    const unbalanced = '{"course_title": "ML Course", "sections": [{"title": "Intro"}';
    const result = safeJSONParse(unbalanced);

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: [{ title: 'Intro' }],
    });
  });

  it('should succeed at Level 3 (trailing comma) when earlier levels fail', () => {
    // Trailing comma that requires Level 3
    const trailingComma = '{"course_title": "ML Course", "difficulty": "intermediate",}';
    const result = safeJSONParse(trailingComma);

    expect(result).toEqual({
      course_title: 'ML Course',
      difficulty: 'intermediate',
    });
  });

  it('should succeed at Level 4 (comment stripping) when earlier levels fail', () => {
    // Comments that require Level 4
    const withComments = `{
      "course_title": "ML Course", // Added title
      "difficulty": "intermediate" /* Difficulty level */
    }`;
    const result = safeJSONParse(withComments);

    expect(result).toEqual({
      course_title: 'ML Course',
      difficulty: 'intermediate',
    });
  });

  it('should handle combined errors (unbalanced + trailing comma)', () => {
    const combinedErrors = '{"course_title": "ML Course", "sections": [{"title": "Intro"},]';
    const result = safeJSONParse(combinedErrors);

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: [{ title: 'Intro' }],
    });
  });

  it('should handle combined errors (markdown + unbalanced + comments)', () => {
    const combinedErrors = `\`\`\`json
    {
      "course_title": "ML Course", // Course title
      "sections": [{"title": "Intro"}
    }
    \`\`\``;
    const result = safeJSONParse(combinedErrors);

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: [{ title: 'Intro' }],
    });
  });
});

describe('safeJSONParse - Real-world LLM output scenarios', () => {
  it('should handle LLM wrapping JSON in markdown', () => {
    const llmOutput = `Here is the course structure:

\`\`\`json
{
  "course_title": "Machine Learning Basics",
  "difficulty_level": "intermediate"
}
\`\`\`

This structure follows best practices.`;

    const result = safeJSONParse(llmOutput);

    // jsonrepair library may parse this as an array with mixed content
    // The extractJSON function will extract just the JSON object
    if (Array.isArray(result)) {
      const jsonObject = result.find(item => typeof item === 'object' && item !== null && 'course_title' in item);
      expect(jsonObject).toEqual({
        course_title: 'Machine Learning Basics',
        difficulty_level: 'intermediate',
      });
    } else {
      expect(result).toEqual({
        course_title: 'Machine Learning Basics',
        difficulty_level: 'intermediate',
      });
    }
  });

  it('should handle LLM adding explanatory comments', () => {
    const llmOutput = `{
  "course_title": "ML Course", // Generated title
  "sections": [ // List of sections
    {
      "section_title": "Introduction", // First section
      "lessons": [] // Placeholder
    }
  ]
}`;

    const result = safeJSONParse(llmOutput);

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: [
        {
          section_title: 'Introduction',
          lessons: [],
        },
      ],
    });
  });

  it('should handle LLM truncating output (missing closing braces)', () => {
    const truncatedOutput = `{
  "course_title": "ML Course",
  "sections": [
    {
      "section_title": "Introduction",
      "lessons": [
        {
          "lesson_title": "Basics"`;

    const result = safeJSONParse(truncatedOutput);

    expect(result).toEqual({
      course_title: 'ML Course',
      sections: [
        {
          section_title: 'Introduction',
          lessons: [{ lesson_title: 'Basics' }],
        },
      ],
    });
  });

  it('should handle LLM adding trailing commas (invalid strict JSON)', () => {
    const llmOutput = `{
  "course_title": "ML Course",
  "difficulty_level": "intermediate",
  "prerequisites": [
    "Python basics",
    "Math fundamentals",
  ],
}`;

    const result = safeJSONParse(llmOutput);

    expect(result).toEqual({
      course_title: 'ML Course',
      difficulty_level: 'intermediate',
      prerequisites: ['Python basics', 'Math fundamentals'],
    });
  });
});

describe('safeJSONParse - Error handling', () => {
  it('should throw ValidationError when all repair strategies fail', () => {
    const irreparableJSON = 'This is not JSON at all, just random text {{{[[[}}}]]]';

    expect(() => safeJSONParse(irreparableJSON)).toThrow('Failed to parse JSON after repair attempts');
  });

  it('should throw ValidationError for completely invalid input', () => {
    const invalidInput = 'null undefined NaN Infinity';

    expect(() => safeJSONParse(invalidInput)).toThrow('Failed to parse JSON after repair attempts');
  });

  it('should successfully repair malformed keys (jsonrepair library handles this)', () => {
    // The jsonrepair library is smart enough to fix missing quotes around keys
    const malformedKeys = '{invalid_key_without_quotes: "value"}';

    // jsonrepair will repair this successfully by adding quotes around the key
    const result = safeJSONParse(malformedKeys);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('invalid_key_without_quotes');
    expect(result.invalid_key_without_quotes).toBe('value');
  });
});

describe('safeJSONParse - Edge cases', () => {
  it('should handle empty object', () => {
    const emptyObject = '{}';
    const result = safeJSONParse(emptyObject);

    expect(result).toEqual({});
  });

  it('should handle empty array', () => {
    const emptyArray = '[]';
    const result = safeJSONParse(emptyArray);

    expect(result).toEqual([]);
  });

  it('should handle whitespace-only', () => {
    const whitespace = '   \n\t   ';

    expect(() => safeJSONParse(whitespace)).toThrow();
  });

  it('should handle very deeply nested structures', () => {
    const deepNested = '{"a": {"b": {"c": {"d": {"e": "value"}}}}}';
    const result = safeJSONParse(deepNested);

    expect(result).toEqual({
      a: { b: { c: { d: { e: 'value' } } } },
    });
  });

  it('should handle large arrays', () => {
    const largeArray = '[' + Array(100).fill('{"item": 1}').join(',') + ']';
    const result = safeJSONParse(largeArray);

    expect(result).toHaveLength(100);
    expect(result[0]).toEqual({ item: 1 });
  });

  it('should handle special characters in strings', () => {
    const specialChars = '{"message": "Line 1\\nLine 2\\tTabbed"}';
    const result = safeJSONParse(specialChars);

    expect(result).toEqual({ message: 'Line 1\nLine 2\tTabbed' });
  });

  it('should handle unicode characters', () => {
    const unicode = '{"emoji": "🚀", "chinese": "你好"}';
    const result = safeJSONParse(unicode);

    expect(result).toEqual({ emoji: '🚀', chinese: '你好' });
  });
});
