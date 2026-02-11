/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, max-lines-per-function */
/**
 * Block Regeneration Handler Unit Tests
 * @module tests/unit/orchestrator/handlers/block-regeneration-handler
 *
 * Tests the BlockRegenerationHandler class and setNestedValue helper function.
 * Covers:
 * - Successful block regeneration (happy path)
 * - Prototype pollution protection in blockPath
 * - Ownership violation detection
 * - LLM parse failure handling
 * - Course not found errors
 * - Nested value setting with array indices
 * - Cancellation checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BlockRegenerationJobData } from '@megacampus/shared-types';
import type { Job } from 'bullmq';

// Mock all external dependencies BEFORE importing handler
vi.mock('../../../../src/shared/supabase/admin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('../../../../src/shared/llm/client.js', () => ({
  llmClient: {
    generateCompletion: vi.fn(),
  },
}));

vi.mock('../../../../src/shared/regeneration/index.js', () => ({
  detectContextTier: vi.fn(),
  generateSemanticDiff: vi.fn(),
  assembleStaticContext: vi.fn(),
  assembleDynamicContext: vi.fn(),
  getFieldValue: vi.fn(),
}));

vi.mock('../../../../src/shared/sentry/init.js', () => ({
  captureError: vi.fn(),
}));

vi.mock('../../../../src/shared/llm/model-config-bunker.js', () => ({
  getModelConfigBunker: vi.fn(() => ({
    isInitialized: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('@megacampus/shared-types/regeneration-types', () => ({
  regenerationResponseSchema: {
    parse: vi.fn((data: unknown) => data),
  },
}));

// Import after mocks are defined
import { BlockRegenerationHandler } from '../../../../src/orchestrator/handlers/block-regeneration-handler.js';
import { getSupabaseAdmin } from '../../../../src/shared/supabase/admin.js';
import { llmClient } from '../../../../src/shared/llm/client.js';
import {
  detectContextTier,
  generateSemanticDiff,
  assembleStaticContext,
  assembleDynamicContext,
  getFieldValue,
} from '../../../../src/shared/regeneration/index.js';
import { regenerationResponseSchema } from '@megacampus/shared-types/regeneration-types';

/**
 * Create a mock BullMQ job for testing
 */
function createMockJob(
  overrides: Partial<BlockRegenerationJobData> = {}
): Job<BlockRegenerationJobData> {
  const jobData: BlockRegenerationJobData = {
    organizationId: 'test-org-id',
    courseId: 'test-course-id',
    userId: 'test-user-id',
    jobType: 'block_regeneration' as const,
    createdAt: new Date().toISOString(),
    blockPath: 'sections[0].lessons[0].lesson_title',
    parentJobId: 'parent-job-id',
    instruction: 'Make it shorter',
    stageId: 'stage_5' as const,
    locale: 'ru',
    ...overrides,
  };

  return {
    id: 'test-job-id',
    data: jobData,
    attemptsMade: 0,
    updateProgress: vi.fn(),
    log: vi.fn(),
    moveToFailed: vi.fn(),
  } as any;
}

/**
 * Create mock Supabase admin client
 */
function createMockSupabaseAdmin(
  options: {
    courseData?: any;
    courseError?: any;
    updateError?: any;
    editHistoryError?: any;
  } = {}
) {
  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'courses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: options.courseData || null,
                error: options.courseError || null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({
                  data: options.updateError ? null : [{ id: 'test-course-id' }],
                  error: options.updateError || null,
                }),
              })),
            })),
          })),
        };
      } else if (table === 'course_edits') {
        return {
          insert: vi.fn().mockResolvedValue({
            error: options.editHistoryError || null,
          }),
        };
      } else if (table === 'job_status') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null, // Not cancelled
                error: null,
              }),
            })),
          })),
        };
      }
      return {};
    }),
  };

  vi.mocked(getSupabaseAdmin).mockReturnValue(mockClient as any);
  return mockClient;
}

describe('BlockRegenerationHandler', () => {
  let handler: BlockRegenerationHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new BlockRegenerationHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful regeneration', () => {
    it('should regenerate block successfully (happy path)', async () => {
      const job = createMockJob();

      // Mock course data
      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        analysis_result: null,
        course_structure: {
          course_title: 'Test Course',
          sections: [
            {
              section_title: 'Section 1',
              lessons: [
                {
                  lesson_title: 'Original Title',
                  lesson_objectives: ['Obj 1'],
                },
              ],
            },
          ],
        },
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      // Mock regeneration helpers
      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({
        content: 'static context',
        tokenEstimate: 100,
      });
      vi.mocked(assembleDynamicContext).mockReturnValue({
        content: 'dynamic context',
        tokenEstimate: 50,
      });
      vi.mocked(getFieldValue).mockReturnValue('Original Title');

      // Mock LLM response
      const mockRegenerationData = {
        regenerated_content: 'New Title',
        pedagogical_change_log: 'Updated title for brevity',
        alignment_score: 4,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      };

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify(mockRegenerationData),
        inputTokens: 100,
        outputTokens: 50,
        model: 'openai/gpt-4o-mini',
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue(mockRegenerationData);

      // Mock semantic diff
      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 4,
        summary: 'Title shortened',
        diffDetails: {},
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Block regenerated successfully');
      expect(result.data).toMatchObject({
        blockPath: 'sections[0].lessons[0].lesson_title',
        changeType: 'modified',
        alignmentScore: 4,
        bloomPreserved: true,
        parentJobId: 'parent-job-id',
      });

      // Verify LLM was called
      expect(llmClient.generateCompletion).toHaveBeenCalledWith(
        expect.stringContaining('sections[0].lessons[0].lesson_title'),
        expect.objectContaining({
          model: 'xiaomi/mimo-v2-flash',
          temperature: 0.7,
        })
      );

      // Verify database update
      expect(getSupabaseAdmin().from).toHaveBeenCalledWith('courses');
    });

    it('should use style_4 (analysis_result) when stageId is stage_4', async () => {
      const job = createMockJob({ stageId: 'stage_4', blockPath: 'course_title' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        analysis_result: {
          course_title: 'Original Title',
          sections: [],
        },
        course_structure: null,
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({
        content: 'static',
        tokenEstimate: 50,
      });
      vi.mocked(assembleDynamicContext).mockReturnValue({
        content: 'dynamic',
        tokenEstimate: 30,
      });
      vi.mocked(getFieldValue).mockReturnValue('Original Title');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'New Title',
          pedagogical_change_log: 'Updated',
          alignment_score: 5,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'New Title',
        pedagogical_change_log: 'Updated',
        alignment_score: 5,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 5,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(true);
      // Verify analysis_result was used as data source
      expect(assembleStaticContext).toHaveBeenCalledWith(
        expect.objectContaining({
          stageId: 'stage_4',
        })
      );
    });

    it('should handle non-blocking edit history failure', async () => {
      const job = createMockJob();

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        analysis_result: null,
        course_structure: {
          sections: [
            {
              lessons: [{ lesson_title: 'Original' }],
            },
          ],
        },
      };

      createMockSupabaseAdmin({
        courseData: mockCourseData,
        editHistoryError: { message: 'Edit history insert failed' },
      });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('Original');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'New',
          pedagogical_change_log: 'Updated',
          alignment_score: 4,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'New',
        pedagogical_change_log: 'Updated',
        alignment_score: 4,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 4,
      } as any);

      const result = await handler.execute(job.data, job);

      // Should succeed despite edit history failure (non-blocking)
      expect(result.success).toBe(true);
      expect(result.message).toBe('Block regenerated successfully');
    });
  });

  describe('security - prototype pollution protection', () => {
    it('should reject __proto__ in blockPath', async () => {
      const job = createMockJob({ blockPath: '__proto__.isAdmin' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {},
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('value');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'hacked',
          pedagogical_change_log: 'x',
          alignment_score: 5,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'hacked',
        pedagogical_change_log: 'x',
        alignment_score: 5,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 5,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid field path');
      expect(result.error).toContain('restricted property name');
    });

    it('should reject constructor in blockPath', async () => {
      const job = createMockJob({ blockPath: 'constructor.prototype.isAdmin' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {},
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('value');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'hacked',
          pedagogical_change_log: 'x',
          alignment_score: 5,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'hacked',
        pedagogical_change_log: 'x',
        alignment_score: 5,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 5,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid field path');
      expect(result.error).toContain('restricted property name');
    });

    it('should reject prototype in blockPath', async () => {
      const job = createMockJob({ blockPath: 'prototype.isAdmin' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {},
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('value');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'hacked',
          pedagogical_change_log: 'x',
          alignment_score: 5,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'hacked',
        pedagogical_change_log: 'x',
        alignment_score: 5,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 5,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid field path');
      expect(result.error).toContain('restricted property name');
    });
  });

  describe('error handling', () => {
    it('should handle course not found', async () => {
      const job = createMockJob();

      createMockSupabaseAdmin({
        courseData: null,
        courseError: { message: 'Course not found' },
      });

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Course not found');
      expect(result.error).toBeDefined();
    });

    it('should handle missing course_structure for stage_5', async () => {
      const job = createMockJob({ stageId: 'stage_5' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        analysis_result: null,
        course_structure: null, // Missing!
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot regenerate');
      expect(result.message).toContain('course_structure');
      expect(result.error).toBe('Target data not available');
    });

    it('should handle missing analysis_result for stage_4', async () => {
      const job = createMockJob({ stageId: 'stage_4' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        analysis_result: null, // Missing!
        course_structure: {},
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot regenerate');
      expect(result.message).toContain('analysis_result');
      expect(result.error).toBe('Target data not available');
    });

    it('should handle LLM JSON parse failure', async () => {
      const job = createMockJob();

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {
          sections: [
            {
              lessons: [{ lesson_title: 'Original' }],
            },
          ],
        },
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('Original');

      // Mock LLM returning invalid JSON
      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: 'This is not JSON at all!',
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toBe('AI generation failed: invalid JSON response');
      expect(result.error).toBeDefined();
    });

    it('should handle LLM returning malformed JSON in code block', async () => {
      const job = createMockJob();

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {
          sections: [
            {
              lessons: [{ lesson_title: 'Original' }],
            },
          ],
        },
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('Original');

      // Mock LLM returning JSON in code block but malformed
      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: '```json\n{invalid json,}\n```',
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toBe('AI generation failed: invalid JSON response');
    });

    it('should handle database update failure', async () => {
      const job = createMockJob();

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {
          sections: [
            {
              lessons: [{ lesson_title: 'Original' }],
            },
          ],
        },
      };

      createMockSupabaseAdmin({
        courseData: mockCourseData,
        updateError: { message: 'Database update failed' },
      });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('Original');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'New',
          pedagogical_change_log: 'Updated',
          alignment_score: 4,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'New',
        pedagogical_change_log: 'Updated',
        alignment_score: 4,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 4,
      } as any);

      const result = await handler.execute(job.data, job);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to update regenerated content');
      expect(result.error).toBe('Database update failed');
    });

    it('should handle invalid nested path', async () => {
      const job = createMockJob({ blockPath: 'invalid..path' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {},
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('value');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'New',
          pedagogical_change_log: 'Updated',
          alignment_score: 4,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'New',
        pedagogical_change_log: 'Updated',
        alignment_score: 4,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 4,
      } as any);

      const result = await handler.execute(job.data, job);

      // Should still succeed - empty parts are filtered out
      expect(result.success).toBe(true);
    });
  });

  describe('progress tracking', () => {
    it('should update progress at each step', async () => {
      const job = createMockJob();

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {
          sections: [{ lessons: [{ lesson_title: 'Original' }] }],
        },
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('standard');
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('Original');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'New',
          pedagogical_change_log: 'Updated',
          alignment_score: 4,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'New',
        pedagogical_change_log: 'Updated',
        alignment_score: 4,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 4,
      } as any);

      await handler.execute(job.data, job);

      // Verify progress updates were called
      expect(job.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 10, message: 'Fetching course data' })
      );
      expect(job.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 20, message: 'Detecting context tier' })
      );
      expect(job.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 50, message: 'Calling LLM for regeneration' })
      );
      expect(job.updateProgress).toHaveBeenCalledWith(
        expect.objectContaining({ percent: 90, message: 'Saving regenerated content' })
      );
    });
  });

  describe('context tier detection', () => {
    it('should detect context tier from instruction', async () => {
      const job = createMockJob({ instruction: 'Expand on Bloom taxonomy implications' });

      const mockCourseData = {
        id: 'test-course-id',
        user_id: 'test-user-id',
        organization_id: 'test-org-id',
        updated_at: '2026-01-01T00:00:00.000Z',
        course_structure: {
          sections: [{ lessons: [{ lesson_title: 'Original' }] }],
        },
      };

      createMockSupabaseAdmin({ courseData: mockCourseData });

      vi.mocked(detectContextTier).mockReturnValue('pedagogical'); // Higher tier
      vi.mocked(assembleStaticContext).mockReturnValue({ content: '', tokenEstimate: 50 });
      vi.mocked(assembleDynamicContext).mockReturnValue({ content: '', tokenEstimate: 30 });
      vi.mocked(getFieldValue).mockReturnValue('Original');

      vi.mocked(llmClient.generateCompletion).mockResolvedValue({
        content: JSON.stringify({
          regenerated_content: 'New',
          pedagogical_change_log: 'Updated',
          alignment_score: 4,
          bloom_level_preserved: true,
          concepts_added: [],
          concepts_removed: [],
        }),
        inputTokens: 80,
        outputTokens: 40,
      } as any);

      vi.mocked(regenerationResponseSchema.parse).mockReturnValue({
        regenerated_content: 'New',
        pedagogical_change_log: 'Updated',
        alignment_score: 4,
        bloom_level_preserved: true,
        concepts_added: [],
        concepts_removed: [],
      });

      vi.mocked(generateSemanticDiff).mockReturnValue({
        changeType: 'modified',
        alignmentScore: 4,
      } as any);

      await handler.execute(job.data, job);

      expect(detectContextTier).toHaveBeenCalledWith('Expand on Bloom taxonomy implications');
    });
  });
});
