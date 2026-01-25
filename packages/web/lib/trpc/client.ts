/**
 * tRPC Client for Web Frontend
 *
 * Minimal tRPC client implementation for clarifying router.
 * Uses native fetch with React hooks for data fetching.
 *
 * Security Features:
 * - CSRF protection via X-CSRF-Token header
 * - Credentials included for session auth
 *
 * TODO: Replace with proper @trpc/react-query setup when package is installed.
 */

'use client'

import React from 'react'
import { BACKEND_URL } from '@/lib/env-client'

/**
 * Get CSRF token from meta tag or cookie
 * The token should be set by the server in a meta tag or cookie
 */
/**
 * Fetch with exponential backoff retry for 5xx errors
 * @param url - Fetch URL
 * @param options - Fetch options
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Response object
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
 * The token should be set by the server in a meta tag or cookie
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
 * Build headers with CSRF protection
 */
function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const csrfToken = getCsrfToken()
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  return headers
}

/**
 * React Query-like hook types
 */
type UseQueryResult<TData> = {
  data: TData | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

type UseMutationResult<TData, TVariables> = {
  mutateAsync: (variables: TVariables) => Promise<TData>
  mutate: (variables: TVariables) => void
  isPending: boolean
  isLoading: boolean
  error: Error | null
}

/**
 * Create a minimal useQuery hook implementation
 */
function createUseQuery<TInput, TOutput>(
  procedurePath: string
): (input: TInput) => UseQueryResult<TOutput> {
  return (input: TInput) => {
    const [data, setData] = React.useState<TOutput | undefined>(undefined)
    const [isLoading, setIsLoading] = React.useState(true)
    const [error, setError] = React.useState<Error | null>(null)

    const fetchData = React.useCallback(async () => {
      try {
        setIsLoading(true)
        const response = await fetchWithRetry(
          `${BACKEND_URL}/trpc/${procedurePath}?input=${encodeURIComponent(JSON.stringify(input))}`,
          {
            credentials: 'include',
            headers: buildHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json()

        // tRPC wraps response in { result: { data: ... } }
        const unwrappedData = result?.result?.data ?? result
        setData(unwrappedData)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setIsLoading(false)
      }
    }, [input])

    React.useEffect(() => {
      void fetchData()
    }, [fetchData])

    return {
      data,
      isLoading,
      error,
      refetch: fetchData,
    }
  }
}

/**
 * Create a minimal useMutation hook implementation
 */
function createUseMutation<TInput, TOutput>(
  procedurePath: string
): () => UseMutationResult<TOutput, TInput> {
  return () => {
    const [isPending, setIsPending] = React.useState(false)
    const [error, setError] = React.useState<Error | null>(null)

    const mutateAsync = React.useCallback(
      async (variables: TInput) => {
        try {
          setIsPending(true)
          setError(null)

          const response = await fetchWithRetry(`${BACKEND_URL}/trpc/${procedurePath}`, {
            method: 'POST',
            headers: buildHeaders(),
            credentials: 'include',
            body: JSON.stringify(variables),
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const result = await response.json()

          // tRPC wraps response in { result: { data: ... } }
          const unwrappedData = result?.result?.data ?? result
          return unwrappedData
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          setError(error)
          throw error
        } finally {
          setIsPending(false)
        }
      },
      [procedurePath]
    )

    const mutate = React.useCallback(
      (variables: TInput) => {
        void mutateAsync(variables)
      },
      [mutateAsync]
    )

    return {
      mutateAsync,
      mutate,
      isPending,
      isLoading: isPending,
      error,
    }
  }
}

/**
 * tRPC React Client
 *
 * Minimal implementation for clarifying router.
 */
export const trpc = {
  clarifying: {
    getQuestions: {
      useQuery: createUseQuery<
        { courseId: string },
        {
          questions: Array<{
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
          }>
        }
      >('clarifying.getQuestions'),
    },
    submitAnswer: {
      useMutation: createUseMutation<
        {
          questionId: string
          answer: string
          answerSource: 'suggested' | 'modified' | 'custom'
          selectedSuggestionIndex?: number
          userModification?: string
        },
        { success: boolean; canProceed: boolean }
      >('clarifying.submitAnswer'),
    },
    skipQuestion: {
      useMutation: createUseMutation<{ questionId: string }, { success: boolean }>(
        'clarifying.skipQuestion'
      ),
    },
    approveAndProceed: {
      useMutation: createUseMutation<{ courseId: string }, { success: boolean; jobId: string }>(
        'clarifying.approveAndProceed'
      ),
    },
  },
}
