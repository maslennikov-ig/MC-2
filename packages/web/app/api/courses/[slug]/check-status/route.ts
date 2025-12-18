import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database.generated'
import type { GenerationStep, GenerationProgress } from '@/types/course-generation'

// Use generated database type for course updates
type CourseUpdate = Database['public']['Tables']['courses']['Update']

/**
 * API endpoint to check and potentially recover course generation status
 * This endpoint can be used to verify the actual status and fix stuck courses
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch course details
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .single()

    if (courseError || !course) {
      logger.error('Course not found', { slug, error: courseError })
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }

    // Check if user owns the course
    if (course.user_id !== user.id) {
      // Check if user is super admin
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'superadmin') {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }
    }

    // Check if course has been stuck in generating status for too long
    const createdAt = course.created_at ? new Date(course.created_at) : new Date()
    const now = new Date()
    const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60)

    let shouldRecover = false
    let recoveryReason = ''
    let suggestedStatus = course.generation_status

    // If course has been generating for more than 15 minutes, it's likely stuck
    const generatingStatuses = ['stage_2_init', 'stage_2_processing', 'stage_3_init', 'stage_3_classifying', 'stage_4_init', 'stage_4_analyzing', 'stage_5_init', 'stage_5_generating', 'finalizing']
    if (
      course.generation_status && generatingStatuses.includes(course.generation_status) &&
      minutesSinceCreation > 15
    ) {
      shouldRecover = true
      recoveryReason = `Course has been in ${course.generation_status} status for ${Math.round(minutesSinceCreation)} minutes`

      // Check if there's any progress data to determine the actual state
      const progress = course.generation_progress as unknown as GenerationProgress | null
      if (progress) {
        // If all steps are completed, mark generation_status as completed
        if (progress.steps?.every((step: GenerationStep) => step.status === 'completed')) {
          suggestedStatus = 'completed'
        }
        // If percentage is 100, mark generation_status as completed
        else if (progress.percentage === 100) {
          suggestedStatus = 'completed'
        }
        // Otherwise mark as failed
        else {
          suggestedStatus = 'failed'
        }
      } else {
        suggestedStatus = 'failed'
      }
    }

    // Response data
    const responseData = {
      courseId: course.id,
      slug,
      currentStatus: course.status,
      currentGenerationStatus: course.generation_status,
      generationProgress: course.generation_progress,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      minutesSinceCreation: Math.round(minutesSinceCreation),
      isStuck: shouldRecover,
      recoveryReason,
      suggestedStatus
    }

    logger.info('Course status check', responseData)

    return NextResponse.json(responseData)
  } catch (error) {
    logger.error('Error checking course status', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST endpoint to force recovery of stuck course
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const body = await request.json()
    const { forceStatus } = body // Allow forcing a specific status

    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch course details
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .single()

    if (courseError || !course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      )
    }

    // Check ownership
    if (course.user_id !== user.id) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'superadmin') {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }
    }

    // Determine the new status
    let newStatus = forceStatus
    const progress = course.generation_progress as unknown as GenerationProgress

    if (!newStatus) {
      // Auto-determine based on progress
      if (progress?.percentage === 100 || progress?.steps?.every((s: GenerationStep) => s.status === 'completed')) {
        newStatus = 'completed'
      } else {
        newStatus = 'failed'
      }
    }

    // Update the course status
    const updates: CourseUpdate = {
      status: newStatus,
      updated_at: new Date().toISOString()
    }

    // If marking as completed, ensure progress is 100%
    if (newStatus === 'completed') {
      if (progress) {
        progress.percentage = 100
        progress.message = 'Курс успешно создан!'
        if (progress.steps) {
          progress.steps = progress.steps.map((step: GenerationStep) => ({
            ...step,
            status: 'completed',
            completed_at: step.completed_at || new Date().toISOString()
          }))
        }
        updates.generation_progress = progress as unknown as Database['public']['Tables']['courses']['Update']['generation_progress']
      }
      updates.generation_completed_at = new Date().toISOString()
    }
    // If marking as failed, add error message
    else if (newStatus === 'failed') {
      updates.error_message = 'Генерация курса прервана из-за таймаута. Попробуйте создать курс заново.'
      if (progress) {
        progress.message = 'Произошла ошибка при генерации'
        updates.generation_progress = progress as unknown as Database['public']['Tables']['courses']['Update']['generation_progress']
      }
    }

    const { error: updateError } = await supabase
      .from('courses')
      .update(updates)
      .eq('id', course.id)

    if (updateError) {
      logger.error('Failed to update course status', { error: updateError, courseId: course.id, slug })
      return NextResponse.json(
        { error: 'Failed to update course status' },
        { status: 500 }
      )
    }

    logger.info('Course status recovered', {
      courseId: course.id,
      slug,
      oldStatus: course.status,
      newStatus,
      reason: 'Manual recovery via API'
    })

    return NextResponse.json({
      success: true,
      courseId: course.id,
      slug,
      oldStatus: course.status,
      newStatus,
      message: `Course status updated from ${course.status} to ${newStatus}`
    })
  } catch (error) {
    logger.error('Error recovering course status', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}