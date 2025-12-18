import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database.generated'
import type { GenerationStep, GenerationProgress } from '@/types/course-generation'

// Type definitions for the webhook payload (specific to n8n webhook)
interface WebhookProgress {
  step: number
  message: string
  percentage: number
}

interface WebhookPayload {
  courseId: string
  status: 'processing' | 'initializing' | 'processing_documents' | 'analyzing_task' |
          'generating_structure' | 'generating_content' | 'finalizing' | 'completed' |
          'failed' | 'cancelled'
  progress?: WebhookProgress
  data?: Record<string, unknown>
  error?: string
}

// Use generated database type for course updates
type CourseUpdate = Database['public']['Tables']['courses']['Update']

/**
 * Webhook endpoint for n8n to update course generation status
 * This endpoint receives status updates from the n8n workflow
 */

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const body = await request.text()

    // Get signature from headers
    const signature = request.headers.get('x-webhook-signature')

    if (!signature) {
      logger.warn('Webhook request without signature')
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      )
    }

    // Verify webhook signature
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET

    if (!webhookSecret) {
      logger.error('N8N_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    // Compare signatures (timing-safe comparison)
    const signatureBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expectedSignature)

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      logger.warn('Invalid webhook signature', {
        received: signature.substring(0, 10) + '...',
        expected: expectedSignature.substring(0, 10) + '...'
      })
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse the validated payload
    const payload: WebhookPayload = JSON.parse(body)

    // Validate required fields
    if (!payload.courseId) {
      return NextResponse.json(
        { error: 'Missing courseId' },
        { status: 400 }
      )
    }

    // Initialize Supabase client with service role for admin operations
    const supabase = await createClient()

    // Log the webhook event
    logger.info('Webhook received', {
      courseId: payload.courseId,
      status: payload.status,
      step: payload.progress?.step
    })

    // Map webhook status to course status
    const statusMapping: Record<string, string> = {
      'processing': 'generating',
      'initializing': 'initializing',
      'processing_documents': 'processing_documents',
      'analyzing_task': 'analyzing_task',
      'generating_structure': 'generating_structure',
      'generating_content': 'generating_content',
      'finalizing': 'finalizing',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled'
    }

    const mappedStatus = statusMapping[payload.status] || payload.status

    // Update course based on status
    switch (payload.status) {
      case 'initializing':
      case 'processing_documents':
      case 'analyzing_task':
      case 'generating_structure':
      case 'generating_content':
      case 'finalizing':
      case 'processing': {
        // Update progress
        const updates: CourseUpdate = {
          generation_status: mappedStatus as Database['public']['Enums']['generation_status'],
          updated_at: new Date().toISOString()
        }

        if (payload.progress) {
          // Fetch current generation_progress to update it
          const { data: course } = await supabase
            .from('courses')
            .select('generation_progress')
            .eq('id', payload.courseId)
            .single()

          if (course?.generation_progress) {
            const progress = course.generation_progress as unknown as GenerationProgress

            // Update the current step status - ensure only one is in_progress
            if (progress.steps && payload.progress.step) {
              const currentTime = new Date().toISOString()

              progress.steps = progress.steps.map((step: GenerationStep) => {
                // Current step should be in_progress
                if (step.id === payload.progress?.step) {
                  return {
                    ...step,
                    status: 'in_progress',
                    started_at: step.started_at || currentTime,
                    completed_at: null // Clear any accidental completion time
                  }
                }
                // Previous steps should be completed
                else if (step.id < (payload.progress?.step ?? 0)) {
                  // Only update if not already completed
                  if (step.status !== 'completed') {
                    return {
                      ...step,
                      status: 'completed',
                      completed_at: step.completed_at || currentTime,
                      started_at: step.started_at || currentTime
                    }
                  }
                  return step
                }
                // Future steps should be pending
                else {
                  return {
                    ...step,
                    status: 'pending',
                    started_at: null,
                    completed_at: null
                  }
                }
              })

              // Log the step transition for debugging
              logger.info('Step status updated', {
                courseId: payload.courseId,
                currentStep: payload.progress?.step,
                steps: progress.steps.map((s: GenerationStep) => ({ id: s.id, status: s.status }))
              })
            }

            // Update progress message and percentage
            progress.message = payload.progress?.message || progress.message
            progress.percentage = payload.progress?.percentage || progress.percentage
            progress.current_step = payload.progress?.step || progress.current_step

            updates.generation_progress = progress as unknown as Database['public']['Tables']['courses']['Update']['generation_progress']
          }
        }

        const { error } = await supabase
          .from('courses')
          .update(updates)
          .eq('id', payload.courseId)

        if (error) {
          logger.error('Failed to update course progress', { error, courseId: payload.courseId })
          return NextResponse.json(
            { error: 'Failed to update course' },
            { status: 500 }
          )
        }
        break
      }

      case 'completed': {
        // Mark course as completed
        const updates: CourseUpdate = {
          generation_status: 'completed',
          status: 'published', // Set publication status to published when generation completes
          updated_at: new Date().toISOString(),
          generation_completed_at: new Date().toISOString()
        }

        // Update final progress
        const { data: course } = await supabase
          .from('courses')
          .select('generation_progress')
          .eq('id', payload.courseId)
          .single()

        if (course?.generation_progress) {
          const progress = course.generation_progress as unknown as GenerationProgress

          // Mark all steps as completed
          if (progress.steps) {
            progress.steps = progress.steps.map((step: GenerationStep) => ({
              ...step,
              status: 'completed',
              completed_at: step.completed_at || new Date().toISOString()
            }))
          }

          progress.message = 'Курс успешно создан!'
          progress.percentage = 100
          progress.current_step = progress.total_steps || 5

          updates.generation_progress = progress as unknown as Database['public']['Tables']['courses']['Update']['generation_progress']
        }

        const { error } = await supabase
          .from('courses')
          .update(updates)
          .eq('id', payload.courseId)

        if (error) {
          logger.error('Failed to mark course as completed', { error, courseId: payload.courseId })
          return NextResponse.json(
            { error: 'Failed to update course' },
            { status: 500 }
          )
        }

        logger.info('Course generation completed', { courseId: payload.courseId })
        break
      }

      case 'failed': {
        // Mark course as failed
        const updates: CourseUpdate = {
          generation_status: 'failed',
          updated_at: new Date().toISOString(),
          error_message: payload.error || 'Произошла ошибка при генерации курса',
          generation_completed_at: new Date().toISOString()
        }

        // Update progress to show failure
        const { data: course } = await supabase
          .from('courses')
          .select('generation_progress')
          .eq('id', payload.courseId)
          .single()

        if (course?.generation_progress) {
          const progress = course.generation_progress as unknown as GenerationProgress
          progress.message = payload.error || 'Ошибка генерации'

          // Mark current step as failed
          if (progress.steps && progress.current_step) {
            progress.steps = progress.steps.map((step: GenerationStep) => {
              if (step.id === progress.current_step) {
                return {
                  ...step,
                  status: 'failed',
                  error: payload.error
                }
              }
              return step
            })
          }

          updates.generation_progress = progress as unknown as Database['public']['Tables']['courses']['Update']['generation_progress']
        }

        const { error } = await supabase
          .from('courses')
          .update(updates)
          .eq('id', payload.courseId)

        if (error) {
          logger.error('Failed to mark course as failed', { error, courseId: payload.courseId })
          return NextResponse.json(
            { error: 'Failed to update course' },
            { status: 500 }
          )
        }

        logger.error('Course generation failed', {
          courseId: payload.courseId,
          error: payload.error
        })
        break
      }

      default:
        logger.warn('Unknown webhook status', {
          courseId: payload.courseId,
          status: payload.status
        })
        return NextResponse.json(
          { error: 'Unknown status' },
          { status: 400 }
        )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      courseId: payload.courseId,
      status: payload.status
    })

  } catch (error) {
    logger.error('Webhook processing error', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}