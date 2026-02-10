import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger, logPermanentFailure } from '@/lib/logger'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'
import crypto from 'crypto'

interface RouteContext {
  params: Promise<{ orgSlug: string; courseSlug: string }>
}

/**
 * POST handler to cancel a course generation
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { orgSlug, courseSlug } = await params

    if (!orgSlug || !courseSlug) {
      return NextResponse.json(
        { error: 'Organization slug and course slug are required' },
        { status: 400 }
      )
    }

    // Get Supabase client with user context
    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized cancel attempt', { orgSlug, courseSlug })
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch course with organization validation
    const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
    if (!courseData) {
      logger.error('Course not found for cancellation', { orgSlug, courseSlug })
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Verify ownership
    if (courseData.user_id !== user.id) {
      logger.warn('Unauthorized cancel attempt - wrong owner', {
        orgSlug,
        courseSlug,
        attemptedBy: user.id,
        owner: courseData.user_id,
      })
      return NextResponse.json(
        { error: 'You do not have permission to cancel this course' },
        { status: 403 }
      )
    }

    // Check if cancellation is allowed based on status
    // Extended to support all generation stages including Stage 6 lesson generation
    const cancellableStatuses = [
      // Legacy statuses
      'generating',
      'processing_documents',
      'document_processing',
      'generating_structure',
      // New FSM-based statuses (all active stages can be cancelled)
      'pending',
      'stage_2_init',
      'stage_2_processing',
      'stage_3_init',
      'stage_3_summarizing',
      'stage_4_init',
      'stage_4_analyzing',
      'stage_5_init',
      'stage_5_generating',
      'stage_6_init',
      'stage_6_generating',
      'finalizing',
    ]

    const courseStatus = courseData.status || ''

    if (!cancellableStatuses.includes(courseStatus)) {
      logger.info('Cancel rejected - course in terminal or non-cancellable state', {
        orgSlug,
        courseSlug,
        status: courseData.status,
      })
      return NextResponse.json(
        {
          error: 'Cannot cancel at this stage',
          message:
            'The course is either completed, already cancelled, or in a state that cannot be cancelled.',
          currentStatus: courseData.status,
        },
        { status: 400 }
      )
    }

    // Check if already cancelled or completed
    if (['cancelled', 'completed', 'failed'].includes(courseStatus)) {
      return NextResponse.json(
        {
          error: 'Course is already in a final state',
          currentStatus: courseData.status,
        },
        { status: 400 }
      )
    }

    // Update course generation_status to cancelled
    const { error: updateError } = await supabase
      .from('courses')
      .update({
        generation_status: 'cancelled',
        error_message: 'Cancelled by user',
        generation_completed_at: new Date().toISOString(),
        // Update the generation progress to reflect cancellation
        last_progress_update: new Date().toISOString(),
      })
      .eq('id', courseData.id)

    if (updateError) {
      logger.error('Failed to update course status to cancelled', {
        error: updateError,
        orgSlug,
        courseSlug,
      })

      // Log to error_logs for admin visibility
      logPermanentFailure({
        user_id: user.id,
        error_message: `Failed to cancel course: ${updateError.message}`,
        severity: 'ERROR',
        job_type: 'COURSE_CANCEL',
        metadata: {
          route: '/api/courses/[orgSlug]/[courseSlug]/cancel',
          courseId: courseData.id,
          orgSlug,
          courseSlug,
        },
      }).catch((e) => console.error('Log write failed:', e.message))

      return NextResponse.json({ error: 'Failed to cancel course generation' }, { status: 500 })
    }

    // Send cancellation signal to n8n workflow if configured
    const cancelWebhookUrl = process.env.N8N_CANCEL_WEBHOOK_URL
    if (cancelWebhookUrl) {
      try {
        const webhookSecret = process.env.N8N_WEBHOOK_SECRET
        if (webhookSecret) {
          const payload = {
            courseId: courseData.id,
            userId: user.id,
            action: 'cancel',
            timestamp: new Date().toISOString(),
          }

          const payloadString = JSON.stringify(payload)
          const signature = crypto
            .createHmac('sha256', webhookSecret)
            .update(payloadString)
            .digest('hex')

          await fetch(cancelWebhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-webhook-signature': signature,
              'X-Course-ID': courseData.id,
            },
            body: payloadString,
            signal: AbortSignal.timeout(3000), // 3 second timeout for cancellation
          }).catch((err) => {
            // Log but don't fail the cancellation if webhook fails
            logger.warn('Failed to send cancellation webhook', {
              error: err,
              courseId: courseData.id,
              orgSlug,
              courseSlug,
            })
          })
        }
      } catch (webhookError) {
        // Log but don't fail the overall cancellation
        logger.warn('Error sending cancellation webhook', {
          error: webhookError,
          courseId: courseData.id,
          orgSlug,
          courseSlug,
        })
      }
    } else {
      // Log that cancellation webhook is not configured
      logger.info('N8N cancellation webhook not configured, skipping workflow cancellation', {
        courseId: courseData.id,
        orgSlug,
        courseSlug,
      })
    }

    logger.info('Course generation cancelled successfully', {
      orgSlug,
      courseSlug,
      userId: user.id,
      previousStatus: courseStatus,
    })

    return NextResponse.json({
      success: true,
      message: 'Course generation has been cancelled',
      slug: courseData.slug,
    })
  } catch (error) {
    const { orgSlug, courseSlug } = await params
    logger.error('Unexpected error in cancel endpoint', {
      error,
      orgSlug,
      courseSlug,
    })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_CANCEL',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]/cancel',
        orgSlug,
        courseSlug,
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json(
      { error: 'An unexpected error occurred while cancelling the course' },
      { status: 500 }
    )
  }
}

/**
 * GET handler to check if a course can be cancelled
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { orgSlug, courseSlug } = await params

    if (!orgSlug || !courseSlug) {
      return NextResponse.json(
        { error: 'Organization slug and course slug are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch course with organization validation
    const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
    if (!courseData) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Check ownership
    if (courseData.user_id !== user.id) {
      return NextResponse.json({ canCancel: false, reason: 'Not the owner' }, { status: 403 })
    }

    // Check if cancellable - extended to support all stages
    const cancellableStatuses = [
      // Legacy statuses
      'generating',
      'processing_documents',
      'document_processing',
      'generating_structure',
      // New FSM-based statuses
      'pending',
      'stage_2_init',
      'stage_2_processing',
      'stage_3_init',
      'stage_3_summarizing',
      'stage_4_init',
      'stage_4_analyzing',
      'stage_5_init',
      'stage_5_generating',
      'stage_6_init',
      'stage_6_generating',
      'finalizing',
    ]

    const courseStatus = courseData.status || ''
    const canCancel = cancellableStatuses.includes(courseStatus)

    return NextResponse.json({
      canCancel,
      currentStatus: courseStatus,
      reason: canCancel ? null : 'Course generation has progressed too far',
    })
  } catch (error) {
    const { orgSlug, courseSlug } = await params
    logger.error('Error checking cancel status', { error, orgSlug, courseSlug })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'COURSE_CANCEL_CHECK',
      metadata: {
        route: '/api/courses/[orgSlug]/[courseSlug]/cancel',
        orgSlug,
        courseSlug,
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((e) => console.error('Log write failed:', e.message))

    return NextResponse.json({ error: 'Failed to check cancel status' }, { status: 500 })
  }
}
