import { cache } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { getAdminClient } from '@/lib/supabase/client-factory';
import { logger } from '@/lib/logger';
import CourseViewerEnhanced from '@/components/course/course-viewer-enhanced';
import { CourseErrorBoundary } from '@/components/common/error-boundary';
import {
  isValidShareToken,
  sanitizeTokenForLog,
  groupAssetsByLessonId,
  groupEnrichmentsByLessonId,
  prepareLessonsForViewer,
} from '@/lib/course-data-utils';
import type { Section, Course, Asset } from '@/types/database';
import { Database } from '@/types/database.generated';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

// Database row types
type SectionRow = Database['public']['Tables']['sections']['Row'];
type LessonRow = Database['public']['Tables']['lessons']['Row'];
type AssetRow = Database['public']['Tables']['assets']['Row'];
type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row'];

// Nested section type from joined query
type NestedSection = SectionRow & {
  lessons?: (LessonRow & { assets?: AssetRow[] })[];
};

interface PageProps {
  params: Promise<{
    locale: Locale;
    token: string;
  }>;
}

/** Minimum response time to prevent timing attacks (ms) */
const CONSTANT_RESPONSE_TIME_MS = 1000;

/**
 * Cached course fetcher - deduplicates queries between generateMetadata and page component
 * Uses React cache() for request-level memoization
 */
const getCourseByShareToken = cache(async (token: string) => {
  const adminSupabase = getAdminClient();

  // Fetch course with all related data in a single query (optimized - no N+1)
  const { data, error } = await adminSupabase
    .from('courses')
    .select(`
      *,
      sections:sections(
        *,
        lessons:lessons(
          *,
          assets:assets(*)
        )
      )
    `)
    .eq('share_token', token)
    .order('order_index', { referencedTable: 'sections', ascending: true })
    .single();

  return { data, error };
});

/**
 * Extract client IP from request headers for logging
 */
async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return (
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headersList.get('x-real-ip') ||
    headersList.get('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * Log share link access for audit purposes
 */
async function logShareAccess(
  courseId: string,
  token: string,
  success: boolean
): Promise<void> {
  const clientIp = await getClientIp();
  const headersList = await headers();

  logger.info('Share link accessed', {
    courseId,
    token: sanitizeTokenForLog(token),
    clientIp,
    userAgent: headersList.get('user-agent')?.slice(0, 100),
    success,
  });
}

/**
 * Shared Course Page - allows anonymous access via share_token.
 * Uses admin client to bypass RLS and renders course in read-only mode.
 */
export default async function SharedCoursePage({ params }: PageProps) {
  const startTime = Date.now();
  const { locale, token } = await params;
  setRequestLocale(locale);

  // Helper to ensure constant-time response (prevents timing attacks)
  const ensureConstantTime = async () => {
    const elapsed = Date.now() - startTime;
    const remainingDelay = Math.max(0, CONSTANT_RESPONSE_TIME_MS - elapsed);
    if (remainingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }
  };

  // Validate token format with strict rules (but don't return early to avoid timing leak)
  const isTokenValid = isValidShareToken(token);

  // Fetch course (uses cached function to deduplicate with generateMetadata)
  const { data: courseWithData, error: courseError } = isTokenValid
    ? await getCourseByShareToken(token)
    : { data: null, error: null };

  // If token invalid or course not found, ensure constant time and return 404
  if (!isTokenValid || courseError || !courseWithData) {
    // Log failed access attempt
    await logShareAccess('unknown', token || 'empty', false);
    await ensureConstantTime();
    notFound();
  }

  // Log successful access
  await logShareAccess(courseWithData.id, token, true);

  // Extract course data (without nested relations for the Course type)
  const { sections: rawSections, ...courseData } = courseWithData;
  const course = courseData;

  // Process nested sections from the joined query
  const nestedSections: NestedSection[] = rawSections || [];

  // Flatten lessons from nested sections
  const flatLessons: LessonRow[] = nestedSections.flatMap((section) =>
    (section.lessons || []).map(({ assets: _, ...lesson }) => lesson)
  );

  // Flatten assets from nested lessons
  const flatAssets: AssetRow[] = nestedSections.flatMap((section) =>
    (section.lessons || []).flatMap((lesson) => lesson.assets || [])
  );

  // Log warning if course has no content
  if (nestedSections.length === 0) {
    logger.warn('Shared course has no sections', {
      courseId: course.id,
      token: sanitizeTokenForLog(token),
    });
  }

  // Group assets by lesson_id using shared utility
  const assetsByLessonId = groupAssetsByLessonId(flatAssets);

  // Fetch enrichments for shared course lessons
  let enrichmentsByLessonId: Record<string, EnrichmentRow[]> = {};
  if (flatLessons.length > 0) {
    const lessonIds = flatLessons.map((l) => l.id);
    const adminSupabase = getAdminClient();
    const { data: enrichments, error: enrichmentsError } = await adminSupabase
      .from('lesson_enrichments')
      .select('*')
      .in('lesson_id', lessonIds)
      .eq('status', 'completed')
      .order('order_index');

    if (enrichmentsError) {
      logger.warn('Failed to load lesson enrichments for shared course', {
        courseId: course.id,
        token: sanitizeTokenForLog(token),
        error: enrichmentsError.message,
      });
    } else {
      enrichmentsByLessonId = groupEnrichmentsByLessonId(enrichments);
    }
  }

  // Prepare sections with lessons for CourseViewerEnhanced
  const sectionsWithLessons: Section[] = nestedSections.map((section) => ({
    ...section,
    section_number: String(section.order_index || ''),
    order_number: section.order_index,
    lessons: (section.lessons || []).map((lesson) => ({
      ...lesson,
      lesson_number: String(lesson.order_index || ''),
      course_id: course.id,
      order_number: lesson.order_index,
    })),
  })) as Section[];

  // Prepare flat lessons list
  const lessonsForViewer = prepareLessonsForViewer(flatLessons, course.id);

  return (
    <CourseErrorBoundary>
      <CourseViewerEnhanced
        course={course as Course}
        sections={sectionsWithLessons}
        lessons={lessonsForViewer}
        assets={assetsByLessonId as Record<string, Asset[]>}
        enrichments={enrichmentsByLessonId}
        readOnly={true}
      />
    </CourseErrorBoundary>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { locale, token } = await params;

  // Strict token validation
  if (!isValidShareToken(token)) {
    return {
      title: 'Course Not Found',
    };
  }

  // Use cached course fetch (deduplicates with page component)
  const { data: courseWithData } = await getCourseByShareToken(token);

  if (!courseWithData) {
    return {
      title: 'Course Not Found',
    };
  }

  const { title, course_description } = courseWithData;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://megacampusai.com';

  return {
    title,
    description: course_description || `Shared course: "${title}"`,
    openGraph: {
      title,
      description: course_description || `Shared course: "${title}"`,
      type: 'website',
      url: `${appUrl}/${locale}/shared/${token}`,
      siteName: 'MegaCampus AI',
      images: [
        {
          url: `${appUrl}/og-course-default.png`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}
