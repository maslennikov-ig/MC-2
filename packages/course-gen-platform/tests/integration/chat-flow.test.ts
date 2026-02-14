/**
 * Chat Flow Integration Tests
 * @module tests/integration/chat-flow
 *
 * Integration test scenarios for the surgical course editing chat flow.
 * Based on plan section 10.2 from docs/plans/2026-02-12-surgical-course-editing-v2-1.md
 *
 * Test scenarios:
 * 1. generation.chat without intent (auto classification) — heuristics tested
 * 2. legacy intent='regenerate' — executeFullRegenerate tested with mocks
 * 3. structural proposal -> applyProposal — pure functions tested directly
 * 4. add lesson + Stage 6 CTA condition — pure operation tests + stubs
 *
 * Remaining stubs (it.todo) document scenarios requiring full DB/tRPC setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyWithHeuristics } from '../../src/shared/intent/heuristics';
import {
  applySurgicalOperations,
  validateOperations,
} from '../../src/server/routers/generation/editing/surgical-operations';
import type { CourseStructure } from '@megacampus/shared-types';
import type { CourseOperation } from '@megacampus/shared-types/course-operations';
import { ensureStableIdsInMemory } from '../../src/stages/stage5-generation/utils/course-structure-editor';
import {
  buildIdRemapContext,
  remapStructureToSimplified,
  remapOperationsToReal,
} from '../../src/server/routers/generation/editing/surgical-id-remap';
import { executeFullRegenerate } from '../../src/server/routers/generation/editing/chat-intent-flow';

// ============================================================================
// Mocks for Scenario 2 (executeFullRegenerate)
// ============================================================================

// Mock orchestrator queue functions
vi.mock('../../src/orchestrator/queue', () => ({
  removeJobsByCourseId: vi.fn().mockResolvedValue(undefined),
  addJob: vi.fn().mockResolvedValue({ id: 'test-job-id-12345' }),
}));

// Mock buildStage5JobInput helper
vi.mock('../../src/server/routers/generation/_shared/helpers', () => ({
  buildStage5JobInput: vi.fn().mockResolvedValue({
    jobInput: {
      courseId: 'test-course',
      userId: 'test-user',
      requestId: 'test-request',
    },
  }),
}));

// ============================================================================
// Shared Test Fixtures
// ============================================================================

/** Minimal course structure for testing */
function createTestStructure(): CourseStructure {
  return {
    title: 'Test Course',
    description: 'A test course',
    tags: ['test'],
    target_audience: 'developers',
    language: 'ru',
    estimated_duration_hours: 2,
    sections: [
      {
        id: 'sec_aaaaaaaa',
        section_number: 1,
        section_title: 'Section 1',
        section_description: 'First section',
        estimated_duration_minutes: 60,
        learning_objectives: ['Objective 1'],
        lessons: [
          {
            id: 'lsn_bbbbbbbb',
            lesson_number: 1,
            lesson_title: 'Lesson 1.1',
            lesson_objectives: ['Learn basics'],
            key_topics: ['topic1'],
            estimated_duration_minutes: 15,
            difficulty_level: 'beginner',
          },
          {
            id: 'lsn_cccccccc',
            lesson_number: 2,
            lesson_title: 'Lesson 1.2',
            lesson_objectives: ['Learn more'],
            key_topics: ['topic2'],
            estimated_duration_minutes: 20,
            difficulty_level: 'intermediate',
          },
        ],
      },
      {
        id: 'sec_dddddddd',
        section_number: 2,
        section_title: 'Section 2',
        section_description: 'Second section',
        estimated_duration_minutes: 30,
        learning_objectives: ['Objective 2'],
        lessons: [
          {
            id: 'lsn_eeeeeeee',
            lesson_number: 1,
            lesson_title: 'Lesson 2.1',
            lesson_objectives: ['Advanced'],
            key_topics: ['topic3'],
            estimated_duration_minutes: 30,
            difficulty_level: 'advanced',
          },
        ],
      },
    ],
  } as CourseStructure;
}

// ============================================================================
// Scenario 1: Auto-classification Flow (No Explicit Intent)
// ============================================================================

describe('Scenario 1: generation.chat without explicit intent (auto-classification)', () => {
  // --- Tier 0 heuristic classification (real executable tests) ---

  describe('Tier 0 heuristics — ADD_LESSON', () => {
    it('should classify "Добавь урок про X" as ADD_LESSON', () => {
      const result = classifyWithHeuristics('Добавь урок про Machine Learning');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('ADD_LESSON');
      expect(result!.confidence).toBe(0.9);
    });

    it('should classify "Добавить новый урок" as ADD_LESSON', () => {
      const result = classifyWithHeuristics('Добавить новый урок по Python');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('ADD_LESSON');
    });

    it('should classify "add lesson" as ADD_LESSON', () => {
      const result = classifyWithHeuristics('add lesson about arrays');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('ADD_LESSON');
    });
  });

  describe('Tier 0 heuristics — DELETE', () => {
    it('should classify "Удали урок 3" as DELETE_LESSON', () => {
      const result = classifyWithHeuristics('Удали урок 3');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('DELETE_LESSON');
      expect(result!.confidence).toBe(0.9);
    });

    it('should classify "Удали последнюю секцию" as DELETE_SECTION', () => {
      const result = classifyWithHeuristics('Удали последнюю секцию');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('DELETE_SECTION');
    });

    it('should classify "remove last section" as DELETE_SECTION', () => {
      const result = classifyWithHeuristics('remove last section');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('DELETE_SECTION');
    });
  });

  describe('Tier 0 heuristics — UPDATE_FIELD (deferred to Tier 1)', () => {
    it('should NOT classify UPDATE_FIELD at Tier 0 (needs fieldName+newValue from LLM)', () => {
      const result = classifyWithHeuristics('Измени название курса на "Advanced Python"');
      expect(result).toBeNull();
    });

    it('should NOT classify "rename title course" at Tier 0', () => {
      const result = classifyWithHeuristics('rename title course to something');
      expect(result).toBeNull();
    });
  });

  describe('Tier 0 heuristics — FULL_REGENERATE', () => {
    it('should classify "Полностью переделай курс" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('Полностью переделай курс');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('FULL_REGENERATE');
      expect(result!.confidence).toBe(0.95);
    });

    it('should classify "Перегенерируй всё" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('Перегенерируй всё');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('FULL_REGENERATE');
    });

    it('should classify "start over" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('start over please');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('FULL_REGENERATE');
    });

    it('should classify "перегенерируй курс" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('перегенерируй курс');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('FULL_REGENERATE');
    });

    it('should classify "regenerate everything" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('regenerate everything');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('FULL_REGENERATE');
    });

    it('should NOT classify bare "regenerate typo in lesson 1" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('Regenerate typo in lesson 1');
      // Should fall through to Tier 1 LLM, not trigger full regeneration
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });

    it('should NOT classify "Перегенерируй опечатку в уроке 1" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('Перегенерируй опечатку в уроке 1');
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });

    it('should NOT classify "переделай заголовок" as FULL_REGENERATE', () => {
      const result = classifyWithHeuristics('переделай заголовок урока 2');
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });

    it('should NOT classify "перепиши весь урок" as FULL_REGENERATE (scope + element type)', () => {
      const result = classifyWithHeuristics('перепиши весь урок');
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });

    it('should NOT classify "regenerate all lessons" as FULL_REGENERATE (scope + element type)', () => {
      const result = classifyWithHeuristics('regenerate all lessons');
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });

    it('should NOT classify "переделай все секции" as FULL_REGENERATE (scope + element type)', () => {
      const result = classifyWithHeuristics('переделай все секции');
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });

    it('should NOT classify "redo the whole section" as FULL_REGENERATE (scope + element type)', () => {
      const result = classifyWithHeuristics('redo the whole section');
      expect(result === null || result.intent !== 'FULL_REGENERATE').toBe(true);
    });
  });

  describe('Tier 0 heuristics — GET_INFO', () => {
    it('should classify "Сколько уроков?" as GET_INFO', () => {
      const result = classifyWithHeuristics('Сколько уроков?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('GET_INFO');
      expect(result!.confidence).toBe(0.95);
    });

    it('should classify "Покажи все секции" as GET_INFO', () => {
      const result = classifyWithHeuristics('Покажи все секции');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('GET_INFO');
      expect(result!.confidence).toBe(0.85);
    });

    it('should classify "how many lessons" as GET_INFO', () => {
      const result = classifyWithHeuristics('how many lessons are there?');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('GET_INFO');
    });
  });

  describe('Tier 0 heuristics — MOVE_ELEMENT (deferred to Tier 1)', () => {
    it('should NOT classify MOVE_ELEMENT at Tier 0 (needs destination from LLM)', () => {
      const result = classifyWithHeuristics('Перемести урок 3 в секцию 2');
      expect(result).toBeNull();
    });
  });

  describe('Tier 0 heuristics — ADD_SECTION', () => {
    it('should classify "Добавь новую секцию" as ADD_SECTION', () => {
      const result = classifyWithHeuristics('Добавь новую секцию про базы данных');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('ADD_SECTION');
      expect(result!.confidence).toBe(0.9);
    });
  });

  describe('Tier 0 heuristics — fallback to null', () => {
    it('should return null for ambiguous messages that need LLM', () => {
      const result = classifyWithHeuristics('Сделай курс более интересным');
      expect(result).toBeNull();
    });

    it('should return null for empty messages', () => {
      const result = classifyWithHeuristics('');
      expect(result).toBeNull();
    });

    it('should return null for generic questions', () => {
      const result = classifyWithHeuristics('Что ты думаешь про этот курс?');
      expect(result).toBeNull();
    });
  });

  // --- Remaining integration stubs (require DB/tRPC setup) ---

  it.todo('should return clarification response when intent confidence is below 0.6 threshold');

  it.todo('should handle fallback to LLM when both heuristics and classifier fail');

  it.todo(
    'should persist user message and assistant message with correct intent in course_chat_messages'
  );

  it.todo('should create or reuse conversationId for multi-turn conversations');
});

// ============================================================================
// Scenario 2: Legacy intent='regenerate' Path
// ============================================================================

describe('Scenario 2: legacy intent="regenerate" (backward compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.todo('should bypass auto-classification when intent="regenerate" is explicitly provided');

  it('should call executeFullRegenerate handler when legacy intent="regenerate" is sent', async () => {
    // Mock Supabase admin client
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'test-course-123',
      userId: 'test-user-456',
      convId: 'test-conv-789',
      chatType: 'global',
      nodeContext: null,
      requestId: 'test-request-abc',
      supabaseAdmin: mockSupabaseAdmin,
    };

    const result = await executeFullRegenerate(params);

    // Verify executeFullRegenerate returns correct ChatResponse
    expect(result).toBeDefined();
    expect(result.conversationId).toBe('test-conv-789');
    expect(result.intent).toBe('regenerate');
    expect(result.jobId).toBe('test-job-id-12345');
    expect(result.modelUsed).toBe('system');
  });

  it('should call restart_from_stage RPC with stage=5 and courseId', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null });
    const mockSupabaseAdmin = {
      rpc: mockRpc,
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-xyz',
      userId: 'user-abc',
      convId: 'conv-123',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-456',
      supabaseAdmin: mockSupabaseAdmin,
    };

    await executeFullRegenerate(params);

    // Verify supabase.rpc called with correct params
    expect(mockRpc).toHaveBeenCalledWith('restart_from_stage', {
      p_course_id: 'course-xyz',
      p_stage_number: 5,
      p_user_id: 'user-abc',
    });
  });

  it('should remove existing jobs for the course via removeJobsByCourseId', async () => {
    const { removeJobsByCourseId } = await import('../../src/orchestrator/queue');

    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-cleanup-test',
      userId: 'user-test',
      convId: 'conv-test',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-test',
      supabaseAdmin: mockSupabaseAdmin,
    };

    await executeFullRegenerate(params);

    // Verify removeJobsByCourseId called
    expect(removeJobsByCourseId).toHaveBeenCalledWith('course-cleanup-test');
  });

  it('should enqueue new STRUCTURE_GENERATION job via addJob', async () => {
    const { addJob } = await import('../../src/orchestrator/queue');

    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-job-test',
      userId: 'user-job',
      convId: 'conv-job',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-job',
      supabaseAdmin: mockSupabaseAdmin,
    };

    await executeFullRegenerate(params);

    // Verify addJob called with STRUCTURE_GENERATION type
    expect(addJob).toHaveBeenCalledWith('structure_generation', expect.any(Object));
  });

  it('should return ChatResponse with jobId and modelUsed="system"', async () => {
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-response-test',
      userId: 'user-response',
      convId: 'conv-response',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-response',
      supabaseAdmin: mockSupabaseAdmin,
    };

    const result = await executeFullRegenerate(params);

    // Verify response has jobId and modelUsed="system"
    expect(result.jobId).toBe('test-job-id-12345');
    expect(result.modelUsed).toBe('system');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('should persist assistant message with intent="regenerate" and zero tokens', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
    });
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: mockFrom,
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-persist-test',
      userId: 'user-persist',
      convId: 'conv-persist',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-persist',
      supabaseAdmin: mockSupabaseAdmin,
    };

    await executeFullRegenerate(params);

    // Verify persistAssistantMessage called with correct parameters
    expect(mockFrom).toHaveBeenCalledWith('course_chat_messages');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: 'course-persist-test',
        conversation_id: 'conv-persist',
        role: 'assistant',
        intent: 'regenerate',
        model_used: 'system',
        input_tokens: 0,
        output_tokens: 0,
      })
    );
  });

  it('should handle RPC failure gracefully without throwing (return error message)', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
    });
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: { message: 'RPC failed' } }),
      from: mockFrom,
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-rpc-fail',
      userId: 'user-rpc-fail',
      convId: 'conv-rpc-fail',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-rpc-fail',
      supabaseAdmin: mockSupabaseAdmin,
    };

    // Verify function returns error response instead of throwing
    const result = await executeFullRegenerate(params);

    expect(result).toBeDefined();
    expect(result.conversationId).toBe('conv-rpc-fail');
    expect(result.intent).toBe('regenerate');
    expect(result.assistantMessage).toContain('Не удалось');
    expect(result.modelUsed).toBe('system');

    // Verify error message was persisted (must match error-specific text, not success)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Не удалось'),
        intent: 'regenerate',
      })
    );
  });

  it('should continue when removeJobsByCourseId fails (non-blocking cleanup)', async () => {
    // Mock removeJobsByCourseId to throw
    const { removeJobsByCourseId } = await import('../../src/orchestrator/queue');
    (removeJobsByCourseId as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Queue cleanup failed')
    );

    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-cleanup-fail',
      userId: 'user-cleanup-fail',
      convId: 'conv-cleanup-fail',
      chatType: 'global',
      nodeContext: null,
      requestId: 'req-cleanup-fail',
      supabaseAdmin: mockSupabaseAdmin,
    };

    // Verify function still succeeds even when removeJobsByCourseId fails
    const result = await executeFullRegenerate(params);
    expect(result).toBeDefined();
    expect(result.jobId).toBe('test-job-id-12345');
  });

  it('should preserve nodeContext in persisted message for traceability', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = vi.fn().mockReturnValue({
      insert: mockInsert,
    });
    const mockSupabaseAdmin = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: mockFrom,
    } as unknown as Parameters<typeof executeFullRegenerate>[0]['supabaseAdmin'];

    const nodeContext = {
      stageId: 'stage_5',
      nodeId: 'node_123',
      blockPath: 'sections[0].lessons[1]',
    };

    const params: Parameters<typeof executeFullRegenerate>[0] = {
      courseId: 'course-node-context',
      userId: 'user-node',
      convId: 'conv-node',
      chatType: 'node',
      nodeContext,
      requestId: 'req-node',
      supabaseAdmin: mockSupabaseAdmin,
    };

    await executeFullRegenerate(params);

    // Verify nodeContext preserved in message
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        node_context: nodeContext,
        chat_type: 'node',
      })
    );
  });
});

// ============================================================================
// Scenario 3: Structural Proposal -> applyProposal Flow
// ============================================================================

describe('Scenario 3: structural proposal -> applyProposal atomic apply', () => {
  let structure: CourseStructure;

  beforeEach(() => {
    structure = createTestStructure();
  });

  // --- validateOperations (pure function, no mocks needed) ---

  describe('validateOperations — batch constraints', () => {
    it('should enforce MAX_OPERATIONS_PER_BATCH limit (15 operations)', () => {
      const ops: CourseOperation[] = Array.from({ length: 16 }, (_, i) => ({
        type: 'update_field' as const,
        targetId: 'sec_aaaaaaaa',
        field: 'section_title',
        newValue: `Title ${i}`,
      }));

      const errors = validateOperations(ops, structure);
      expect(errors.some(e => e.message.includes('maximum of 15'))).toBe(true);
    });

    it('should enforce MAX_DELETES_PER_BATCH limit (3 deletes)', () => {
      // Create a structure with 5+ lessons to test delete limit
      const bigStructure = createTestStructure();
      bigStructure.sections[0].lessons.push(
        {
          id: 'lsn_extra001',
          lesson_number: 3,
          lesson_title: 'Extra 1',
          lesson_objectives: [],
          key_topics: [],
          estimated_duration_minutes: 10,
          difficulty_level: 'beginner',
        } as CourseStructure['sections'][0]['lessons'][0],
        {
          id: 'lsn_extra002',
          lesson_number: 4,
          lesson_title: 'Extra 2',
          lesson_objectives: [],
          key_topics: [],
          estimated_duration_minutes: 10,
          difficulty_level: 'beginner',
        } as CourseStructure['sections'][0]['lessons'][0]
      );

      const ops: CourseOperation[] = [
        { type: 'delete_element', targetId: 'lsn_bbbbbbbb' },
        { type: 'delete_element', targetId: 'lsn_cccccccc' },
        { type: 'delete_element', targetId: 'lsn_eeeeeeee' },
        { type: 'delete_element', targetId: 'lsn_extra001' },
      ];

      const errors = validateOperations(ops, bigStructure);
      expect(errors.some(e => e.message.includes('maximum of 3 delete'))).toBe(true);
    });

    it('should enforce delete ratio limit (max 50% of total content)', () => {
      // Structure has 5 elements (2 sections + 3 lessons), deleting 3 = 60%
      const ops: CourseOperation[] = [
        { type: 'delete_element', targetId: 'lsn_bbbbbbbb' },
        { type: 'delete_element', targetId: 'lsn_cccccccc' },
        { type: 'delete_element', targetId: 'lsn_eeeeeeee' },
      ];

      const errors = validateOperations(ops, structure);
      expect(errors.some(e => e.message.includes('% of content'))).toBe(true);
    });
  });

  describe('validateOperations — per-operation checks', () => {
    it('should fail validation when referencing non-existent stable ID', () => {
      const ops: CourseOperation[] = [{ type: 'delete_element', targetId: 'lsn_nonexist' }];

      const errors = validateOperations(ops, structure);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('lsn_nonexist');
    });

    it('should allow tempId cross-referencing in batch operations', () => {
      const ops: CourseOperation[] = [
        {
          type: 'add_section',
          reasoning: 'New section needed',
          tempId: '__new_sec__',
          afterSectionId: 'sec_aaaaaaaa',
          title: 'New Section',
        },
        {
          type: 'add_lesson',
          reasoning: 'New lesson in new section',
          tempId: '__new_lsn__',
          parentSectionId: '__new_sec__',
          afterLessonId: null,
          title: 'New Lesson',
        },
      ];

      const errors = validateOperations(ops, structure);
      // Should NOT have error about __new_sec__ not found (tempId cross-reference)
      expect(errors.filter(e => e.message.includes('__new_sec__'))).toHaveLength(0);
    });

    it('should reject duplicate tempId in batch operations', () => {
      const ops: CourseOperation[] = [
        {
          type: 'add_lesson',
          reasoning: 'First',
          tempId: '__dup__',
          parentSectionId: 'sec_aaaaaaaa',
          afterLessonId: null,
          title: 'Lesson A',
        },
        {
          type: 'add_lesson',
          reasoning: 'Second with same tempId',
          tempId: '__dup__',
          parentSectionId: 'sec_aaaaaaaa',
          afterLessonId: null,
          title: 'Lesson B',
        },
      ];

      const errors = validateOperations(ops, structure);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Duplicate tempId'))).toBe(true);
    });

    it('should validate operations pass for valid single operation', () => {
      const ops: CourseOperation[] = [
        {
          type: 'update_field',
          targetId: 'sec_aaaaaaaa',
          field: 'section_title',
          newValue: 'Updated Title',
        },
      ];

      const errors = validateOperations(ops, structure);
      expect(errors).toHaveLength(0);
    });
  });

  // --- applySurgicalOperations (pure function, no DB needed) ---

  describe('applySurgicalOperations — add operations', () => {
    it('should add lesson to section and generate real stable ID from tempId', () => {
      const ops: CourseOperation[] = [
        {
          type: 'add_lesson',
          reasoning: 'Adding test lesson',
          tempId: '__new_1__',
          parentSectionId: 'sec_aaaaaaaa',
          afterLessonId: 'lsn_bbbbbbbb',
          title: 'New Inserted Lesson',
          objectives: ['Learn insertion'],
          estimatedDuration: 20,
        },
      ];

      const result = applySurgicalOperations(ops, structure);

      // Check new lesson was added
      const section = result.updatedStructure.sections[0];
      expect(section.lessons).toHaveLength(3);
      expect(section.lessons[1].lesson_title).toBe('New Inserted Lesson');

      // Check tempId was mapped to real ID
      expect(result.tempIdMap['__new_1__']).toBeDefined();
      expect(result.tempIdMap['__new_1__']).toMatch(/^lsn_/);

      // Check lesson has the real ID
      expect(section.lessons[1].id).toBe(result.tempIdMap['__new_1__']);

      // Check renumbering (dotted format matching legacy editor: section.lesson)
      expect(section.lessons[0].lesson_number).toBe(1.1);
      expect(section.lessons[1].lesson_number).toBe(1.2);
      expect(section.lessons[2].lesson_number).toBe(1.3);
    });

    it('should add section and insert at correct position', () => {
      const ops: CourseOperation[] = [
        {
          type: 'add_section',
          reasoning: 'Adding new section',
          tempId: '__new_sec__',
          afterSectionId: 'sec_aaaaaaaa',
          title: 'Inserted Section',
          description: 'Between sections',
        },
      ];

      const result = applySurgicalOperations(ops, structure);

      expect(result.updatedStructure.sections).toHaveLength(3);
      expect(result.updatedStructure.sections[1].section_title).toBe('Inserted Section');
      expect(result.tempIdMap['__new_sec__']).toMatch(/^sec_/);

      // Renumbering
      expect(result.updatedStructure.sections[0].section_number).toBe(1);
      expect(result.updatedStructure.sections[1].section_number).toBe(2);
      expect(result.updatedStructure.sections[2].section_number).toBe(3);
    });
  });

  describe('applySurgicalOperations — delete operations', () => {
    it('should delete lesson and renumber remaining', () => {
      const ops: CourseOperation[] = [{ type: 'delete_element', targetId: 'lsn_bbbbbbbb' }];

      const result = applySurgicalOperations(ops, structure);
      const section = result.updatedStructure.sections[0];

      expect(section.lessons).toHaveLength(1);
      expect(section.lessons[0].lesson_title).toBe('Lesson 1.2');
      expect(section.lessons[0].lesson_number).toBe(1.1);
    });
  });

  describe('applySurgicalOperations — update operations', () => {
    it('should update field on existing element', () => {
      const ops: CourseOperation[] = [
        {
          type: 'update_field',
          targetId: 'sec_aaaaaaaa',
          field: 'section_title',
          newValue: 'Renamed Section',
        },
      ];

      const result = applySurgicalOperations(ops, structure);
      expect(result.updatedStructure.sections[0].section_title).toBe('Renamed Section');
    });
  });

  describe('applySurgicalOperations — move operations', () => {
    it('should move lesson between sections', () => {
      const ops: CourseOperation[] = [
        {
          type: 'move_element',
          targetId: 'lsn_bbbbbbbb',
          newParentId: 'sec_dddddddd',
          afterId: 'lsn_eeeeeeee',
        },
      ];

      const result = applySurgicalOperations(ops, structure);

      // Section 1 should have 1 lesson
      expect(result.updatedStructure.sections[0].lessons).toHaveLength(1);
      // Section 2 should have 2 lessons
      expect(result.updatedStructure.sections[1].lessons).toHaveLength(2);
      expect(result.updatedStructure.sections[1].lessons[1].lesson_title).toBe('Lesson 1.1');
    });
  });

  describe('applySurgicalOperations — atomicity', () => {
    it('should not mutate original structure', () => {
      const originalJson = JSON.stringify(structure);

      const ops: CourseOperation[] = [
        {
          type: 'add_lesson',
          reasoning: 'Add',
          tempId: '__new__',
          parentSectionId: 'sec_aaaaaaaa',
          afterLessonId: null,
          title: 'New First Lesson',
        },
      ];

      applySurgicalOperations(ops, structure);
      expect(JSON.stringify(structure)).toBe(originalJson);
    });

    it('should recalculate section and course durations after operations', () => {
      const ops: CourseOperation[] = [
        {
          type: 'add_lesson',
          reasoning: 'Add long lesson',
          tempId: '__new__',
          parentSectionId: 'sec_dddddddd',
          afterLessonId: null,
          title: 'Long Lesson',
          estimatedDuration: 45,
        },
      ];

      const result = applySurgicalOperations(ops, structure);
      // Section 2 originally had 30 min, now should have 30 + 45 = 75 or recalculated
      const section2 = result.updatedStructure.sections[1];
      expect(section2.estimated_duration_minutes).toBeGreaterThan(30);
    });

    it('should throw on invalid operation (non-existent targetId)', () => {
      const ops: CourseOperation[] = [{ type: 'delete_element', targetId: 'lsn_nonexist' }];

      expect(() => applySurgicalOperations(ops, structure)).toThrow('Pre-flight validation failed');
    });
  });

  describe('applySurgicalOperations — batch operations', () => {
    it('should apply add_section + add_lesson batch with tempId cross-reference', () => {
      const ops: CourseOperation[] = [
        {
          type: 'add_section',
          reasoning: 'New section',
          tempId: '__new_sec__',
          afterSectionId: null,
          title: 'First Section (new)',
        },
        {
          type: 'add_lesson',
          reasoning: 'New lesson in new section',
          tempId: '__new_lsn__',
          parentSectionId: '__new_sec__',
          afterLessonId: null,
          title: 'First Lesson in New Section',
          estimatedDuration: 10,
        },
      ];

      const result = applySurgicalOperations(ops, structure);

      // New section should be first (afterSectionId: null)
      expect(result.updatedStructure.sections[0].section_title).toBe('First Section (new)');
      expect(result.updatedStructure.sections[0].lessons).toHaveLength(1);
      expect(result.updatedStructure.sections[0].lessons[0].lesson_title).toBe(
        'First Lesson in New Section'
      );

      // Both tempIds mapped
      expect(result.tempIdMap['__new_sec__']).toMatch(/^sec_/);
      expect(result.tempIdMap['__new_lsn__']).toMatch(/^lsn_/);

      expect(result.appliedCount).toBe(2);
    });
  });

  // --- Remaining stubs requiring full tRPC/DB context ---

  it('should remap stable IDs to simplified IDs (sec_hY7a3fRx -> sec_1) in LLM context', () => {
    const structure = createTestStructure();

    // Build ID remap context
    const ctx = buildIdRemapContext(structure);

    // Verify context was built correctly
    expect(ctx.toSimplified.size).toBeGreaterThan(0);
    expect(ctx.toReal.size).toBeGreaterThan(0);

    // Remap structure to simplified IDs
    const simplified = remapStructureToSimplified(structure, ctx);

    // Verify sections get sec_1, sec_2
    expect(simplified.sections[0].id).toBe('sec_1');
    expect(simplified.sections[1].id).toBe('sec_2');

    // Verify lessons get lsn_1, lsn_2, lsn_3 (sequential across entire course)
    expect(simplified.sections[0].lessons[0].id).toBe('lsn_1');
    expect(simplified.sections[0].lessons[1].id).toBe('lsn_2');
    expect(simplified.sections[1].lessons[0].id).toBe('lsn_3');

    // Verify original structure unchanged (immutability)
    expect(structure.sections[0].id).toBe('sec_aaaaaaaa');
    expect(structure.sections[0].lessons[0].id).toBe('lsn_bbbbbbbb');
  });

  it('should remap simplified IDs back to stable IDs (sec_1 -> sec_hY7a3fRx) in LLM response', () => {
    const structure = createTestStructure();

    // Build ID remap context
    const ctx = buildIdRemapContext(structure);

    // Create operations with simplified IDs (as LLM would return)
    const simplifiedOps: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'sec_1', // Simplified ID
        field: 'section_title',
        newValue: 'Updated Title',
      },
      {
        type: 'delete_element',
        targetId: 'lsn_2', // Simplified ID
      },
      {
        type: 'add_lesson',
        reasoning: 'Add new lesson',
        tempId: '__new_lesson__', // tempId should NOT be remapped
        parentSectionId: 'sec_1', // Simplified ID
        afterLessonId: 'lsn_1', // Simplified ID
        title: 'New Lesson',
      },
    ];

    // Remap operations back to real IDs
    const realOps = remapOperationsToReal(simplifiedOps, ctx);

    // Verify operations now have real IDs
    expect(realOps[0].type).toBe('update_field');
    if (realOps[0].type === 'update_field') {
      expect(realOps[0].targetId).toBe('sec_aaaaaaaa');
    }

    expect(realOps[1].type).toBe('delete_element');
    if (realOps[1].type === 'delete_element') {
      expect(realOps[1].targetId).toBe('lsn_cccccccc');
    }

    expect(realOps[2].type).toBe('add_lesson');
    if (realOps[2].type === 'add_lesson') {
      expect(realOps[2].parentSectionId).toBe('sec_aaaaaaaa');
      expect(realOps[2].afterLessonId).toBe('lsn_bbbbbbbb');
      expect(realOps[2].tempId).toBe('__new_lesson__'); // tempId unchanged
    }
  });

  it.todo('should persist updated course_structure to database after successful apply');

  it.todo('should handle concurrent apply requests with optimistic locking');
});

// ============================================================================
// Scenario 4: Add Lesson + Stage 6 CTA Condition
// ============================================================================

describe('Scenario 4: add lesson + Stage 6 CTA condition', () => {
  let structure: CourseStructure;

  beforeEach(() => {
    structure = createTestStructure();
  });

  it('should insert new lesson at correct position (afterLessonId logic)', () => {
    const ops: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Add after first lesson',
        tempId: '__new__',
        parentSectionId: 'sec_aaaaaaaa',
        afterLessonId: 'lsn_bbbbbbbb',
        title: 'Inserted After First',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    const section = result.updatedStructure.sections[0];

    expect(section.lessons[1].lesson_title).toBe('Inserted After First');
  });

  it('should assign new stable ID (lsn_xyz) to newly added lesson', () => {
    const ops: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'test',
        tempId: '__tmp__',
        parentSectionId: 'sec_aaaaaaaa',
        afterLessonId: null,
        title: 'New First',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    expect(result.tempIdMap['__tmp__']).toMatch(/^lsn_[A-Za-z0-9_-]+$/);
  });

  it('should renumber lesson_number for all lessons in section after insertion', () => {
    const ops: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'Insert at start',
        tempId: '__new__',
        parentSectionId: 'sec_aaaaaaaa',
        afterLessonId: null,
        title: 'New First Lesson',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    const section = result.updatedStructure.sections[0];

    expect(section.lessons).toHaveLength(3);
    expect(section.lessons[0].lesson_number).toBe(1.1);
    expect(section.lessons[1].lesson_number).toBe(1.2);
    expect(section.lessons[2].lesson_number).toBe(1.3);
    expect(section.lessons[0].lesson_title).toBe('New First Lesson');
  });

  it('should update section estimated_duration_minutes by adding new lesson duration', () => {
    const ops: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'add',
        tempId: '__new__',
        parentSectionId: 'sec_aaaaaaaa',
        afterLessonId: null,
        title: 'Timed Lesson',
        estimatedDuration: 25,
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    // Original section 1: 15 + 20 = 35 min. With new: 25 + 15 + 20 = 60
    const section = result.updatedStructure.sections[0];
    expect(section.estimated_duration_minutes).toBe(60);
  });

  it('should return updated course_structure with new lesson included', () => {
    const ops: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'add',
        tempId: '__new__',
        parentSectionId: 'sec_dddddddd',
        afterLessonId: 'lsn_eeeeeeee',
        title: 'Appended Lesson',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    expect(result.updatedStructure.sections[1].lessons).toHaveLength(2);
    expect(result.updatedStructure.sections[1].lessons[1].lesson_title).toBe('Appended Lesson');
    expect(result.operationSummary).toHaveLength(1);
  });

  // --- Remaining stubs (require DB for generation_status checks) ---

  it.todo(
    'should include metadata.stage6ContentReady=true when generation_status is "stage_6_complete"'
  );

  it.todo('should include metadata.stage6ContentReady=true when generation_status is "finalizing"');

  it.todo('should include metadata.stage6ContentReady=true when generation_status is "completed"');

  it.todo('should NOT include stage6ContentReady when generation_status is "stage_5_complete"');

  it.todo('should NOT include stage6ContentReady when generation_status is "stage_5_in_progress"');

  it.todo('should verify consistency by checking lesson_contents.status for existing lessons');

  it.todo(
    'should show CTA only when majority of lesson_contents have status "completed" or "review_required"'
  );

  it.todo('should NOT auto-generate Stage 6 content for new lesson (user must trigger CTA)');
});

// ============================================================================
// Cross-Scenario Integration Tests
// ============================================================================

describe('Cross-scenario integration: full chat workflow', () => {
  it.todo(
    'should handle multi-turn conversation: user refines proposal -> LLM adjusts -> user accepts'
  );

  it.todo('should preserve conversationId across turns for context continuity');

  it.todo('should track all user/assistant messages in course_chat_messages table');

  it.todo('should handle proposal rejection and allow user to refine further');

  it.todo('should handle switch from auto-classification to explicit intent mid-conversation');

  it.todo('should use skeleton + targeted context to minimize input tokens for large courses');

  it.todo('should cache static system prompts and schemas using prompt cache strategy');

  it.todo(
    'should use phase-specific model config (chat_stage_5_refinement) without global_default fallback'
  );

  it.todo('should return 503 when chat phase model config is missing or invalid');

  it.todo('should log audit trail for all model resolution decisions');
});

// ============================================================================
// Stable IDs & Backfill Integration
// ============================================================================

describe('Stable IDs and backfill integration', () => {
  it('should use stable IDs (sec_xyz, lsn_abc) for all structural operations', () => {
    const structure = createTestStructure();
    const ops: CourseOperation[] = [
      {
        type: 'add_lesson',
        reasoning: 'test',
        tempId: '__new__',
        parentSectionId: 'sec_aaaaaaaa',
        afterLessonId: 'lsn_bbbbbbbb',
        title: 'Stable ID Test',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    const newId = result.tempIdMap['__new__'];
    expect(newId).toMatch(/^lsn_[A-Za-z0-9_-]{8}$/);
  });

  it('should generate new stable IDs with nanoid (sec_ prefix for sections, lsn_ for lessons)', () => {
    const structure = createTestStructure();
    const ops: CourseOperation[] = [
      {
        type: 'add_section',
        reasoning: 'test',
        tempId: '__sec__',
        afterSectionId: null,
        title: 'New Sec',
      },
      {
        type: 'add_lesson',
        reasoning: 'test',
        tempId: '__lsn__',
        parentSectionId: '__sec__',
        afterLessonId: null,
        title: 'New Lsn',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    expect(result.tempIdMap['__sec__']).toMatch(/^sec_/);
    expect(result.tempIdMap['__lsn__']).toMatch(/^lsn_/);
  });

  it('should preserve existing stable IDs when present (idempotent)', () => {
    const structure = createTestStructure();
    const ops: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'sec_aaaaaaaa',
        field: 'section_title',
        newValue: 'Renamed',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    // Existing IDs unchanged
    expect(result.updatedStructure.sections[0].id).toBe('sec_aaaaaaaa');
    expect(result.updatedStructure.sections[0].lessons[0].id).toBe('lsn_bbbbbbbb');
  });

  it('should call ensureStableIdsInMemory for legacy structures without stable IDs', () => {
    // Create legacy structure WITHOUT id fields on sections/lessons
    const legacyStructure: CourseStructure = {
      title: 'Legacy Course',
      description: 'Course without IDs',
      tags: [],
      target_audience: 'everyone',
      language: 'ru',
      estimated_duration_hours: 2,
      sections: [
        {
          // No id field
          section_number: 1,
          section_title: 'Section 1',
          section_description: 'First',
          estimated_duration_minutes: 30,
          learning_objectives: [],
          lessons: [
            {
              // No id field
              lesson_number: 1,
              lesson_title: 'Lesson 1.1',
              lesson_objectives: [],
              key_topics: [],
              estimated_duration_minutes: 15,
              difficulty_level: 'beginner',
            },
          ],
        } as CourseStructure['sections'][0],
      ],
    };

    const result = ensureStableIdsInMemory(legacyStructure);

    // Verify all sections got sec_ prefix IDs
    expect(result.sections[0].id).toBeDefined();
    expect(result.sections[0].id).toMatch(/^sec_[A-Za-z0-9_-]{8}$/);

    // Verify all lessons got lsn_ prefix IDs
    expect(result.sections[0].lessons[0].id).toBeDefined();
    expect(result.sections[0].lessons[0].id).toMatch(/^lsn_[A-Za-z0-9_-]{8}$/);
  });

  it('should NOT write-on-read to database (backfill is in-memory only for request)', () => {
    // ensureStableIdsInMemory is synchronous (no async, no DB client param)
    // — proving it cannot perform DB writes by design
    const legacyStructure: CourseStructure = {
      title: 'Legacy',
      description: 'No IDs',
      tags: [],
      target_audience: 'everyone',
      language: 'ru',
      estimated_duration_hours: 1,
      sections: [
        {
          section_number: 1,
          section_title: 'S1',
          section_description: 'D1',
          estimated_duration_minutes: 30,
          learning_objectives: [],
          lessons: [
            {
              lesson_number: 1,
              lesson_title: 'L1',
              lesson_objectives: [],
              key_topics: [],
              estimated_duration_minutes: 30,
              difficulty_level: 'beginner',
            },
          ],
        } as CourseStructure['sections'][0],
      ],
    };

    // Call is synchronous — returns value directly, not a Promise
    const result = ensureStableIdsInMemory(legacyStructure);
    expect(result).not.toBeInstanceOf(Promise);

    // Original structure is not mutated (pure function)
    expect((legacyStructure.sections[0] as Record<string, unknown>).id).toBeUndefined();
    expect((legacyStructure.sections[0].lessons[0] as Record<string, unknown>).id).toBeUndefined();

    // Result has IDs assigned
    expect(result.sections[0].id).toMatch(/^sec_/);
    expect(result.sections[0].lessons[0].id).toMatch(/^lsn_/);
  });

  it('should apply operations correctly even when structure has mixed stable/missing IDs', () => {
    // Create structure with SOME IDs missing
    const mixedStructure: CourseStructure = {
      title: 'Mixed Course',
      description: 'Some IDs present, some missing',
      tags: [],
      target_audience: 'everyone',
      language: 'ru',
      estimated_duration_hours: 2,
      sections: [
        {
          id: 'sec_existing1', // Has ID
          section_number: 1,
          section_title: 'Section 1',
          section_description: 'First',
          estimated_duration_minutes: 30,
          learning_objectives: [],
          lessons: [
            {
              id: 'lsn_existing1', // Has ID
              lesson_number: 1,
              lesson_title: 'Lesson 1.1',
              lesson_objectives: [],
              key_topics: [],
              estimated_duration_minutes: 15,
              difficulty_level: 'beginner',
            },
          ],
        },
        {
          // No id field on section 2
          section_number: 2,
          section_title: 'Section 2',
          section_description: 'Second',
          estimated_duration_minutes: 20,
          learning_objectives: [],
          lessons: [
            {
              // No id field on lesson
              lesson_number: 1,
              lesson_title: 'Lesson 2.1',
              lesson_objectives: [],
              key_topics: [],
              estimated_duration_minutes: 20,
              difficulty_level: 'intermediate',
            },
          ],
        } as CourseStructure['sections'][0],
      ],
    };

    // First ensure all IDs are present
    const backfilledStructure = ensureStableIdsInMemory(mixedStructure);

    // Verify existing IDs preserved
    expect(backfilledStructure.sections[0].id).toBe('sec_existing1');
    expect(backfilledStructure.sections[0].lessons[0].id).toBe('lsn_existing1');

    // Verify missing IDs added
    expect(backfilledStructure.sections[1].id).toBeDefined();
    expect(backfilledStructure.sections[1].id).toMatch(/^sec_/);
    expect(backfilledStructure.sections[1].lessons[0].id).toBeDefined();
    expect(backfilledStructure.sections[1].lessons[0].id).toMatch(/^lsn_/);

    // Now apply operations using the backfilled structure
    const ops: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'sec_existing1',
        field: 'section_title',
        newValue: 'Updated Section 1',
      },
    ];

    const result = applySurgicalOperations(ops, backfilledStructure);
    expect(result.updatedStructure.sections[0].section_title).toBe('Updated Section 1');
  });

  it.todo('should handle schema_version marker in course_structure (v1=no IDs, v2=with IDs)');
});

// ============================================================================
// Error Handling & Edge Cases
// ============================================================================

describe('Error handling and edge cases', () => {
  it.todo('should return error when courseId does not exist');

  it.todo('should return error when user is not authorized to edit course');

  it.todo('should return error when course is in locked state (active job running)');

  it.todo('should handle LLM timeout gracefully (return fallback message)');

  it.todo('should handle LLM API error gracefully (return error message, do not throw)');

  it.todo('should validate userMessage length (min 1, max 10000 chars)');

  it.todo('should sanitize userMessage to prevent injection attacks');

  it.todo('should handle malformed proposal JSON from LLM (retry or fallback)');

  it.todo('should handle database write conflict during applyProposal (optimistic locking)');

  it('should throw on partial operation failure during apply (atomic semantics)', () => {
    const structure = createTestStructure();
    // Second op references non-existent ID — pre-flight will fail
    const ops: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'sec_aaaaaaaa',
        field: 'section_title',
        newValue: 'OK',
      },
      { type: 'delete_element', targetId: 'lsn_nonexist' },
    ];

    expect(() => applySurgicalOperations(ops, structure)).toThrow();
    // Original structure unchanged (atomic)
    expect(structure.sections[0].section_title).toBe('Section 1');
  });
});

// ============================================================================
// Token Metrics & Logging
// ============================================================================

describe('Token metrics and logging', () => {
  it.todo('should track inputTokens and outputTokens for all LLM calls');

  it.todo('should set inputTokens=0 and outputTokens=0 for system operations (regenerate)');

  it.todo('should set inputTokens=0 and outputTokens=0 for GET_INFO intent (no LLM call)');

  it.todo('should log modelUsed in ChatResponse');

  it.todo('should log intent classification result (intent, confidence) in debug logs');

  it('should include operation summary in apply result', () => {
    const structure = createTestStructure();
    const ops: CourseOperation[] = [
      {
        type: 'update_field',
        targetId: 'sec_aaaaaaaa',
        field: 'section_title',
        newValue: 'New Title',
      },
    ];

    const result = applySurgicalOperations(ops, structure);
    expect(result.operationSummary).toHaveLength(1);
    expect(result.appliedCount).toBe(1);
  });

  it.todo('should log warning when removeJobsByCourseId fails (non-blocking)');

  it.todo('should log error when RPC restart_from_stage fails');

  it.todo('should log audit trail for all structural operations (who, what, when)');
});
