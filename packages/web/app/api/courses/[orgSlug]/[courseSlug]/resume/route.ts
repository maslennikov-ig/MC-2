import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'

interface RouteContext {
  params: Promise<{ orgSlug: string; courseSlug: string }>
}

/**
 * POST handler to resume paused course generation
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
        { error: 'You do not have permission to resume this course' },
        { status: 403 }
      )
    }

    // Early validation: Check if actually paused (Issue #4 from code review)
    if (!courseData.generation_paused_at) {
      return NextResponse.json({ error: 'Generation is not paused' }, { status: 400 })
    }

    // Call the resume RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc('resume_course_generation', {
      p_course_id: courseData.id,
      p_user_id: user.id,
    })

    if (rpcError) {
      logger.error('Failed to resume generation', { error: rpcError, orgSlug, courseSlug })
      return NextResponse.json({ error: 'Failed to resume generation' }, { status: 500 })
    }

    // Cast the jsonb result to proper type
    const result = rpcResult as {
      success: boolean
      error?: string
      resumed_at?: string
      paused_duration_seconds?: number
    } | null

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || 'Cannot resume generation' },
        { status: 400 }
      )
    }

    logger.info('Course generation resumed', {
      orgSlug,
      courseSlug,
      userId: user.id,
      pausedDurationSeconds: result.paused_duration_seconds,
    })

    return NextResponse.json({
      success: true,
      message: 'Generation resumed',
      resumedAt: result.resumed_at,
      pausedDurationSeconds: result.paused_duration_seconds,
    })
  } catch (error) {
    logger.error('Unexpected error in resume endpoint', { error })
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
