import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeIntentClassificationFlow } from '@/server/routers/generation/editing/chat-intent-flow';
import { TRPCError } from '@trpc/server';

// === MOCKS === //
const { mockLogInfo, mockLogWarn, mockLogError, mockLogDebug, mockLogger } = vi.hoisted(() => {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn((...args) => console.log('LOG_ERROR:', ...args));
  const debug = vi.fn();
  return {
    mockLogInfo: info,
    mockLogWarn: warn,
    mockLogError: error,
    mockLogDebug: debug,
    mockLogger: { info, warn, error, debug },
  };
});

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

const mockAddJob = vi.fn();
const mockRemoveJobsByCourseId = vi.fn();
vi.mock('@/orchestrator/queue', () => ({
  addJob: (...args: any[]) => mockAddJob(...args),
  removeJobsByCourseId: (...args: any[]) => mockRemoveJobsByCourseId(...args),
}));

const mockBuildStage5JobInput = vi.fn();
vi.mock('@/server/routers/generation/_shared/helpers', () => ({
  buildStage5JobInput: (...args: any[]) => mockBuildStage5JobInput(...args),
}));

const mockClassifyIntent = vi.fn();
const mockClassifyWithHeuristics = vi.fn();
const mockIsDirectExecutionIntent = vi.fn();
const mockIsLLMRequiredIntent = vi.fn();

vi.mock('@/shared/intent', () => ({
  classifyIntent: (...args: any[]) => mockClassifyIntent(...args),
  classifyWithHeuristics: (...args: any[]) => mockClassifyWithHeuristics(...args),
  isDirectExecutionIntent: (...args: any[]) => mockIsDirectExecutionIntent(...args),
  isLLMRequiredIntent: (...args: any[]) => mockIsLLMRequiredIntent(...args),
}));

const mockGenerateChatCompletion = vi.fn();
vi.mock('@/shared/llm/client', () => ({
  llmClient: {
    generateChatCompletion: (...args: any[]) => mockGenerateChatCompletion(...args),
  },
}));

const mockGetModelForPhase = vi.fn();
const mockIsMissingChatPhaseConfigError = vi.fn();
vi.mock('@/shared/llm/model-config-service', () => ({
  createModelConfigService: () => ({ getModelForPhase: mockGetModelForPhase }),
  isMissingChatPhaseConfigError: (...args: any[]) => mockIsMissingChatPhaseConfigError(...args),
}));

const mockHandleDirectIntent = vi.fn();
const mockHandleInfoQuery = vi.fn();
const mockParseProposalFromLLMResponse = vi.fn();

vi.mock('@/server/routers/generation/editing/chat-helpers', () => ({
  handleDirectIntent: (...args: any[]) => mockHandleDirectIntent(...args),
  handleInfoQuery: (...args: any[]) => mockHandleInfoQuery(...args),
  buildTargetedRefinementPrompt: vi.fn().mockReturnValue('system prompt'),
  buildCourseSkeleton: vi.fn().mockReturnValue('skeleton'),
  parseProposalFromLLMResponse: (...args: any[]) => mockParseProposalFromLLMResponse(...args),
  resolveTargetedContext: vi.fn().mockReturnValue({
    targetedContext: 'context',
    allowedFieldsForTarget: ['title'],
    targetPath: 'path1',
    courseSkeleton: 'skeleton',
  }),
}));

const mockPersistAssistantMessage = vi.fn();
vi.mock('@/server/routers/generation/editing/chat-mutation-helpers', () => ({
  persistAssistantMessage: (...args: any[]) => mockPersistAssistantMessage(...args),
}));

const mockRemapOperationsToReal = vi.fn();
vi.mock('@/server/routers/generation/editing/surgical-id-remap', () => ({
  buildIdRemapContext: vi.fn(),
  remapStructureToSimplified: vi.fn().mockReturnValue({ course_title: 'Title', course_id: '1' }),
  remapOperationsToReal: (...args: any[]) => mockRemapOperationsToReal(...args),
}));

const mockValidateOperations = vi.fn();
vi.mock('@/server/routers/generation/editing/surgical-operations', () => ({
  validateOperations: (...args: any[]) => mockValidateOperations(...args),
}));

describe('Chat Intent Flow', () => {
  let mockSupabase: any;
  let baseParams: any;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.CHAT_STRUCTURAL_PROPOSALS_ENABLED = 'true';

    // Base mock returns for functions that should return falsy by default to avoid taking wrong branches
    mockIsDirectExecutionIntent.mockReturnValue(false);
    mockIsLLMRequiredIntent.mockReturnValue(false);
    mockHandleDirectIntent.mockReturnValue({
      message: 'Direct default',
      proposal: undefined,
      requiresClarification: false,
    });

    mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    baseParams = {
      userMessage: 'Test prompt',
      courseStructure: { title: 'Test', sections: [] },
      courseLanguage: 'en',
      courseId: 'test-course',
      convId: 'conv-1',
      chatType: 'global',
      requestId: 'req-1',
      supabaseAdmin: mockSupabase,
      userId: 'user-1',
      fallbackConfig: { temperature: 0.7 },
      thresholds: {
        DIRECT_EXECUTION: 0.8,
        GET_INFO: 0.7,
        LLM_REQUIRED: 0.6,
        CLARIFICATION: 0.5,
      },
    };
  });

  describe('FULL_REGENERATE', () => {
    it('executes full regeneration successfully', async () => {
      mockClassifyWithHeuristics.mockReturnValue({ intent: 'FULL_REGENERATE', confidence: 1.0 });
      mockBuildStage5JobInput.mockResolvedValue({ jobInput: { myJob: true } });
      mockAddJob.mockResolvedValue({ id: 'job-123' });

      const res = await executeIntentClassificationFlow(baseParams);

      expect(res).toBeDefined();
      expect(res?.intent).toBe('regenerate');
      expect(res?.jobId).toBe('job-123');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('restart_from_stage', expect.anything());
      expect(mockRemoveJobsByCourseId).toHaveBeenCalledWith('test-course');
      expect(mockAddJob).toHaveBeenCalled();
      expect(mockPersistAssistantMessage).toHaveBeenCalled();
    });

    it('returns error message if RPC fails', async () => {
      mockClassifyWithHeuristics.mockReturnValue({ intent: 'FULL_REGENERATE', confidence: 1.0 });
      mockSupabase.rpc.mockResolvedValue({ error: new Error('RPC Failed') });

      const res = await executeIntentClassificationFlow(baseParams);
      expect(res?.assistantMessage).toContain('Не удалось запустить');
      expect(mockLogError).toHaveBeenCalled();
    });

    it('logs warning if job cleanup fails but continues', async () => {
      mockClassifyWithHeuristics.mockReturnValue({ intent: 'FULL_REGENERATE', confidence: 1.0 });
      mockBuildStage5JobInput.mockResolvedValue({ jobInput: { myJob: true } });
      mockAddJob.mockResolvedValue({ id: 'job-777' });
      mockRemoveJobsByCourseId.mockRejectedValue(new Error('Cleanup fail'));

      const res = await executeIntentClassificationFlow(baseParams);
      expect(res?.jobId).toBe('job-777');
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Failed to clean up jobs')
      );
    });
  });

  describe('Direct Execution (DELETE / MOVE)', () => {
    it('handles high confidence direct execution', async () => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockResolvedValue({
        intent: 'DELETE_SECTION',
        confidence: 0.9,
        target: 'sec1',
      });
      mockIsDirectExecutionIntent.mockReturnValue(true);

      mockHandleDirectIntent.mockReturnValue({
        message: 'Deleted section',
        proposal: { type: 'structural_operation', operations: [] },
        requiresClarification: false,
      });

      const res = await executeIntentClassificationFlow(baseParams);

      expect(res?.intent).toBe('refine');
      expect(res?.assistantMessage).toBe('Deleted section');
      expect(res?.modelUsed).toBe('intent_classifier');
    });
  });

  describe('GET_INFO', () => {
    it('handles high confidence GET_INFO without LLM', async () => {
      mockClassifyWithHeuristics.mockReturnValue({ intent: 'GET_INFO', confidence: 0.9 });

      mockHandleInfoQuery.mockReturnValue({
        message: 'Info message',
      });

      const res = await executeIntentClassificationFlow(baseParams);

      expect(res?.intent).toBe('refine');
      expect(res?.assistantMessage).toBe('Info message');
      expect(mockHandleInfoQuery).toHaveBeenCalled();
    });
  });

  describe('Clarification Rules', () => {
    it('asks for clarification on low confidence or UNKNOWN', async () => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockResolvedValue({ intent: 'REWRITE', confidence: 0.4 }); // Below threshold 0.5

      const res = await executeIntentClassificationFlow(baseParams);
      expect(res?.metadata?.clarificationType).toBe('ambiguous_intent');
      expect(res?.assistantMessage).toContain('Не совсем понял');
    });

    it('asks for clarification on UNKNOWN even if high confidence', async () => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockResolvedValue({ intent: 'UNKNOWN', confidence: 0.9 });

      const res = await executeIntentClassificationFlow(baseParams);
      expect(res?.metadata?.clarificationType).toBe('ambiguous_intent');
    });
  });

  describe('Structural Intents (ADD_LESSON / ADD_SECTION)', () => {
    beforeEach(() => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockResolvedValue({ intent: 'ADD_LESSON', confidence: 0.8 });
      mockIsDirectExecutionIntent.mockReturnValue(false);
      mockIsLLMRequiredIntent.mockReturnValue(false);
    });

    it('calls LLM and parses structural operation successfully', async () => {
      mockGetModelForPhase.mockResolvedValue({ modelId: 'gpt-4o', temperature: 0.2 });

      // LLM Response
      mockGenerateChatCompletion.mockResolvedValue({
        content:
          '{"summary": "added lesson", "operations": [{ "type": "add_lesson", "tempId": "1", "parentSectionId": "sec1", "afterLessonId": "lsn_1", "reasoning": "some reasoning", "title": "valid title", "objectives": [], "keyTopics": [] }]}',
        inputTokens: 10,
        outputTokens: 5,
      });

      mockRemapOperationsToReal.mockReturnValue([{ type: 'add_lesson', id: 'real-1' }]);
      mockValidateOperations.mockReturnValue([]); // Valid

      const res = await executeIntentClassificationFlow(baseParams);

      expect(mockLogWarn.mock.calls).toEqual([]);
      expect(res?.assistantMessage).toBe('added lesson');
      expect(res?.operationCount).toBeUndefined(); // we check proposal
      expect(res?.proposal?.operations).toHaveLength(1);
    });

    it('handles validation error and warns', async () => {
      mockGetModelForPhase.mockResolvedValue({ modelId: 'gpt-4o', temperature: 0.2 });
      mockGenerateChatCompletion.mockResolvedValue({
        content: `{"operations": []}`,
      });
      mockRemapOperationsToReal.mockReturnValue([]);
      mockValidateOperations.mockReturnValue([new Error('Validation fail')]);

      const res = await executeIntentClassificationFlow(baseParams);

      // Falls back to direct text
      expect(res?.assistantMessage).toBe('{"operations": []}');
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it('checks stage 6 consistency when generationStatus matches and appends CTA', async () => {
      mockGetModelForPhase.mockResolvedValue({ modelId: 'gpt-4o', temperature: 0.2 });
      mockGenerateChatCompletion.mockResolvedValue({
        content:
          '{"summary": "added lesson", "operations": [{ "type": "add_lesson", "tempId": "1", "parentSectionId": "sec1", "afterLessonId": "lsn_1", "reasoning": "some reasoning", "title": "valid title", "objectives": [], "keyTopics": [] }]}',
      });
      mockRemapOperationsToReal.mockReturnValue([{ type: 'add_lesson', id: 'real-1' }]);
      mockValidateOperations.mockReturnValue([]);
      mockSupabase.select.mockReturnThis();
      mockSupabase.eq.mockResolvedValueOnce({ data: [{ id: 'lesson1' }], error: null }); // Query 1: eq resolves
      mockSupabase.eq.mockReturnThis(); // Query 2: eq returns this
      mockSupabase.in.mockReturnThis(); // Query 2: in returns this
      mockSupabase.order.mockResolvedValueOnce({
        data: [{ lesson_id: 'lesson1', status: 'completed' }],
        error: null,
      }); // Query 2: order resolves

      const res = await executeIntentClassificationFlow({
        ...baseParams,
        generationStatus: 'stage_6_complete',
      });

      expect(mockLogWarn.mock.calls).toEqual([]);
      expect(res?.assistantMessage).toContain('Контент курса уже сгенерирован');
      expect(res?.metadata?.stage6ContentReady).toBe(true);
    });
  });

  describe('Targeted LLM Intents (REWRITE, EXPAND)', () => {
    beforeEach(() => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockResolvedValue({ intent: 'REWRITE', confidence: 0.8 });
      mockIsDirectExecutionIntent.mockReturnValue(false);
      mockIsLLMRequiredIntent.mockReturnValue(true);
    });

    it('calls LLM and parses proposal', async () => {
      mockGetModelForPhase.mockResolvedValue({ modelId: 'gpt-4o', temperature: 0.2 });
      mockGenerateChatCompletion.mockResolvedValue({
        content: 'hello',
        inputTokens: 10,
        outputTokens: 5,
      });
      mockParseProposalFromLLMResponse.mockReturnValue({
        summary: 'Targeted summary',
        updates: [],
      });

      const res = await executeIntentClassificationFlow(baseParams);

      expect(res?.assistantMessage).toBe('Targeted summary');
      expect(res?.inputTokens).toBe(10);
    });

    it('falls back to secondary model on primary fail', async () => {
      mockGetModelForPhase.mockResolvedValue({
        modelId: 'gpt-4o',
        fallbackModelId: 'gpt-4o-mini',
        temperature: 0.2,
      });

      // Primary fails
      mockGenerateChatCompletion.mockRejectedValueOnce(new Error('Primary failed'));
      // Secondary succeeds
      mockGenerateChatCompletion.mockResolvedValueOnce({
        content: 'hello fallback',
        inputTokens: 10,
        outputTokens: 5,
      });

      mockParseProposalFromLLMResponse.mockReturnValue({
        summary: 'Targeted fallback summary',
      });

      const res = await executeIntentClassificationFlow(baseParams);

      expect(res?.assistantMessage).toBe('Targeted fallback summary');
      expect(res?.modelUsed).toBe('gpt-4o-mini');
      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Primary model failed')
      );
    });

    it('throws error if both primary and fallback fail', async () => {
      mockGetModelForPhase.mockResolvedValue({ modelId: 'gpt-4o', fallbackModelId: 'gpt-4o-mini' });
      mockGenerateChatCompletion.mockRejectedValue(new Error('Both failed'));

      await expect(executeIntentClassificationFlow(baseParams)).rejects.toThrow('Both failed');
      expect(mockLogError).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Both primary and fallback models failed')
      );
    });

    it('returns TRPC Error if model config is missing', async () => {
      mockGetModelForPhase.mockRejectedValue(new Error('Config missing'));
      // But we should throw a TRPCError directly from the module?
      // Our target is testing executeIntentClassificationFlow

      await expect(executeIntentClassificationFlow(baseParams)).rejects.toThrow(TRPCError);
    });
  });

  describe('Fallback', () => {
    it('returns null if intent unhandled', async () => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockResolvedValue({ intent: 'WEIRD_INTENT', confidence: 1.0 });
      mockIsDirectExecutionIntent.mockReturnValue(false);
      // not structural (by our file list)
      mockIsLLMRequiredIntent.mockReturnValue(false);

      const res = await executeIntentClassificationFlow(baseParams);
      expect(res).toBeNull();
    });

    it('throws TRPC error if classifyIntent throws missing config', async () => {
      mockClassifyWithHeuristics.mockReturnValue(null);
      mockClassifyIntent.mockRejectedValue(new Error('Classify config missing'));
      mockIsMissingChatPhaseConfigError.mockReturnValue(true);

      await expect(executeIntentClassificationFlow(baseParams)).rejects.toThrow(TRPCError);
    });
  });
});
