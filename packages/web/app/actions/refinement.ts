'use server'

import {
  ChatRequest,
  ChatResponse,
  chatResponseSchema,
  Proposal,
} from '@megacampus/shared-types/chat-types'
import { TRPCClientError } from '@trpc/client'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'
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

  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.getChatTokenEstimates.query({ courseId })
    return (result ?? null) as TokenEstimates | null
  } catch (error) {
    console.warn('[getChatTokenEstimates] Failed to fetch:', error)
    return null
  }
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
  try {
    const client = await getServerTrpcClient()
    // NOTE: AbortSignal cannot be passed to server actions (not serializable).
    // Abort handling is done client-side by checking controller.signal.aborted after response.
    const result = await client.generation.chat.mutate(request)

    // Validate response structure with Zod
    const parseResult = chatResponseSchema.safeParse(result)

    if (!parseResult.success) {
      console.error('[sendChatMessage] Response validation failed:', parseResult.error.issues)
      throw new Error('Received invalid response from server. Please try again.')
    }

    return parseResult.data
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const httpCode = error.data?.httpStatus
      const errorMessage =
        (httpCode && HTTP_ERROR_MESSAGES[httpCode]) ||
        error.message ||
        'Chat request failed. Please try again.'
      throw new Error(errorMessage)
    }
    if (error instanceof Error) throw error
    throw new Error('Chat request failed. Please try again.')
  }
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
  try {
    const client = await getServerTrpcClient()
    const result = await client.generation.applyProposal.mutate({
      courseId,
      conversationId,
      proposal,
    })
    return { success: result?.success ?? false }
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const httpCode = error.data?.httpStatus
      const errorMessage =
        (httpCode && HTTP_ERROR_MESSAGES[httpCode]) || error.message || 'Failed to apply changes'
      throw new Error(errorMessage)
    }
    if (error instanceof Error) throw error
    throw new Error('Failed to apply changes')
  }
}

/**
 * Fetch recent courses that have course_structure populated.
 * Used by debug pages to list available courses for testing.
 * Uses admin client (bypasses RLS) to show ALL courses regardless of owner.
 *
 * @returns Array of course summaries (id, title, generation_code, status, counts)
 */
export async function fetchRecentCourses(): Promise<
  Array<{
    id: string
    title: string
    generationCode: string
    generationStatus: string
    sectionsCount: number
    lessonsCount: number
    createdAt: string
  }>
> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  const { data: courses, error } = await supabaseAdmin
    .from('courses')
    .select('id, title, generation_code, generation_status, course_structure, created_at')
    .not('course_structure', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error || !courses) {
    return []
  }

  return courses
    .filter((c) => c.course_structure && typeof c.course_structure === 'object')
    .map((c) => {
      const structure = c.course_structure as { sections?: Array<{ lessons?: unknown[] }> }
      const sectionsCount = structure?.sections?.length ?? 0
      const lessonsCount =
        structure?.sections?.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0) ?? 0
      return {
        id: c.id,
        title: c.title ?? '',
        generationCode: c.generation_code ?? '',
        generationStatus: c.generation_status ?? '',
        sectionsCount,
        lessonsCount,
        createdAt: c.created_at ?? '',
      }
    })
}

/**
 * Fetch course structure and title for the refinement UI.
 * Returns section/lesson counts for display purposes.
 *
 * @param courseId - Course UUID
 * @returns Course title, structure, and counts, or null if not found/unauthorized
 */
export async function fetchCourseStructure(courseId: string): Promise<{
  title: string
  courseStructure: unknown
  sectionsCount: number
  lessonsCount: number
} | null> {
  // Verify user authentication
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.warn('[fetchCourseStructure] No authenticated user')
    return null
  }

  // Fetch course with structure and title
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('user_id, title, course_structure')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    console.warn('[fetchCourseStructure] Course not found', { courseId })
    return null
  }

  // Check ownership (user owns course)
  if (course.user_id !== user.id) {
    console.warn('[fetchCourseStructure] User does not own course', {
      userId: user.id,
      courseId,
      courseOwner: course.user_id,
    })
    return null
  }

  const structure = course.course_structure as { sections?: Array<{ lessons?: unknown[] }> }
  const sectionsCount = structure?.sections?.length ?? 0
  const lessonsCount =
    structure?.sections?.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0) ?? 0

  return {
    title: course.title ?? '',
    courseStructure: course.course_structure,
    sectionsCount,
    lessonsCount,
  }
}

/**
 * Debug version of fetchCourseStructure — bypasses RLS/ownership check.
 * Used only by debug pages to load any course regardless of owner.
 */
export async function fetchCourseStructureAdmin(courseId: string): Promise<{
  title: string
  courseStructure: unknown
  sectionsCount: number
  lessonsCount: number
} | null> {
  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('title, course_structure')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    console.warn('[fetchCourseStructureAdmin] Course not found', { courseId })
    return null
  }

  const structure = course.course_structure as { sections?: Array<{ lessons?: unknown[] }> }
  const sectionsCount = structure?.sections?.length ?? 0
  const lessonsCount =
    structure?.sections?.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0) ?? 0

  return {
    title: course.title ?? '',
    courseStructure: course.course_structure,
    sectionsCount,
    lessonsCount,
  }
}
