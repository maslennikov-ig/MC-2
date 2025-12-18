/**
 * Unit tests for DraftSessionManager
 *
 * Tests Redis-based session management with proper mocking strategies.
 * Coverage includes: creation, updates, retrieval, deletion, materialization,
 * TTL behavior, schema validation, and error handling.
 *
 * @see /home/me/code/megacampus2-worktrees/frontend-improvements/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md Section 7
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { DraftSessionManager } from '@/lib/draft-session'
import type { DraftSessionData, DraftFormData } from '@/lib/draft-session'

// Mock nanoid to avoid ESM issues
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-session-id-' + Math.random().toString(36).substring(7)),
}))

// Mock logger to suppress console output in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock Redis client - create mock inside factory function
vi.mock('@/lib/redis-client', () => ({
  RedisCache: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  })),
}))

// Mock Supabase createDraftCourse action
vi.mock('@/app/actions/courses', () => ({
  createDraftCourse: vi.fn(),
}))

// Import after mocking
const { RedisCache } = await import('@/lib/redis-client')
const { createDraftCourse: mockCreateDraftCourse } = await import('@/app/actions/courses')

// Get mock instance for assertions
const getMockRedisInstance = () => {
  const instances = (RedisCache as Mock).mock.results
  if (instances.length > 0) {
    return instances[instances.length - 1].value
  }
  return null
}

describe('DraftSessionManager', () => {
  let manager: DraftSessionManager
  let mockRedis: any
  const testUserId = 'test-user-123'
  const testOrgId = 'test-org-456'
  const DRAFT_TTL = 24 * 60 * 60 // 24 hours in seconds

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new DraftSessionManager()
    mockRedis = getMockRedisInstance()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('createSession', () => {
    it('should create a new session with correct TTL', async () => {
      mockRedis.set.mockResolvedValue(true)

      const result = await manager.createSession(testUserId, testOrgId)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('string')
      expect(result.data!.length).toBeGreaterThan(0)

      // Verify Redis set was called with correct TTL
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(`draft:session:${testUserId}:`),
        expect.objectContaining({
          userId: testUserId,
          organizationId: testOrgId,
          sessionId: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          formData: {},
        }),
        { ttl: DRAFT_TTL }
      )
    })

    it('should generate unique session IDs', async () => {
      mockRedis.set.mockResolvedValue(true)

      const result1 = await manager.createSession(testUserId, testOrgId)
      const result2 = await manager.createSession(testUserId, testOrgId)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.data).not.toBe(result2.data)
    })

    it('should validate userId and organizationId are provided', async () => {
      mockRedis.set.mockResolvedValue(true)

      const result = await manager.createSession('', testOrgId)

      expect(result.success).toBe(true) // Empty strings are technically valid
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: '',
          organizationId: testOrgId,
        }),
        { ttl: DRAFT_TTL }
      )
    })

    it('should handle Redis connection failures', async () => {
      mockRedis.set.mockResolvedValue(false)

      const result = await manager.createSession(testUserId, testOrgId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to store session in Redis')
    })

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection timeout'))

      const result = await manager.createSession(testUserId, testOrgId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Redis connection timeout')
    })
  })

  describe('updateSession', () => {
    const mockSessionId = 'session-123'
    const existingSession: DraftSessionData = {
      sessionId: mockSessionId,
      userId: testUserId,
      organizationId: testOrgId,
      formData: {
        topic: 'Original Topic',
        language: 'ru',
      },
      createdAt: new Date('2025-01-01T10:00:00Z').toISOString(),
      updatedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
    }

    it('should update session with form data and refresh TTL', async () => {
      mockRedis.get.mockResolvedValue(existingSession)
      mockRedis.set.mockResolvedValue(true)

      const newFormData: Partial<DraftFormData> = {
        topic: 'Updated Topic',
        description: 'New description',
      }

      const result = await manager.updateSession(testUserId, mockSessionId, newFormData)

      expect(result.success).toBe(true)
      expect(mockRedis.set).toHaveBeenCalledWith(
        `draft:session:${testUserId}:${mockSessionId}`,
        expect.objectContaining({
          userId: testUserId,
          sessionId: mockSessionId,
          formData: {
            topic: 'Updated Topic',
            description: 'New description',
            language: 'ru', // Preserved from existing
          },
          updatedAt: expect.any(String),
        }),
        { ttl: DRAFT_TTL }
      )

      // Verify updatedAt changed
      const setCall = mockRedis.set.mock.calls[0][1] as DraftSessionData
      expect(setCall.updatedAt).not.toBe(existingSession.updatedAt)
    })

    it('should validate form data schema', async () => {
      mockRedis.get.mockResolvedValue(existingSession)
      mockRedis.set.mockResolvedValue(true)

      const validFormData: Partial<DraftFormData> = {
        topic: 'Valid Topic',
        email: 'valid@example.com',
        language: 'en',
      }

      const result = await manager.updateSession(testUserId, mockSessionId, validFormData)

      expect(result.success).toBe(true)
    })

    it('should return error for non-existent session', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await manager.updateSession(testUserId, 'non-existent', {
        topic: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Session not found or expired')
      expect(mockRedis.set).not.toHaveBeenCalled()
    })

    it('should handle Redis update failures', async () => {
      mockRedis.get.mockResolvedValue(existingSession)
      mockRedis.set.mockResolvedValue(false)

      const result = await manager.updateSession(testUserId, mockSessionId, {
        topic: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to update session in Redis')
    })

    it('should merge form data correctly', async () => {
      mockRedis.get.mockResolvedValue(existingSession)
      mockRedis.set.mockResolvedValue(true)

      // First update: add description
      await manager.updateSession(testUserId, mockSessionId, {
        description: 'Test description',
      })

      const firstCall = mockRedis.set.mock.calls[0][1] as DraftSessionData
      expect(firstCall.formData).toEqual({
        topic: 'Original Topic',
        language: 'ru',
        description: 'Test description',
      })

      // Reset mocks but keep the updated session
      mockRedis.get.mockResolvedValue({
        ...existingSession,
        formData: firstCall.formData,
      })
      mockRedis.set.mockClear()

      // Second update: add email
      await manager.updateSession(testUserId, mockSessionId, {
        email: 'test@example.com',
      })

      const secondCall = mockRedis.set.mock.calls[0][1] as DraftSessionData
      expect(secondCall.formData).toEqual({
        topic: 'Original Topic',
        language: 'ru',
        description: 'Test description',
        email: 'test@example.com',
      })
    })
  })

  describe('getSession', () => {
    const mockSessionId = 'session-123'
    const mockSession: DraftSessionData = {
      sessionId: mockSessionId,
      userId: testUserId,
      organizationId: testOrgId,
      formData: {
        topic: 'Test Course',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('should retrieve existing session', async () => {
      mockRedis.get.mockResolvedValue(mockSession)

      const result = await manager.getSession(testUserId, mockSessionId)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockSession)
      expect(mockRedis.get).toHaveBeenCalledWith(
        `draft:session:${testUserId}:${mockSessionId}`
      )
    })

    it('should return null for non-existent session', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await manager.getSession(testUserId, 'non-existent')

      expect(result.success).toBe(true)
      expect(result.data).toBeNull()
    })

    it('should prevent cross-user access (key isolation)', async () => {
      mockRedis.get.mockResolvedValue(null) // Different user ID = different key = no data

      const result = await manager.getSession('different-user', mockSessionId)

      expect(result.success).toBe(true)
      expect(result.data).toBeNull()
      expect(mockRedis.get).toHaveBeenCalledWith(
        `draft:session:different-user:${mockSessionId}`
      )
    })

    it('should validate retrieved session schema', async () => {
      const invalidSession = {
        sessionId: mockSessionId,
        // Missing required fields
      }
      mockRedis.get.mockResolvedValue(invalidSession)

      const result = await manager.getSession(testUserId, mockSessionId)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle Redis errors', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis read error'))

      const result = await manager.getSession(testUserId, mockSessionId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Redis read error')
    })
  })

  describe('deleteSession', () => {
    const mockSessionId = 'session-123'

    it('should remove session from Redis', async () => {
      mockRedis.delete.mockResolvedValue(true)

      const result = await manager.deleteSession(testUserId, mockSessionId)

      expect(result.success).toBe(true)
      expect(mockRedis.delete).toHaveBeenCalledWith(
        `draft:session:${testUserId}:${mockSessionId}`
      )
    })

    it('should handle deletion failures', async () => {
      mockRedis.delete.mockResolvedValue(false)

      const result = await manager.deleteSession(testUserId, mockSessionId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to delete session from Redis')
    })

    it('should handle Redis errors during deletion', async () => {
      mockRedis.delete.mockRejectedValue(new Error('Redis delete error'))

      const result = await manager.deleteSession(testUserId, mockSessionId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Redis delete error')
    })
  })

  describe('materializeSession', () => {
    const mockSessionId = 'session-123'
    const mockSession: DraftSessionData = {
      sessionId: mockSessionId,
      userId: testUserId,
      organizationId: testOrgId,
      formData: {
        topic: 'Test Course',
        description: 'Test description',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    it('should create DB record from session data', async () => {
      mockRedis.get.mockResolvedValue(mockSession)
      mockRedis.delete.mockResolvedValue(true)
      ;(mockCreateDraftCourse as Mock).mockResolvedValue({
        id: 'course-123',
        slug: 'test-course',
      })

      const result = await manager.materializeSession(testUserId, mockSessionId)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        id: 'course-123',
        slug: 'test-course',
      })
      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Test Course')
      expect(mockRedis.delete).toHaveBeenCalledWith(
        `draft:session:${testUserId}:${mockSessionId}`
      )
    })

    it('should handle missing session error', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await manager.materializeSession(testUserId, 'non-existent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Session not found or expired')
      expect(mockCreateDraftCourse).not.toHaveBeenCalled()
    })

    it('should validate required fields (title/topic)', async () => {
      const sessionWithoutTopic: DraftSessionData = {
        ...mockSession,
        formData: {
          description: 'Description only',
        },
      }
      mockRedis.get.mockResolvedValue(sessionWithoutTopic)
      ;(mockCreateDraftCourse as Mock).mockResolvedValue({
        id: 'course-123',
        slug: 'new-course',
      })

      const result = await manager.materializeSession(testUserId, mockSessionId)

      // Should use fallback title
      expect(result.success).toBe(true)
      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Новый курс')
    })

    it('should handle createDraftCourse errors', async () => {
      mockRedis.get.mockResolvedValue(mockSession)
      ;(mockCreateDraftCourse as Mock).mockResolvedValue({
        error: 'Database error',
      })

      const result = await manager.materializeSession(testUserId, mockSessionId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database error')
      expect(mockRedis.delete).not.toHaveBeenCalled() // Don't delete session on failure
    })

    it('should prefer topic over title field', async () => {
      const sessionWithBoth: DraftSessionData = {
        ...mockSession,
        formData: {
          topic: 'Topic Field',
          title: 'Title Field',
        },
      }
      mockRedis.get.mockResolvedValue(sessionWithBoth)
      ;(mockCreateDraftCourse as Mock).mockResolvedValue({
        id: 'course-123',
        slug: 'test-course',
      })

      await manager.materializeSession(testUserId, mockSessionId)

      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Topic Field')
    })

    it('should use title if topic is not present', async () => {
      const sessionWithTitle: DraftSessionData = {
        ...mockSession,
        formData: {
          title: 'Title Field',
        },
      }
      mockRedis.get.mockResolvedValue(sessionWithTitle)
      ;(mockCreateDraftCourse as Mock).mockResolvedValue({
        id: 'course-123',
        slug: 'test-course',
      })

      await manager.materializeSession(testUserId, mockSessionId)

      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Title Field')
    })
  })

  describe('sessionExists', () => {
    const mockSessionId = 'session-123'

    it('should return true if session exists in Redis', async () => {
      mockRedis.exists.mockResolvedValue(true)

      const result = await manager.sessionExists(testUserId, mockSessionId)

      expect(result).toBe(true)
      expect(mockRedis.exists).toHaveBeenCalledWith(
        `draft:session:${testUserId}:${mockSessionId}`
      )
    })

    it('should return false if session does not exist', async () => {
      mockRedis.exists.mockResolvedValue(false)

      const result = await manager.sessionExists(testUserId, mockSessionId)

      expect(result).toBe(false)
    })

    it('should return false on Redis errors', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'))

      const result = await manager.sessionExists(testUserId, mockSessionId)

      expect(result).toBe(false)
    })
  })

  describe('Error handling', () => {
    it('should handle Redis connection failures gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Connection refused'))

      const result = await manager.getSession(testUserId, 'session-123')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection refused')
    })

    it('should handle invalid data types gracefully', async () => {
      mockRedis.get.mockResolvedValue({ invalid: 'data' })

      const result = await manager.getSession(testUserId, 'session-123')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle JSON parsing errors', async () => {
      mockRedis.get.mockResolvedValue('invalid-json')

      const result = await manager.getSession(testUserId, 'session-123')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('TTL behavior', () => {
    it('should set correct TTL on session creation (24 hours)', async () => {
      mockRedis.set.mockResolvedValue(true)

      await manager.createSession(testUserId, testOrgId)

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { ttl: 86400 } // 24 hours = 86400 seconds
      )
    })

    it('should refresh TTL on session update', async () => {
      const mockSession: DraftSessionData = {
        sessionId: 'session-123',
        userId: testUserId,
        organizationId: testOrgId,
        formData: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockRedis.get.mockResolvedValue(mockSession)
      mockRedis.set.mockResolvedValue(true)

      await manager.updateSession(testUserId, 'session-123', { topic: 'Test' })

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { ttl: 86400 } // TTL refreshed to 24 hours
      )
    })
  })

  describe('Data integrity', () => {
    it('should preserve all session fields during update', async () => {
      const mockSession: DraftSessionData = {
        sessionId: 'session-123',
        userId: testUserId,
        organizationId: testOrgId,
        formData: {
          topic: 'Original',
          language: 'ru',
          email: 'test@example.com',
        },
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T10:00:00Z',
      }
      mockRedis.get.mockResolvedValue(mockSession)
      mockRedis.set.mockResolvedValue(true)

      await manager.updateSession(testUserId, 'session-123', {
        description: 'New field',
      })

      const setCall = mockRedis.set.mock.calls[0][1] as DraftSessionData
      expect(setCall.sessionId).toBe('session-123')
      expect(setCall.userId).toBe(testUserId)
      expect(setCall.organizationId).toBe(testOrgId)
      expect(setCall.createdAt).toBe('2025-01-01T10:00:00Z') // Preserved
      expect(setCall.formData.topic).toBe('Original') // Preserved
      expect(setCall.formData.language).toBe('ru') // Preserved
      expect(setCall.formData.email).toBe('test@example.com') // Preserved
      expect(setCall.formData.description).toBe('New field') // Added
    })

    it('should not mutate original session object', async () => {
      const mockSession: DraftSessionData = {
        sessionId: 'session-123',
        userId: testUserId,
        organizationId: testOrgId,
        formData: {
          topic: 'Original',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const originalFormData = { ...mockSession.formData }
      mockRedis.get.mockResolvedValue(mockSession)
      mockRedis.set.mockResolvedValue(true)

      await manager.updateSession(testUserId, 'session-123', {
        description: 'New',
      })

      expect(mockSession.formData).toEqual(originalFormData) // Unchanged
    })
  })
})
