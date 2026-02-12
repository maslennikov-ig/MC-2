/**
 * executeFullRegenerate Unit Tests
 * @module tests/unit/execute-full-regenerate
 *
 * Tests for the shared full regeneration handler used by both:
 * 1. Explicit `intent='regenerate'` path in chat.router.ts
 * 2. Classified FULL_REGENERATE intent in chat-intent-flow.ts
 *
 * Covers:
 * - Happy path: RPC → cleanup → enqueue → persist → response
 * - RPC failure → error response (no throw)
 * - Job cleanup failure → non-blocking warning, continues
 * - Correct ChatResponse shape (modelUsed='system', zero tokens)
 * - Assistant message persistence with correct params
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobType } from '@megacampus/shared-types';

// ============================================================================
// MOCKS - Define before imports
// ============================================================================

const {
  mockAddJob,
  mockRemoveJobsByCourseId,
  mockBuildStage5JobInput,
  mockPersistAssistantMessage,
} = vi.hoisted(() => ({
  mockAddJob: vi.fn(),
  mockRemoveJobsByCourseId: vi.fn(),
  mockBuildStage5JobInput: vi.fn(),
  mockPersistAssistantMessage: vi.fn(),
}));

vi.mock('../../src/shared/logger/index.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/orchestrator/queue.js', () => ({
  addJob: mockAddJob,
  removeJobsByCourseId: mockRemoveJobsByCourseId,
}));

vi.mock('../../src/server/routers/generation/_shared/helpers.js', () => ({
  buildStage5JobInput: mockBuildStage5JobInput,
}));

vi.mock('../../src/server/routers/generation/editing/chat-mutation-helpers.js', () => ({
  persistAssistantMessage: mockPersistAssistantMessage,
}));

// Stub remaining transitive imports pulled in by chat-intent-flow
vi.mock('../../src/shared/intent/index.js', () => ({
  classifyIntent: vi.fn(),
  classifyWithHeuristics: vi.fn(),
  isDirectExecutionIntent: vi.fn(),
  isLLMRequiredIntent: vi.fn(),
}));

vi.mock('../../src/shared/llm/client.js', () => ({
  llmClient: { generateChatCompletion: vi.fn() },
}));

vi.mock('../../src/shared/llm/model-config-service.js', () => ({
  createModelConfigService: vi.fn(),
}));

vi.mock('../../src/server/routers/generation/editing/chat-helpers.js', () => ({
  handleDirectIntent: vi.fn(),
  handleInfoQuery: vi.fn(),
  buildTargetedRefinementPrompt: vi.fn(),
  buildCourseSkeleton: vi.fn(),
  parseProposalFromLLMResponse: vi.fn(),
  resolveTargetedContext: vi.fn(),
}));

vi.mock('../../src/server/routers/generation/editing/surgical-id-remap.js', () => ({
  buildIdRemapContext: vi.fn(),
  remapStructureToSimplified: vi.fn(),
  remapOperationsToReal: vi.fn(),
}));

vi.mock('../../src/server/routers/generation/editing/surgical-operations.js', () => ({
  validateOperations: vi.fn(),
}));

// Import AFTER mocks
import { executeFullRegenerate } from '../../src/server/routers/generation/editing/chat-intent-flow.js';
import type { FullRegenerateParams } from '../../src/server/routers/generation/editing/chat-intent-flow.js';
import { logger } from '../../src/shared/logger/index.js';

// ============================================================================
// FIXTURES
// ============================================================================

function createMockSupabaseAdmin() {
  const rpcMock = vi.fn();
  return {
    rpc: rpcMock,
    from: vi.fn(),
    _rpcMock: rpcMock,
  };
}

function createParams(overrides?: Partial<FullRegenerateParams>): FullRegenerateParams {
  const admin = createMockSupabaseAdmin();
  admin._rpcMock.mockResolvedValue({ error: null });
  return {
    courseId: 'course-123',
    userId: 'user-456',
    convId: 'conv-789',
    chatType: 'node' as const,
    nodeContext: { stageId: 'stage_5', nodeId: 'node-1' },
    requestId: 'req-abc',
    supabaseAdmin: admin as unknown as FullRegenerateParams['supabaseAdmin'],
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('executeFullRegenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default happy-path mocks
    mockBuildStage5JobInput.mockResolvedValue({
      jobInput: { courseId: 'course-123', userId: 'user-456' },
    });
    mockAddJob.mockResolvedValue({ id: 'job-001' });
    mockRemoveJobsByCourseId.mockResolvedValue(undefined);
    mockPersistAssistantMessage.mockResolvedValue(undefined);
  });

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------

  it('should call restart_from_stage RPC with correct params', async () => {
    const admin = createMockSupabaseAdmin();
    admin._rpcMock.mockResolvedValue({ error: null });
    const params = createParams({
      supabaseAdmin: admin as unknown as FullRegenerateParams['supabaseAdmin'],
    });

    await executeFullRegenerate(params);

    expect(admin._rpcMock).toHaveBeenCalledWith('restart_from_stage', {
      p_course_id: 'course-123',
      p_stage_number: 5,
      p_user_id: 'user-456',
    });
  });

  it('should remove existing jobs for the course', async () => {
    const params = createParams();

    await executeFullRegenerate(params);

    expect(mockRemoveJobsByCourseId).toHaveBeenCalledWith('course-123');
  });

  it('should build and enqueue a Stage 5 job', async () => {
    const params = createParams();

    await executeFullRegenerate(params);

    expect(mockBuildStage5JobInput).toHaveBeenCalledWith(
      params.supabaseAdmin,
      'course-123',
      'user-456',
      'req-abc'
    );
    expect(mockAddJob).toHaveBeenCalledWith(JobType.STRUCTURE_GENERATION, {
      courseId: 'course-123',
      userId: 'user-456',
    });
  });

  it('should persist assistant message with correct params', async () => {
    const params = createParams();

    await executeFullRegenerate(params);

    expect(mockPersistAssistantMessage).toHaveBeenCalledWith(
      params.supabaseAdmin,
      expect.objectContaining({
        courseId: 'course-123',
        convId: 'conv-789',
        chatType: 'node',
        nodeContext: { stageId: 'stage_5', nodeId: 'node-1' },
        intent: 'regenerate',
        modelUsed: 'system',
        inputTokens: 0,
        outputTokens: 0,
        requestId: 'req-abc',
      })
    );
  });

  it('should return ChatResponse with jobId and system model', async () => {
    const params = createParams();

    const result = await executeFullRegenerate(params);

    expect(result).toMatchObject({
      conversationId: 'conv-789',
      intent: 'regenerate',
      jobId: 'job-001',
      modelUsed: 'system',
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(result.assistantMessage).toBeTruthy();
  });

  it('should pass null nodeContext when nodeContext is undefined', async () => {
    const params = createParams({ nodeContext: undefined });

    await executeFullRegenerate(params);

    expect(mockPersistAssistantMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nodeContext: null })
    );
  });

  // --------------------------------------------------------------------------
  // RPC failure
  // --------------------------------------------------------------------------

  it('should return error response when RPC fails (no throw)', async () => {
    const admin = createMockSupabaseAdmin();
    admin._rpcMock.mockResolvedValue({ error: { message: 'RPC failed', code: '42000' } });
    const params = createParams({
      supabaseAdmin: admin as unknown as FullRegenerateParams['supabaseAdmin'],
    });

    const result = await executeFullRegenerate(params);

    expect(result.conversationId).toBe('conv-789');
    expect(result.intent).toBe('regenerate');
    expect(result.modelUsed).toBe('system');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    // Should NOT have a jobId — the job was never enqueued
    expect(result.jobId).toBeUndefined();
    // Error message persisted
    expect(mockPersistAssistantMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intent: 'regenerate', modelUsed: 'system' })
    );
  });

  it('should log error when RPC fails', async () => {
    const admin = createMockSupabaseAdmin();
    admin._rpcMock.mockResolvedValue({ error: { message: 'timeout' } });
    const params = createParams({
      supabaseAdmin: admin as unknown as FullRegenerateParams['supabaseAdmin'],
    });

    await executeFullRegenerate(params);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-abc', courseId: 'course-123' }),
      expect.stringContaining('FULL_REGENERATE')
    );
  });

  // --------------------------------------------------------------------------
  // Job cleanup failure (non-blocking)
  // --------------------------------------------------------------------------

  it('should continue when removeJobsByCourseId throws', async () => {
    mockRemoveJobsByCourseId.mockRejectedValue(new Error('Redis down'));
    const params = createParams();

    const result = await executeFullRegenerate(params);

    // Should still succeed — cleanup is non-blocking
    expect(result.jobId).toBe('job-001');
    expect(result.intent).toBe('regenerate');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-abc', courseId: 'course-123' }),
      expect.stringContaining('clean up jobs')
    );
  });

  // --------------------------------------------------------------------------
  // addJob / buildStage5JobInput failure
  // --------------------------------------------------------------------------

  it('should return error response when addJob throws', async () => {
    mockAddJob.mockRejectedValue(new Error('Queue unavailable'));
    const params = createParams();

    const result = await executeFullRegenerate(params);

    expect(result.jobId).toBeUndefined();
    expect(result.assistantMessage).toContain('Не удалось');
    expect(result.modelUsed).toBe('system');
  });

  it('should return error response when buildStage5JobInput throws', async () => {
    mockBuildStage5JobInput.mockRejectedValue(new Error('Missing course data'));
    const params = createParams();

    const result = await executeFullRegenerate(params);

    expect(result.jobId).toBeUndefined();
    expect(result.assistantMessage).toContain('Не удалось');
  });
});
