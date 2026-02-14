/**
 * Surgical ID Remap Unit Tests
 * @module tests/unit/surgical-id-remap
 *
 * Tests for surgical-id-remap.ts, focusing on:
 * 1. buildIdRemapContext - Creates bidirectional maps for sections and lessons
 * 2. remapStructureToSimplified - Replaces real IDs with simplified ones (sec_1, lsn_1)
 * 3. remapOperationsToReal - Converts simplified IDs back to real, preserves __new_* IDs
 * 4. Round-trip testing - Ensures remap → operations → unremap produces consistent IDs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildIdRemapContext,
  remapStructureToSimplified,
  remapOperationsToReal,
  type IdRemapContext,
} from '../../src/server/routers/generation/editing/surgical-id-remap.js';
import type { CourseStructure } from '@megacampus/shared-types';
import type { CourseOperation } from '@megacampus/shared-types/course-operations';

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
 * Sample CourseStructure with real stable IDs.
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
        id: 'sec_hY7a3fRx',
        section_title: 'Section 1',
        section_description: 'First section',
        section_number: 1,
        learning_objectives: ['Objective 1'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_kM9b2cQw',
            lesson_title: 'Lesson 1',
            lesson_number: 1.1,
            lesson_objectives: ['Obj 1'],
            key_topics: ['Topic 1'],
            estimated_duration_minutes: 30,
          },
          {
            id: 'lsn_xY8z3aRw',
            lesson_title: 'Lesson 2',
            lesson_number: 1.2,
            lesson_objectives: ['Obj 2'],
            key_topics: ['Topic 2'],
            estimated_duration_minutes: 30,
          },
        ],
      },
      {
        id: 'sec_kM9b2cQw',
        section_title: 'Section 2',
        section_description: 'Second section',
        section_number: 2,
        learning_objectives: ['Objective 2'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_pQ3r4sTu',
            lesson_title: 'Lesson 3',
            lesson_number: 2.1,
            lesson_objectives: ['Obj 3'],
            key_topics: ['Topic 3'],
            estimated_duration_minutes: 30,
          },
          {
            id: 'lsn_vW5x6yZa',
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
// buildIdRemapContext TESTS
// ============================================================================

describe('buildIdRemapContext', () => {
  it('should create bidirectional maps for sections and lessons', () => {
    const structure = createSampleStructure();

    const ctx = buildIdRemapContext(structure);

    // Check sections
    expect(ctx.toSimplified.get('sec_hY7a3fRx')).toBe('sec_1');
    expect(ctx.toSimplified.get('sec_kM9b2cQw')).toBe('sec_2');
    expect(ctx.toReal.get('sec_1')).toBe('sec_hY7a3fRx');
    expect(ctx.toReal.get('sec_2')).toBe('sec_kM9b2cQw');

    // Check lessons
    expect(ctx.toSimplified.get('lsn_kM9b2cQw')).toBe('lsn_1');
    expect(ctx.toSimplified.get('lsn_xY8z3aRw')).toBe('lsn_2');
    expect(ctx.toSimplified.get('lsn_pQ3r4sTu')).toBe('lsn_3');
    expect(ctx.toSimplified.get('lsn_vW5x6yZa')).toBe('lsn_4');

    expect(ctx.toReal.get('lsn_1')).toBe('lsn_kM9b2cQw');
    expect(ctx.toReal.get('lsn_2')).toBe('lsn_xY8z3aRw');
    expect(ctx.toReal.get('lsn_3')).toBe('lsn_pQ3r4sTu');
    expect(ctx.toReal.get('lsn_4')).toBe('lsn_vW5x6yZa');
  });

  it('should number lessons sequentially across all sections', () => {
    const structure = createSampleStructure();

    const ctx = buildIdRemapContext(structure);

    // Lessons are numbered 1-4 across both sections, not 1-2 per section
    expect(ctx.toSimplified.get('lsn_kM9b2cQw')).toBe('lsn_1'); // Section 1, Lesson 1
    expect(ctx.toSimplified.get('lsn_xY8z3aRw')).toBe('lsn_2'); // Section 1, Lesson 2
    expect(ctx.toSimplified.get('lsn_pQ3r4sTu')).toBe('lsn_3'); // Section 2, Lesson 1
    expect(ctx.toSimplified.get('lsn_vW5x6yZa')).toBe('lsn_4'); // Section 2, Lesson 2
  });

  it('should skip elements without id field', () => {
    const structure = createSampleStructure();
    // Remove ID from one section
    delete (structure.sections[1] as { id?: string }).id;

    const ctx = buildIdRemapContext(structure);

    expect(ctx.toSimplified.get('sec_hY7a3fRx')).toBe('sec_1');
    expect(ctx.toSimplified.has('sec_kM9b2cQw')).toBe(false);
    expect(ctx.toReal.get('sec_1')).toBe('sec_hY7a3fRx');
    expect(ctx.toReal.has('sec_2')).toBe(false);
  });

  it('should handle empty course structure', () => {
    const structure: CourseStructure = {
      course_title: 'Empty Course',
      estimated_duration_hours: 0,
      sections: [],
    };

    const ctx = buildIdRemapContext(structure);

    expect(ctx.toSimplified.size).toBe(0);
    expect(ctx.toReal.size).toBe(0);
  });
});

// ============================================================================
// remapStructureToSimplified TESTS
// ============================================================================

describe('remapStructureToSimplified', () => {
  it('should replace real IDs with simplified ones', () => {
    const structure = createSampleStructure();
    const ctx = buildIdRemapContext(structure);

    const simplified = remapStructureToSimplified(structure, ctx);

    expect(simplified.sections[0].id).toBe('sec_1');
    expect(simplified.sections[1].id).toBe('sec_2');
    expect(simplified.sections[0].lessons[0].id).toBe('lsn_1');
    expect(simplified.sections[0].lessons[1].id).toBe('lsn_2');
    expect(simplified.sections[1].lessons[0].id).toBe('lsn_3');
    expect(simplified.sections[1].lessons[1].id).toBe('lsn_4');
  });

  it('should preserve all other fields unchanged', () => {
    const structure = createSampleStructure();
    const ctx = buildIdRemapContext(structure);

    const simplified = remapStructureToSimplified(structure, ctx);

    expect(simplified.course_title).toBe('Test Course');
    expect(simplified.sections[0].section_title).toBe('Section 1');
    expect(simplified.sections[0].lessons[0].lesson_title).toBe('Lesson 1');
    expect(simplified.sections[0].lessons[0].estimated_duration_minutes).toBe(30);
  });

  it('should not mutate the original structure', () => {
    const structure = createSampleStructure();
    const ctx = buildIdRemapContext(structure);
    const originalSectionId = structure.sections[0].id;

    const simplified = remapStructureToSimplified(structure, ctx);

    expect(structure.sections[0].id).toBe(originalSectionId);
    expect(simplified.sections[0].id).toBe('sec_1');
  });

  it('should handle elements without id field gracefully', () => {
    const structure = createSampleStructure();
    delete (structure.sections[1] as { id?: string }).id;
    const ctx = buildIdRemapContext(structure);

    const simplified = remapStructureToSimplified(structure, ctx);

    expect(simplified.sections[0].id).toBe('sec_1');
    expect(simplified.sections[1].id).toBeUndefined();
  });
});

// ============================================================================
// remapOperationsToReal TESTS
// ============================================================================

describe('remapOperationsToReal', () => {
  let ctx: IdRemapContext;

  beforeEach(() => {
    const structure = createSampleStructure();
    ctx = buildIdRemapContext(structure);
  });

  it('should convert add_lesson operation from simplified to real IDs', () => {
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_1', // Simplified ID
        afterLessonId: 'lsn_1', // Simplified ID
        title: 'New Lesson',
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect(remapped[0]).toMatchObject({
      type: 'add_lesson',
      tempId: '__new_1__', // tempId preserved
      parentSectionId: 'sec_hY7a3fRx', // Converted to real ID
      afterLessonId: 'lsn_kM9b2cQw', // Converted to real ID
    });
  });

  it('should preserve __new_* tempIds without remapping', () => {
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_1',
        afterLessonId: null,
        title: 'New Lesson',
      },
      {
        type: 'update_field',
        targetId: '__new_1__', // Reference to tempId
        field: 'lesson_title',
        newValue: 'Updated Title',
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect(remapped[0].tempId).toBe('__new_1__');
    expect((remapped[1] as { targetId: string }).targetId).toBe('__new_1__');
  });

  it('should convert add_section operation from simplified to real IDs', () => {
    const operations: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'Add section',
        tempId: '__new_section__',
        afterSectionId: 'sec_1', // Simplified ID
        title: 'New Section',
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect(remapped[0]).toMatchObject({
      type: 'add_section',
      afterSectionId: 'sec_hY7a3fRx', // Converted to real ID
    });
  });

  it('should convert update_field operation from simplified to real IDs', () => {
    const operations: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'lsn_2', // Simplified ID
        field: 'lesson_title',
        newValue: 'Updated Title',
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect((remapped[0] as { targetId: string }).targetId).toBe('lsn_xY8z3aRw');
  });

  it('should convert delete_element operation from simplified to real IDs', () => {
    const operations: CourseOperation[] = [
      {
        type: 'delete_element',
        targetId: 'sec_2', // Simplified ID
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect((remapped[0] as { targetId: string }).targetId).toBe('sec_kM9b2cQw');
  });

  it('should convert move_element operation from simplified to real IDs', () => {
    const operations: CourseOperation[] = [
      {
        type: 'move_element',
        targetId: 'lsn_1', // Simplified ID
        newParentId: 'sec_2', // Simplified ID
        afterId: 'lsn_3', // Simplified ID
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect(remapped[0]).toMatchObject({
      targetId: 'lsn_kM9b2cQw',
      newParentId: 'sec_kM9b2cQw',
      afterId: 'lsn_pQ3r4sTu',
    });
  });

  it('should handle null and undefined ID fields correctly', () => {
    const operations: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_1__',
        parentSectionId: 'sec_1',
        afterLessonId: null, // Null ID
        title: 'New Lesson',
      },
      {
        type: 'move_element',
        targetId: 'lsn_1',
        afterId: null, // Null ID
      },
    ];

    const remapped = remapOperationsToReal(operations, ctx);

    expect((remapped[0] as { afterLessonId: string | null }).afterLessonId).toBeNull();
    expect((remapped[1] as { afterId: string | null }).afterId).toBeNull();
  });

  it('should throw error for unknown simplified ID', () => {
    const operations: CourseOperation[] = [
      {
        type: 'delete_element',
        targetId: 'lsn_999', // Non-existent simplified ID
      },
    ];

    expect(() => remapOperationsToReal(operations, ctx)).toThrow('Unknown simplified ID');
  });
});

// ============================================================================
// ROUND-TRIP TESTS
// ============================================================================

describe('Round-trip ID remapping', () => {
  it('should preserve IDs after remap → operations → unremap', () => {
    const structure = createSampleStructure();
    const ctx = buildIdRemapContext(structure);

    // 1. Simplify structure
    const _simplified = remapStructureToSimplified(structure, ctx);

    // 2. Create operations with simplified IDs
    const simplifiedOps: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'lsn_1', // Simplified
        field: 'lesson_title',
        newValue: 'Updated',
      },
      {
        type: 'delete_element',
        targetId: 'sec_2', // Simplified
      },
    ];

    // 3. Remap operations back to real IDs
    const realOps = remapOperationsToReal(simplifiedOps, ctx);

    // 4. Verify real IDs are restored
    expect((realOps[0] as { targetId: string }).targetId).toBe('lsn_kM9b2cQw');
    expect((realOps[1] as { targetId: string }).targetId).toBe('sec_kM9b2cQw');
  });

  it('should handle complex batch with tempId cross-references', () => {
    const structure = createSampleStructure();
    const ctx = buildIdRemapContext(structure);

    const simplifiedOps: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'Add section',
        tempId: '__new_section__',
        afterSectionId: 'sec_1', // Simplified
        title: 'New Section',
      },
      {
        type: 'add_lesson',
        reasoning: 'Add lesson',
        tempId: '__new_lesson__',
        parentSectionId: '__new_section__', // tempId reference
        afterLessonId: null,
        title: 'New Lesson',
      },
      {
        type: 'update_field',
        targetId: '__new_lesson__', // tempId reference
        field: 'lesson_title',
        newValue: 'Updated New Lesson',
      },
    ];

    const realOps = remapOperationsToReal(simplifiedOps, ctx);

    // Verify simplified IDs are converted, tempIds are preserved
    expect((realOps[0] as { afterSectionId: string | null }).afterSectionId).toBe('sec_hY7a3fRx');
    expect((realOps[1] as { parentSectionId: string }).parentSectionId).toBe('__new_section__');
    expect((realOps[2] as { targetId: string }).targetId).toBe('__new_lesson__');
  });

  it('should maintain structure integrity after round-trip', () => {
    const structure = createSampleStructure();
    const ctx = buildIdRemapContext(structure);

    const simplified = remapStructureToSimplified(structure, ctx);

    // Verify simplified structure has expected IDs
    expect(simplified.sections[0].id).toBe('sec_1');
    expect(simplified.sections[0].lessons[0].id).toBe('lsn_1');

    // Verify original structure is unchanged
    expect(structure.sections[0].id).toBe('sec_hY7a3fRx');
    expect(structure.sections[0].lessons[0].id).toBe('lsn_kM9b2cQw');

    // Verify all other fields are identical
    expect(simplified.course_title).toBe(structure.course_title);
    expect(simplified.sections[0].section_title).toBe(structure.sections[0].section_title);
  });
});
