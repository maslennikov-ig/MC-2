/**
 * GET /api/coursegen/lesson-content
 *
 * Calls tRPC lessonContent.getLessonContent via type-safe server caller.
 * Retrieves generated lesson content from lesson_contents table.
 *
 * @module api/coursegen/lesson-content
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

/**
 * GET handler for fetching lesson content
 *
 * Query params:
 * - courseId: Course UUID
 * - lessonId: Lesson ID in format "section.lesson" (e.g., "1.2") or lesson UUID
 *
 * This is a thin proxy that:
 * 1. Validates authentication
 * 2. Validates required parameters
 * 3. Calls tRPC lessonContent.getLessonContent via type-safe client
 * 4. Returns formatted response
 */
export async function GET(request: NextRequest) {
  let userId: string | undefined

  try {
    // Secure auth check using getUser() to verify with Supabase Auth server
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/lesson-content', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      })
      return NextResponse.json(
        { error: 'Требуется авторизация', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    // Parse query params
    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId')
    const lessonId = searchParams.get('lessonId')

    // Validate required fields
    if (!courseId) {
      logger.warn('Missing courseId in lesson-content request', { userId: user.id })
      return NextResponse.json(
        { error: 'courseId обязателен', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    if (!lessonId) {
      logger.warn('Missing lessonId in lesson-content request', {
        userId: user.id,
        courseId,
      })
      return NextResponse.json(
        { error: 'lessonId обязателен', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    logger.debug('Fetching lesson content via tRPC client', {
      userId: user.id,
      courseId,
      lessonId,
    })

    // Call tRPC via type-safe server caller (uses httpBatchLink with correct wire format)
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.getLessonContent.query({ courseId, lessonId })

    const contentFound = !!result
    logger.debug('Lesson content fetched', {
      userId: user.id,
      courseId,
      lessonId,
      found: contentFound,
    })

    // Wrap in tRPC-compatible response shape for frontend compatibility
    return NextResponse.json({ result: { data: result } })
  } catch (error) {
    // Handle tRPC errors with proper HTTP status codes
    if (error instanceof TRPCClientError) {
      const statusMap: Record<string, number> = {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        TOO_MANY_REQUESTS: 429,
        BAD_REQUEST: 400,
        INTERNAL_SERVER_ERROR: 500,
      }
      const httpStatus = error.data?.httpStatus || statusMap[error.data?.code] || 500

      logger.error('tRPC lessonContent.getLessonContent failed', {
        userId,
        code: error.data?.code,
        message: error.message,
        httpStatus,
      })

      return NextResponse.json(
        { error: error.message, code: error.data?.code || 'BAD_REQUEST' },
        { status: httpStatus }
      )
    }

    logger.error('Unexpected error in /api/coursegen/lesson-content', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      user_id: userId,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'LESSON_CONTENT',
      metadata: {
        route: '/api/coursegen/lesson-content',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
