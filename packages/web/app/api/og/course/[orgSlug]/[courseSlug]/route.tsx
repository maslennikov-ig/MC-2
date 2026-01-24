import { ImageResponse } from 'next/og'
import { getCourseByOrgAndSlug } from '@/lib/helpers/organization'
import { getAdminClient } from '@/lib/supabase/client-factory'

// Using nodejs runtime because shared-logger is not edge-compatible
export const runtime = 'nodejs'

// OG Image dimensions (standard: 1200x630)
const WIDTH = 1200
const HEIGHT = 630

// Cache for 1 day (OG images rarely change)
const CACHE_MAX_AGE = 86400

interface CourseCover {
  content: {
    imageUrl?: string
  } | null
}

/**
 * Validate URL to prevent XSS attacks
 * Only allows http/https protocols
 */
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Generate fallback OG image (gradient background with logo)
 */
function generateFallbackImage(title?: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 48, color: 'white' }}>M</span>
          </div>
          <span style={{ fontSize: 48, fontWeight: 700, color: 'white' }}>MegaCampusAI</span>
        </div>
        {title && (
          <h1
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              textAlign: 'center',
              maxWidth: '80%',
              margin: 0,
            }}
          >
            {title}
          </h1>
        )}
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate`,
      },
    }
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgSlug: string; courseSlug: string }> }
) {
  const { orgSlug, courseSlug } = await params

  try {
    // Fetch course with organization validation
    const course = await getCourseByOrgAndSlug(orgSlug, courseSlug)

    if (!course) {
      return new Response('Course not found', { status: 404 })
    }

    const supabase = getAdminClient()

    // Fetch course cover
    const { data: coverData } = (await supabase
      .from('lesson_enrichments')
      .select('content')
      .eq('course_id', course.id)
      .eq('enrichment_type', 'card')
      .eq('title', 'course-card')
      .eq('status', 'completed')
      .maybeSingle()) as { data: CourseCover | null; error: unknown }

    // Validate cover URL (XSS prevention)
    let validCoverUrl: string | null = null
    const rawCoverUrl = coverData?.content?.imageUrl
    if (rawCoverUrl && isValidHttpUrl(rawCoverUrl)) {
      validCoverUrl = rawCoverUrl
    }

    // Generate OG Image
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Background */}
          {validCoverUrl ? (
            <>
              {/* Cover image as background - using native img for ImageResponse */}
              <img
                src={validCoverUrl}
                alt=""
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: WIDTH,
                  height: HEIGHT,
                  objectFit: 'cover',
                }}
              />
              {/* Dark overlay for readability */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: WIDTH,
                  height: HEIGHT,
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 100%)',
                }}
              />
            </>
          ) : (
            /* Gradient background when no cover */
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: WIDTH,
                height: HEIGHT,
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
              }}
            />
          )}

          {/* Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: 60,
              height: '100%',
              position: 'relative',
              zIndex: 10,
            }}
          >
            {/* Top section: Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 24, color: 'white' }}>M</span>
              </div>
              <span style={{ fontSize: 24, fontWeight: 600, color: 'white' }}>MegaCampusAI</span>
            </div>

            {/* Middle section: Course info */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                flex: 1,
                justifyContent: 'center',
              }}
            >
              {/* Title */}
              <h1
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: 'white',
                  lineHeight: 1.2,
                  margin: 0,
                  maxWidth: '90%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {course.title}
              </h1>

              {/* Description */}
              {course.course_description && (
                <p
                  style={{
                    fontSize: 24,
                    color: 'rgba(255,255,255,0.8)',
                    lineHeight: 1.4,
                    margin: 0,
                    maxWidth: '80%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {course.course_description}
                </p>
              )}
            </div>

            {/* Bottom section: Stats */}
            <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
              {/* Modules count */}
              {course.total_sections_count && course.total_sections_count > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>Модулей:</span>
                  <span style={{ fontSize: 20, fontWeight: 600, color: 'white' }}>
                    {course.total_sections_count}
                  </span>
                </div>
              )}

              {/* Lessons count */}
              {course.total_lessons_count && course.total_lessons_count > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>Уроков:</span>
                  <span style={{ fontSize: 20, fontWeight: 600, color: 'white' }}>
                    {course.total_lessons_count}
                  </span>
                </div>
              )}

              {/* Difficulty */}
              {course.difficulty && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: 20,
                  }}
                >
                  <span style={{ fontSize: 18, color: 'white' }}>
                    {course.difficulty === 'beginner' && 'Начальный'}
                    {course.difficulty === 'intermediate' && 'Средний'}
                    {course.difficulty === 'advanced' && 'Продвинутый'}
                    {course.difficulty === 'expert' && 'Эксперт'}
                  </span>
                </div>
              )}

              {/* Language */}
              {course.language && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 16px',
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: 20,
                  }}
                >
                  <span style={{ fontSize: 18, color: 'white' }}>
                    {course.language === 'ru' ? 'RU' : course.language.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        headers: {
          'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate`,
        },
      }
    )
  } catch (error) {
    console.error('Error generating OG image:', error)
    // Return fallback image instead of error
    return generateFallbackImage()
  }
}
