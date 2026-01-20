/**
 * Unit tests for JSON Repair Utility
 * Tests all 5 repair strategies with malformed JSON examples
 */

import { repairJSON } from '../json-repair';

describe('JSON Repair Utility', () => {
  describe('Valid JSON (as-is strategy)', () => {
    it('should parse valid JSON without modification', () => {
      const valid = '{"key": "value", "number": 42}';
      const result = repairJSON(valid);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ key: 'value', number: 42 });
      expect(result.strategy).toBe('as_is');
    });
  });

  describe('Trailing commas', () => {
    it('should remove trailing comma before closing brace', () => {
      const malformed = '{"key": "value",}';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ key: 'value' });
      expect(result.strategy).toBe('remove_trailing_commas');
    });

    it('should remove trailing comma before closing bracket', () => {
      const malformed = '{"items": [1, 2, 3,]}';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ items: [1, 2, 3] });
      expect(result.strategy).toBe('remove_trailing_commas');
    });

    it('should handle multiple trailing commas', () => {
      const malformed = '{"a": 1, "b": [2, 3,], "c": {"d": 4,},}';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ a: 1, b: [2, 3], c: { d: 4 } });
    });
  });

  describe('Missing closing brackets', () => {
    it('should add missing closing brace', () => {
      const malformed = '{"key": "value"';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ key: 'value' });
      expect(result.strategy).toBe('add_closing_brackets');
    });

    it('should add missing closing bracket', () => {
      const malformed = '{"items": [1, 2, 3';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ items: [1, 2, 3] });
    });

    it('should add multiple missing brackets', () => {
      const malformed = '{"outer": {"inner": [1, 2';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ outer: { inner: [1, 2] } });
    });

    it('should handle complex nested structure', () => {
      const malformed = '{"a": {"b": [{"c": "value"';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ a: { b: [{ c: 'value' }] } });
    });
  });

  describe('Unquoted keys', () => {
    it('should quote unquoted object key', () => {
      const malformed = '{key: "value"}';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ key: 'value' });
      expect(result.strategy).toBe('fix_unquoted_keys');
    });

    it('should quote multiple unquoted keys', () => {
      const malformed = '{first: "a", second: "b"}';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ first: 'a', second: 'b' });
    });
  });

  describe('Incomplete strings', () => {
    it('should truncate incomplete string at end', () => {
      const malformed = '{"key": "complete", "broken": "incomple';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toHaveProperty('key', 'complete');
      // After truncation, only complete key remains
    });

    it('should handle string with comma before incomplete part', () => {
      const malformed = '{"a": "value", "b": "incomp';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toHaveProperty('a', 'value');
    });
  });

  describe('Aggressive cleanup (combined strategies)', () => {
    it('should handle trailing comma + missing bracket', () => {
      const malformed = '{"items": [1, 2,';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ items: [1, 2] });
    });

    it('should handle unquoted keys + missing braces', () => {
      const malformed = '{key: "value", num: 42';
      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toEqual({ key: 'value', num: 42 });
    });
  });

  describe('Real-world Phase 2 examples', () => {
    it('should repair Phase 2 output with missing closing brace', () => {
      const malformed = `{
  "recommended_structure": {
    "estimated_content_hours": 10.0,
    "scope_reasoning": "Test reasoning",
    "lesson_duration_minutes": 15,
    "calculation_explanation": "10h * 60 / 15 = 40 lessons",
    "total_lessons": 40,
    "total_sections": 2,
    "scope_warning": null,
    "sections_breakdown": [
      {
        "area": "Introduction",
        "estimated_lessons": 20,
        "importance": "core",
        "learning_objectives": ["Objective 1", "Objective 2"],
        "key_topics": ["Topic 1", "Topic 2", "Topic 3"],
        "pedagogical_approach": "Theory first, then practice",
        "difficulty_progression": "gradual"
      }
    ]
  },
  "phase_metadata": {
    "duration_ms": 0,
    "model_used": "openai/gpt-oss-20b",
    "tokens": {"input": 0, "output": 0, "total": 0},
    "quality_score": 0.0,
    "retry_count": 0
  `;

      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired).toHaveProperty('recommended_structure');
      expect(result.repaired).toHaveProperty('phase_metadata');
      expect(result.repaired.recommended_structure.total_lessons).toBe(40);
    });

    it('should repair Phase 2 output with trailing comma', () => {
      const malformed = `{
  "recommended_structure": {
    "estimated_content_hours": 15.0,
    "scope_reasoning": "Test",
    "lesson_duration_minutes": 15,
    "calculation_explanation": "Test",
    "total_lessons": 60,
    "total_sections": 3,
    "scope_warning": null,
    "sections_breakdown": [],
  },
  "phase_metadata": {
    "duration_ms": 0,
    "model_used": "openai/gpt-oss-20b",
    "tokens": {"input": 0, "output": 0, "total": 0},
    "quality_score": 0.0,
    "retry_count": 0
  }
}`;

      const result = repairJSON(malformed);

      expect(result.success).toBe(true);
      expect(result.repaired.recommended_structure.total_lessons).toBe(60);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const result = repairJSON('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty input');
    });

    it('should handle whitespace-only input', () => {
      const result = repairJSON('   \n  \t  ');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty input');
    });

    it('should handle completely invalid JSON', () => {
      const result = repairJSON('not json at all!!!');

      expect(result.success).toBe(false);
      expect(result.error).toBe('All repair strategies exhausted');
    });

    it('should handle escaped quotes in strings', () => {
      const valid = '{"key": "value with \\"quotes\\""}';
      const result = repairJSON(valid);

      expect(result.success).toBe(true);
      expect(result.repaired.key).toBe('value with "quotes"');
    });
  });
});
