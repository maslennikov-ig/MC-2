import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEnrichmentGeneration } from '@/lib/hooks/useEnrichmentGeneration'
import type { OnDemandEnrichmentType } from '@megacampus/shared-types'
import React from 'react'

/**
 * Unit tests for useEnrichmentGeneration hook
 *
 * Tests on-demand enrichment generation functionality including:
 * - Initial state management
 * - Generation start with race condition protection
 * - Status polling with exponential backoff
 * - Generation cancellation
 * - Request cleanup on unmount
 * - Error handling (auth, network, polling failures)
 */

// =============================================================================
// Test Configuration
// =============================================================================

const BACKEND_URL = 'http://localhost:3456'
const TRPC_URL = `${BACKEND_URL}/trpc`
const DEFAULT_POLLING_INTERVAL = 2000

// =============================================================================
// Mock Setup
// =============================================================================

// Mock useSupabase hook
vi.mock('@/lib/supabase/browser-client', () => ({
  useSupabase: vi.fn(() => ({
    session: { access_token: 'test-token' },
  })),
}))

// =============================================================================
// Test Fixtures
// =============================================================================

const mockGenerateResponse = {
  result: {
    data: {
      enrichmentId: 'test-enrichment-id',
      status: 'pending',
      jobId: 'test-job-id',
    },
  },
}

const mockStatusPending = {
  result: {
    data: {
      status: 'pending',
      progress: 0,
      currentStep: 'queued' as const,
    },
  },
}

const mockStatusGenerating = {
  result: {
    data: {
      status: 'generating',
      progress: 75,
      currentStep: 'generating' as const,
    },
  },
}

const mockStatusCompleted = {
  result: {
    data: {
      status: 'completed',
      progress: 100,
      currentStep: 'completed' as const,
    },
  },
}

const mockStatusFailed = {
  result: {
    data: {
      status: 'failed',
      progress: 0,
      error: 'Generation failed',
    },
  },
}

const mockStatusCancelled = {
  result: {
    data: {
      status: 'cancelled',
      progress: 50,
    },
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a mock fetch response
 */
function createMockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  } as Response
}

// =============================================================================
// Tests
// =============================================================================

describe('useEnrichmentGeneration', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    // Use real timers for these tests to avoid timing issues
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe('initial state', () => {
    it('should have empty generating map initially', () => {
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      expect(result.current.generating.size).toBe(0)
      unmount()
    })

    it('should return false for isGenerating on any type initially', () => {
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      expect(result.current.isGenerating('quiz')).toBe(false)
      expect(result.current.isGenerating('audio')).toBe(false)
      expect(result.current.isGenerating('presentation')).toBe(false)
      unmount()
    })

    it('should return undefined for getProgress on any type initially', () => {
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      expect(result.current.getProgress('quiz')).toBeUndefined()
      unmount()
    })
  })

  // ===========================================================================
  // startGeneration Tests
  // ===========================================================================

  describe('startGeneration', () => {
    it('should make POST request to correct tRPC endpoint with proper body', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz', { questionCount: 10 })
      })

      expect(mockFetch).toHaveBeenCalledWith(
        `${TRPC_URL}/enrichment.generateOnDemand`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({
            lessonId: 'lesson-123',
            enrichmentType: 'quiz',
            settings: { questionCount: 10 },
          }),
        })
      )

      unmount()
    })

    it('should add enrichment to generating map on success', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      expect(result.current.generating.has('quiz')).toBe(true)
      expect(result.current.isGenerating('quiz')).toBe(true)

      const enrichment = result.current.generating.get('quiz')
      expect(enrichment).toEqual({
        enrichmentId: 'test-enrichment-id',
        type: 'quiz',
        progress: 0,
        currentStep: 'queued',
      })

      unmount()
    })

    it('should return enrichmentId on successful start', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      let enrichmentId: string | null = null
      await act(async () => {
        enrichmentId = await result.current.startGeneration('quiz')
      })

      expect(enrichmentId).toBe('test-enrichment-id')
      unmount()
    })

    it('should prevent duplicate generation for same type (race condition protection)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Try to start again - should return null (race condition protection)
      let secondResult: string | null = null
      await act(async () => {
        secondResult = await result.current.startGeneration('quiz')
      })

      expect(secondResult).toBeNull()
      // First generation should still be in progress
      expect(result.current.isGenerating('quiz')).toBe(true)

      unmount()
    })

    it('should handle 401/403 auth errors', async () => {
      const errorResponse = {
        error: {
          message: 'Unauthorized',
        },
      }

      mockFetch.mockResolvedValueOnce(createMockResponse(errorResponse, 401))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          onError,
        })
      )

      await act(async () => {
        const enrichmentId = await result.current.startGeneration('quiz')
        expect(enrichmentId).toBeNull()
      })

      expect(onError).toHaveBeenCalledWith('Unauthorized')
      unmount()
    })

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          onError,
        })
      )

      await act(async () => {
        const enrichmentId = await result.current.startGeneration('quiz')
        expect(enrichmentId).toBeNull()
      })

      expect(onError).toHaveBeenCalledWith('Network error')
      unmount()
    })

    it('should handle settings parameter correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      const settings = { questionCount: 15, difficulty: 'hard' }

      await act(async () => {
        await result.current.startGeneration('quiz', settings)
      })

      expect(mockFetch).toHaveBeenCalledWith(
        `${TRPC_URL}/enrichment.generateOnDemand`,
        expect.objectContaining({
          body: JSON.stringify({
            lessonId: 'lesson-123',
            enrichmentType: 'quiz',
            settings,
          }),
        })
      )

      unmount()
    })

    it('should default settings to empty object if not provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('audio')
      })

      expect(mockFetch).toHaveBeenCalledWith(
        `${TRPC_URL}/enrichment.generateOnDemand`,
        expect.objectContaining({
          body: JSON.stringify({
            lessonId: 'lesson-123',
            enrichmentType: 'audio',
            settings: {},
          }),
        })
      )

      unmount()
    })

    it('should show optimistic loading state immediately before API response', async () => {
      // Create a deferred promise to control when fetch resolves
      let resolveFetch: (value: Response) => void
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
      mockFetch.mockReturnValueOnce(fetchPromise)
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      // Start generation but don't await - check state immediately
      let generationPromise: Promise<string | null>
      act(() => {
        generationPromise = result.current.startGeneration('quiz')
      })

      // OPTIMISTIC: Should show generating state BEFORE fetch resolves
      expect(result.current.isGenerating('quiz')).toBe(true)
      const optimisticEnrichment = result.current.generating.get('quiz')
      expect(optimisticEnrichment).toBeDefined()
      expect(optimisticEnrichment!.enrichmentId).toMatch(/^optimistic-quiz-/)
      expect(optimisticEnrichment!.progress).toBe(0)
      expect(optimisticEnrichment!.currentStep).toBe('queued')

      // Now resolve the fetch
      await act(async () => {
        resolveFetch!(createMockResponse(mockGenerateResponse))
        await generationPromise
      })

      // After API response, should have real enrichmentId
      const realEnrichment = result.current.generating.get('quiz')
      expect(realEnrichment!.enrichmentId).toBe('test-enrichment-id')

      unmount()
    })

    it('should rollback optimistic state on API error', async () => {
      // Create a deferred promise to control when fetch resolves
      let resolveFetch: (value: Response) => void
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
      mockFetch.mockReturnValueOnce(fetchPromise)

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          onError,
        })
      )

      // Start generation
      let generationPromise: Promise<string | null>
      act(() => {
        generationPromise = result.current.startGeneration('quiz')
      })

      // Optimistic state should be present
      expect(result.current.isGenerating('quiz')).toBe(true)

      // Resolve with error
      await act(async () => {
        resolveFetch!(createMockResponse({ error: { message: 'Server error' } }, 500))
        await generationPromise
      })

      // ROLLBACK: Optimistic state should be removed
      expect(result.current.isGenerating('quiz')).toBe(false)
      expect(result.current.generating.has('quiz')).toBe(false)
      expect(onError).toHaveBeenCalledWith('Server error')

      unmount()
    })

    it('should call onError callback on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: { message: 'Server error' } }, 500)
      )

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      expect(onError).toHaveBeenCalledWith('Server error')
      unmount()
    })
  })

  // ===========================================================================
  // Polling Tests (with delayed polling verification)
  // ===========================================================================

  describe('polling', () => {
    it('should start polling immediately after generation starts', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait a bit for initial poll
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      // Should have made initial poll request
      const statusCalls = mockFetch.mock.calls.filter((call) =>
        call[0].includes('getGenerationStatus')
      )
      expect(statusCalls.length).toBeGreaterThan(0)

      unmount()
    })

    it('should update progress when status changes', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))
        .mockResolvedValueOnce(createMockResponse(mockStatusGenerating))
        .mockResolvedValue(createMockResponse(mockStatusGenerating))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 50, // Very fast polling for testing
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for polls to occur (need enough time for multiple polls)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250))
      })

      const enrichment = result.current.generating.get('quiz')
      expect(enrichment).toBeDefined()
      expect(enrichment!.progress).toBe(75)
      expect(enrichment!.currentStep).toBe('generating')

      unmount()
    })

    it('should call onComplete when status is completed', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))
        .mockResolvedValueOnce(createMockResponse(mockStatusCompleted))

      const onComplete = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 100,
          onComplete,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for polling to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
      })

      expect(onComplete).toHaveBeenCalledWith('test-enrichment-id')
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should call onError when status is failed', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))
        .mockResolvedValueOnce(createMockResponse(mockStatusFailed))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 100,
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for polling
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
      })

      expect(onError).toHaveBeenCalledWith('Generation failed')
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should not call onError when status is cancelled', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))
        .mockResolvedValueOnce(createMockResponse(mockStatusCancelled))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 100,
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for polling
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
      })

      expect(onError).not.toHaveBeenCalled()
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should handle polling errors with backoff', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 100,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for polls (including error recovery)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
      })

      // Should still be generating (not stopped after single error - backoff recovery)
      expect(result.current.generating.has('quiz')).toBe(true)

      unmount()
    })
  })

  // ===========================================================================
  // cancelGeneration Tests
  // ===========================================================================

  describe('cancelGeneration', () => {
    it('should stop polling and remove from generating map', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      expect(result.current.generating.has('quiz')).toBe(true)

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }))

      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      expect(result.current.generating.has('quiz')).toBe(false)

      // Verify cancel endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        `${TRPC_URL}/enrichment.cancel`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            enrichmentId: 'test-enrichment-id',
          }),
        })
      )

      unmount()
    })

    it('should handle 404 gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: 'Not found' }, 404))

      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      // Should still clean up UI state even when cancel endpoint returns 404
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should call onError for 403 permission error', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: 'Forbidden' }, 403))

      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      expect(onError).toHaveBeenCalledWith('You do not have permission to cancel this generation')
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should skip backend call when cancelling during optimistic phase', async () => {
      // Create a deferred promise to control when fetch resolves
      let resolveFetch: (value: Response) => void
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
      mockFetch.mockReturnValueOnce(fetchPromise)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      // Start generation but don't await
      act(() => {
        result.current.startGeneration('quiz')
      })

      // Should be in optimistic phase with optimistic ID
      expect(result.current.isGenerating('quiz')).toBe(true)
      const optimisticEnrichment = result.current.generating.get('quiz')
      expect(optimisticEnrichment!.enrichmentId).toMatch(/^optimistic-quiz-/)

      // Clear mock to track new calls
      mockFetch.mockClear()

      // Cancel during optimistic phase
      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      // Should NOT have called backend cancel endpoint (optimistic ID doesn't exist on backend)
      expect(mockFetch).not.toHaveBeenCalled()

      // Should have cleaned up frontend state
      expect(result.current.isGenerating('quiz')).toBe(false)
      expect(result.current.generating.has('quiz')).toBe(false)

      // Clean up: resolve the pending fetch to avoid unhandled promise
      resolveFetch!(createMockResponse(mockGenerateResponse))

      unmount()
    })

    it('should clean up optimistic state on unmount', async () => {
      // Create a promise that never resolves (simulates slow network)
      const fetchPromise = new Promise<Response>(() => {})
      mockFetch.mockReturnValueOnce(fetchPromise)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      // Start generation but don't await
      act(() => {
        result.current.startGeneration('quiz')
      })

      // Should be in optimistic phase
      expect(result.current.isGenerating('quiz')).toBe(true)

      // Unmount should clean up without errors
      unmount()

      // No assertion needed - test passes if unmount doesn't throw
    })

    it('should do nothing if enrichment not in generating map', async () => {
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      // Cancel without starting - should not throw
      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      expect(mockFetch).not.toHaveBeenCalled()
      unmount()
    })
  })

  // ===========================================================================
  // Cleanup Tests
  // ===========================================================================

  describe('cleanup', () => {
    it('should clear intervals on unmount', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      mockFetch.mockClear()

      // Unmount
      unmount()

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100))

      // No more fetch calls should have been made
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration scenarios', () => {
    it('should handle multiple concurrent generations for different types', async () => {
      const quizResponse = {
        result: {
          data: {
            enrichmentId: 'quiz-enrichment-id',
            status: 'pending',
            jobId: 'quiz-job-id',
          },
        },
      }

      const audioResponse = {
        result: {
          data: {
            enrichmentId: 'audio-enrichment-id',
            status: 'pending',
            jobId: 'audio-job-id',
          },
        },
      }

      const mockQuizStatusPending = {
        result: {
          data: {
            status: 'pending',
            progress: 0,
            currentStep: 'queued' as const,
          },
        },
      }

      const mockAudioStatusPending = {
        result: {
          data: {
            status: 'pending',
            progress: 0,
            currentStep: 'queued' as const,
          },
        },
      }

      mockFetch
        .mockResolvedValueOnce(createMockResponse(quizResponse))
        .mockResolvedValueOnce(createMockResponse(mockQuizStatusPending))
        .mockResolvedValueOnce(createMockResponse(audioResponse))
        .mockResolvedValueOnce(createMockResponse(mockAudioStatusPending))
        .mockResolvedValue(createMockResponse(mockStatusPending))

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 100,
        })
      )

      // Start first generation
      await act(async () => {
        await result.current.startGeneration('quiz')
        // Wait for initial poll
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      // Start second generation
      await act(async () => {
        await result.current.startGeneration('audio')
        // Wait for initial poll
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      expect(result.current.isGenerating('quiz')).toBe(true)
      expect(result.current.isGenerating('audio')).toBe(true)
      expect(result.current.generating.size).toBe(2)

      unmount()
    })

    it('should allow retry after failure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch
        .mockResolvedValueOnce(createMockResponse(mockStatusPending))
        .mockResolvedValueOnce(createMockResponse(mockStatusFailed))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 100,
          onError,
        })
      )

      // First attempt
      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for failure
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300))
      })

      expect(result.current.isGenerating('quiz')).toBe(false)
      expect(onError).toHaveBeenCalled()

      // Retry
      mockFetch.mockClear()
      mockFetch.mockResolvedValueOnce(createMockResponse(mockGenerateResponse))
      mockFetch.mockResolvedValue(createMockResponse(mockStatusPending))

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      expect(result.current.isGenerating('quiz')).toBe(true)

      unmount()
    })
  })
})
