import { TRPCClientError } from '@trpc/client'

/**
 * Convert tRPC or unknown errors to a plain Error for server action boundaries.
 * tRPC errors pass through with their message, unknown errors get a fallback.
 */
export function toActionError(error: unknown, fallback: string): Error {
  if (error instanceof TRPCClientError) return new Error(error.message)
  if (error instanceof Error) return error
  return new Error(fallback)
}

/**
 * Wrap raw errors into user-friendly messages.
 * Differentiates network, auth, not found, and validation errors.
 */
export function wrapError(error: unknown, context: string): Error {
  if (error instanceof TRPCClientError) {
    return new Error(error.message)
  }

  const message = error instanceof Error ? error.message : String(error)
  const lowerMessage = message.toLowerCase()

  if (
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('timeout')
  ) {
    return new Error(`Unable to connect to server. Please check your connection and try again.`)
  }

  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('401') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('403')
  ) {
    return new Error(`Session expired or insufficient permissions. Please refresh the page.`)
  }

  if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
    return new Error(`The requested ${context} was not found.`)
  }

  if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
    return new Error(message)
  }

  return new Error(`Failed to ${context}. Please try again.`)
}
