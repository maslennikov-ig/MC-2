/**
 * Unit tests for lesson-identifiers module
 * Tests branded types for LessonUUID and LessonLabel
 *
 * Coverage:
 * - createLessonUUID (valid/invalid inputs)
 * - createLessonLabel (valid/invalid inputs)
 * - isValidUUID type guard
 * - isValidLessonLabel type guard
 * - tryCreateLessonUUID safe factory
 * - tryCreateLessonLabel safe factory
 * - Type safety (compile-time distinction)
 */

import { describe, it, expect } from 'vitest';
import {
  LessonUUID,
  LessonLabel,
  createLessonUUID,
  createLessonLabel,
  isValidUUID,
  isValidLessonLabel,
  tryCreateLessonUUID,
  tryCreateLessonLabel,
} from '../src/lesson-identifiers';

// ==================== Helper Functions (Data Fixtures) ====================

/**
 * Valid UUID v4 examples for testing
 */
const VALID_UUIDS = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '550e8400-e29b-41d4-a716-446655440000',
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  '123e4567-e89b-12d3-a456-426614174000',
];

/**
 * Invalid UUID examples for testing
 */
const INVALID_UUIDS = [
  '1.1', // Lesson label format
  'not-a-uuid',
  '123', // Too short
  'a1b2c3d4-e5f6-7890-abcd', // Missing last segment
  'a1b2c3d4e5f678901234567890abcdef', // Missing hyphens
  'g1b2c3d4-e5f6-7890-abcd-ef1234567890', // Invalid hex character 'g'
  '', // Empty string
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890-extra', // Extra segment
];

/**
 * Valid lesson label examples for testing
 */
const VALID_LABELS = [
  '1.1',
  '2.3',
  '10.15',
  '100.200',
  '0.0',
  '999.999',
];

/**
 * Invalid lesson label examples for testing
 */
const INVALID_LABELS = [
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // UUID format
  'section1-lesson1',
  '1', // Missing dot
  '1.', // Missing lesson number
  '.1', // Missing section number
  '1.1.1', // Too many segments
  'a.b', // Non-numeric
  '1-1', // Wrong separator
  '', // Empty string
  '1 .1', // Space
  '1. 1', // Space
];

// ==================== createLessonUUID Tests ====================

describe('createLessonUUID', () => {
  describe('Valid cases', () => {
    it('should create LessonUUID from valid UUID v4 string', () => {
      for (const uuid of VALID_UUIDS) {
        const lessonUuid = createLessonUUID(uuid);
        expect(lessonUuid).toBe(uuid);
        expect(typeof lessonUuid).toBe('string');
      }
    });

    it('should create LessonUUID from UUID with uppercase letters', () => {
      const upperUuid = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      const lessonUuid = createLessonUUID(upperUuid);
      expect(lessonUuid).toBe(upperUuid);
    });

    it('should create LessonUUID from UUID with mixed case', () => {
      const mixedUuid = 'A1b2C3d4-E5f6-7890-AbCd-Ef1234567890';
      const lessonUuid = createLessonUUID(mixedUuid);
      expect(lessonUuid).toBe(mixedUuid);
    });
  });

  describe('Invalid cases', () => {
    it('should throw error for invalid UUID format', () => {
      for (const invalidUuid of INVALID_UUIDS) {
        expect(() => createLessonUUID(invalidUuid)).toThrow(
          `Invalid LessonUUID format: "${invalidUuid}". Expected UUID v4.`
        );
      }
    });

    it('should throw error for lesson label format (most common mistake)', () => {
      expect(() => createLessonUUID('1.1')).toThrow(
        'Invalid LessonUUID format: "1.1". Expected UUID v4.'
      );
    });

    it('should throw error for empty string', () => {
      expect(() => createLessonUUID('')).toThrow(
        'Invalid LessonUUID format: "". Expected UUID v4.'
      );
    });
  });

  describe('Type safety (compile-time)', () => {
    it('should create distinct type from string', () => {
      const uuid = createLessonUUID(VALID_UUIDS[0]);
      const plainString: string = uuid; // OK: can assign to base type

      // NOTE: TypeScript won't allow this at compile time:
      // const uuid2: LessonUUID = plainString; // Error: Type 'string' is not assignable to type 'LessonUUID'

      // But we can verify runtime behavior
      expect(typeof uuid).toBe('string');
      expect(plainString).toBe(uuid);
    });
  });
});

// ==================== createLessonLabel Tests ====================

describe('createLessonLabel', () => {
  describe('Valid cases', () => {
    it('should create LessonLabel from valid "section.lesson" string', () => {
      for (const label of VALID_LABELS) {
        const lessonLabel = createLessonLabel(label);
        expect(lessonLabel).toBe(label);
        expect(typeof lessonLabel).toBe('string');
      }
    });

    it('should create LessonLabel from "0.0" (edge case)', () => {
      const label = createLessonLabel('0.0');
      expect(label).toBe('0.0');
    });

    it('should create LessonLabel from large numbers', () => {
      const label = createLessonLabel('999.999');
      expect(label).toBe('999.999');
    });
  });

  describe('Invalid cases', () => {
    it('should throw error for invalid lesson label format', () => {
      for (const invalidLabel of INVALID_LABELS) {
        expect(() => createLessonLabel(invalidLabel)).toThrow(
          `Invalid LessonLabel format: "${invalidLabel}". Expected "section.lesson" (e.g., "1.1").`
        );
      }
    });

    it('should throw error for UUID format (most common mistake)', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      expect(() => createLessonLabel(uuid)).toThrow(
        `Invalid LessonLabel format: "${uuid}". Expected "section.lesson" (e.g., "1.1").`
      );
    });

    it('should throw error for empty string', () => {
      expect(() => createLessonLabel('')).toThrow(
        'Invalid LessonLabel format: "". Expected "section.lesson" (e.g., "1.1").'
      );
    });
  });

  describe('Type safety (compile-time)', () => {
    it('should create distinct type from string', () => {
      const label = createLessonLabel('1.1');
      const plainString: string = label; // OK: can assign to base type

      // NOTE: TypeScript won't allow this at compile time:
      // const label2: LessonLabel = plainString; // Error: Type 'string' is not assignable to type 'LessonLabel'

      // But we can verify runtime behavior
      expect(typeof label).toBe('string');
      expect(plainString).toBe(label);
    });
  });
});

// ==================== isValidUUID Tests ====================

describe('isValidUUID', () => {
  describe('Valid cases', () => {
    it('should return true for valid UUID v4 strings', () => {
      for (const uuid of VALID_UUIDS) {
        expect(isValidUUID(uuid)).toBe(true);
      }
    });

    it('should return true for UUID with uppercase letters', () => {
      expect(isValidUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
    });

    it('should return true for UUID with mixed case', () => {
      expect(isValidUUID('A1b2C3d4-E5f6-7890-AbCd-Ef1234567890')).toBe(true);
    });
  });

  describe('Invalid cases', () => {
    it('should return false for invalid UUID formats', () => {
      for (const invalidUuid of INVALID_UUIDS) {
        expect(isValidUUID(invalidUuid)).toBe(false);
      }
    });

    it('should return false for lesson label format', () => {
      expect(isValidUUID('1.1')).toBe(false);
      expect(isValidUUID('10.15')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });
  });
});

// ==================== isValidLessonLabel Tests ====================

describe('isValidLessonLabel', () => {
  describe('Valid cases', () => {
    it('should return true for valid "section.lesson" strings', () => {
      for (const label of VALID_LABELS) {
        expect(isValidLessonLabel(label)).toBe(true);
      }
    });

    it('should return true for "0.0"', () => {
      expect(isValidLessonLabel('0.0')).toBe(true);
    });

    it('should return true for large numbers', () => {
      expect(isValidLessonLabel('999.999')).toBe(true);
    });
  });

  describe('Invalid cases', () => {
    it('should return false for invalid lesson label formats', () => {
      for (const invalidLabel of INVALID_LABELS) {
        expect(isValidLessonLabel(invalidLabel)).toBe(false);
      }
    });

    it('should return false for UUID format', () => {
      expect(isValidLessonLabel('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
        false
      );
    });

    it('should return false for empty string', () => {
      expect(isValidLessonLabel('')).toBe(false);
    });
  });
});

// ==================== tryCreateLessonUUID Tests ====================

describe('tryCreateLessonUUID', () => {
  describe('Valid cases', () => {
    it('should return LessonUUID for valid UUID v4 string', () => {
      for (const uuid of VALID_UUIDS) {
        const result = tryCreateLessonUUID(uuid);
        expect(result).not.toBeNull();
        expect(result).toBe(uuid);
      }
    });

    it('should return LessonUUID for UUID with uppercase letters', () => {
      const result = tryCreateLessonUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
      expect(result).not.toBeNull();
      expect(result).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
    });
  });

  describe('Invalid cases', () => {
    it('should return null for invalid UUID formats', () => {
      for (const invalidUuid of INVALID_UUIDS) {
        const result = tryCreateLessonUUID(invalidUuid);
        expect(result).toBeNull();
      }
    });

    it('should return null for lesson label format', () => {
      expect(tryCreateLessonUUID('1.1')).toBeNull();
      expect(tryCreateLessonUUID('10.15')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(tryCreateLessonUUID('')).toBeNull();
    });
  });

  describe('Usage pattern', () => {
    it('should support null-check pattern', () => {
      const validInput = VALID_UUIDS[0];
      const maybeUuid = tryCreateLessonUUID(validInput);

      if (maybeUuid !== null) {
        // Type is LessonUUID here
        expect(maybeUuid).toBe(validInput);
      } else {
        throw new Error('Should not be null');
      }
    });

    it('should support null-check pattern for invalid input', () => {
      const invalidInput = '1.1';
      const maybeUuid = tryCreateLessonUUID(invalidInput);

      if (maybeUuid !== null) {
        throw new Error('Should be null');
      } else {
        // Handle invalid input
        expect(maybeUuid).toBeNull();
      }
    });
  });
});

// ==================== tryCreateLessonLabel Tests ====================

describe('tryCreateLessonLabel', () => {
  describe('Valid cases', () => {
    it('should return LessonLabel for valid "section.lesson" string', () => {
      for (const label of VALID_LABELS) {
        const result = tryCreateLessonLabel(label);
        expect(result).not.toBeNull();
        expect(result).toBe(label);
      }
    });

    it('should return LessonLabel for "0.0"', () => {
      const result = tryCreateLessonLabel('0.0');
      expect(result).not.toBeNull();
      expect(result).toBe('0.0');
    });
  });

  describe('Invalid cases', () => {
    it('should return null for invalid lesson label formats', () => {
      for (const invalidLabel of INVALID_LABELS) {
        const result = tryCreateLessonLabel(invalidLabel);
        expect(result).toBeNull();
      }
    });

    it('should return null for UUID format', () => {
      expect(tryCreateLessonLabel('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(tryCreateLessonLabel('')).toBeNull();
    });
  });

  describe('Usage pattern', () => {
    it('should support null-check pattern', () => {
      const validInput = '1.1';
      const maybeLabel = tryCreateLessonLabel(validInput);

      if (maybeLabel !== null) {
        // Type is LessonLabel here
        expect(maybeLabel).toBe(validInput);
      } else {
        throw new Error('Should not be null');
      }
    });

    it('should support null-check pattern for invalid input', () => {
      const invalidInput = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const maybeLabel = tryCreateLessonLabel(invalidInput);

      if (maybeLabel !== null) {
        throw new Error('Should be null');
      } else {
        // Handle invalid input
        expect(maybeLabel).toBeNull();
      }
    });
  });
});

// ==================== Cross-Type Validation Tests ====================

describe('Cross-type validation (UUID vs Label)', () => {
  it('should reject UUID when creating LessonLabel', () => {
    const uuid = VALID_UUIDS[0];
    expect(() => createLessonLabel(uuid)).toThrow();
    expect(tryCreateLessonLabel(uuid)).toBeNull();
    expect(isValidLessonLabel(uuid)).toBe(false);
  });

  it('should reject label when creating LessonUUID', () => {
    const label = VALID_LABELS[0];
    expect(() => createLessonUUID(label)).toThrow();
    expect(tryCreateLessonUUID(label)).toBeNull();
    expect(isValidUUID(label)).toBe(false);
  });

  it('should not allow cross-assignment at type level', () => {
    const uuid = createLessonUUID(VALID_UUIDS[0]);
    const label = createLessonLabel(VALID_LABELS[0]);

    // Runtime: both are strings
    expect(typeof uuid).toBe('string');
    expect(typeof label).toBe('string');

    // Compile-time: TypeScript prevents this
    // const wrongUuid: LessonUUID = label; // Error: Type 'LessonLabel' is not assignable to type 'LessonUUID'
    // const wrongLabel: LessonLabel = uuid; // Error: Type 'LessonUUID' is not assignable to type 'LessonLabel'

    // But both can be assigned to string
    const plainString1: string = uuid;
    const plainString2: string = label;
    expect(plainString1).toBe(VALID_UUIDS[0]);
    expect(plainString2).toBe(VALID_LABELS[0]);
  });
});

// ==================== Real-World Usage Scenarios ====================

describe('Real-world usage scenarios', () => {
  it('should prevent UUID/Label confusion in function parameters', () => {
    // Example function expecting LessonUUID
    function fetchLessonByUUID(uuid: LessonUUID): string {
      return `Fetching lesson with UUID: ${uuid}`;
    }

    // Example function expecting LessonLabel
    function fetchLessonByLabel(label: LessonLabel): string {
      return `Fetching lesson with label: ${label}`;
    }

    const uuid = createLessonUUID(VALID_UUIDS[0]);
    const label = createLessonLabel(VALID_LABELS[0]);

    // Correct usage
    expect(fetchLessonByUUID(uuid)).toContain('UUID');
    expect(fetchLessonByLabel(label)).toContain('label');

    // TypeScript prevents incorrect usage at compile time:
    // fetchLessonByUUID(label); // Error: Argument of type 'LessonLabel' is not assignable to parameter of type 'LessonUUID'
    // fetchLessonByLabel(uuid); // Error: Argument of type 'LessonUUID' is not assignable to parameter of type 'LessonLabel'
  });

  it('should validate user input before creating branded types', () => {
    const userInputs = [
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // UUID
      '1.1', // Label
      'invalid-input', // Invalid
    ];

    for (const input of userInputs) {
      // Safe approach: try both formats
      const maybeUuid = tryCreateLessonUUID(input);
      const maybeLabel = tryCreateLessonLabel(input);

      if (maybeUuid !== null) {
        // Handle as UUID
        expect(isValidUUID(input)).toBe(true);
      } else if (maybeLabel !== null) {
        // Handle as Label
        expect(isValidLessonLabel(input)).toBe(true);
      } else {
        // Invalid input
        expect(isValidUUID(input)).toBe(false);
        expect(isValidLessonLabel(input)).toBe(false);
      }
    }
  });

  it('should support conversion from database results', () => {
    // Simulate database query result
    const dbResult = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      label: '1.1',
      title: 'Introduction to TypeScript',
    };

    // Convert to branded types
    const lessonUuid = createLessonUUID(dbResult.id);
    const lessonLabel = createLessonLabel(dbResult.label);

    // Type-safe usage
    expect(lessonUuid).toBe(dbResult.id);
    expect(lessonLabel).toBe(dbResult.label);
  });
});
