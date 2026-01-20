/* eslint-disable */
/**
 * Unit tests for pause/resume course generation API endpoints
 * @module tests/api/courses/pause-resume
 *
 * Tests for:
 * - POST /api/courses/[slug]/pause - pauses generation
 * - POST /api/courses/[slug]/resume - resumes generation
 * - GET /api/courses/[slug]/pause - returns pause status
 *
 * Test coverage:
 * - Authentication (401 if not authenticated)
 * - Authorization (403 if user doesn't own course)
 * - Course existence (404 if course not found)
 * - Validation (400 for invalid operations)
 * - Success cases (200 for valid operations)
 * - canPauseGeneration logic for different statuses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as pausePost, GET as pauseGet } from '@/app/api/courses/[slug]/pause/route'
import { POST as resumePost } from '@/app/api/courses/[slug]/resume/route'
import { canPauseGeneration, PAUSABLE_STATUSES } from '@megacampus/shared-types'

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
}

// Mock createClient to return our mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

/**
 * Helper to create mock NextRequest for testing
 */
function createMockRequest(url = 'http://localhost:3000/api/test'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
  })
}

/**
 * Helper to create mock params with slug
 */
function createMockParams(slug: string): { params: Promise<{ slug: string }> } {
  return {
    params: Promise.resolve({ slug }),
  }
}

/**
 * Helper to create mock authenticated user
 */
function mockAuthenticatedUser(userId = 'user-123', email = 'test@example.com') {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: {
      user: {
        id: userId,
        email,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    },
    error: null,
  })
}

/**
 * Helper to mock unauthenticated user
 */
function mockUnauthenticatedUser() {
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Not authenticated' },
  })
}

/**
 * Helper to mock course lookup
 */
function mockCourseLookup(
  _slug: string,
  course: {
    id: string
    user_id: string
    generation_status?: string
    generation_paused_at?: string | null
  } | null,
  error: unknown = null
) {
  const mockSelect = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const mockSingle = vi.fn().mockResolvedValue({ data: course, error })

  mockSupabaseClient.from.mockReturnValue({
    select: mockSelect,
  })

  mockSelect.mockReturnValue({
    eq: mockEq,
  })

  mockEq.mockReturnValue({
    single: mockSingle,
  })

  return { mockSelect, mockEq, mockSingle }
}

describe('Pause/Resume API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================================================
  // POST /api/courses/[slug]/pause - Pause generation
  // ============================================================================

  describe('POST /api/courses/[slug]/pause', () => {
    it('should return 401 if not authenticated', async () => {
      mockUnauthenticatedUser()

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Authentication required')
    })

    it('should return 404 if course not found', async () => {
      mockAuthenticatedUser()
      mockCourseLookup('test-course', null, { message: 'Not found' })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('Course not found')
    })

    it('should return 403 if user does not own the course', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'other-user-789', // Different user
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('You do not have permission to pause this course')
    })

    it('should return 400 if RPC returns success: false', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
      })

      // Mock RPC to return failure
      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: false,
          error: 'Cannot pause at this stage',
        },
        error: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Cannot pause at this stage')
    })

    it('should return 500 if RPC call fails with error', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
      })

      // Mock RPC to return error
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.error).toBe('Failed to pause generation')
    })

    it('should return 200 on successful pause', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
      })

      // Mock successful RPC response
      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          paused_at: '2024-01-14T10:00:00Z',
        },
        error: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.message).toBe('Generation paused')
      expect(json.pausedAt).toBe('2024-01-14T10:00:00Z')
    })

    it('should call RPC with correct parameters', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
      })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: { success: true, paused_at: '2024-01-14T10:00:00Z' },
        error: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      await pausePost(request, params)

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('pause_course_generation', {
        p_course_id: 'course-456',
        p_user_id: 'user-123',
      })
    })

    it('should return 400 if slug is missing', async () => {
      const request = createMockRequest()
      const params = createMockParams('')

      const response = await pausePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Course slug is required')
    })
  })

  // ============================================================================
  // POST /api/courses/[slug]/resume - Resume generation
  // ============================================================================

  describe('POST /api/courses/[slug]/resume', () => {
    it('should return 401 if not authenticated', async () => {
      mockUnauthenticatedUser()

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Authentication required')
    })

    it('should return 404 if course not found', async () => {
      mockAuthenticatedUser()
      mockCourseLookup('test-course', null, { message: 'Not found' })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('Course not found')
    })

    it('should return 403 if user does not own the course', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'other-user-789', // Different user
        generation_paused_at: '2024-01-14T10:00:00Z',
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('You do not have permission to resume this course')
    })

    it('should return 400 if trying to resume non-paused course', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_paused_at: null, // Not paused
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Generation is not paused')
    })

    it('should return 500 if RPC call fails with error', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_paused_at: '2024-01-14T10:00:00Z',
      })

      // Mock RPC to return error
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.error).toBe('Failed to resume generation')
    })

    it('should return 400 if RPC returns success: false', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_paused_at: '2024-01-14T10:00:00Z',
      })

      // Mock RPC to return failure
      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: false,
          error: 'Cannot resume generation',
        },
        error: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Cannot resume generation')
    })

    it('should return 200 on successful resume', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_paused_at: '2024-01-14T10:00:00Z',
      })

      // Mock successful RPC response
      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          resumed_at: '2024-01-14T10:30:00Z',
          paused_duration_seconds: 1800,
        },
        error: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.message).toBe('Generation resumed')
      expect(json.resumedAt).toBe('2024-01-14T10:30:00Z')
      expect(json.pausedDurationSeconds).toBe(1800)
    })

    it('should call RPC with correct parameters', async () => {
      mockAuthenticatedUser('user-123')
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_paused_at: '2024-01-14T10:00:00Z',
      })

      mockSupabaseClient.rpc.mockResolvedValue({
        data: {
          success: true,
          resumed_at: '2024-01-14T10:30:00Z',
          paused_duration_seconds: 1800,
        },
        error: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      await resumePost(request, params)

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('resume_course_generation', {
        p_course_id: 'course-456',
        p_user_id: 'user-123',
      })
    })

    it('should return 400 if slug is missing', async () => {
      const request = createMockRequest()
      const params = createMockParams('')

      const response = await resumePost(request, params)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Course slug is required')
    })
  })

  // ============================================================================
  // GET /api/courses/[slug]/pause - Get pause status
  // ============================================================================

  describe('GET /api/courses/[slug]/pause', () => {
    it('should return 404 if course not found', async () => {
      mockCourseLookup('test-course', null, { message: 'Not found' })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pauseGet(request, params)
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('Course not found')
    })

    it('should return pause status for paused course', async () => {
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_status: 'stage_5_generating',
        generation_paused_at: '2024-01-14T10:00:00Z',
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pauseGet(request, params)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.isPaused).toBe(true)
      expect(json.canPause).toBe(false) // Already paused
      expect(json.pausedAt).toBe('2024-01-14T10:00:00Z')
      expect(json.currentStatus).toBe('stage_5_generating')
    })

    it('should return pause status for non-paused pausable course', async () => {
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_status: 'stage_5_generating', // Pausable status
        generation_paused_at: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pauseGet(request, params)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.isPaused).toBe(false)
      expect(json.canPause).toBe(true) // Can pause
      expect(json.pausedAt).toBeNull()
      expect(json.currentStatus).toBe('stage_5_generating')
    })

    it('should return pause status for non-pausable course', async () => {
      mockCourseLookup('test-course', {
        id: 'course-456',
        user_id: 'user-123',
        generation_status: 'completed', // Non-pausable status
        generation_paused_at: null,
      })

      const request = createMockRequest()
      const params = createMockParams('test-course')

      const response = await pauseGet(request, params)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.isPaused).toBe(false)
      expect(json.canPause).toBe(false) // Cannot pause
      expect(json.pausedAt).toBeNull()
      expect(json.currentStatus).toBe('completed')
    })

    it('should return 400 if slug is missing', async () => {
      const request = createMockRequest()
      const params = createMockParams('')

      const response = await pauseGet(request, params)
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Course slug is required')
    })
  })

  // ============================================================================
  // canPauseGeneration - Utility function tests
  // ============================================================================

  describe('canPauseGeneration', () => {
    it('should return true for all pausable statuses', () => {
      PAUSABLE_STATUSES.forEach((status) => {
        expect(canPauseGeneration(status)).toBe(true)
      })
    })

    it('should return false for non-pausable statuses', () => {
      const nonPausableStatuses = [
        'pending',
        'completed',
        'failed',
        'cancelled',
        'stage_1_init',
        'stage_1_processing',
      ]

      nonPausableStatuses.forEach((status) => {
        expect(canPauseGeneration(status)).toBe(false)
      })
    })

    it('should return false for null status', () => {
      expect(canPauseGeneration(null)).toBe(false)
    })

    it('should return false for undefined status', () => {
      expect(canPauseGeneration(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(canPauseGeneration('')).toBe(false)
    })

    it('should return false for unknown status', () => {
      expect(canPauseGeneration('unknown_status')).toBe(false)
    })

    it('should verify all PAUSABLE_STATUSES are stage 2-6', () => {
      // Verify that pausable statuses are from stages 2-6 only
      PAUSABLE_STATUSES.forEach((status) => {
        const isStage2to6 = /^stage_[2-6]_/.test(status)
        expect(isStage2to6).toBe(true)
      })
    })
  })
})
