/**
 * Unit tests for Revision Chain Service
 * Tests LangChain-based JSON repair with mocked LLM responses
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { reviseJSON } from '../revision-chain'
import type { ChatOpenAI } from '@langchain/openai'

// Mock LangChain components
vi.mock('@langchain/core/prompts', () => ({
  PromptTemplate: {
    fromTemplate: vi.fn(() => ({
      pipe: vi.fn().mockReturnThis(),
    })),
  },
}))

vi.mock('@langchain/core/output_parsers', () => ({
  StringOutputParser: vi.fn().mockImplementation(() => ({})),
}))

describe('Revision Chain Service', () => {
  let mockModel: ChatOpenAI
  let mockInvoke: Mock

  beforeEach(() => {
    // Reset mocks
    mockInvoke = vi.fn()

    // Create mock chain with invoke method
    const mockChain = {
      invoke: mockInvoke,
    }

    // Mock the pipe chain
    const { PromptTemplate } = require('@langchain/core/prompts')
    PromptTemplate.fromTemplate.mockReturnValue({
      pipe: vi.fn(() => ({
        pipe: vi.fn(() => mockChain),
      })),
    })

    // Create mock model
    mockModel = {} as ChatOpenAI
  })

  describe('Successful revision on first attempt', () => {
    it('should repair malformed JSON on first try', async () => {
      const validJSON = '{"key": "value", "number": 42}'
      mockInvoke.mockResolvedValueOnce(validJSON)

      const result = await reviseJSON(
        'Original prompt',
        '{"key": "value"', // Missing closing brace
        'Unexpected end of JSON input',
        mockModel,
        2
      )

      expect(result).toEqual({ key: 'value', number: 42 })
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const wrappedJSON = '```json\n{"key": "value"}\n```'
      mockInvoke.mockResolvedValueOnce(wrappedJSON)

      const result = await reviseJSON(
        'Original prompt',
        '{"key": "value"',
        'Unexpected end',
        mockModel
      )

      expect(result).toEqual({ key: 'value' })
    })

    it('should extract JSON from explanatory text', async () => {
      const textWithJSON = 'Here is the corrected JSON: {"key": "value"} Hope this helps!'
      mockInvoke.mockResolvedValueOnce(textWithJSON)

      const result = await reviseJSON(
        'Original prompt',
        '{"key": "value"',
        'Unexpected end',
        mockModel
      )

      expect(result).toEqual({ key: 'value' })
    })
  })

  describe('Retry logic', () => {
    it('should retry and succeed on second attempt', async () => {
      // First attempt: still malformed
      mockInvoke.mockResolvedValueOnce('{"key": "value"') // Still missing brace
      // Second attempt: fixed
      mockInvoke.mockResolvedValueOnce('{"key": "value"}')

      const result = await reviseJSON(
        'Original prompt',
        '{"key": "value"',
        'Unexpected end',
        mockModel,
        2
      )

      expect(result).toEqual({ key: 'value' })
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    it('should succeed on last retry attempt', async () => {
      // Attempts 1-2: malformed
      mockInvoke.mockResolvedValueOnce('{"a":')
      mockInvoke.mockResolvedValueOnce('{"a": 1')
      // Attempt 3: fixed
      mockInvoke.mockResolvedValueOnce('{"a": 1, "b": 2}')

      const result = await reviseJSON(
        'Original prompt',
        '{"a":',
        'Unexpected end',
        mockModel,
        3
      )

      expect(result).toEqual({ a: 1, b: 2 })
      expect(mockInvoke).toHaveBeenCalledTimes(3)
    })
  })

  describe('Failure cases', () => {
    it('should throw after max retries exhausted', async () => {
      // All attempts fail
      mockInvoke.mockResolvedValue('{"key": "value"') // Always malformed

      await expect(
        reviseJSON('Original prompt', '{"key": "value"', 'Unexpected end', mockModel, 2)
      ).rejects.toThrow('Revision chain failed after 2 attempts')

      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    it('should handle LLM returning completely invalid output', async () => {
      mockInvoke.mockResolvedValue('This is not JSON at all')

      await expect(
        reviseJSON('Original prompt', '{"key": "value"', 'Unexpected end', mockModel, 2)
      ).rejects.toThrow('Revision chain failed after 2 attempts')
    })

    it('should handle LLM throwing error', async () => {
      mockInvoke.mockRejectedValue(new Error('LLM API error'))

      await expect(
        reviseJSON('Original prompt', '{"key": "value"', 'Unexpected end', mockModel, 1)
      ).rejects.toThrow('LLM API error')
    })
  })

  describe('Real-world Phase 2 scenarios', () => {
    it('should repair Phase 2 output structure', async () => {
      const repairedJSON = JSON.stringify({
        recommended_structure: {
          estimated_content_hours: 10.0,
          scope_reasoning: 'Test reasoning',
          lesson_duration_minutes: 15,
          calculation_explanation: '10h * 60 / 15 = 40 lessons',
          total_lessons: 40,
          total_sections: 2,
          scope_warning: null,
          sections_breakdown: [
            {
              area: 'Introduction',
              estimated_lessons: 20,
              importance: 'core',
              learning_objectives: ['Obj 1', 'Obj 2'],
              key_topics: ['Topic 1', 'Topic 2', 'Topic 3'],
              pedagogical_approach: 'Theory then practice',
              difficulty_progression: 'gradual',
            },
            {
              area: 'Advanced Topics',
              estimated_lessons: 20,
              importance: 'important',
              learning_objectives: ['Obj 3', 'Obj 4'],
              key_topics: ['Topic 4', 'Topic 5', 'Topic 6'],
              pedagogical_approach: 'Practice-based learning',
              difficulty_progression: 'steep',
            },
          ],
        },
        phase_metadata: {
          duration_ms: 0,
          model_used: 'openai/gpt-oss-20b',
          tokens: { input: 0, output: 0, total: 0 },
          quality_score: 0.0,
          retry_count: 0,
        },
      })

      mockInvoke.mockResolvedValueOnce(repairedJSON)

      const result = await reviseJSON(
        'Analyze course and provide scope',
        '{"recommended_structure": {', // Truncated
        'Unexpected end',
        mockModel
      )

      expect(result).toHaveProperty('recommended_structure')
      expect(result).toHaveProperty('phase_metadata')
      expect(result.recommended_structure.total_lessons).toBe(40)
      expect(result.recommended_structure.sections_breakdown).toHaveLength(2)
    })

    it('should handle Phase 2 output with Russian content', async () => {
      const repairedJSON = JSON.stringify({
        recommended_structure: {
          estimated_content_hours: 12.0,
          scope_reasoning:
            'Курс по закупкам требует углубленного изучения законодательства',
          lesson_duration_minutes: 15,
          calculation_explanation: '12 * 60 / 15 = 48 lessons',
          total_lessons: 48,
          total_sections: 4,
          scope_warning: null,
          sections_breakdown: [],
        },
        phase_metadata: {
          duration_ms: 0,
          model_used: 'openai/gpt-oss-20b',
          tokens: { input: 0, output: 0, total: 0 },
          quality_score: 0.0,
          retry_count: 0,
        },
      })

      mockInvoke.mockResolvedValueOnce(repairedJSON)

      const result = await reviseJSON(
        'Russian topic prompt',
        '{"recommended_structure":',
        'Unexpected end',
        mockModel
      )

      expect(result.recommended_structure.total_lessons).toBe(48)
      expect(result.recommended_structure.scope_reasoning).toContain('закупкам')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty LLM response', async () => {
      mockInvoke.mockResolvedValue('')

      await expect(
        reviseJSON('Prompt', '{"key"', 'Unexpected end', mockModel, 1)
      ).rejects.toThrow()
    })

    it('should handle whitespace-only LLM response', async () => {
      mockInvoke.mockResolvedValue('   \n\t  ')

      await expect(
        reviseJSON('Prompt', '{"key"', 'Unexpected end', mockModel, 1)
      ).rejects.toThrow()
    })

    it('should use default maxRetries of 2', async () => {
      mockInvoke.mockResolvedValue('invalid')

      await expect(
        reviseJSON('Prompt', '{"key"', 'Unexpected end', mockModel) // No maxRetries arg
      ).rejects.toThrow('failed after 2 attempts')

      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })
  })
})
