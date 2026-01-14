import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { canPauseGeneration } from '@megacampus/shared-types'

/**
 * POST handler to pause course generation
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    if (!slug) {
      return NextResponse.json({ error: 'Course slug is required' }, { status: 400 })
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

    // Fetch course to get ID and verify ownership
    const { data: course, error: fetchError } = await supabase
      .from('courses')
      .select('id, user_id')
      .eq('slug', slug)
      .single()

    if (fetchError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    if (course.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to pause this course' },
        { status: 403 }
      )
    }

    // Call the pause RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc('pause_course_generation', {
      p_course_id: course.id,
      p_user_id: user.id,
    })

    if (rpcError) {
      logger.error('Failed to pause generation', { error: rpcError, slug })
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

    logger.info('Course generation paused', { slug, userId: user.id })

    return NextResponse.json({
      success: true,
      message: 'Generation paused',
      pausedAt: result.paused_at,
    })
  } catch (error) {
    logger.error('Unexpected error in pause endpoint', { error })
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * GET handler to check pause status
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    if (!slug) {
      return NextResponse.json({ error: 'Course slug is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: course, error } = await supabase
      .from('courses')
      .select('generation_paused_at, generation_status')
      .eq('slug', slug)
      .single()

    if (error || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const isPaused = course.generation_paused_at !== null
    // Use shared constants for pausable statuses (Issue #10 from code review)
    const canPause = canPauseGeneration(course.generation_status)

    return NextResponse.json({
      isPaused,
      canPause: canPause && !isPaused,
      pausedAt: course.generation_paused_at,
      currentStatus: course.generation_status,
    })
  } catch (error) {
    logger.error('Error checking pause status', { error })
    return NextResponse.json({ error: 'Failed to check pause status' }, { status: 500 })
  }
}
