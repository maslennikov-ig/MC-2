import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'

interface RouteContext {
  params: Promise<{ orgSlug: string; courseSlug: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { orgSlug, courseSlug } = await params
  const supabase = await createClient()

  // Get user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Apply rate limiting: 60 requests per minute per user
  const identifier = getRateLimitIdentifier(request, user.id)
  const rateLimitResult = await checkRateLimit(identifier, {
    requests: 60,
    window: 60,
    keyPrefix: 'rate-limit:traces',
  })

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    )
  }

  // Get course with organization validation
  const courseData = await getCourseByOrgAndSlug(orgSlug, courseSlug)
  if (!courseData) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  // Fetch traces
  const { data: traces, error } = await supabase
    .from('generation_trace')
    .select('*')
    .eq('course_id', courseData.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return traces with rate limit headers
  return NextResponse.json(
    { traces },
    {
      headers: {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        'X-RateLimit-Reset': String(rateLimitResult.reset),
      },
    }
  )
}
