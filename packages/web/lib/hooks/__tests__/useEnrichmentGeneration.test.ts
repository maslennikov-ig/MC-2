import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { TRPCClientError } from '@trpc/client'
import { useEnrichmentGeneration } from '@/lib/hooks/useEnrichmentGeneration'

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
// Mock Setup
// =============================================================================

const mockMutateGenerate = vi.fn()
const mockQueryStatus = vi.fn()
const mockMutateCancel = vi.fn()

vi.mock('@/lib/trpc/browser-client', () => ({
  getBrowserTrpcClient: vi.fn(() => ({
    enrichment: {
      generateOnDemand: { mutate: mockMutateGenerate },
      getGenerationStatus: { query: mockQueryStatus },
      cancel: { mutate: mockMutateCancel },
    },
  })),
}))

// =============================================================================
// Test Fixtures
// =============================================================================

const mockGenerateResponse = {
  enrichmentId: 'test-enrichment-id',
  status: 'pending',
  jobId: 'test-job-id',
}

const mockStatusPending = {
  status: 'pending',
  progress: 0,
  currentStep: 'queued' as const,
}

const mockStatusGenerating = {
  status: 'generating',
  progress: 75,
  currentStep: 'generating' as const,
}

const mockStatusCompleted = {
  status: 'completed',
  progress: 100,
  currentStep: 'completed' as const,
}

const mockStatusFailed = {
  status: 'failed',
  progress: 0,
  error: 'Generation failed',
}

const mockStatusCancelled = {
  status: 'cancelled',
  progress: 50,
}

// =============================================================================
// Tests
// =============================================================================

describe('useEnrichmentGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateGenerate.mockReset()
    mockQueryStatus.mockReset()
    mockMutateCancel.mockReset()
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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz', { questionCount: 10 })
      })

      expect(mockMutateGenerate).toHaveBeenCalledWith(
        {
          lessonId: 'lesson-123',
          enrichmentType: 'quiz',
          settings: { questionCount: 10 },
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )

      unmount()
    })

    it('should add enrichment to generating map on success', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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
      expect(enrichment).toEqual(
        expect.objectContaining({
          enrichmentId: 'test-enrichment-id',
          type: 'quiz',
          progress: 0,
          currentStep: 'queued',
        })
      )
      expect(enrichment?.startedAtMs).toEqual(expect.any(Number))
      expect(enrichment?.maxDurationMs).toBeUndefined()

      unmount()
    })

    it('should set 60-minute max duration for NLM media generation', async () => {
      mockMutateGenerate.mockResolvedValueOnce({
        ...mockGenerateResponse,
        enrichmentId: 'test-nlm-enrichment-id',
      })
      mockQueryStatus.mockResolvedValue(mockStatusPending)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('nlm_audio')
      })

      const enrichment = result.current.generating.get('nlm_audio')
      expect(enrichment).toBeDefined()
      expect(enrichment?.maxDurationMs).toBe(60 * 60 * 1000)
      expect(enrichment?.startedAtMs).toEqual(expect.any(Number))

      unmount()
    })

    it('should return enrichmentId on successful start', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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
      mockMutateGenerate.mockRejectedValueOnce(new TRPCClientError('Unauthorized'))

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
      mockMutateGenerate.mockRejectedValueOnce(new Error('Network error'))

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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

      expect(mockMutateGenerate).toHaveBeenCalledWith(
        {
          lessonId: 'lesson-123',
          enrichmentType: 'quiz',
          settings,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )

      unmount()
    })

    it('should omit settings when not provided', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('audio')
      })

      expect(mockMutateGenerate).toHaveBeenCalledWith(
        {
          lessonId: 'lesson-123',
          enrichmentType: 'audio',
          settings: undefined,
        },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )

      unmount()
    })

    it('should show optimistic loading state immediately before API response', async () => {
      // Create a deferred promise to control when mutate resolves
      let resolveMutate: (value: unknown) => void
      const mutatePromise = new Promise((resolve) => {
        resolveMutate = resolve
      })
      mockMutateGenerate.mockReturnValueOnce(mutatePromise)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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

      // OPTIMISTIC: Should show generating state BEFORE mutate resolves
      expect(result.current.isGenerating('quiz')).toBe(true)
      const optimisticEnrichment = result.current.generating.get('quiz')
      expect(optimisticEnrichment).toBeDefined()
      expect(optimisticEnrichment!.enrichmentId).toMatch(/^optimistic-quiz-/)
      expect(optimisticEnrichment!.progress).toBe(0)
      expect(optimisticEnrichment!.currentStep).toBe('queued')

      // Now resolve the mutate
      await act(async () => {
        resolveMutate!(mockGenerateResponse)
        await generationPromise
      })

      // After API response, should have real enrichmentId
      const realEnrichment = result.current.generating.get('quiz')
      expect(realEnrichment!.enrichmentId).toBe('test-enrichment-id')

      unmount()
    })

    it('should rollback optimistic state on API error', async () => {
      // Create a deferred promise to control when mutate resolves
      let rejectMutate: (error: Error) => void
      const mutatePromise = new Promise<unknown>((_, reject) => {
        rejectMutate = reject
      })
      mockMutateGenerate.mockReturnValueOnce(mutatePromise)

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
        rejectMutate!(new TRPCClientError('Server error'))
        await generationPromise
      })

      // ROLLBACK: Optimistic state should be removed
      expect(result.current.isGenerating('quiz')).toBe(false)
      expect(result.current.generating.has('quiz')).toBe(false)
      expect(onError).toHaveBeenCalledWith('Server error')

      unmount()
    })

    it('should call onError callback on failure', async () => {
      mockMutateGenerate.mockRejectedValueOnce(new TRPCClientError('Server error'))

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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
      expect(mockQueryStatus).toHaveBeenCalled()

      unmount()
    })

    it('should update progress when status changes', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus
        .mockResolvedValueOnce(mockStatusPending)
        .mockResolvedValueOnce(mockStatusGenerating)
        .mockResolvedValue(mockStatusGenerating)

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus
        .mockResolvedValueOnce(mockStatusPending)
        .mockResolvedValueOnce(mockStatusCompleted)

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus
        .mockResolvedValueOnce(mockStatusPending)
        .mockResolvedValueOnce(mockStatusFailed)

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus
        .mockResolvedValueOnce(mockStatusPending)
        .mockResolvedValueOnce(mockStatusCancelled)

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus
        .mockResolvedValueOnce(mockStatusPending)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockStatusPending)

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

    it('should ignore abort-like polling errors from transport layer', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockRejectedValue(new TRPCClientError('signal is aborted without reason'))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 50,
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait long enough to exceed MAX_POLL_FAILURES if aborts were treated as real failures.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
      })

      expect(onError).not.toHaveBeenCalled()
      expect(result.current.generating.has('quiz')).toBe(true)

      unmount()
    })

    it('should stop polling after MAX_POLL_FAILURES NOT_FOUND errors', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)

      // Always reject with NOT_FOUND (permanent failure)
      const notFoundError = new TRPCClientError('Enrichment not found', {
        result: {
          error: { data: { code: 'NOT_FOUND' }, message: 'Enrichment not found', shape: null },
        },
      })
      mockQueryStatus.mockRejectedValue(notFoundError)

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 50,
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait for 5 NOT_FOUND failures to accumulate (5 polls × ~50ms each + buffer)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
      })

      // After MAX_POLL_FAILURES (5) NOT_FOUND errors: onError is called and generating is cleared
      expect(onError).toHaveBeenCalled()
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should NOT stop polling on transient server errors', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)

      // Always reject with a plain Error (transient failure — not a TRPCClientError)
      mockQueryStatus.mockRejectedValue(new Error('fetch failed'))

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 50,
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait well beyond the 5-failure threshold (which would have stopped NOT_FOUND errors)
      // Transient errors back off exponentially but never trigger the permanent stop
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
      })

      // Transient errors must NOT call onError and must NOT clear generating state
      expect(onError).not.toHaveBeenCalled()
      expect(result.current.generating.has('quiz')).toBe(true)

      unmount()
    })

    it('should NOT count INTERNAL_SERVER_ERROR as permanent failure', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)

      // Always reject with INTERNAL_SERVER_ERROR — this is a TRPCClientError but NOT NOT_FOUND
      const internalError = new TRPCClientError('Internal server error', {
        result: {
          error: {
            data: { code: 'INTERNAL_SERVER_ERROR' },
            message: 'Internal server error',
            shape: null,
          },
        },
      })
      mockQueryStatus.mockRejectedValue(internalError)

      const onError = vi.fn()
      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
          pollingInterval: 50,
          onError,
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      // Wait beyond the NOT_FOUND threshold to confirm no permanent stop is triggered
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
      })

      // INTERNAL_SERVER_ERROR is a transient error: polling continues, onError is never called
      expect(onError).not.toHaveBeenCalled()
      expect(result.current.generating.has('quiz')).toBe(true)

      unmount()
    })
  })

  // ===========================================================================
  // cancelGeneration Tests
  // ===========================================================================

  describe('cancelGeneration', () => {
    it('should stop polling and remove from generating map', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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

      mockMutateGenerate.mockClear()
      mockQueryStatus.mockClear()
      mockMutateCancel.mockClear()
      mockMutateCancel.mockResolvedValueOnce({ success: true })

      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      expect(result.current.generating.has('quiz')).toBe(false)

      // Verify cancel endpoint was called
      expect(mockMutateCancel).toHaveBeenCalledWith({
        enrichmentId: 'test-enrichment-id',
      })

      unmount()
    })

    it('should handle 404 gracefully', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      mockMutateGenerate.mockClear()
      mockQueryStatus.mockClear()
      mockMutateCancel.mockClear()
      mockMutateCancel.mockRejectedValueOnce(new TRPCClientError('Not found'))

      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      // Should still clean up UI state even when cancel endpoint returns 404
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should call onError for 403 permission error', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

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

      mockMutateGenerate.mockClear()
      mockQueryStatus.mockClear()
      mockMutateCancel.mockClear()
      mockMutateCancel.mockRejectedValueOnce(new TRPCClientError('forbidden'))

      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      expect(onError).toHaveBeenCalledWith('You do not have permission to cancel this generation')
      expect(result.current.generating.has('quiz')).toBe(false)

      unmount()
    })

    it('should skip backend call when cancelling during optimistic phase', async () => {
      // Create a deferred promise to control when mutate resolves
      let resolveMutate: (value: unknown) => void
      const mutatePromise = new Promise((resolve) => {
        resolveMutate = resolve
      })
      mockMutateGenerate.mockReturnValueOnce(mutatePromise)

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
      mockMutateGenerate.mockClear()
      mockQueryStatus.mockClear()
      mockMutateCancel.mockClear()

      // Cancel during optimistic phase
      await act(async () => {
        await result.current.cancelGeneration('quiz')
      })

      // Should NOT have called backend cancel endpoint (optimistic ID doesn't exist on backend)
      expect(mockMutateCancel).not.toHaveBeenCalled()

      // Should have cleaned up frontend state
      expect(result.current.isGenerating('quiz')).toBe(false)
      expect(result.current.generating.has('quiz')).toBe(false)

      // Clean up: resolve the pending mutate to avoid unhandled promise
      resolveMutate!(mockGenerateResponse)

      unmount()
    })

    it('should clean up optimistic state on unmount', () => {
      // Create a promise that never resolves (simulates slow network)
      const mutatePromise = new Promise<unknown>(() => {})
      mockMutateGenerate.mockReturnValueOnce(mutatePromise)

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

      expect(mockMutateCancel).not.toHaveBeenCalled()
      unmount()
    })
  })

  // ===========================================================================
  // Cleanup Tests
  // ===========================================================================

  describe('cleanup', () => {
    it('should clear intervals on unmount', async () => {
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

      const { result, unmount } = renderHook(() =>
        useEnrichmentGeneration({
          lessonId: 'lesson-123',
          courseId: 'course-123',
        })
      )

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      mockQueryStatus.mockClear()

      // Unmount
      unmount()

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100))

      // No more query calls should have been made
      expect(mockQueryStatus).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration scenarios', () => {
    it('should handle multiple concurrent generations for different types', async () => {
      const quizResponse = {
        enrichmentId: 'quiz-enrichment-id',
        status: 'pending',
        jobId: 'quiz-job-id',
      }

      const audioResponse = {
        enrichmentId: 'audio-enrichment-id',
        status: 'pending',
        jobId: 'audio-job-id',
      }

      mockMutateGenerate.mockResolvedValueOnce(quizResponse).mockResolvedValueOnce(audioResponse)

      mockQueryStatus.mockResolvedValue(mockStatusPending)

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
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus
        .mockResolvedValueOnce(mockStatusPending)
        .mockResolvedValueOnce(mockStatusFailed)

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
      mockMutateGenerate.mockClear()
      mockQueryStatus.mockClear()
      mockMutateCancel.mockClear()
      mockMutateGenerate.mockResolvedValueOnce(mockGenerateResponse)
      mockQueryStatus.mockResolvedValue(mockStatusPending)

      await act(async () => {
        await result.current.startGeneration('quiz')
      })

      expect(result.current.isGenerating('quiz')).toBe(true)

      unmount()
    })
  })
})
