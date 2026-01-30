/**
 * tRPC Client for Web Frontend
 *
 * TanStack Query-based tRPC client implementation for clarifying router.
 * Uses native fetch with React Query hooks for data fetching and caching.
 *
 * Security Features:
 * - CSRF protection via X-CSRF-Token header
 * - Credentials included for session auth
 *
 * Key Benefits over custom implementation:
 * - Automatic cache invalidation notifies ALL subscribers (fixes GraphView/ClarifyingPanel sync)
 * - Built-in query deduplication
 * - Optimistic updates support
 * - DevTools integration
 */

'use client'

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { useCallback } from 'react'
import { BACKEND_URL } from '@/lib/env-client'
import { getSupabaseClient } from '@/lib/supabase/browser-client'

// ============================================================================
// Types
// ============================================================================

/** Clarifying question from API */
export interface ClarifyingQuestion {
  id: string
  course_id: string
  question_text: string
  question_priority: string
  question_category: string | null
  suggested_answers: string[] | null
  user_answer: string | null
  answer_source: string | null
  selected_suggestion_index: number | null
  user_modification: string | null
  iteration_round: number
  status: string
  order_index: number
  created_at: string | null
  answered_at: string | null
  metadata: Record<string, unknown> | null
}

/** Response from clarifying.isEnabled */
export interface ClarifyingIsEnabledResponse {
  enabled: boolean
}

/** Response from clarifying.getQuestions */
export interface ClarifyingQuestionsResponse {
  questions: ClarifyingQuestion[]
}

/** Response from clarifying.getProgress */
export interface ClarifyingProgressResponse {
  total: number
  answered: number
  skipped: number
  pending: number
  criticalTotal: number
  criticalAnswered: number
  importantTotal: number
  importantAnswered: number
  canProceed: boolean
  currentRound: number
  isAutomatic: boolean
}

/** Input for clarifying.submitAnswer */
export interface SubmitAnswerInput {
  questionId: string
  answer: string
  answerSource: 'suggested' | 'modified' | 'custom'
  selectedSuggestionIndex?: number
  userModification?: string
}

/** Response from clarifying.submitAnswer */
export interface SubmitAnswerResponse {
  success: boolean
  canProceed: boolean
}

/** Input for clarifying.submitMultipleAnswers */
export interface SubmitMultipleAnswersInput {
  submissions: Array<{
    questionId: string
    answer: string
    answerSource: 'suggested' | 'modified' | 'custom'
    selectedSuggestionIndex?: number
  }>
}

/** Response from clarifying.submitMultipleAnswers */
export interface SubmitMultipleAnswersResponse {
  successCount: number
  failedIds: string[]
  canProceed: boolean
}

/** Input for clarifying.skipQuestion */
export interface SkipQuestionInput {
  questionId: string
}

/** Response from clarifying.skipQuestion */
export interface SkipQuestionResponse {
  success: boolean
}

/** Input for clarifying.approveAndProceed */
export interface ApproveAndProceedInput {
  courseId: string
}

/** Response from clarifying.approveAndProceed */
export interface ApproveAndProceedResponse {
  success: boolean
  jobId: string
}

// ============================================================================
// Query Keys Factory
// ============================================================================

/**
 * Available clarifying procedures for type-safe query keys.
 * Adding new procedures requires updating this union type.
 */
export type ClarifyingProcedure = 'isEnabled' | 'questions' | 'progress'

/**
 * Type for clarifying query keys.
 * Ensures consistent key structure across the application.
 */
export type ClarifyingQueryKey =
  | readonly ['clarifying']
  | readonly ['clarifying', ClarifyingProcedure, string]

/**
 * Query keys factory for clarifying procedures.
 *
 * Follows TanStack Query key factory pattern for consistent cache management.
 * Keys are hierarchical, enabling bulk invalidation:
 * - `clarifyingKeys.all` - invalidates ALL clarifying queries
 * - `clarifyingKeys.progress(courseId)` - invalidates specific query
 *
 * @see https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
 *
 * @example
 * ```ts
 * // Invalidate all clarifying queries
 * queryClient.invalidateQueries({ queryKey: clarifyingKeys.all })
 *
 * // Invalidate specific progress query
 * queryClient.invalidateQueries({ queryKey: clarifyingKeys.progress(courseId) })
 * ```
 */
export const clarifyingKeys = {
  /** Base key for all clarifying queries */
  all: ['clarifying'] as const,

  /**
   * Creates query key for isEnabled procedure.
   * @param courseId - Course ID to check clarifying status
   */
  isEnabled: (courseId: string): ClarifyingQueryKey =>
    [...clarifyingKeys.all, 'isEnabled', courseId] as const,

  /**
   * Creates query key for questions procedure.
   * @param courseId - Course ID to fetch questions for
   */
  questions: (courseId: string): ClarifyingQueryKey =>
    [...clarifyingKeys.all, 'questions', courseId] as const,

  /**
   * Creates query key for progress procedure.
   * @param courseId - Course ID to fetch progress for
   */
  progress: (courseId: string): ClarifyingQueryKey =>
    [...clarifyingKeys.all, 'progress', courseId] as const,
} as const

// ============================================================================
// HTTP Utilities
// ============================================================================

/**
 * Fetch with exponential backoff retry for 5xx errors
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // Retry only on 5xx errors (server errors)
      if (response.ok || response.status < 500) {
        return response
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (error) {
      // Network errors, timeouts, etc.
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    // Exponential backoff: 1s, 2s, 4s (max 5s)
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw lastError || new Error('Fetch failed after retries')
}

/**
 * Get CSRF token from meta tag or cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null

  // Try meta tag first (preferred method)
  const metaTag = document.querySelector('meta[name="csrf-token"]')
  if (metaTag) {
    return metaTag.getAttribute('content')
  }

  // Fallback to cookie
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'csrf-token' || name === '_csrf') {
      return decodeURIComponent(value)
    }
  }

  return null
}

/**
 * Build headers with CSRF protection and Authorization
 */
async function buildHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const csrfToken = getCsrfToken()
  if (csrfToken !== null && csrfToken !== '') {
    headers['X-CSRF-Token'] = csrfToken
  }

  // Add Authorization header with Supabase access token
  try {
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
  } catch {
    // Ignore errors - request will proceed without auth
  }

  return headers
}

// ============================================================================
// Fetch Functions (for TanStack Query)
// ============================================================================

async function fetchClarifyingIsEnabled(courseId: string): Promise<ClarifyingIsEnabledResponse> {
  const response = await fetchWithRetry(
    `${BACKEND_URL}/trpc/clarifying.isEnabled?input=${encodeURIComponent(JSON.stringify({ courseId }))}`,
    {
      credentials: 'include',
      headers: await buildHeaders(),
    }
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

async function fetchClarifyingQuestions(courseId: string): Promise<ClarifyingQuestionsResponse> {
  const response = await fetchWithRetry(
    `${BACKEND_URL}/trpc/clarifying.getQuestions?input=${encodeURIComponent(JSON.stringify({ courseId }))}`,
    {
      credentials: 'include',
      headers: await buildHeaders(),
    }
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

async function fetchClarifyingProgress(courseId: string): Promise<ClarifyingProgressResponse> {
  const response = await fetchWithRetry(
    `${BACKEND_URL}/trpc/clarifying.getProgress?input=${encodeURIComponent(JSON.stringify({ courseId }))}`,
    {
      credentials: 'include',
      headers: await buildHeaders(),
    }
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResponse> {
  const response = await fetchWithRetry(`${BACKEND_URL}/trpc/clarifying.submitAnswer`, {
    method: 'POST',
    headers: await buildHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

async function submitMultipleAnswers(
  input: SubmitMultipleAnswersInput
): Promise<SubmitMultipleAnswersResponse> {
  const response = await fetchWithRetry(`${BACKEND_URL}/trpc/clarifying.submitMultipleAnswers`, {
    method: 'POST',
    headers: await buildHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

async function skipQuestion(input: SkipQuestionInput): Promise<SkipQuestionResponse> {
  const response = await fetchWithRetry(`${BACKEND_URL}/trpc/clarifying.skipQuestion`, {
    method: 'POST',
    headers: await buildHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

async function approveAndProceed(
  input: ApproveAndProceedInput
): Promise<ApproveAndProceedResponse> {
  const response = await fetchWithRetry(`${BACKEND_URL}/trpc/clarifying.approveAndProceed`, {
    method: 'POST',
    headers: await buildHeaders(),
    credentials: 'include',
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const result = await response.json()
  return result?.result?.data ?? result
}

// ============================================================================
// TanStack Query Hooks
// ============================================================================

/**
 * Hook to check if clarifying is enabled for a course.
 *
 * Returns whether the clarifying feature is enabled for the given course.
 * Use this before fetching questions or progress to avoid unnecessary API calls.
 *
 * @param courseId - The course ID to check clarifying status for
 * @param options - Additional TanStack Query options (enabled, staleTime, etc.)
 * @returns Query result with `enabled` boolean and loading/error states
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useClarifyingIsEnabled(courseId, {
 *   enabled: isAtStage4OrBeyond,
 *   staleTime: Infinity, // Config doesn't change
 * })
 *
 * if (data?.enabled) {
 *   // Show clarifying panel
 * }
 * ```
 */
export function useClarifyingIsEnabled(
  courseId: string,
  options?: Omit<UseQueryOptions<ClarifyingIsEnabledResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: clarifyingKeys.isEnabled(courseId),
    queryFn: () => fetchClarifyingIsEnabled(courseId),
    ...options,
  })
}

/**
 * Hook to fetch clarifying questions for a course.
 *
 * Returns all clarifying questions with their current answers and status.
 * Questions are generated once and cached with `staleTime: Infinity`.
 *
 * @param courseId - The course ID to fetch questions for
 * @param options - Additional TanStack Query options (enabled, staleTime, refetchInterval, etc.)
 * @returns Query result with questions array and loading/error states
 *
 * @example
 * ```tsx
 * const { data, isLoading, refetch } = useClarifyingQuestions(courseId, {
 *   staleTime: Infinity, // Questions don't change
 *   refetchOnWindowFocus: false,
 *   // Poll until questions are generated
 *   refetchInterval: (query) => query.state.data?.questions?.length ? false : 2000,
 * })
 *
 * const questions = data?.questions ?? []
 * ```
 */
export function useClarifyingQuestions(
  courseId: string,
  options?: Omit<UseQueryOptions<ClarifyingQuestionsResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: clarifyingKeys.questions(courseId),
    queryFn: () => fetchClarifyingQuestions(courseId),
    ...options,
  })
}

/**
 * Hook to fetch clarifying progress for a course.
 *
 * Returns progress stats including total, answered, skipped counts,
 * and whether the user can proceed to the next stage.
 *
 * This hook is automatically refetched when mutations invalidate the cache,
 * ensuring all components stay in sync.
 *
 * @param courseId - The course ID to fetch progress for
 * @param options - Additional TanStack Query options (enabled, staleTime, etc.)
 * @returns Query result with progress data and loading/error states
 *
 * @example
 * ```tsx
 * const { data } = useClarifyingProgress(courseId, {
 *   enabled: clarifyingEnabled,
 *   staleTime: 5000, // Cache 5 sec to prevent rate limiting
 * })
 *
 * if (data) {
 *   console.log(`${data.answered}/${data.total} answered`)
 *   console.log(`Can proceed: ${data.canProceed}`)
 * }
 * ```
 */
export function useClarifyingProgress(
  courseId: string,
  options?: Omit<UseQueryOptions<ClarifyingProgressResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: clarifyingKeys.progress(courseId),
    queryFn: () => fetchClarifyingProgress(courseId),
    ...options,
  })
}

/**
 * Hook to submit an answer to a clarifying question.
 *
 * Automatically invalidates questions and progress cache on success,
 * which triggers refetch in all components using these queries (e.g., GraphView).
 *
 * Features:
 * - Automatic retry (2 retries with exponential backoff)
 * - Cache invalidation on success
 * - Error-safe invalidation (logs but doesn't fail mutation)
 *
 * @param courseId - Course ID for cache invalidation scope
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const submitAnswer = useSubmitAnswer(courseId)
 *
 * const handleSubmit = async () => {
 *   await submitAnswer.mutateAsync({
 *     questionId: '123',
 *     answer: 'My answer',
 *     answerSource: 'custom',
 *   })
 *   // Cache automatically invalidated, GraphView updates
 * }
 * ```
 */
export function useSubmitAnswer(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitAnswer,
    retry: 2, // Retry twice on failure (total 3 attempts)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // 1s, 2s, max 5s
    onSuccess: async () => {
      // Invalidate both questions and progress - this notifies ALL subscribers
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: clarifyingKeys.questions(courseId) }),
          queryClient.invalidateQueries({ queryKey: clarifyingKeys.progress(courseId) }),
        ])
      } catch (error) {
        // Log but don't fail mutation - data is already saved on server
        console.error('[useSubmitAnswer] Cache invalidation failed:', error)
      }
    },
  })
}

/**
 * Hook to submit multiple answers at once (batch operation).
 *
 * Use this for "Accept All Recommendations" feature to avoid rate limiting.
 * Automatically invalidates cache on success.
 *
 * @param courseId - Course ID for cache invalidation scope
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const submitMultiple = useSubmitMultipleAnswers(courseId)
 *
 * const handleAcceptAll = async () => {
 *   const result = await submitMultiple.mutateAsync({
 *     submissions: questions.map(q => ({
 *       questionId: q.id,
 *       answer: q.suggestedAnswers[0].text,
 *       answerSource: 'suggested',
 *     }))
 *   })
 *   console.log(`Saved ${result.successCount} answers`)
 * }
 * ```
 */
export function useSubmitMultipleAnswers(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitMultipleAnswers,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    onSuccess: async () => {
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: clarifyingKeys.questions(courseId) }),
          queryClient.invalidateQueries({ queryKey: clarifyingKeys.progress(courseId) }),
        ])
      } catch (error) {
        console.error('[useSubmitMultipleAnswers] Cache invalidation failed:', error)
      }
    },
  })
}

/**
 * Hook to skip a clarifying question.
 *
 * Marks the question as skipped (status changes but no answer saved).
 * Use for "nice_to_have" questions that user doesn't want to answer.
 *
 * @param courseId - Course ID for cache invalidation scope
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const skipQuestion = useSkipQuestion(courseId)
 *
 * <Button onClick={() => skipQuestion.mutate({ questionId: '123' })}>
 *   Skip
 * </Button>
 * ```
 */
export function useSkipQuestion(courseId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: skipQuestion,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    onSuccess: async () => {
      try {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: clarifyingKeys.questions(courseId) }),
          queryClient.invalidateQueries({ queryKey: clarifyingKeys.progress(courseId) }),
        ])
      } catch (error) {
        console.error('[useSkipQuestion] Cache invalidation failed:', error)
      }
    },
  })
}

/**
 * Hook to approve clarifying answers and proceed to next pipeline stage.
 *
 * Call this when user has answered all critical questions and wants to
 * continue with course generation. Triggers Stage 5 (structure generation).
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const approveAndProceed = useApproveAndProceed()
 *
 * const handleContinue = async () => {
 *   const { jobId } = await approveAndProceed.mutateAsync({ courseId })
 *   console.log('Stage 5 started, job:', jobId)
 * }
 * ```
 */
export function useApproveAndProceed() {
  return useMutation({
    mutationFn: approveAndProceed,
  })
}

/**
 * Hook to manually invalidate clarifying cache.
 *
 * Returns a stable callback that invalidates both questions and progress queries.
 * Use for polling scenarios or manual refresh triggers.
 *
 * Note: Mutations (useSubmitAnswer, etc.) automatically invalidate cache,
 * so manual invalidation is rarely needed.
 *
 * @param courseId - Course ID to invalidate cache for
 * @returns Stable async callback function for invalidation
 *
 * @example
 * ```tsx
 * const invalidate = useInvalidateClarifying(courseId)
 *
 * // Manual refresh button
 * <Button onClick={() => invalidate()}>Refresh</Button>
 *
 * // Or in useEffect for polling
 * useEffect(() => {
 *   const interval = setInterval(invalidate, 5000)
 *   return () => clearInterval(interval)
 * }, [invalidate])
 * ```
 */
export function useInvalidateClarifying(courseId: string) {
  const queryClient = useQueryClient()

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: clarifyingKeys.questions(courseId) }),
      queryClient.invalidateQueries({ queryKey: clarifyingKeys.progress(courseId) }),
    ])
  }, [queryClient, courseId])
}

// ============================================================================
// Legacy API (for backward compatibility during migration)
// ============================================================================

/**
 * @deprecated Use useClarifyingIsEnabled, useClarifyingQuestions, etc. directly
 *
 * Legacy tRPC-style API maintained for gradual migration.
 * Components should migrate to the new hooks above.
 */
export const trpc = {
  clarifying: {
    isEnabled: {
      useQuery: (
        input: { courseId: string },
        options?: { enabled?: boolean; staleTime?: number; refetchOnWindowFocus?: boolean }
      ) => {
        return useClarifyingIsEnabled(input.courseId, {
          enabled: options?.enabled,
          staleTime: options?.staleTime,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        })
      },
    },
    getQuestions: {
      useQuery: (
        input: { courseId: string },
        options?: { enabled?: boolean; staleTime?: number; refetchOnWindowFocus?: boolean }
      ) => {
        return useClarifyingQuestions(input.courseId, {
          enabled: options?.enabled,
          staleTime: options?.staleTime,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        })
      },
    },
    getProgress: {
      useQuery: (
        input: { courseId: string },
        options?: { enabled?: boolean; staleTime?: number; refetchOnWindowFocus?: boolean }
      ) => {
        return useClarifyingProgress(input.courseId, {
          enabled: options?.enabled,
          staleTime: options?.staleTime,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        })
      },
    },
    submitAnswer: {
      useMutation: () => {
        // Note: This legacy wrapper cannot auto-invalidate because courseId is not available
        // Use useSubmitAnswer(courseId) for automatic cache invalidation
        return useMutation({
          mutationFn: submitAnswer,
        })
      },
    },
    submitMultipleAnswers: {
      useMutation: () => {
        return useMutation({
          mutationFn: submitMultipleAnswers,
        })
      },
    },
    skipQuestion: {
      useMutation: () => {
        return useMutation({
          mutationFn: skipQuestion,
        })
      },
    },
    approveAndProceed: {
      useMutation: () => {
        return useApproveAndProceed()
      },
    },
  },
}

/**
 * @deprecated Use useInvalidateClarifying hook instead
 *
 * Legacy cache invalidation function.
 * This is kept for backward compatibility but does nothing in TanStack Query
 * because invalidation now requires QueryClient context.
 *
 * Components should migrate to useInvalidateClarifying hook.
 */
export function invalidateQueryCache(_procedurePath: string, _input?: unknown): void {
  // No-op in TanStack Query - use useInvalidateClarifying hook instead
  console.warn(
    '[trpc/client] invalidateQueryCache is deprecated. Use useInvalidateClarifying hook instead.'
  )
}
