'use server'

import {
  ChatRequest,
  ChatResponse,
  chatResponseSchema,
  Proposal,
} from '@megacampus/shared-types/chat-types'
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * HTTP status code to user-friendly error message mapping.
 * Provides context-aware messages for chat-specific errors.
 */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your message and try again.',
  401: 'Session expired. Please refresh the page and sign in again.',
  403: 'You do not have permission to chat about this course.',
  404: 'Course not found. It may have been deleted.',
  429: 'Too many requests. Please wait a moment before trying again.',
  500: 'Server error. Our team has been notified.',
  502: 'Service temporarily unavailable. Please try again in a moment.',
  503: 'Service is under maintenance. Please try again later.',
}

/**
 * Token estimates response for chat intent modes.
 */
export interface TokenEstimates {
  refine: {
    tokens: number
    formatted: string
  }
  regenerate: {
    tokens: number
    formatted: string
  }
}

/**
 * Fetch token estimates for chat intents (refine vs regenerate).
 * Used to show users estimated token cost before sending.
 *
 * @param courseId - Course UUID
 * @returns Token estimates for both intent modes
 */
export async function getChatTokenEstimates(courseId: string): Promise<TokenEstimates | null> {
  // Verify user authentication
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.warn('[getChatTokenEstimates] No authenticated user')
    return null
  }

  // Verify user has access to this course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('user_id')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    console.warn('[getChatTokenEstimates] Course not found or access denied', { courseId })
    return null
  }

  // Check ownership (user owns course)
  if (course.user_id !== user.id) {
    console.warn('[getChatTokenEstimates] User does not own course', {
      userId: user.id,
      courseId,
      courseOwner: course.user_id,
    })
    return null
  }

  const headers = await getBackendAuthHeaders()

  const response = await fetch(
    `${TRPC_URL}/generation.getChatTokenEstimates?input=${encodeURIComponent(JSON.stringify({ courseId }))}`,
    {
      method: 'GET',
      headers,
    }
  )

  if (!response.ok) {
    console.warn('[getChatTokenEstimates] Failed to fetch:', response.status)
    return null
  }

  const data = await response.json()
  const result = data?.result?.data

  if (!result) {
    return null
  }

  return result as TokenEstimates
}

/**
 * Submit a chat request to the backend.
 * Connects to trpc.generation.chat endpoint.
 *
 * Features:
 * - Response validation with Zod schema
 * - Context-aware error messages based on HTTP status
 *
 * @param request - Chat request payload
 * @returns Validated chat response
 * @throws Error with user-friendly message on failure
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const headers = await getBackendAuthHeaders()

  // NOTE: AbortSignal cannot be passed to server actions (not serializable).
  // Abort handling is done client-side by checking controller.signal.aborted after response.
  const response = await fetch(`${TRPC_URL}/generation.chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorMessage =
      HTTP_ERROR_MESSAGES[response.status] ||
      `Chat request failed (${response.status}). Please try again.`
    throw new Error(errorMessage)
  }

  const data = await response.json()
  const result = data?.result?.data || data

  // Validate response structure with Zod
  const parseResult = chatResponseSchema.safeParse(result)

  if (!parseResult.success) {
    console.error('[sendChatMessage] Response validation failed:', parseResult.error.issues)
    throw new Error('Received invalid response from server. Please try again.')
  }

  return parseResult.data
}

/**
 * Apply a proposal (Confirm-then-Apply flow).
 * Submits the accepted proposal to the backend for execution.
 *
 * @param courseId - Course UUID
 * @param conversationId - Conversation UUID for context
 * @param proposal - Proposal to apply
 * @returns Success status
 * @throws Error with user-friendly message on failure
 */
export async function applyProposal(
  courseId: string,
  conversationId: string,
  proposal: Proposal
): Promise<{ success: boolean }> {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.applyProposal`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, conversationId, proposal }),
  })

  if (!response.ok) {
    const errorMessage = HTTP_ERROR_MESSAGES[response.status] || 'Failed to apply changes'
    throw new Error(errorMessage)
  }

  const data = await response.json()
  return { success: data?.result?.data?.success ?? false }
}
