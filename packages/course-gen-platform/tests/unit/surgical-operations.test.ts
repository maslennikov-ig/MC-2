/**
 * Surgical Operations Unit Tests
 * @module tests/unit/surgical-operations
 *
 * Tests for surgical-operations.ts, focusing on:
 * 1. Operation application (add_lesson, add_section, delete_element, move_element, update_field)
 * 2. Batch operations with tempId cross-referencing
 * 3. Validation (max operations, max deletes, delete ratio, ID existence)
 * 4. Renumbering and duration recalculation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applySurgicalOperations,
  validateOperations,
} from '../../src/server/routers/generation/editing/surgical-operations.js';
import type { CourseStructure } from '@megacampus/shared-types';
import type { CourseOperation } from '@megacampus/shared-types/course-operations';
import {
  MAX_OPERATIONS_PER_BATCH,
  MAX_DELETES_PER_BATCH,
} from '@megacampus/shared-types/course-operations';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../src/shared/logger/index.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Sample CourseStructure with 2 sections, 4 lessons total.
 * All elements have stable IDs (sec_test01, sec_test02, lsn_test01, etc.).
 */
function createSampleStructure(): CourseStructure {
  return {
    course_title: 'Test Course',
    course_description: 'A test course',
    target_audience: 'Students',
    estimated_duration_hours: 2,
    difficulty_level: 'beginner',
    prerequisites: [],
    sections: [
      {
        id: 'sec_test01',
        section_title: 'Section 1',
        section_description: 'First section',
        section_number: 1,
        learning_objectives: ['Objective 1'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_test01',
            lesson_title: 'Lesson 1',
            lesson_number: 1.1,
            lesson_objectives: ['Obj 1'],
            key_topics: ['Topic 1'],
            estimated_duration_minutes: 30,
          },
          {
            id: 'lsn_test02',
            lesson_title: 'Lesson 2',
            lesson_number: 1.2,
            lesson_objectives: ['Obj 2'],
            key_topics: ['Topic 2'],
            estimated_duration_minutes: 30,
          },
        ],
      },
      {
        id: 'sec_test02',
        section_title: 'Section 2',
        section_description: 'Second section',
        section_number: 2,
        learning_objectives: ['Objective 2'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_test03',
            lesson_title: 'Lesson 3',
            lesson_number: 2.1,
            lesson_objectives: ['Obj 3'],
            key_topics: ['Topic 3'],
            estimated_duration_minutes: 30,
          },
          {
            id: 'lsn_test04',
            lesson_title: 'Lesson 4',
            lesson_number: 2.2,
            lesson_objectives: ['Obj 4'],
            key_topics: ['Topic 4'],
            estimated_duration_minutes: 30,
          },
        ],
      },
    ],
  };
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('validateOperations', () => {
  it('should pass validation for empty operations array', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [];

    const errors = validateOperations(operations, structure);

    expect(errors).toHaveLength(0);
  });

  it('should fail validation when exceeding MAX_OPERATIONS_PER_BATCH', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = Array.from(
      { length: MAX_OPERATIONS_PER_BATCH + 1 },
      (_, i) => ({
        type: 'add_lesson',
        reasoning: 'Test',
        tempId: `__new_${i}__`,
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: `Lesson ${i}`,
      })
    );

    const errors = validateOperations(operations, structure);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain(`maximum of ${MAX_OPERATIONS_PER_BATCH} operations`);
  });

  it('should fail validation when exceeding MAX_DELETES_PER_BATCH', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = Array.from(
      { length: MAX_DELETES_PER_BATCH + 1 },
      (_, i) => ({
        type: 'delete_element',
        targetId:
          i === 0 ? 'lsn_test01' : i === 1 ? 'lsn_test02' : i === 2 ? 'lsn_test03' : 'lsn_test04',
      })
    );

    const errors = validateOperations(operations, structure);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain(`maximum of ${MAX_DELETES_PER_BATCH} delete operations`);
  });

  it('should fail validation when deleting more than 50% of content', () => {
    const structure = createSampleStructure();
    // Total elements: 2 sections + 4 lessons = 6 elements
    // Deleting 4 elements = 66% > 50%
    const operations: CourseOperation[] = [
      { type: 'delete_element', targetId: 'lsn_test01' },
      { type: 'delete_element', targetId: 'lsn_test02' },
      { type: 'delete_element', targetId: 'lsn_test03' },
      // 3 deletes = 50%, so this should pass - let me add one more to fail
    ];

    const errors = validateOperations(operations, structure);

    // 3 out of 6 = 50%, should still pass
    expect(errors).toHaveLength(0);

    // Now add one more to exceed the ratio
    operations.push({ type: 'delete_element', targetId: 'lsn_test04' });
    const errors2 = validateOperations(operations, structure);

    // 4 out of 6 = 66% > 50%
    expect(errors2.length).toBeGreaterThan(0);
    expect(errors2.some(e => e.message.includes('50%'))).toBe(true);
  });

  it('should fail validation when referencing non-existent ID', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [{ type: 'delete_element', targetId: 'nonexistent_id' }];

    const errors = validateOperations(operations, structure);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('not found');
  });

  it('should allow tempId references from earlier add operations in batch', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add new lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
      },
      {
        type: 'update_field',
        targetId: '__new_1__', // Reference tempId from previous operation
        field: 'lesson_title',
        newValue: 'Updated New Lesson',
      },
    ];

    const errors = validateOperations(operations, structure);

    expect(errors).toHaveLength(0);
  });
});

// ============================================================================
// ADD_LESSON OPERATION TESTS
// ============================================================================

describe('applySurgicalOperations - add_lesson', () => {
  it('should add a lesson at the beginning when afterLessonId is null', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson at start',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New First Lesson',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons).toHaveLength(3);
    expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('New First Lesson');
    expect(result.updatedStructure.sections[0].lessons[0].id).toMatch(/^lsn_/);
    expect(result.tempIdMap['__new_1__']).toMatch(/^lsn_/);
  });

  it('should add a lesson after a specific lesson', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson after first',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: 'lsn_test01',
        title: 'New Second Lesson',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons).toHaveLength(3);
    expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('New Second Lesson');
    expect(result.updatedStructure.sections[0].lessons[1].id).toMatch(/^lsn_/);
  });

  it('should use default lesson duration when not provided', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
        // No estimatedDuration provided
      },
    ];

    const result = applySurgicalOperations(operations, structure, 20);

    expect(result.updatedStructure.sections[0].lessons[0].estimated_duration_minutes).toBe(20);
  });

  it('should use provided lesson duration', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
        estimatedDuration: 45,
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons[0].estimated_duration_minutes).toBe(45);
  });
});

// ============================================================================
// ADD_SECTION OPERATION TESTS
// ============================================================================

describe('applySurgicalOperations - add_section', () => {
  it('should add a section at the beginning when afterSectionId is null', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'Add section at start',
        tempId: '__new_1__',
        afterSectionId: null,
        title: 'New First Section',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections).toHaveLength(3);
    expect(result.updatedStructure.sections[0].section_title).toBe('New First Section');
    expect(result.updatedStructure.sections[0].id).toMatch(/^sec_/);
    expect(result.tempIdMap['__new_1__']).toMatch(/^sec_/);
  });

  it('should add a section after a specific section', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'Add section after first',
        tempId: '__new_1__',
        afterSectionId: 'sec_test01',
        title: 'New Middle Section',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections).toHaveLength(3);
    expect(result.updatedStructure.sections[1].section_title).toBe('New Middle Section');
  });
});

// ============================================================================
// DELETE_ELEMENT OPERATION TESTS
// ============================================================================

describe('applySurgicalOperations - delete_element', () => {
  it('should delete a lesson by stable ID', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [{ type: 'delete_element', targetId: 'lsn_test01' }];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons).toHaveLength(1);
    expect(result.updatedStructure.sections[0].lessons[0].id).toBe('lsn_test02');
  });

  it('should delete a section by stable ID', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [{ type: 'delete_element', targetId: 'sec_test01' }];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections).toHaveLength(1);
    expect(result.updatedStructure.sections[0].id).toBe('sec_test02');
  });
});

// ============================================================================
// MOVE_ELEMENT OPERATION TESTS
// ============================================================================

describe('applySurgicalOperations - move_element', () => {
  it('should move a lesson within the same section', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'move_element',
        targetId: 'lsn_test01',
        afterId: 'lsn_test02', // Move first lesson after second
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons[0].id).toBe('lsn_test02');
    expect(result.updatedStructure.sections[0].lessons[1].id).toBe('lsn_test01');
  });

  it('should move a lesson to a different section', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'move_element',
        targetId: 'lsn_test01',
        newParentId: 'sec_test02',
        afterId: null, // Move to beginning of section 2
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons).toHaveLength(1);
    expect(result.updatedStructure.sections[1].lessons).toHaveLength(3);
    expect(result.updatedStructure.sections[1].lessons[0].id).toBe('lsn_test01');
  });

  it('should move a section to a different position', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'move_element',
        targetId: 'sec_test01',
        afterId: 'sec_test02', // Move first section after second
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].id).toBe('sec_test02');
    expect(result.updatedStructure.sections[1].id).toBe('sec_test01');
  });
});

// ============================================================================
// UPDATE_FIELD OPERATION TESTS
// ============================================================================

describe('applySurgicalOperations - update_field', () => {
  it('should update lesson title', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'lsn_test01',
        field: 'lesson_title',
        newValue: 'Updated Lesson Title',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe(
      'Updated Lesson Title'
    );
  });

  it('should update section title', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'sec_test01',
        field: 'section_title',
        newValue: 'Updated Section Title',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].section_title).toBe('Updated Section Title');
  });

  it('should support friendly field names', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'lsn_test01',
        field: 'title', // Friendly name instead of lesson_title
        newValue: 'Updated via friendly name',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe(
      'Updated via friendly name'
    );
  });
});

// ============================================================================
// BATCH OPERATIONS TESTS
// ============================================================================

describe('applySurgicalOperations - batch operations', () => {
  it('should apply multiple operations in sequence', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add new lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
      },
      {
        type: 'update_field',
        targetId: 'lsn_test01',
        field: 'lesson_title',
        newValue: 'Updated Lesson 1',
      },
      {
        type: 'delete_element',
        targetId: 'lsn_test02',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.appliedCount).toBe(3);
    expect(result.updatedStructure.sections[0].lessons).toHaveLength(2);
    expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe('New Lesson');
    expect(result.updatedStructure.sections[0].lessons[1].lesson_title).toBe('Updated Lesson 1');
  });

  it('should support tempId cross-referencing in batch', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'Add new section',
        tempId: '__new_section__',
        afterSectionId: null,
        title: 'New Section',
      },
      {
        type: 'add_lesson',
        reasoning: 'Add lesson to new section',
        tempId: '__new_lesson__',
        parentSectionId: '__new_section__', // Reference tempId from previous operation
        afterLessonId: null,
        title: 'Lesson in New Section',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections).toHaveLength(3);
    expect(result.updatedStructure.sections[0].lessons).toHaveLength(1);
    expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe(
      'Lesson in New Section'
    );
    expect(result.tempIdMap['__new_section__']).toMatch(/^sec_/);
    expect(result.tempIdMap['__new_lesson__']).toMatch(/^lsn_/);
  });
});

// ============================================================================
// RENUMBERING & DURATION RECALCULATION TESTS
// ============================================================================

describe('applySurgicalOperations - renumbering and duration recalculation', () => {
  it('should renumber lessons after add operation', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New First Lesson',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].lessons[0].lesson_number).toBe(1.1);
    expect(result.updatedStructure.sections[0].lessons[1].lesson_number).toBe(1.2);
    expect(result.updatedStructure.sections[0].lessons[2].lesson_number).toBe(1.3);
  });

  it('should renumber sections after add operation', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'Add section',
        tempId: '__new_1__',
        afterSectionId: null,
        title: 'New First Section',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.updatedStructure.sections[0].section_number).toBe(1);
    expect(result.updatedStructure.sections[1].section_number).toBe(2);
    expect(result.updatedStructure.sections[2].section_number).toBe(3);
  });

  it('should recalculate section duration after adding lesson', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
        estimatedDuration: 20,
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    // Original: 30 + 30 = 60, After: 20 + 30 + 30 = 80
    expect(result.updatedStructure.sections[0].estimated_duration_minutes).toBe(80);
  });

  it('should recalculate course duration after adding lesson', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
        estimatedDuration: 30,
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    // Original: 120 minutes = 2 hours, After: 150 minutes = 2.5 hours
    expect(result.updatedStructure.estimated_duration_hours).toBe(2.5);
  });

  it('should recalculate durations after deleting lesson', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [{ type: 'delete_element', targetId: 'lsn_test01' }];

    const result = applySurgicalOperations(operations, structure);

    // Original: 60 minutes, After: 30 minutes (one lesson deleted)
    expect(result.updatedStructure.sections[0].estimated_duration_minutes).toBe(30);
    // Original: 120 minutes = 2 hours, After: 90 minutes = 1.5 hours
    expect(result.updatedStructure.estimated_duration_hours).toBe(1.5);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('applySurgicalOperations - error handling', () => {
  it('should throw error when validation fails', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [{ type: 'delete_element', targetId: 'nonexistent_id' }];

    expect(() => applySurgicalOperations(operations, structure)).toThrow(
      'Pre-flight validation failed'
    );
  });

  it('should include operation summary in result', () => {
    const structure = createSampleStructure();
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_test01',
        afterLessonId: null,
        title: 'New Lesson',
      },
    ];

    const result = applySurgicalOperations(operations, structure);

    expect(result.operationSummary).toHaveLength(1);
    expect(result.operationSummary[0]).toContain('add_lesson');
    expect(result.operationSummary[0]).toContain('New Lesson');
  });
});
