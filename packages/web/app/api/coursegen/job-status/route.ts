/**
 * GET /api/coursegen/job-status?jobId=<id>
 *
 * Calls tRPC jobs.getStatus via type-safe server caller.
 * Returns the status of a generation job.
 *
 * @module api/coursegen/job-status
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TRPCClientError } from '@trpc/client'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getServerTrpcClient } from '@/lib/trpc/server-caller'

/**
 * GET handler for job status query
 *
 * Query params:
 * - jobId: BullMQ job ID (required)
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
      return NextResponse.json(
        { error: 'Requires authorization', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    userId = user.id

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    // Call tRPC via type-safe server caller (uses httpBatchLink with correct wire format)
    const client = await getServerTrpcClient()
    const result = await client.jobs.getStatus.query({ jobId })

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

      logger.error('tRPC jobs.getStatus failed', {
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

    logger.error('Unexpected error in /api/coursegen/job-status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      user_id: userId,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'JOB_STATUS',
      metadata: {
        route: '/api/coursegen/job-status',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
