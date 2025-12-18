/**
 * Integration tests for Draft Session Workflow
 *
 * Tests realistic user scenarios with mocked Redis and Supabase.
 * Covers full workflows: create -> update -> get -> materialize,
 * auto-save behavior, form submission, file uploads, and cleanup.
 *
 * @see /home/me/code/megacampus2-worktrees/frontend-improvements/docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md Section 7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DraftSessionManager } from '@/lib/draft-session'
import type { DraftFormData } from '@/lib/draft-session'

// Mock nanoid to avoid ESM issues
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-session-id-' + Math.random().toString(36).substring(7)),
}))

// In-memory Redis mock for integration testing
class InMemoryRedis {
  private store: Map<string, { value: unknown; expiresAt: number | null }> = new Map()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key)
    if (!entry) return null

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value as T
  }

  async set(key: string, value: unknown, options?: { ttl?: number }): Promise<boolean> {
    const expiresAt = options?.ttl ? Date.now() + options.ttl * 1000 : null
    this.store.set(key, { value, expiresAt })
    return true
  }

  async delete(key: string): Promise<boolean> {
    this.store.delete(key)
    return true
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key)
    if (!entry) return false

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return false
    }

    return true
  }

  reset(): void {
    this.store.clear()
  }

  // Helper for testing expiration
  expireAll(): void {
    this.store.forEach((entry, key) => {
      if (entry.expiresAt) {
        this.store.delete(key)
      }
    })
  }
}

const inMemoryRedis = new InMemoryRedis()

// Mock Redis client with in-memory implementation
vi.mock('@/lib/redis-client', () => ({
  RedisCache: vi.fn(() => ({
    get: (key: string) => inMemoryRedis.get(key),
    set: (key: string, value: unknown, options?: { ttl?: number }) =>
      inMemoryRedis.set(key, value, options),
    delete: (key: string) => inMemoryRedis.delete(key),
    exists: (key: string) => inMemoryRedis.exists(key),
  })),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock Supabase createDraftCourse action
const mockCreateDraftCourse = vi.fn()
vi.mock('@/app/actions/courses', () => ({
  createDraftCourse: mockCreateDraftCourse,
}))

describe('Draft Session Workflow Integration Tests', () => {
  let manager: DraftSessionManager
  const testUserId = 'user-integration-test'
  const testOrgId = 'org-integration-test'

  beforeEach(() => {
    vi.clearAllMocks()
    inMemoryRedis.reset()
    manager = new DraftSessionManager()
  })

  afterEach(() => {
    inMemoryRedis.reset()
  })

  describe('Full workflow: create -> update -> get -> materialize', () => {
    it('should complete entire session lifecycle successfully', async () => {
      // Step 1: Create session
      const createResult = await manager.createSession(testUserId, testOrgId)
      expect(createResult.success).toBe(true)
      const sessionId = createResult.data!

      // Step 2: Update session with form data
      const updateResult1 = await manager.updateSession(testUserId, sessionId, {
        topic: 'Integration Test Course',
        language: 'ru',
      })
      expect(updateResult1.success).toBe(true)

      // Step 3: Get session and verify data
      const getResult1 = await manager.getSession(testUserId, sessionId)
      expect(getResult1.success).toBe(true)
      expect(getResult1.data?.formData.topic).toBe('Integration Test Course')
      expect(getResult1.data?.formData.language).toBe('ru')

      // Step 4: Update session again (simulating auto-save)
      const updateResult2 = await manager.updateSession(testUserId, sessionId, {
        description: 'Added description',
        email: 'test@example.com',
      })
      expect(updateResult2.success).toBe(true)

      // Step 5: Get session and verify merged data
      const getResult2 = await manager.getSession(testUserId, sessionId)
      expect(getResult2.success).toBe(true)
      expect(getResult2.data?.formData).toEqual({
        topic: 'Integration Test Course',
        language: 'ru',
        description: 'Added description',
        email: 'test@example.com',
      })

      // Step 6: Materialize session to DB
      mockCreateDraftCourse.mockResolvedValue({
        id: 'course-integration-123',
        slug: 'integration-test-course',
      })

      const materializeResult = await manager.materializeSession(testUserId, sessionId)
      expect(materializeResult.success).toBe(true)
      expect(materializeResult.data).toEqual({
        id: 'course-integration-123',
        slug: 'integration-test-course',
      })

      // Step 7: Verify session was deleted after materialization
      const getResult3 = await manager.getSession(testUserId, sessionId)
      expect(getResult3.success).toBe(true)
      expect(getResult3.data).toBeNull()
    })
  })

  describe('Auto-save workflow: create -> multiple updates -> verify TTL refresh', () => {
    it('should auto-save multiple times and refresh TTL on each update', async () => {
      // Create session
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // Simulate auto-save every 3 seconds (5 updates)
      const updates = [
        { topic: 'Auto-save test' },
        { description: 'Step 1' },
        { language: 'en' },
        { email: 'user@example.com' },
        { writingStyles: ['academic', 'technical'] },
      ]

      for (const update of updates) {
        const result = await manager.updateSession(testUserId, sessionId, update)
        expect(result.success).toBe(true)
      }

      // Verify all updates were merged
      const getResult = await manager.getSession(testUserId, sessionId)
      expect(getResult.success).toBe(true)
      expect(getResult.data?.formData).toEqual({
        topic: 'Auto-save test',
        description: 'Step 1',
        language: 'en',
        email: 'user@example.com',
        writingStyles: ['academic', 'technical'],
      })

      // Verify session still exists (TTL was refreshed)
      const exists = await manager.sessionExists(testUserId, sessionId)
      expect(exists).toBe(true)
    })

    it('should handle rapid updates without data loss', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // Simulate rapid form changes (100ms apart)
      const rapidUpdates = Array.from({ length: 10 }, (_, i) => ({
        topic: `Topic ${i + 1}`,
      }))

      for (const update of rapidUpdates) {
        await manager.updateSession(testUserId, sessionId, update)
      }

      // Verify final state
      const getResult = await manager.getSession(testUserId, sessionId)
      expect(getResult.success).toBe(true)
      expect(getResult.data?.formData.topic).toBe('Topic 10')
    })
  })

  describe('Form submit workflow: create -> update -> materialize -> verify DB record', () => {
    it('should materialize session on form submit', async () => {
      // User opens /create page -> session created
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // User fills form (auto-save happens)
      await manager.updateSession(testUserId, sessionId, {
        topic: 'Submit Test Course',
        description: 'Testing submit workflow',
        language: 'ru',
        email: 'submit@example.com',
      })

      // User clicks submit -> materialize session
      mockCreateDraftCourse.mockResolvedValue({
        id: 'course-submit-123',
        slug: 'submit-test-course',
      })

      const materializeResult = await manager.materializeSession(testUserId, sessionId)

      // Verify course was created with correct data
      expect(materializeResult.success).toBe(true)
      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Submit Test Course')

      // Verify session was deleted
      const exists = await manager.sessionExists(testUserId, sessionId)
      expect(exists).toBe(false)
    })

    it('should keep session if materialization fails', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      await manager.updateSession(testUserId, sessionId, {
        topic: 'Fail Test',
      })

      // Simulate DB error
      mockCreateDraftCourse.mockResolvedValue({
        error: 'Database connection failed',
      })

      const materializeResult = await manager.materializeSession(testUserId, sessionId)

      expect(materializeResult.success).toBe(false)
      expect(materializeResult.error).toBe('Database connection failed')

      // Verify session was NOT deleted (user can retry)
      const exists = await manager.sessionExists(testUserId, sessionId)
      expect(exists).toBe(true)
    })
  })

  describe('File upload workflow: create -> materialize before upload -> verify', () => {
    it('should materialize session before file upload', async () => {
      // User opens /create page
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // User starts typing (auto-save)
      await manager.updateSession(testUserId, sessionId, {
        topic: 'File Upload Test',
        description: 'Testing file upload flow',
      })

      // User uploads file -> triggers materialization
      mockCreateDraftCourse.mockResolvedValue({
        id: 'course-upload-123',
        slug: 'file-upload-test',
      })

      const materializeResult = await manager.materializeSession(testUserId, sessionId)

      expect(materializeResult.success).toBe(true)
      expect(materializeResult.data?.id).toBe('course-upload-123')

      // File upload would use courseId from materialization result
      const courseId = materializeResult.data!.id
      expect(courseId).toBeDefined()

      // Verify session was deleted after materialization
      const exists = await manager.sessionExists(testUserId, sessionId)
      expect(exists).toBe(false)
    })

    it('should handle materialization for file upload without topic', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // User uploads file without filling form
      mockCreateDraftCourse.mockResolvedValue({
        id: 'course-no-topic-123',
        slug: 'new-course',
      })

      const materializeResult = await manager.materializeSession(testUserId, sessionId)

      expect(materializeResult.success).toBe(true)
      // Should use default title
      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Новый курс')
    })
  })

  describe('Session expiration: create -> wait 24h -> verify deletion', () => {
    it('should simulate session expiration after TTL', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // Verify session exists
      let exists = await manager.sessionExists(testUserId, sessionId)
      expect(exists).toBe(true)

      // Simulate TTL expiration (in real Redis, this would happen automatically)
      inMemoryRedis.expireAll()

      // Verify session expired
      exists = await manager.sessionExists(testUserId, sessionId)
      expect(exists).toBe(false)

      // Verify getSession returns null for expired session
      const getResult = await manager.getSession(testUserId, sessionId)
      expect(getResult.success).toBe(true)
      expect(getResult.data).toBeNull()
    })

    it('should not find expired session on update attempt', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // Expire session
      inMemoryRedis.expireAll()

      // Attempt to update expired session
      const updateResult = await manager.updateSession(testUserId, sessionId, {
        topic: 'Too late',
      })

      expect(updateResult.success).toBe(false)
      expect(updateResult.error).toBe('Session not found or expired')
    })
  })

  describe('Concurrent updates: multiple updates to same session', () => {
    it('should handle concurrent updates correctly (last write wins)', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // Simulate concurrent updates
      const updates = [
        manager.updateSession(testUserId, sessionId, { topic: 'Topic A' }),
        manager.updateSession(testUserId, sessionId, { description: 'Description B' }),
        manager.updateSession(testUserId, sessionId, { language: 'en' }),
        manager.updateSession(testUserId, sessionId, { email: 'test@example.com' }),
      ]

      const results = await Promise.all(updates)

      // All updates should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true)
      })

      // Final state may have race conditions (last write wins)
      // At minimum, verify session exists and has valid structure
      const getResult = await manager.getSession(testUserId, sessionId)
      expect(getResult.success).toBe(true)
      expect(getResult.data).toBeDefined()
      expect(getResult.data?.sessionId).toBe(sessionId)
      expect(getResult.data?.userId).toBe(testUserId)

      // At least one field should be present from concurrent updates
      const hasData = Boolean(
        getResult.data?.formData.topic ||
        getResult.data?.formData.description ||
        getResult.data?.formData.language ||
        getResult.data?.formData.email
      )
      expect(hasData).toBe(true)
    })
  })

  describe('Cross-user isolation: user A cannot access user B\'s session', () => {
    it('should isolate sessions by userId', async () => {
      const userA = 'user-a'
      const userB = 'user-b'

      // User A creates session
      const createResultA = await manager.createSession(userA, testOrgId)
      const sessionIdA = createResultA.data!

      await manager.updateSession(userA, sessionIdA, {
        topic: 'User A Course',
      })

      // User B tries to access User A's session
      const getResultB = await manager.getSession(userB, sessionIdA)

      expect(getResultB.success).toBe(true)
      expect(getResultB.data).toBeNull() // Different userId = different key

      // User A can still access their session
      const getResultA = await manager.getSession(userA, sessionIdA)
      expect(getResultA.success).toBe(true)
      expect(getResultA.data?.formData.topic).toBe('User A Course')
    })

    it('should prevent cross-user updates', async () => {
      const userA = 'user-a'
      const userB = 'user-b'

      const createResultA = await manager.createSession(userA, testOrgId)
      const sessionIdA = createResultA.data!

      // User B tries to update User A's session
      const updateResultB = await manager.updateSession(userB, sessionIdA, {
        topic: 'Hacked!',
      })

      expect(updateResultB.success).toBe(false)
      expect(updateResultB.error).toBe('Session not found or expired')

      // Verify User A's session is unchanged
      const getResultA = await manager.getSession(userA, sessionIdA)
      expect(getResultA.success).toBe(true)
      expect(getResultA.data?.formData.topic).toBeUndefined()
    })

    it('should prevent cross-user deletion', async () => {
      const userA = 'user-a'
      const userB = 'user-b'

      const createResultA = await manager.createSession(userA, testOrgId)
      const sessionIdA = createResultA.data!

      // User B tries to delete User A's session (will succeed but won't affect User A)
      const deleteResultB = await manager.deleteSession(userB, sessionIdA)
      expect(deleteResultB.success).toBe(true) // Delete operation succeeds even if key doesn't exist

      // Verify User A's session still exists
      const exists = await manager.sessionExists(userA, sessionIdA)
      expect(exists).toBe(true)

      // User A deletes their own session
      const deleteResultA = await manager.deleteSession(userA, sessionIdA)
      expect(deleteResultA.success).toBe(true)

      // Now session is gone
      const existsAfter = await manager.sessionExists(userA, sessionIdA)
      expect(existsAfter).toBe(false)
    })
  })

  describe('Cleanup integration: old sessions are deleted', () => {
    it('should handle multiple expired sessions', async () => {
      // Create multiple sessions
      const sessions = []
      for (let i = 0; i < 5; i++) {
        const result = await manager.createSession(`user-${i}`, testOrgId)
        sessions.push({ userId: `user-${i}`, sessionId: result.data! })
      }

      // Verify all sessions exist
      for (const { userId, sessionId } of sessions) {
        const exists = await manager.sessionExists(userId, sessionId)
        expect(exists).toBe(true)
      }

      // Expire all sessions
      inMemoryRedis.expireAll()

      // Verify all sessions expired
      for (const { userId, sessionId } of sessions) {
        const exists = await manager.sessionExists(userId, sessionId)
        expect(exists).toBe(false)
      }
    })

    it('should not affect active sessions during cleanup', async () => {
      // Create old session (would be expired)
      const oldResult = await manager.createSession('old-user', testOrgId)
      const oldSessionId = oldResult.data!

      // Create new session (active)
      const newResult = await manager.createSession('new-user', testOrgId)
      const newSessionId = newResult.data!

      // Manually expire only old session
      const oldKey = `draft:session:old-user:${oldSessionId}`
      await inMemoryRedis.delete(oldKey)

      // Verify old session expired
      const oldExists = await manager.sessionExists('old-user', oldSessionId)
      expect(oldExists).toBe(false)

      // Verify new session still active
      const newExists = await manager.sessionExists('new-user', newSessionId)
      expect(newExists).toBe(true)
    })
  })

  describe('Edge cases and error scenarios', () => {
    it('should handle materialize with empty form data', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      // No updates (empty form data)
      mockCreateDraftCourse.mockResolvedValue({
        id: 'course-empty-123',
        slug: 'new-course',
      })

      const materializeResult = await manager.materializeSession(testUserId, sessionId)

      expect(materializeResult.success).toBe(true)
      expect(mockCreateDraftCourse).toHaveBeenCalledWith('Новый курс')
    })

    it('should handle session with special characters in data', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      const specialData: Partial<DraftFormData> = {
        topic: 'Course with "quotes" and \'apostrophes\'',
        description: 'Описание с кириллицей и эмодзи',
        email: 'test+special@example.com',
      }

      const updateResult = await manager.updateSession(testUserId, sessionId, specialData)
      expect(updateResult.success).toBe(true)

      const getResult = await manager.getSession(testUserId, sessionId)
      expect(getResult.success).toBe(true)
      expect(getResult.data?.formData).toEqual(specialData)
    })

    it('should handle session with arrays in form data', async () => {
      const createResult = await manager.createSession(testUserId, testOrgId)
      const sessionId = createResult.data!

      const arrayData: Partial<DraftFormData> = {
        writingStyles: ['academic', 'technical', 'professional'],
        outputFormats: ['pdf', 'docx', 'html'],
      }

      const updateResult = await manager.updateSession(testUserId, sessionId, arrayData)
      expect(updateResult.success).toBe(true)

      const getResult = await manager.getSession(testUserId, sessionId)
      expect(getResult.success).toBe(true)
      expect(getResult.data?.formData.writingStyles).toEqual([
        'academic',
        'technical',
        'professional',
      ])
      expect(getResult.data?.formData.outputFormats).toEqual(['pdf', 'docx', 'html'])
    })

    it('should handle very long session ID gracefully', async () => {
      const veryLongSessionId = 'a'.repeat(500)

      const getResult = await manager.getSession(testUserId, veryLongSessionId)

      expect(getResult.success).toBe(true)
      expect(getResult.data).toBeNull()
    })
  })
})
