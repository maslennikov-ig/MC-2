/**
 * Chat Mutation Helpers Unit Tests
 * @module tests/unit/chat-mutation-helpers
 *
 * Tests for chat-mutation-helpers.ts, focusing on:
 * 1. 3-tier model fallback logic (CR-009 from code review)
 * 2. Model config resolution (phase name mapping)
 * 3. Error handling when all models fail
 *
 * 3-Tier Fallback Strategy:
 * - Tier 1: Primary model from ModelConfigService (DB)
 * - Tier 2: DB fallback model (fallbackModelId from ModelConfigService)
 * - Tier 3: Hardcoded fallback (CHAT_STAGE_FALLBACK_MODELS constant)
 * - All fail → TRPCError INTERNAL_SERVER_ERROR
 */

/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ============================================================================
// MOCKS - Define before imports
// ============================================================================

// Create mock functions with vi.hoisted() so they're available when vi.mock factories are hoisted
const { mockCreateModelConfigService, mockGenerateChatCompletion } = vi.hoisted(() => ({
  mockCreateModelConfigService: vi.fn(),
  mockGenerateChatCompletion: vi.fn(),
}));

// Mock logger
vi.mock('../../src/shared/logger/index.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Supabase admin
vi.mock('../../src/shared/supabase/admin.js', () => ({
  getSupabaseAdmin: vi.fn(),
}));

// Mock LLM client
vi.mock('../../src/shared/llm/client.js', () => ({
  llmClient: {
    generateChatCompletion: mockGenerateChatCompletion,
  },
}));

// Mock ModelConfigService
vi.mock('../../src/shared/llm/model-config-service.js', () => ({
  createModelConfigService: mockCreateModelConfigService,
}));

// Mock chat helpers (for buildRefinementPrompt, parseProposalFromLLMResponse)
vi.mock('../../src/server/routers/generation/editing/chat-helpers.js', () => ({
  buildRefinementPrompt: vi.fn(() => 'Mocked refinement prompt'),
  parseProposalFromLLMResponse: vi.fn(() => null),
}));

// Import after mocks
import { executeLegacyLLMFlow } from '../../src/server/routers/generation/editing/chat-mutation-helpers.js';
import type { LegacyLLMFlowParams } from '../../src/server/routers/generation/editing/chat-mutation-helpers.js';
import { llmClient } from '../../src/shared/llm/client.js';
import { logger } from '../../src/shared/logger/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create mock Supabase admin client
 */
function createMockSupabaseAdmin() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'course_chat_messages') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    }),
  };
}

/**
 * Create mock LegacyLLMFlowParams for testing
 */
function createMockLLMFlowParams(
  overrides: Partial<LegacyLLMFlowParams> = {}
): LegacyLLMFlowParams {
  const mockSupabaseAdmin = createMockSupabaseAdmin();

  return {
    courseId: 'test-course-id',
    course: {
      title: 'Test Course',
      language: 'ru',
      style: 'formal',
      analysis_result: null,
      course_structure: {
        course_title: 'Test Course',
        sections: [],
      },
    },
    userMessage: 'Please make this better',
    chatType: 'node',
    nodeContext: { stageId: 'stage_5', nodeId: 'node-1' },
    previousOutput: 'Original content',
    intent: 'refine',
    convId: 'conv-123',
    history: [],
    requestId: 'req-123',
    supabaseAdmin: mockSupabaseAdmin as any,
    fallbackConfig: {
      modelId: 'moonshotai/kimi-k2-0905',
      temperature: 0.7,
      maxTokens: 2000,
    },
    ...overrides,
  };
}

/**
 * Create mock ModelConfigService
 */
function createMockModelConfigService(options: {
  primaryModel?: string;
  fallbackModel?: string | null;
  shouldThrow?: boolean;
  errorMessage?: string;
}) {
  const mockService = {
    getModelForPhase: vi.fn(),
  };

  if (options.shouldThrow) {
    mockService.getModelForPhase.mockRejectedValue(
      new Error(options.errorMessage || 'Database unavailable')
    );
  } else {
    mockService.getModelForPhase.mockResolvedValue({
      modelId: options.primaryModel || 'openai/gpt-4o-mini',
      fallbackModelId: options.fallbackModel,
      temperature: 0.7,
      maxTokens: 2000,
      source: 'database',
    });
  }

  // Use the global mockCreateModelConfigService
  mockCreateModelConfigService.mockReturnValue(mockService);
  return mockService;
}

/**
 * Create mock LLM response
 */
function createMockLLMResponse(content: string = 'LLM response') {
  return {
    content,
    inputTokens: 100,
    outputTokens: 50,
  };
}

// ============================================================================
// TESTS - 3-Tier Fallback Logic (CR-009)
// ============================================================================

describe('executeLegacyLLMFlow - 3-Tier Model Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tier 1: Primary model succeeds', () => {
    it('should use primary model from DB and return response', async () => {
      const params = createMockLLMFlowParams();

      // Mock ModelConfigService returning DB config
      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      // Mock LLM client success on first call
      mockGenerateChatCompletion.mockResolvedValueOnce(
        createMockLLMResponse('Success from primary model')
      );

      const result = await executeLegacyLLMFlow(params);

      // Verify primary model was used
      expect(llmClient.generateChatCompletion).toHaveBeenCalledOnce();
      expect(llmClient.generateChatCompletion).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          model: 'openai/gpt-4o-mini',
        })
      );

      // Verify response returned
      expect(result.assistantMessage).toBeTruthy();
      expect(result.modelUsed).toBe('openai/gpt-4o-mini');
      expect(result.conversationId).toBe('conv-123');
    });

    it('should not attempt fallback models when primary succeeds', async () => {
      const params = createMockLLMFlowParams();

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Primary success'));

      await executeLegacyLLMFlow(params);

      // Only called once (no fallback attempts)
      expect(llmClient.generateChatCompletion).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Tier 2: Primary fails, DB fallback succeeds', () => {
    it('should use DB fallback model when primary fails', async () => {
      const params = createMockLLMFlowParams();

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      // Primary model fails
      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Primary model rate limited'))
        // DB fallback succeeds
        .mockResolvedValueOnce(createMockLLMResponse('Success from DB fallback'));

      const result = await executeLegacyLLMFlow(params);

      // Verify fallback was attempted
      expect(llmClient.generateChatCompletion).toHaveBeenCalledTimes(2);

      // Verify second call used DB fallback model
      expect(llmClient.generateChatCompletion).toHaveBeenNthCalledWith(
        2,
        expect.any(Array),
        expect.objectContaining({
          model: 'anthropic/claude-3-5-sonnet',
        })
      );

      // Verify modelUsed reflects fallback
      expect(result.modelUsed).toBe('anthropic/claude-3-5-sonnet');
      expect(result.assistantMessage).toBeTruthy();

      // Verify warning was logged
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryModel: 'openai/gpt-4o-mini',
          error: 'Primary model rate limited',
        }),
        expect.stringContaining('Primary model failed')
      );
    });

    it('should use hardcoded fallback as DB fallback when fallbackModelId is null', async () => {
      const params = createMockLLMFlowParams();

      // DB config has no fallbackModelId
      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: null,
      });

      // Primary fails, hardcoded fallback (from fallbackConfig) succeeds
      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce(createMockLLMResponse('Hardcoded fallback success'));

      const result = await executeLegacyLLMFlow(params);

      // Second call should use fallbackConfig.modelId (moonshotai/kimi-k2-0905)
      expect(llmClient.generateChatCompletion).toHaveBeenNthCalledWith(
        2,
        expect.any(Array),
        expect.objectContaining({
          model: 'moonshotai/kimi-k2-0905',
        })
      );

      expect(result.modelUsed).toBe('moonshotai/kimi-k2-0905');
    });
  });

  describe('Tier 3: Primary + DB fallback fail, hardcoded fallback succeeds', () => {
    it('should use hardcoded fallback when primary and DB fallback fail', async () => {
      const params = createMockLLMFlowParams({
        nodeContext: { stageId: 'stage_5' },
      });

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      // Primary fails, DB fallback fails, hardcoded fallback succeeds
      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Primary model unavailable'))
        .mockRejectedValueOnce(new Error('DB fallback model unavailable'))
        .mockResolvedValueOnce(createMockLLMResponse('Hardcoded fallback success'));

      const result = await executeLegacyLLMFlow(params);

      // Verify all 3 models were attempted
      expect(llmClient.generateChatCompletion).toHaveBeenCalledTimes(3);

      // Third call should use hardcoded fallback for stage_5
      // CHAT_STAGE_FALLBACK_MODELS.stage_5.fallback = 'moonshotai/kimi-k2.5'
      expect(llmClient.generateChatCompletion).toHaveBeenNthCalledWith(
        3,
        expect.any(Array),
        expect.objectContaining({
          model: 'moonshotai/kimi-k2.5',
        })
      );

      expect(result.modelUsed).toBe('moonshotai/kimi-k2.5');
      expect(result.assistantMessage).toBeTruthy();

      // Verify warnings were logged for each failure
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryModel: 'openai/gpt-4o-mini',
        }),
        expect.stringContaining('Primary model failed')
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          dbFallbackModel: 'anthropic/claude-3-5-sonnet',
        }),
        expect.stringContaining('DB fallback model failed')
      );
    });

    it('should use stage_6 hardcoded fallback for stage_6', async () => {
      const params = createMockLLMFlowParams({
        nodeContext: { stageId: 'stage_6' },
      });

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('DB fallback failed'))
        .mockResolvedValueOnce(createMockLLMResponse('Stage 6 hardcoded fallback'));

      const result = await executeLegacyLLMFlow(params);

      // CHAT_STAGE_FALLBACK_MODELS.stage_6.fallback = 'qwen/qwen3-235b-a22b-2507'
      expect(llmClient.generateChatCompletion).toHaveBeenNthCalledWith(
        3,
        expect.any(Array),
        expect.objectContaining({
          model: 'qwen/qwen3-235b-a22b-2507',
        })
      );

      expect(result.modelUsed).toBe('qwen/qwen3-235b-a22b-2507');
    });

    it('should use DEFAULT fallback for unknown stageId', async () => {
      const params = createMockLLMFlowParams({
        nodeContext: { stageId: 'stage_7' }, // Not in CHAT_STAGE_FALLBACK_MODELS
      });

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('DB fallback failed'))
        .mockResolvedValueOnce(createMockLLMResponse('Default hardcoded fallback'));

      const result = await executeLegacyLLMFlow(params);

      // DEFAULT_CHAT_FALLBACK_MODELS.fallback = 'moonshotai/kimi-k2.5'
      expect(llmClient.generateChatCompletion).toHaveBeenNthCalledWith(
        3,
        expect.any(Array),
        expect.objectContaining({
          model: 'moonshotai/kimi-k2.5',
        })
      );

      expect(result.modelUsed).toBe('moonshotai/kimi-k2.5');
    });
  });

  describe('All 3 tiers fail → TRPCError', () => {
    it('should throw TRPCError INTERNAL_SERVER_ERROR when all models fail', async () => {
      const params = createMockLLMFlowParams({
        nodeContext: { stageId: 'stage_5' },
      });

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      // All 3 models fail
      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockRejectedValueOnce(new Error('DB fallback failed'))
        .mockRejectedValueOnce(new Error('Hardcoded fallback failed'));

      let thrownError: unknown;
      try {
        await executeLegacyLLMFlow(params);
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(TRPCError);
      expect((thrownError as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((thrownError as TRPCError).message).toContain('Failed to generate response');

      // Verify all 3 models were attempted
      expect(llmClient.generateChatCompletion).toHaveBeenCalledTimes(3);

      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryModel: 'openai/gpt-4o-mini',
          dbFallbackModel: 'anthropic/claude-3-5-sonnet',
          hardcodedFallback: 'moonshotai/kimi-k2.5',
        }),
        expect.stringContaining('All models failed')
      );
    });

    it('should include all model names in error log', async () => {
      const params = createMockLLMFlowParams({
        nodeContext: { stageId: 'stage_6' },
      });

      createMockModelConfigService({
        primaryModel: 'openai/gpt-4o-mini',
        fallbackModel: 'anthropic/claude-3-5-sonnet',
      });

      mockGenerateChatCompletion
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      try {
        await executeLegacyLLMFlow(params);
      } catch {
        // Expected to throw
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryModel: 'openai/gpt-4o-mini',
          dbFallbackModel: 'anthropic/claude-3-5-sonnet',
          hardcodedFallback: 'qwen/qwen3-235b-a22b-2507', // stage_6 fallback
          stageId: 'stage_6',
        }),
        expect.any(String)
      );
    });
  });
});

// ============================================================================
// TESTS - resolveModelConfig() Phase Name Mapping
// ============================================================================

describe('resolveModelConfig - Phase Name Mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use "chat_stage_5_refinement" phase for stageId=stage_5 + chatType=node', async () => {
    const params = createMockLLMFlowParams({
      chatType: 'node',
      nodeContext: { stageId: 'stage_5' },
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      'chat_stage_5_refinement',
      'test-course-id',
      undefined,
      'ru'
    );
  });

  it('should use "chat_stage_6_refinement" phase for stageId=stage_6 + chatType=node', async () => {
    const params = createMockLLMFlowParams({
      chatType: 'node',
      nodeContext: { stageId: 'stage_6' },
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      'chat_stage_6_refinement',
      'test-course-id',
      undefined,
      'ru'
    );
  });

  it('should use "chat_node_refinement" phase for other stages + chatType=node', async () => {
    const params = createMockLLMFlowParams({
      chatType: 'node',
      nodeContext: { stageId: 'stage_4' },
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      'chat_node_refinement',
      'test-course-id',
      undefined,
      'ru'
    );
  });

  it('should use "chat_global_guidance" phase for chatType=global', async () => {
    const params = createMockLLMFlowParams({
      chatType: 'global',
      nodeContext: undefined,
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      'chat_global_guidance',
      'test-course-id',
      undefined,
      'ru'
    );
  });

  it('should handle missing stageId gracefully', async () => {
    const params = createMockLLMFlowParams({
      chatType: 'node',
      nodeContext: { stageId: '' }, // Empty stageId
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    // Should use chat_node_refinement (fallback for non-stage_5/stage_6)
    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      'chat_node_refinement',
      'test-course-id',
      undefined,
      'ru'
    );
  });

  it('should pass course language to ModelConfigService', async () => {
    const params = createMockLLMFlowParams({
      course: {
        title: 'Test',
        language: 'en',
        style: null,
        analysis_result: null,
        course_structure: null,
      },
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      expect.any(String),
      'test-course-id',
      undefined,
      'en'
    );
  });

  it('should default to "ru" when language is null', async () => {
    const params = createMockLLMFlowParams({
      course: {
        title: 'Test',
        language: null,
        style: null,
        analysis_result: null,
        course_structure: null,
      },
    });

    const mockService = createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    expect(mockService.getModelForPhase).toHaveBeenCalledWith(
      expect.any(String),
      'test-course-id',
      undefined,
      'ru'
    );
  });
});

// ============================================================================
// TESTS - DB Unavailable → Hardcoded Stage-Specific Fallback
// ============================================================================

describe('resolveModelConfig - DB Unavailable Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use stage_5 hardcoded models when DB is unavailable', async () => {
    const params = createMockLLMFlowParams({
      nodeContext: { stageId: 'stage_5' },
    });

    // DB throws error
    createMockModelConfigService({
      shouldThrow: true,
      errorMessage: 'Database connection failed',
    });

    // Hardcoded primary succeeds
    mockGenerateChatCompletion.mockResolvedValueOnce(
      createMockLLMResponse('Hardcoded primary success')
    );

    const result = await executeLegacyLLMFlow(params);

    // Should use CHAT_STAGE_FALLBACK_MODELS.stage_5.primary = 'moonshotai/kimi-k2-0905'
    expect(llmClient.generateChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        model: 'moonshotai/kimi-k2-0905',
      })
    );

    expect(result.modelUsed).toBe('moonshotai/kimi-k2-0905');

    // Verify warning logged
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Database connection failed',
        }),
      }),
      expect.stringContaining('Failed to get model config from database')
    );
  });

  it('should use stage_6 hardcoded models when DB is unavailable', async () => {
    const params = createMockLLMFlowParams({
      nodeContext: { stageId: 'stage_6' },
    });

    createMockModelConfigService({
      shouldThrow: true,
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Stage 6 hardcoded'));

    const result = await executeLegacyLLMFlow(params);

    // CHAT_STAGE_FALLBACK_MODELS.stage_6.primary = 'deepseek/deepseek-v3.2'
    expect(llmClient.generateChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        model: 'deepseek/deepseek-v3.2',
      })
    );

    expect(result.modelUsed).toBe('deepseek/deepseek-v3.2');
  });

  it('should use DEFAULT hardcoded models when DB unavailable and stageId unknown', async () => {
    const params = createMockLLMFlowParams({
      nodeContext: { stageId: 'stage_unknown' },
    });

    createMockModelConfigService({
      shouldThrow: true,
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Default hardcoded'));

    const result = await executeLegacyLLMFlow(params);

    // DEFAULT_CHAT_FALLBACK_MODELS.primary = 'moonshotai/kimi-k2-0905'
    expect(llmClient.generateChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        model: 'moonshotai/kimi-k2-0905',
      })
    );

    expect(result.modelUsed).toBe('moonshotai/kimi-k2-0905');
  });

  it('should use fallbackConfig temperature and maxTokens when DB unavailable', async () => {
    const params = createMockLLMFlowParams({
      fallbackConfig: {
        modelId: 'custom-fallback',
        temperature: 0.9,
        maxTokens: 4096,
      },
    });

    createMockModelConfigService({
      shouldThrow: true,
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    await executeLegacyLLMFlow(params);

    // Should use fallbackConfig's temperature and maxTokens
    expect(llmClient.generateChatCompletion).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        temperature: 0.9,
        maxTokens: 4096,
      })
    );
  });
});

// ============================================================================
// TESTS - Message Persistence (Non-Blocking)
// ============================================================================

describe('executeLegacyLLMFlow - Message Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should save assistant message after successful LLM response', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabaseAdmin = {
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
      }),
    };

    const params = createMockLLMFlowParams({
      supabaseAdmin: mockSupabaseAdmin as any,
    });

    createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce({
      content: 'LLM response content',
      inputTokens: 150,
      outputTokens: 75,
    } as any);

    await executeLegacyLLMFlow(params);

    // Verify assistant message was saved
    expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('course_chat_messages');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: 'test-course-id',
        conversation_id: 'conv-123',
        role: 'assistant',
        model_used: 'openai/gpt-4o-mini',
        input_tokens: 150,
        output_tokens: 75,
      })
    );
  });

  it('should continue when message persistence fails (non-blocking)', async () => {
    // Create custom mock with error response
    const mockSupabaseAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'course_chat_messages') {
          return {
            insert: vi.fn().mockResolvedValue({
              error: { message: 'Insert failed' },
            }),
          };
        }
        return {};
      }),
    };

    const params = createMockLLMFlowParams({
      supabaseAdmin: mockSupabaseAdmin as any,
    });

    createMockModelConfigService({
      primaryModel: 'openai/gpt-4o-mini',
    });

    mockGenerateChatCompletion.mockResolvedValueOnce(createMockLLMResponse('Success'));

    // Should not throw despite persistence failure
    const result = await executeLegacyLLMFlow(params);

    expect(result.assistantMessage).toBeTruthy();
    expect(result.conversationId).toBe('conv-123');

    // Verify warning was logged
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Insert failed',
        }),
      }),
      expect.stringContaining('Failed to save assistant message')
    );
  });
});
