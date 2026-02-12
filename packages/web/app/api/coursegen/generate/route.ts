/**
 * POST /api/coursegen/generate
 *
 * Calls tRPC generation.initiate via type-safe server caller.
 * All business logic is in packages/course-gen-platform/src/server/routers/generation.ts
 *
 * This endpoint serves as a compatibility layer for existing API consumers.
 * New integrations should use the tRPC endpoint directly for type safety.
 *
 * @module api/coursegen/generate
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

/**
 * POST handler for course generation
 *
 * This is a thin proxy that:
 * 1. Validates authentication
 * 2. Calls tRPC generation.initiate via type-safe client
 * 3. Returns formatted response
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
      logger.warn('Unauthorized access attempt to /api/coursegen/generate', {
        error: authError?.message,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      })
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    let body
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

    logger.info('Calling generation.initiate via tRPC client', {
      userId: user.id,
      courseId: body.courseId,
    })

    // Call tRPC via type-safe server caller (uses httpBatchLink with correct wire format)
    const client = await getServerTrpcClient()
    const result = await client.generation.initiate.mutate(body)

    logger.info('Course generation initiated successfully', {
      userId: user.id,
      courseId: body.courseId,
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

      logger.error('tRPC generation.initiate failed', {
        userId,
        courseId: undefined,
        code: error.data?.code,
        message: error.message,
        httpStatus,
      })

      return NextResponse.json(
        { error: error.message, code: error.data?.code || 'BAD_REQUEST' },
        { status: httpStatus }
      )
    }

    logger.error('Unexpected error in /api/coursegen/generate', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      user_id: userId,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_GENERATE',
      metadata: {
        route: '/api/coursegen/generate',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
