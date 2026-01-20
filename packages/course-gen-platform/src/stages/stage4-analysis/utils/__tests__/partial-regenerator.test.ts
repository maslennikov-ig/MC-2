/**
 * Unit tests for Partial Regeneration Service
 * Tests ATOMIC field-level regeneration with Zod schema validation
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { regenerateFields } from '../partial-regenerator'
import { z } from 'zod'
import type { ChatOpenAI } from '@langchain/openai'

describe('Partial Regeneration Service', () => {
  let mockModel: ChatOpenAI

  // Simple test schema
  const SimpleSchema = z.object({
    name: z.string().min(3),
    age: z.number().int().min(0),
    email: z.string().email(),
  })

  // Nested schema similar to Phase 2
  const NestedSchema = z.object({
    structure: z.object({
      total_lessons: z.number().int().min(10),
      scope_reasoning: z.string().min(100),
      sections: z.array(
        z.object({
          area: z.string().min(3),
          lessons: z.number().int().min(1),
        })
      ),
    }),
    metadata: z.object({
      model_used: z.string().min(1),
      duration_ms: z.number().int().min(0),
    }),
  })

  beforeEach(() => {
    mockModel = {
      invoke: vi.fn(),
    } as unknown as ChatOpenAI
  })

  describe('Already valid data (bypass)', () => {
    it('should return data as-is if already valid', async () => {
      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      }

      const { result, metadata } = await regenerateFields(
        SimpleSchema,
        validData,
        'Test prompt',
        mockModel
      )

      expect(result).toEqual(validData)
      expect(metadata.attempts).toBe(0)
      expect(metadata.successfulFields).toHaveLength(3)
      expect(metadata.regeneratedFields).toHaveLength(0)
      expect(mockModel.invoke).not.toHaveBeenCalled()
    })
  })

  describe('Partial data with failed fields', () => {
    it('should regenerate single failed field', async () => {
      const partialData = {
        name: 'John Doe',
        age: 30,
        email: 'invalid', // Invalid email
      }

      // Mock LLM response with fixed email
      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          name: 'John Doe',
          age: 30,
          email: 'john@example.com',
        }),
      })

      const { result, metadata } = await regenerateFields(
        SimpleSchema,
        partialData,
        'Test prompt',
        mockModel
      )

      expect(result.name).toBe('John Doe')
      expect(result.age).toBe(30)
      expect(result.email).toBe('john@example.com')
      expect(metadata.successfulFields).toContain('name')
      expect(metadata.successfulFields).toContain('age')
      expect(metadata.regeneratedFields).toContain('email')
      expect(mockModel.invoke).toHaveBeenCalledTimes(1)
    })

    it('should regenerate multiple failed fields', async () => {
      const partialData = {
        name: 'JD', // Too short (min 3)
        age: 30,
        email: 'invalid', // Invalid email
      }

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          name: 'John Doe',
          age: 30,
          email: 'john@example.com',
        }),
      })

      const { result, metadata } = await regenerateFields(
        SimpleSchema,
        partialData,
        'Test prompt',
        mockModel
      )

      expect(result.name).toBe('John Doe')
      expect(result.age).toBe(30)
      expect(result.email).toBe('john@example.com')
      expect(metadata.successfulFields).toContain('age')
      expect(metadata.regeneratedFields).toContain('name')
      expect(metadata.regeneratedFields).toContain('email')
    })
  })

  describe('Nested structure regeneration', () => {
    it('should regenerate failed nested field', async () => {
      const partialData = {
        structure: {
          total_lessons: 15,
          scope_reasoning: 'Too short', // Less than 100 chars (min 100)
          sections: [
            { area: 'Introduction', lessons: 5 },
            { area: 'Advanced', lessons: 10 },
          ],
        },
        metadata: {
          model_used: 'openai/gpt-oss-20b',
          duration_ms: 1000,
        },
      }

      const regeneratedReasoning =
        'This is a comprehensive scope reasoning that explains the course structure in detail and meets the minimum character requirement for validation purposes and provides valuable context.'

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          structure: {
            total_lessons: 15,
            scope_reasoning: regeneratedReasoning,
            sections: [
              { area: 'Introduction', lessons: 5 },
              { area: 'Advanced', lessons: 10 },
            ],
          },
          metadata: {
            model_used: 'openai/gpt-oss-20b',
            duration_ms: 1000,
          },
        }),
      })

      const { result, metadata } = await regenerateFields(
        NestedSchema,
        partialData,
        'Test prompt',
        mockModel
      )

      expect(result.structure.total_lessons).toBe(15)
      expect(result.structure.scope_reasoning).toBe(regeneratedReasoning)
      expect(result.structure.sections).toHaveLength(2)
      expect(metadata.successfulFields).toContain('structure.total_lessons')
      expect(metadata.successfulFields).toContain('metadata.model_used')
      expect(metadata.regeneratedFields.some((f) => f.includes('scope_reasoning'))).toBe(
        true
      )
    })

    it('should regenerate array element with failed validation', async () => {
      const partialData = {
        structure: {
          total_lessons: 15,
          scope_reasoning:
            'This is a valid scope reasoning with enough characters to pass validation and provide meaningful context about the course structure and objectives.',
          sections: [
            { area: 'Introduction', lessons: 5 },
            { area: 'Ad', lessons: 10 }, // area too short (min 3)
          ],
        },
        metadata: {
          model_used: 'openai/gpt-oss-20b',
          duration_ms: 1000,
        },
      }

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          structure: {
            total_lessons: 15,
            scope_reasoning:
              'This is a valid scope reasoning with enough characters to pass validation and provide meaningful context about the course structure and objectives.',
            sections: [
              { area: 'Introduction', lessons: 5 },
              { area: 'Advanced Topics', lessons: 10 },
            ],
          },
          metadata: {
            model_used: 'openai/gpt-oss-20b',
            duration_ms: 1000,
          },
        }),
      })

      const { result, metadata } = await regenerateFields(
        NestedSchema,
        partialData,
        'Test prompt',
        mockModel
      )

      expect(result.structure.sections[1].area).toBe('Advanced Topics')
      expect(metadata.successfulFields).toContain('structure.total_lessons')
    })
  })

  describe('Error handling', () => {
    it('should throw if LLM returns invalid JSON', async () => {
      const partialData = {
        name: 'John',
        age: 30,
        email: 'invalid',
      }

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: 'not json at all',
      })

      await expect(
        regenerateFields(SimpleSchema, partialData, 'Test prompt', mockModel)
      ).rejects.toThrow('Failed to parse regenerated JSON')
    })

    it('should throw if merged result still invalid', async () => {
      const partialData = {
        name: 'John',
        age: 30,
        email: 'invalid',
      }

      // LLM returns data that still has invalid email
      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          name: 'John',
          age: 30,
          email: 'still-invalid',
        }),
      })

      await expect(
        regenerateFields(SimpleSchema, partialData, 'Test prompt', mockModel)
      ).rejects.toThrow('Merged result still invalid after regeneration')
    })

    it('should throw if LLM API call fails', async () => {
      const partialData = {
        name: 'John',
        age: 30,
        email: 'invalid',
      }

      ;(mockModel.invoke as Mock).mockRejectedValueOnce(
        new Error('LLM API timeout')
      )

      await expect(
        regenerateFields(SimpleSchema, partialData, 'Test prompt', mockModel)
      ).rejects.toThrow('LLM API timeout')
    })
  })

  describe('Atomicity tracking', () => {
    it('should accurately track successful vs regenerated fields', async () => {
      const partialData = {
        name: 'John Doe',
        age: -5, // Invalid (min 0)
        email: 'invalid',
      }

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          name: 'John Doe',
          age: 30,
          email: 'john@example.com',
        }),
      })

      const { metadata } = await regenerateFields(
        SimpleSchema,
        partialData,
        'Test prompt',
        mockModel
      )

      expect(metadata.successfulFields).toEqual(['name'])
      expect(metadata.regeneratedFields).toContain('age')
      expect(metadata.regeneratedFields).toContain('email')
      expect(metadata.attempts).toBe(1)
    })

    it('should preserve successful nested fields', async () => {
      const partialData = {
        structure: {
          total_lessons: 15,
          scope_reasoning: 'short', // Invalid
          sections: [],
        },
        metadata: {
          model_used: 'test',
          duration_ms: 1000,
        },
      }

      const validReasoning =
        'This is a comprehensive reasoning that provides detailed explanation of the course scope, structure, and learning objectives with sufficient character count.'

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          structure: {
            total_lessons: 15,
            scope_reasoning: validReasoning,
            sections: [],
          },
          metadata: {
            model_used: 'test',
            duration_ms: 1000,
          },
        }),
      })

      const { result, metadata } = await regenerateFields(
        NestedSchema,
        partialData,
        'Test prompt',
        mockModel
      )

      // Successful fields should be preserved exactly
      expect(result.structure.total_lessons).toBe(15)
      expect(result.metadata.model_used).toBe('test')
      expect(result.metadata.duration_ms).toBe(1000)

      // Only failed field regenerated
      expect(result.structure.scope_reasoning).toBe(validReasoning)
      expect(metadata.successfulFields).toContain('structure.total_lessons')
      expect(metadata.successfulFields).toContain('metadata.model_used')
    })
  })

  describe('Focused prompt construction', () => {
    it('should include successful field values in prompt', async () => {
      const partialData = {
        name: 'John Doe',
        age: 30,
        email: 'invalid',
      }

      ;(mockModel.invoke as Mock).mockResolvedValueOnce({
        content: JSON.stringify({
          name: 'John Doe',
          age: 30,
          email: 'john@example.com',
        }),
      })

      await regenerateFields(SimpleSchema, partialData, 'Original prompt text', mockModel)

      const callArgs = (mockModel.invoke as Mock).mock.calls[0][0]
      expect(callArgs).toContain('Original prompt text')
      expect(callArgs).toContain('name')
      expect(callArgs).toContain('John Doe')
      expect(callArgs).toContain('age')
      expect(callArgs).toContain('30')
      expect(callArgs).toContain('email')
    })
  })
})
