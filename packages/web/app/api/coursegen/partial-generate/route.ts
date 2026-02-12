/**
 * POST /api/coursegen/partial-generate
 *
 * Calls tRPC lessonContent.partialGenerate via type-safe server caller.
 * Enables partial generation of specific lessons or sections.
 *
 * @module api/coursegen/partial-generate
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

interface PartialGenerateRequest {
  courseId: string // Course UUID
  lessonIds?: string[] // ["1.1", "1.2", "2.1"]
  sectionIds?: number[] // [1, 2, 3]
  priority?: number // 1-10, default 5
}

/**
 * POST handler for partial course generation
 *
 * 1. Validates authentication (friendly error messages)
 * 2. Validates required parameters
 * 3. Calls tRPC via type-safe getServerTrpcClient()
 * 4. Returns formatted response
 */
export async function POST(request: NextRequest) {
  let userId: string | undefined

  try {
    // Secure auth check using getUser() to verify with Supabase Auth server
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to /api/coursegen/partial-generate', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      })
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    let body: PartialGenerateRequest
    try {
      body = await request.json()
    } catch (parseError) {
      logger.error('Failed to parse request body', {
        userId: user.id,
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
      })
      return NextResponse.json(
        { error: 'Invalid request format', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.courseId) {
      return NextResponse.json(
        { error: 'courseId обязателен', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    if (!body.lessonIds?.length && !body.sectionIds?.length) {
      return NextResponse.json(
        { error: 'Укажите lessonIds или sectionIds', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    logger.info('Calling lessonContent.partialGenerate via tRPC client', {
      userId: user.id,
      courseId: body.courseId,
      lessonIds: body.lessonIds,
      sectionIds: body.sectionIds,
      priority: body.priority,
    })

    // Call tRPC via type-safe server caller (uses httpBatchLink with correct wire format)
    const client = await getServerTrpcClient()
    const result = await client.lessonContent.partialGenerate.mutate({
      courseId: body.courseId,
      lessonIds: body.lessonIds,
      sectionIds: body.sectionIds,
      priority: body.priority ?? 5,
    })

    logger.info('Partial generation initiated successfully', {
      userId: user.id,
      courseId: body.courseId,
      jobCount: result.jobCount,
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

      logger.error('tRPC lessonContent.partialGenerate failed', {
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

    logger.error('Unexpected error in /api/coursegen/partial-generate', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    logPermanentFailure({
      user_id: userId,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'PARTIAL_GENERATE',
      metadata: {
        route: '/api/coursegen/partial-generate',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
