import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { canPauseGeneration } from '@megacampus/shared-types'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'

interface RouteContext {
  params: Promise<{ orgSlug: string; courseSlug: string }>
}

/**
 * POST handler to pause course generation
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

    if (courseData.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to pause this course' },
        { status: 403 }
      )
    }

    // Call the pause RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc('pause_course_generation', {
      p_course_id: courseData.id,
      p_user_id: user.id,
    })

    if (rpcError) {
      logger.error('Failed to pause generation', { error: rpcError, orgSlug, courseSlug })
      return NextResponse.json({ error: 'Failed to pause generation' }, { status: 500 })
    }

    // Cast the jsonb result to proper type
    const result = rpcResult as { success: boolean; error?: string; paused_at?: string } | null

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || 'Cannot pause generation at this stage' },
        { status: 400 }
      )
    }

    logger.info('Course generation paused', { orgSlug, courseSlug, userId: user.id })

    return NextResponse.json({
      success: true,
      message: 'Generation paused',
      pausedAt: result.paused_at,
    })
  } catch (error) {
    logger.error('Unexpected error in pause endpoint', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}

/**
 * GET handler to check pause status
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

    // Fetch course with organization validation
    const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
    if (!courseData) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isPaused = courseData.generation_paused_at !== null
    // Use shared constants for pausable statuses (Issue #10 from code review)
    const canPause = canPauseGeneration(courseData.generation_status)

    return NextResponse.json({
      isPaused,
      canPause: canPause && !isPaused,
      pausedAt: courseData.generation_paused_at,
      currentStatus: courseData.generation_status,
    })
  } catch (error) {
    logger.error('Error checking pause status', { error })
    return NextResponse.json({ error: 'Failed to check pause status' }, { status: 500 })
  }
}
