import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase/client-factory'
import { withAuth, AuthUser } from '@/lib/auth'
import { logger, logPermanentFailure } from '@/lib/logger'
import { validateWebhookUrl } from '@/lib/validate-webhook-url'
import type { Json } from '@/types/database.generated'

async function handleContentGeneration(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json()

    const {
      webhook,
      courseId,
      lessonId,
      lessonNumber,
      lessonTitle,
      sectionId,
      formatId,
      language = 'ru',
    } = body

    logger.info('Content generation request', {
      webhook,
      courseId,
      lessonId,
      formatId,
      userId: user?.id,
    })

    // Validate required fields
    if (!webhook || !courseId || !lessonId) {
      logger.error('Missing required fields', { webhook, courseId, lessonId })
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use admin client for server operations
    const supabase = getAdminClient()

    // Get lesson content from database
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .single()

    if (lessonError || !lesson) {
      logger.error('Lesson not found', { lessonId, lessonError })
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    }

    // Get course information
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('title, course_description, style, target_audience')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      logger.error('Course not found', { courseId, courseError })
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Prepare webhook payload (with safe fallbacks for testing)
    const webhookPayload = {
      courseId,
      courseTitle: course?.title || 'Test Course',
      courseDescription: course?.course_description || 'Test Description',
      lessonId,
      lessonNumber: lessonNumber || lesson?.order_index || 1,
      lessonTitle: lessonTitle || lesson?.title || 'Test Lesson',
      lessonContent: 'Test content for webhook testing', // Content is in lesson_contents table, not lessons
      lessonObjectives: lesson?.objectives || [],
      lessonDuration: lesson?.duration_minutes || 5,
      sectionId,
      formatId,
      language,
      timestamp: new Date().toISOString(),
      metadata: {
        courseStyle: course?.style || 'academic',
        targetAudience: course?.target_audience || 'general',
      },
    }

    logger.info('Sending webhook request', { url: webhook })

    // Validate webhook URL against allowlist
    const allowedWebhookHosts = (process.env.ALLOWED_WEBHOOK_HOSTS || '').split(',').filter(Boolean)
    let webhookUrl: URL
    try {
      webhookUrl = new URL(webhook)
    } catch {
      return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
    }

    if (allowedWebhookHosts.length === 0) {
      logger.error('ALLOWED_WEBHOOK_HOSTS not configured, denying webhook request')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
    }
    if (!allowedWebhookHosts.includes(webhookUrl.host)) {
      logger.warn('Webhook URL not in allowlist', { host: webhookUrl.host, allowedWebhookHosts })
      return NextResponse.json({ error: 'Webhook URL not allowed' }, { status: 403 })
    }

    // Validate webhook URL does not resolve to private IP addresses (SSRF protection)
    const ipValidation = await validateWebhookUrl(webhook)
    if (!ipValidation.valid) {
      logger.warn('Webhook URL failed IP validation', {
        webhookUrl: webhook,
        error: ipValidation.error
      })
      return NextResponse.json({
        error: 'Webhook URL validation failed',
        details: ipValidation.error
      }, { status: 403 })
    }

    // Send webhook request with HMAC-SHA256 signature (never send secrets in plaintext)
    const webhookSecret = process.env.WEBHOOK_SECRET || ''
    const webhookBody = JSON.stringify(webhookPayload)
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MegaCampusAI/1.0',
    }
    if (webhookSecret) {
      const signature = crypto.createHmac('sha256', webhookSecret).update(webhookBody).digest('hex')
      webhookHeaders['X-Webhook-Signature'] = signature
    }
    const webhookResponse = await fetch(webhook, {
      method: 'POST',
      headers: webhookHeaders,
      body: webhookBody,
    })

    logger.info('Webhook response received', { status: webhookResponse.status })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text()
      logger.error('Webhook failed', {
        error: errorText,
        response: {
          status: webhookResponse.status,
          statusText: webhookResponse.statusText,
          headers: Object.fromEntries(webhookResponse.headers.entries()),
          body: errorText,
        },
      })

      // Log to error_logs for admin visibility
      logPermanentFailure({
        user_id: user?.id,
        error_message: `Webhook failed: ${errorText}`,
        severity: 'ERROR',
        job_type: 'CONTENT_GENERATE',
        metadata: {
          route: '/api/content/generate',
          courseId,
          lessonId,
          formatId,
          webhookUrl: webhook,
          webhookStatus: webhookResponse.status,
        },
      }).catch((err) =>
        logger.warn('Non-critical operation failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      )

      return NextResponse.json(
        {
          error: 'Webhook request failed',
          details: errorText,
          status: webhookResponse.status,
        },
        { status: 500 }
      )
    }

    // Parse webhook response
    let webhookResult
    try {
      webhookResult = await webhookResponse.json()
    } catch {
      webhookResult = { success: true, message: 'Webhook accepted' }
    }

    // Update lesson metadata to track generated content (only if lesson exists)
    if (lesson) {
      try {
        const currentMetadata = (lesson.metadata || {}) as Record<string, Json | undefined>
        const generatedContent = (currentMetadata.generated_content || {}) as Record<
          string,
          Json | undefined
        >
        generatedContent[formatId] = {
          status: 'requested',
          requestedAt: new Date().toISOString(),
          webhookResponse: webhookResult as Json,
        }

        const updatedMetadata: Json = {
          ...currentMetadata,
          generated_content: generatedContent,
        }

        const { error: updateError } = await supabase
          .from('lessons')
          .update({
            metadata: updatedMetadata,
          })
          .eq('id', lessonId)

        if (updateError) {
          logger.warn('Failed to update lesson metadata', { error: updateError, lessonId })
          // Continue execution - this is not a critical failure
        }
      } catch (metadataError) {
        logger.warn('Error updating lesson metadata', { error: metadataError, lessonId })
        // Continue execution - this is not a critical failure
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Content generation initiated',
      lessonId,
      formatId,
      webhookResponse: webhookResult,
    })
  } catch (error) {
    logger.error('Content generation failed', { error })

    // Log to error_logs for admin visibility
    logPermanentFailure({
      error_message: error instanceof Error ? error.message : 'Unknown error',
      stack_trace: error instanceof Error ? error.stack : undefined,
      severity: 'ERROR',
      job_type: 'CONTENT_GENERATE',
      metadata: {
        route: '/api/content/generate',
        errorCode: 'INTERNAL_ERROR',
      },
    }).catch((err) =>
      logger.warn('Non-critical operation failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    )

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Export the POST handler with required authentication
export const POST = withAuth(handleContentGeneration)
