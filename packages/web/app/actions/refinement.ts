'use server'

import { ChatRequest, ChatResponse, chatResponseSchema } from '@megacampus/shared-types/chat-types'
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth'

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
 * Submit a chat request to the backend.
 * Connects to trpc.generation.chat endpoint.
 *
 * Features:
 * - Response validation with Zod schema
 * - Context-aware error messages based on HTTP status
 * - AbortController support for request cancellation
 *
 * @param request - Chat request payload
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Validated chat response
 * @throws Error with user-friendly message on failure
 */
export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const headers = await getBackendAuthHeaders()

  const response = await fetch(`${TRPC_URL}/generation.chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal,
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
