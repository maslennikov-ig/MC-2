import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserClient } from '@/lib/supabase/client-factory'
import { logger } from '@/lib/logger'
import { withAuth, AuthUser } from '@/lib/auth'

const UpdateProgressSchema = z.object({
  lesson_id: z.string().uuid(),
  action: z.enum(['mark_complete', 'mark_incomplete', 'access']),
})

type UpdateProgressInput = z.infer<typeof UpdateProgressSchema>

interface RouteParams {
  params: Promise<{
    slug: string
  }>
}

async function handleGetProgress(_request: NextRequest, user: AuthUser, { params }: RouteParams) {
  try {
    const { slug } = await params
    const supabase = await getUserClient()

    // Get course by slug
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Get user from users table
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (userError || !dbUser) {
      // User not in users table - return empty progress
      return NextResponse.json({
        lessons_completed: [],
        last_accessed: null,
        last_accessed_lesson_id: null,
      })
    }

    // Call RPC function
    const { data: progress, error: progressError } = await supabase.rpc('get_lesson_progress', {
      p_user_id: dbUser.id,
      p_course_id: course.id,
    })

    if (progressError) {
      logger.error('Failed to get lesson progress', {
        userId: dbUser.id,
        courseId: course.id,
        error: progressError.message,
      })
      return NextResponse.json({ error: 'Failed to get progress' }, { status: 500 })
    }

    return NextResponse.json(progress)
  } catch (error) {
    logger.error('Unexpected error in GET /api/courses/[slug]/progress', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleUpdateProgress(request: NextRequest, user: AuthUser, { params }: RouteParams) {
  try {
    const { slug } = await params
    const supabase = await getUserClient()

    // Parse and validate body
    let body: UpdateProgressInput
    try {
      const rawBody = await request.json()
      body = UpdateProgressSchema.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Get course by slug
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('slug', slug)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Get user from users table
    const { data: dbUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (userError || !dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 })
    }

    // Call RPC function
    const { data: progress, error: progressError } = await supabase.rpc('update_lesson_progress', {
      p_user_id: dbUser.id,
      p_course_id: course.id,
      p_lesson_id: body.lesson_id,
      p_action: body.action,
    })

    if (progressError) {
      logger.error('Failed to update lesson progress', {
        userId: dbUser.id,
        courseId: course.id,
        lessonId: body.lesson_id,
        action: body.action,
        error: progressError.message,
      })
      return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
    }

    return NextResponse.json(progress)
  } catch (error) {
    logger.error('Unexpected error in POST /api/courses/[slug]/progress', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Export handlers with authentication
export const GET = withAuth(handleGetProgress)
export const POST = withAuth(handleUpdateProgress)
