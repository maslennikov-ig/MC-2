/**
 * Intent Classifier Unit Tests
 * @module shared/intent/__tests__/classifier.test
 *
 * Tests for classifyIntent function with OpenRouter Structured Output.
 * Tests classification accuracy, malformed JSON handling, and nodeContext integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClassifiedIntent, NodeContextForClassification } from '../classifier';

// Mock dependencies before imports
vi.mock('@/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('openai', () => {
  const MockOpenAI = vi.fn(function (this: any, config: any) {
    this.config = config;
    this.chat = {
      completions: {
        create: vi.fn(),
      },
    };
  });

  return {
    default: MockOpenAI,
  };
});

// Import after mocks are defined
import { classifyIntent, isDirectExecutionIntent, isLLMRequiredIntent } from '../classifier';
import { logger } from '@/shared/logger/index.js';
import OpenAI from 'openai';

describe('classifyIntent', () => {
  let mockOpenAIClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock OpenAI client instance
    mockOpenAIClient = new OpenAI({ apiKey: 'test-key', baseURL: 'https://test.example.com' });
  });

  it('should classify DELETE_LESSON intent', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'DELETE_LESSON',
              confidence: 0.95,
              target: {
                elementType: 'lesson',
                identifier: 'урок 2.3',
              },
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent('удали урок 2.3', undefined, mockOpenAIClient);

    expect(result.intent).toBe('DELETE_LESSON');
    expect(result.confidence).toBe(0.95);
    expect(result.target?.identifier).toBe('урок 2.3');
    expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'удали урок 2.3' }),
        ]),
        response_format: expect.objectContaining({ type: 'json_schema' }),
      })
    );
  });

  it('should classify MOVE_ELEMENT with destination', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'MOVE_ELEMENT',
              confidence: 0.9,
              target: {
                elementType: 'lesson',
                identifier: 'урок 1.2',
              },
              destination: 'секция 2',
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent(
      'перенеси урок 1.2 в секцию 2',
      undefined,
      mockOpenAIClient
    );

    expect(result.intent).toBe('MOVE_ELEMENT');
    expect(result.confidence).toBe(0.9);
    expect(result.target?.identifier).toBe('урок 1.2');
    expect(result.destination).toBe('секция 2');
  });

  it('should handle malformed JSON response', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'This is not valid JSON at all',
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent('some message', undefined, mockOpenAIClient);

    expect(result.intent).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(String),
        userMessage: 'some message',
      }),
      'Intent classification failed'
    );
  });

  it('should return UNKNOWN for ambiguous requests', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'UNKNOWN',
              confidence: 0.2,
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent('может быть что-то', undefined, mockOpenAIClient);

    expect(result.intent).toBe('UNKNOWN');
    expect(result.confidence).toBe(0.2);
  });

  it('should respect nodeContext in classification', async () => {
    const nodeContext: NodeContextForClassification = {
      stageId: 'stage5',
      path: 'sections[0].lessons[2]',
      elementType: 'lesson',
    };

    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'DELETE_LESSON',
              confidence: 0.98,
              target: {
                elementType: 'lesson',
                path: 'sections[0].lessons[2]',
              },
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent('удали этот урок', nodeContext, mockOpenAIClient);

    expect(result.intent).toBe('DELETE_LESSON');
    expect(result.target?.path).toBe('sections[0].lessons[2]');

    // Check that system prompt includes nodeContext
    expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('lesson at sections[0].lessons[2]'),
          }),
        ]),
      })
    );
  });

  it('should use classification model from env var or default', async () => {
    const originalEnv = process.env.CHAT_CLASSIFICATION_MODEL;

    // Test with env var
    process.env.CHAT_CLASSIFICATION_MODEL = 'custom/model';

    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'GET_INFO',
              confidence: 0.85,
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    await classifyIntent('сколько уроков?', undefined, mockOpenAIClient);

    expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom/model' })
    );

    // Reset env var
    if (originalEnv) {
      process.env.CHAT_CLASSIFICATION_MODEL = originalEnv;
    } else {
      delete process.env.CHAT_CLASSIFICATION_MODEL;
    }
  });

  it('should classify UPDATE_FIELD with field name and value', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'UPDATE_FIELD',
              confidence: 0.92,
              target: {
                elementType: 'lesson',
                identifier: 'урок 1.1',
              },
              fieldName: 'estimated_duration_minutes',
              newValue: 45,
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent(
      'измени длительность урока 1.1 на 45 минут',
      undefined,
      mockOpenAIClient
    );

    expect(result.intent).toBe('UPDATE_FIELD');
    expect(result.fieldName).toBe('estimated_duration_minutes');
    expect(result.newValue).toBe(45);
  });

  it('should handle empty response content', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: null,
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent('test message', undefined, mockOpenAIClient);

    expect(result.intent).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: 'test message' }),
      'Intent classification: empty response'
    );
  });

  it('should handle API errors gracefully', async () => {
    vi.mocked(mockOpenAIClient.chat.completions.create).mockRejectedValue(
      new Error('API connection failed')
    );

    const result = await classifyIntent('test message', undefined, mockOpenAIClient);

    expect(result.intent).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'API connection failed',
        userMessage: 'test message',
      }),
      'Intent classification failed'
    );
  });

  it('should classify LLM-required intent (REWRITE_CONTENT)', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'REWRITE_CONTENT',
              confidence: 0.88,
              target: {
                elementType: 'lesson',
                identifier: 'урок 1.2',
              },
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    const result = await classifyIntent('перепиши урок 1.2 проще', undefined, mockOpenAIClient);

    expect(result.intent).toBe('REWRITE_CONTENT');
    expect(result.confidence).toBe(0.88);
  });

  it('should truncate long messages in logs', async () => {
    const longMessage = 'a'.repeat(200);

    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              intent: 'UNKNOWN',
              confidence: 0.5,
            }),
          },
        },
      ],
    };

    vi.mocked(mockOpenAIClient.chat.completions.create).mockResolvedValue(mockResponse);

    await classifyIntent(longMessage, undefined, mockOpenAIClient);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringMatching(/^a{100}$/), // Truncated to 100 chars
      }),
      'Intent classified'
    );
  });
});

describe('isDirectExecutionIntent', () => {
  it('should return true for DELETE_LESSON', () => {
    expect(isDirectExecutionIntent('DELETE_LESSON')).toBe(true);
  });

  it('should return true for DELETE_SECTION', () => {
    expect(isDirectExecutionIntent('DELETE_SECTION')).toBe(true);
  });

  it('should return true for MOVE_ELEMENT', () => {
    expect(isDirectExecutionIntent('MOVE_ELEMENT')).toBe(true);
  });

  it('should return true for UPDATE_FIELD', () => {
    expect(isDirectExecutionIntent('UPDATE_FIELD')).toBe(true);
  });

  it('should return false for REWRITE_CONTENT', () => {
    expect(isDirectExecutionIntent('REWRITE_CONTENT')).toBe(false);
  });

  it('should return false for UNKNOWN', () => {
    expect(isDirectExecutionIntent('UNKNOWN')).toBe(false);
  });
});

describe('isLLMRequiredIntent', () => {
  it('should return true for REWRITE_CONTENT', () => {
    expect(isLLMRequiredIntent('REWRITE_CONTENT')).toBe(true);
  });

  it('should return true for EXPAND_CONTENT', () => {
    expect(isLLMRequiredIntent('EXPAND_CONTENT')).toBe(true);
  });

  it('should return true for SIMPLIFY_CONTENT', () => {
    expect(isLLMRequiredIntent('SIMPLIFY_CONTENT')).toBe(true);
  });

  it('should return true for ADD_LESSON', () => {
    expect(isLLMRequiredIntent('ADD_LESSON')).toBe(true);
  });

  it('should return true for ADD_SECTION', () => {
    expect(isLLMRequiredIntent('ADD_SECTION')).toBe(true);
  });

  it('should return false for DELETE_LESSON', () => {
    expect(isLLMRequiredIntent('DELETE_LESSON')).toBe(false);
  });

  it('should return false for UNKNOWN', () => {
    expect(isLLMRequiredIntent('UNKNOWN')).toBe(false);
  });
});
