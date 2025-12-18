import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

/**
 * POST handler to cancel a course generation
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    
    if (!slug) {
      return NextResponse.json(
        { error: 'Course slug is required' },
        { status: 400 }
      )
    }
    
    // Get Supabase client with user context
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      logger.warn('Unauthorized cancel attempt', { slug })
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // Fetch course to check ownership and status
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('id, user_id, status, slug')
      .eq('slug', slug)
      .single()
    
    if (fetchError || !course) {
      logger.error('Course not found for cancellation', { 
        slug, 
        error: fetchError 
      })
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }
    
    // Verify ownership
    if (course.user_id !== user.id) {
      logger.warn('Unauthorized cancel attempt - wrong owner', { 
        slug, 
        attemptedBy: user.id,
        owner: course.user_id 
      })
      return NextResponse.json(
        { error: 'You do not have permission to cancel this course' },
        { status: 403 }
      )
    }
    
    // Check if cancellation is allowed based on status
    const cancellableStatuses = [
      'generating', 
      'processing_documents', 
      'document_processing',
      'generating_structure'
    ]
    
    const courseStatus = course.status || ''
    
    if (!cancellableStatuses.includes(courseStatus)) {
      logger.info('Cancel rejected - course too far along', { 
        slug, 
        status: course.status 
      })
      return NextResponse.json(
        { 
          error: 'Cannot cancel at this stage',
          message: 'The course generation has progressed too far to be cancelled.',
          currentStatus: course.status
        },
        { status: 400 }
      )
    }
    
    // Check if already cancelled or completed
    if (['cancelled', 'completed', 'failed'].includes(courseStatus)) {
      return NextResponse.json(
        { 
          error: 'Course is already in a final state',
          currentStatus: course.status
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
        last_progress_update: new Date().toISOString()
      })
      .eq('slug', slug)
    
    if (updateError) {
      logger.error('Failed to update course status to cancelled', { 
        error: updateError, 
        slug 
      })
      return NextResponse.json(
        { error: 'Failed to cancel course generation' },
        { status: 500 }
      )
    }
    
    // Send cancellation signal to n8n workflow if configured
    const cancelWebhookUrl = process.env.N8N_CANCEL_WEBHOOK_URL
    if (cancelWebhookUrl) {
      try {
        const webhookSecret = process.env.N8N_WEBHOOK_SECRET
        if (webhookSecret) {
          const payload = {
            courseId: course.id,
            userId: user.id,
            action: 'cancel',
            timestamp: new Date().toISOString()
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
              'X-Course-ID': course.id
            },
            body: payloadString,
            signal: AbortSignal.timeout(3000) // 3 second timeout for cancellation
          }).catch(err => {
            // Log but don't fail the cancellation if webhook fails
            logger.warn('Failed to send cancellation webhook', {
              error: err,
              courseId: course.id,
              slug
            })
          })
        }
      } catch (webhookError) {
        // Log but don't fail the overall cancellation
        logger.warn('Error sending cancellation webhook', {
          error: webhookError,
          courseId: course.id,
          slug
        })
      }
    } else {
      // Log that cancellation webhook is not configured
      logger.info('N8N cancellation webhook not configured, skipping workflow cancellation', {
        courseId: course.id,
        slug
      })
    }

    logger.info('Course generation cancelled successfully', { 
      slug, 
      userId: user.id,
      previousStatus: courseStatus 
    })
    
    return NextResponse.json({ 
      success: true,
      message: 'Course generation has been cancelled',
      slug: course.slug
    })
    
  } catch (error) {
    logger.error('Unexpected error in cancel endpoint', { 
      error, 
      slug: (await params).slug 
    })
    return NextResponse.json(
      { error: 'An unexpected error occurred while cancelling the course' },
      { status: 500 }
    )
  }
}

/**
 * GET handler to check if a course can be cancelled
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    
    if (!slug) {
      return NextResponse.json(
        { error: 'Course slug is required' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // Fetch course status
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('user_id, status')
      .eq('slug', slug)
      .single()
    
    if (fetchError || !course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }
    
    // Check ownership
    if (course.user_id !== user.id) {
      return NextResponse.json(
        { canCancel: false, reason: 'Not the owner' },
        { status: 403 }
      )
    }
    
    // Check if cancellable
    const cancellableStatuses = [
      'generating', 
      'processing_documents', 
      'document_processing',
      'generating_structure'
    ]
    
    const courseStatus = course.status || ''
    const canCancel = cancellableStatuses.includes(courseStatus)
    
    return NextResponse.json({
      canCancel,
      currentStatus: courseStatus,
      reason: canCancel ? null : 'Course generation has progressed too far'
    })
    
  } catch (error) {
    logger.error('Error checking cancel status', { error, slug: (await params).slug })
    return NextResponse.json(
      { error: 'Failed to check cancel status' },
      { status: 500 }
    )
  }
}