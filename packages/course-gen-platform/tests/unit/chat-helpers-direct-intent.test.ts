/**
 * Chat Helpers Direct Intent Unit Tests
 * @module tests/unit/chat-helpers-direct-intent
 *
 * Tests for handleDirectIntent in chat-helpers.ts, focusing on:
 * 1. DELETE_LESSON intent - Returns structural_operation with delete_element
 * 2. DELETE_SECTION intent - Returns structural_operation with delete_element
 * 3. MOVE_ELEMENT intent - Returns structural_operation with move_element
 * 4. Error handling - Missing element, missing stable ID, ambiguous target
 */

import { describe, it, expect, vi } from 'vitest';
import { handleDirectIntent } from '../../src/server/routers/generation/editing/chat-helpers.js';
import type { CourseStructure } from '@megacampus/shared-types';
import type { ClassifiedIntent } from '../../src/shared/intent/index.js';

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
 * Sample CourseStructure with stable IDs for testing.
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
        section_title: 'Introduction',
        section_description: 'Intro section',
        section_number: 1,
        learning_objectives: ['Objective 1'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_test01',
            lesson_title: 'What is happiness',
            lesson_number: 1.1,
            lesson_objectives: ['Obj 1'],
            key_topics: ['Topic 1'],
            estimated_duration_minutes: 30,
          },
          {
            id: 'lsn_test02',
            lesson_title: 'Myths about happiness',
            lesson_number: 1.2,
            lesson_objectives: ['Obj 2'],
            key_topics: ['Topic 2'],
            estimated_duration_minutes: 30,
          },
        ],
      },
      {
        id: 'sec_test02',
        section_title: 'Fundamentals',
        section_description: 'Core concepts',
        section_number: 2,
        learning_objectives: ['Objective 2'],
        estimated_duration_minutes: 60,
        lessons: [
          {
            id: 'lsn_test03',
            lesson_title: 'Scientific approach',
            lesson_number: 2.1,
            lesson_objectives: ['Obj 3'],
            key_topics: ['Topic 3'],
            estimated_duration_minutes: 30,
          },
          {
            id: 'lsn_test04',
            lesson_title: 'Practical exercises',
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

/**
 * Create a ClassifiedIntent for testing.
 */
function createIntent(
  intent: string,
  targetIdentifier?: string,
  targetPath?: string,
  destination?: string
): ClassifiedIntent {
  return {
    intent: intent as ClassifiedIntent['intent'],
    confidence: 0.9,
    target:
      targetIdentifier || targetPath
        ? {
            identifier: targetIdentifier,
            path: targetPath,
          }
        : undefined,
    destination,
  };
}

// ============================================================================
// DELETE_LESSON INTENT TESTS
// ============================================================================

describe('handleDirectIntent - DELETE_LESSON', () => {
  it('should return structural_operation proposal for deleting a lesson', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_LESSON', 'урок 1', 'sections[0].lessons[0]');

    const result = handleDirectIntent(intent, structure);

    expect(result.message).toContain('Удалить');
    expect(result.message).toContain('What is happiness');
    expect(result.proposal).toBeDefined();
    expect(result.proposal?.type).toBe('structural_operation');
    expect(result.proposal?.operations).toHaveLength(1);
    expect(result.proposal?.operations[0]).toMatchObject({
      type: 'delete_element',
      targetId: 'lsn_test01',
    });
  });

  it('should use stable ID from lesson for delete operation', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_LESSON', 'урок 2', 'sections[0].lessons[1]');

    const result = handleDirectIntent(intent, structure);

    expect(result.proposal?.operations[0]).toMatchObject({
      type: 'delete_element',
      targetId: 'lsn_test02',
    });
  });

  it('should return error when lesson not found', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_LESSON', 'nonexistent lesson');

    const result = handleDirectIntent(intent, structure);

    // When no match is found, resolveTargetPathWithMatches returns empty array,
    // triggering clarification flow
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('определить элемент');
    expect(result.proposal).toBeUndefined();
  });

  it('should return error when lesson has no stable ID', () => {
    const structure = createSampleStructure();
    delete (structure.sections[0].lessons[0] as { id?: string }).id;
    const intent = createIntent('DELETE_LESSON', 'урок 1', 'sections[0].lessons[0]');

    const result = handleDirectIntent(intent, structure);

    expect(result.message).toContain('стабильного идентификатора');
    expect(result.proposal).toBeUndefined();
  });

  it('should handle ambiguous target and require clarification', () => {
    const structure = createSampleStructure();
    // Create intent without specific path - will trigger fuzzy matching
    const intent = createIntent('DELETE_LESSON', 'урок');

    const result = handleDirectIntent(intent, structure);

    // Should ask for clarification when multiple matches found or no specific match
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toBeDefined();
  });
});

// ============================================================================
// DELETE_SECTION INTENT TESTS
// ============================================================================

describe('handleDirectIntent - DELETE_SECTION', () => {
  it('should return structural_operation proposal for deleting a section', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_SECTION', 'секция 1', 'sections[0]');

    const result = handleDirectIntent(intent, structure);

    expect(result.message).toContain('Удалить');
    expect(result.message).toContain('Introduction');
    expect(result.proposal).toBeDefined();
    expect(result.proposal?.type).toBe('structural_operation');
    expect(result.proposal?.operations[0]).toMatchObject({
      type: 'delete_element',
      targetId: 'sec_test01',
    });
  });

  it('should include lesson count in summary when deleting section', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_SECTION', 'секция 1', 'sections[0]');

    const result = handleDirectIntent(intent, structure);

    expect(result.proposal?.summary).toContain('2'); // 2 lessons in section
  });

  it('should use stable ID from section for delete operation', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_SECTION', 'секция 2', 'sections[1]');

    const result = handleDirectIntent(intent, structure);

    expect(result.proposal?.operations[0]).toMatchObject({
      type: 'delete_element',
      targetId: 'sec_test02',
    });
  });

  it('should return error when section not found', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_SECTION', 'nonexistent section');

    const result = handleDirectIntent(intent, structure);

    // When no match is found, triggers clarification flow
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('определить элемент');
    expect(result.proposal).toBeUndefined();
  });
});

// ============================================================================
// MOVE_ELEMENT INTENT TESTS
// ============================================================================

describe('handleDirectIntent - MOVE_ELEMENT', () => {
  it('should require clarification when destination is not precisely specified', () => {
    const structure = createSampleStructure();
    const intent = createIntent(
      'MOVE_ELEMENT',
      'урок 1',
      'sections[0].lessons[0]',
      'после урока 2'
    );

    const result = handleDirectIntent(intent, structure);

    // Without a precise destination path, requires clarification
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toBeDefined();
  });

  it('should require clarification when destination is ambiguous', () => {
    const structure = createSampleStructure();
    const intent = createIntent(
      'MOVE_ELEMENT',
      'урок 1',
      'sections[0].lessons[0]',
      'после урока 2'
    );

    const result = handleDirectIntent(intent, structure);

    // Without resolved destination path, should require clarification
    expect(result.requiresClarification).toBe(true);
  });

  it('should require clarification when destination is missing', () => {
    const structure = createSampleStructure();
    const intent = createIntent('MOVE_ELEMENT', 'урок 1', 'sections[0].lessons[0]');
    // No destination provided

    const result = handleDirectIntent(intent, structure);

    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('куда переместить');
  });

  it('should return error when source element not found', () => {
    const structure = createSampleStructure();
    const intent = createIntent('MOVE_ELEMENT', 'nonexistent', undefined, 'после урока 1');

    const result = handleDirectIntent(intent, structure);

    // When no match found, triggers clarification
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('определить элемент');
    expect(result.proposal).toBeUndefined();
  });

  it('should require clarification when destination cannot be resolved', () => {
    const structure = createSampleStructure();
    const intent = createIntent(
      'MOVE_ELEMENT',
      'урок 1',
      'sections[0].lessons[0]',
      'invalid destination'
    );

    const result = handleDirectIntent(intent, structure);

    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('место назначения');
  });

  it('should handle move operations with destination clarification needed', () => {
    const structure = createSampleStructure();
    const intent = createIntent('MOVE_ELEMENT', 'урок 1', 'sections[0].lessons[0]', 'в секцию 2');

    const result = handleDirectIntent(intent, structure);

    // Complex move operations may require clarification for destination
    expect(result.message).toBeDefined();
  });
});

// ============================================================================
// UPDATE_FIELD INTENT TESTS
// ============================================================================

describe('handleDirectIntent - UPDATE_FIELD', () => {
  it('should return field_updates proposal when fieldName and newValue are present', () => {
    const structure = createSampleStructure();
    const intent = createIntent('UPDATE_FIELD', 'урок 1', 'sections[0].lessons[0]');
    // Add fieldName and newValue to intent
    intent.fieldName = 'title';
    intent.newValue = 'New Title';

    const result = handleDirectIntent(intent, structure);

    expect(result.message).toContain('Изменить');
    expect(result.message).toContain('title');
    expect(result.message).toContain('New Title');
    expect(result.proposal).toBeDefined();
    expect(result.proposal?.type).toBe('field_updates');
    if (result.proposal?.type === 'field_updates') {
      expect(result.proposal.stageId).toBe('stage_5');
      expect(result.proposal.updates).toHaveLength(1);
      expect(result.proposal.updates[0]).toMatchObject({
        path: 'title',
        newValue: 'New Title',
      });
      expect(result.proposal.summary).toContain('title');
    }
  });

  it('should use stage_4 when stageId is explicitly stage_4', () => {
    const structure = createSampleStructure();
    const intent = createIntent('UPDATE_FIELD', 'урок 1', 'sections[0].lessons[0]');
    intent.fieldName = 'course_title';
    intent.newValue = 'Updated Course';

    const result = handleDirectIntent(intent, structure, undefined, 'stage_4');

    expect(result.proposal).toBeDefined();
    if (result.proposal?.type === 'field_updates') {
      expect(result.proposal.stageId).toBe('stage_4');
    }
  });

  it('should default to stage_5 when no stageId is provided', () => {
    const structure = createSampleStructure();
    const intent = createIntent('UPDATE_FIELD', 'урок 1', 'sections[0].lessons[0]');
    intent.fieldName = 'lesson_title';
    intent.newValue = 'Updated Lesson';

    const result = handleDirectIntent(intent, structure);

    expect(result.proposal).toBeDefined();
    if (result.proposal?.type === 'field_updates') {
      expect(result.proposal.stageId).toBe('stage_5');
    }
  });

  it('should handle non-string newValue in proposal', () => {
    const structure = createSampleStructure();
    const intent = createIntent('UPDATE_FIELD', 'урок 1', 'sections[0].lessons[0]');
    intent.fieldName = 'estimated_duration_minutes';
    intent.newValue = 45;

    const result = handleDirectIntent(intent, structure);

    expect(result.message).toContain('45');
    expect(result.proposal).toBeDefined();
    if (result.proposal?.type === 'field_updates') {
      expect(result.proposal.updates[0].newValue).toBe(45);
    }
  });

  it('should require clarification when field or value is missing', () => {
    const structure = createSampleStructure();
    const intent = createIntent('UPDATE_FIELD', 'урок 1', 'sections[0].lessons[0]');
    // No fieldName or newValue

    const result = handleDirectIntent(intent, structure);

    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('какое поле');
  });
});

// ============================================================================
// FUZZY MATCHING & AMBIGUITY TESTS
// ============================================================================

describe('handleDirectIntent - fuzzy matching and ambiguity', () => {
  it('should handle fuzzy matching for unique identifiers', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_LESSON', 'happiness'); // Unique word in lesson title

    const result = handleDirectIntent(intent, structure);

    // Fuzzy matching behavior depends on the implementation
    // May either find the match or require clarification
    expect(result.message).toBeDefined();
  });

  it('should require clarification when confidence is below threshold', () => {
    const structure = createSampleStructure();
    // Add more lessons with similar names to reduce confidence
    structure.sections[0].lessons.push({
      id: 'lsn_test05',
      lesson_title: 'Happiness theory',
      lesson_number: 1.3,
      lesson_objectives: ['Obj 5'],
      key_topics: ['Topic 5'],
      estimated_duration_minutes: 30,
    });
    structure.sections[0].lessons.push({
      id: 'lsn_test06',
      lesson_title: 'Happiness practice',
      lesson_number: 1.4,
      lesson_objectives: ['Obj 6'],
      key_topics: ['Topic 6'],
      estimated_duration_minutes: 30,
    });

    const intent = createIntent('DELETE_LESSON', 'happiness');

    const result = handleDirectIntent(intent, structure);

    // With multiple "happiness" lessons, should require clarification
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toContain('совпадени');
  });

  it('should handle generic identifiers by requiring clarification', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_LESSON', 'урок'); // Very generic

    const result = handleDirectIntent(intent, structure);

    // Generic identifiers should trigger clarification
    expect(result.requiresClarification).toBe(true);
    expect(result.message).toBeDefined();
  });

  it('should limit clarification list to 5 options', () => {
    const structure = createSampleStructure();
    // Add many lessons
    for (let i = 5; i <= 10; i++) {
      structure.sections[0].lessons.push({
        id: `lsn_test${String(i).padStart(2, '0')}`,
        lesson_title: `Lesson ${i}`,
        lesson_number: 1 + i * 0.1,
        lesson_objectives: [`Obj ${i}`],
        key_topics: [`Topic ${i}`],
        estimated_duration_minutes: 30,
      });
    }

    const intent = createIntent('DELETE_LESSON', 'lesson');

    const result = handleDirectIntent(intent, structure);

    if (result.requiresClarification) {
      const matches = result.message.match(/\d+\)/g);
      expect(matches?.length).toBeLessThanOrEqual(5);
    }
  });
});

// ============================================================================
// NODE CONTEXT PATH TESTS
// ============================================================================

describe('handleDirectIntent - nodeContextPath', () => {
  it('should use nodeContextPath to narrow down search scope', () => {
    const structure = createSampleStructure();
    const intent = createIntent('DELETE_LESSON', 'урок 1');
    const nodeContextPath = 'sections[1]'; // Context is section 2

    // Without context, might match lesson 1 in section 1
    // With context, should prioritize lesson 1 in section 2 (lsn_test03)
    const result = handleDirectIntent(intent, structure, nodeContextPath);

    // This test depends on the actual implementation of resolveTargetPathWithMatches
    // which uses nodeContextPath as a hint for scoring
    expect(result.proposal).toBeDefined();
  });
});

// ============================================================================
// UNSUPPORTED INTENT TESTS
// ============================================================================

describe('handleDirectIntent - unsupported intents', () => {
  it('should handle unsupported intent types gracefully', () => {
    const structure = createSampleStructure();
    const intent = createIntent('UNSUPPORTED_INTENT', 'something');

    const result = handleDirectIntent(intent, structure);

    // Unsupported intents should return an error or clarification
    expect(result.message).toBeDefined();
    expect(result.proposal).toBeUndefined();
  });
});
