/**
 * POST /api/courses/[orgSlug]/[courseSlug]/restart-stage
 *
 * Restarts course generation from a specific stage.
 * Calls tRPC generation.restartStage via type-safe server caller.
 *
 * @module api/courses/[orgSlug]/[courseSlug]/restart-stage
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'

interface RestartStageInput {
  stageNumber: number
}

interface RouteContext {
  params: Promise<{ orgSlug: string; courseSlug: string }>
}

/**
 * POST handler for stage restart
 *
 * Input:
 * - stageNumber: Stage to restart from (2-6)
 *
 * Output:
 * - success: boolean
 * - jobId?: string
 * - previousStatus?: string
 * - newStatus?: string
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  let userId: string | undefined

  try {
    const { orgSlug, courseSlug } = await params
    const supabase = await createClient()

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized access attempt to restart-stage', {
        error: authError?.message,
        orgSlug,
        courseSlug,
      })
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    // Get course with organization validation
    const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
    if (!courseData) {
      logger.warn('Course not found for restart-stage', {
        orgSlug,
        courseSlug,
        userId: user.id,
      })
      return NextResponse.json({ error: 'Course not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Check ownership
    if (courseData.user_id !== user.id) {
      logger.warn('Unauthorized restart-stage attempt - wrong owner', {
        orgSlug,
        courseSlug,
        attemptedBy: user.id,
        owner: courseData.user_id,
      })
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }

    // Parse request body
    let body: RestartStageInput
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Validate stageNumber
    const { stageNumber } = body
    if (typeof stageNumber !== 'number' || stageNumber < 2 || stageNumber > 6) {
      return NextResponse.json(
        { error: 'Invalid stage number. Must be between 2 and 6.', code: 'INVALID_STAGE' },
        { status: 400 }
      )
    }

    logger.info('Calling generation.restartStage via tRPC client', {
      userId: user.id,
      courseId: courseData.id,
      stageNumber,
    })

    // Call tRPC via type-safe server caller (uses httpBatchLink with correct wire format)
    const client = await getServerTrpcClient()
    const result = await client.generation.restartStage.mutate({
      courseId: courseData.id,
      stageNumber,
    })

    logger.info('Stage restart initiated successfully', {
      userId: user.id,
      courseId: courseData.id,
      stageNumber,
      previousStatus: result?.previousStatus,
      newStatus: result?.newStatus,
    })

    // Return tRPC result data (spread first, then override success to ensure it's true)
    return NextResponse.json({
      ...result,
      success: true,
    })
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

      logger.error('tRPC generation.restartStage failed', {
        userId,
        code: error.data?.code,
        message: error.message,
        httpStatus,
      })

      return NextResponse.json(
        {
          error: error.message || 'Failed to restart stage',
          code: error.data?.code || 'INTERNAL_ERROR',
        },
        { status: httpStatus }
      )
    }

    logger.error('Unexpected error in restart-stage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      user_id: userId,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'RESTART_STAGE',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]/restart-stage',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
