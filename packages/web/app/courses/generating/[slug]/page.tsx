import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GenerationProgress, GenerationStep, CourseStatus } from '@/types/course-generation';
import GenerationProgressContainerEnhanced from './GenerationProgressContainerEnhanced';
import GenerationErrorBoundary from './GenerationErrorBoundary';
import { GenerationRealtimeProvider } from '@/components/generation-monitoring/realtime-provider';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';

/** Default fallback when lessons count is unknown (before Stage 4 analysis completes) */
const DEFAULT_LESSONS_COUNT = 5;

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CourseGeneratingPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  // Get the current user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  // Fetch user role for admin features
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userData?.role || null;

  // Fetch the course with generation progress
  const { data: course, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('user_id', user.id)
    .single();

  if (error || !course) {
    notFound();
  }

  // If course generation is already completed, redirect to the course page
  if (course.generation_status === 'completed') {
    redirect(`/courses/${course.slug}`);
  }

  // If course generation has been cancelled, redirect to course page
  // Note: 'failed' status stays on this page to show error and allow restart
  if (course.generation_status === 'cancelled') {
    redirect(`/courses/${course.slug}`);
  }

  // Parse generation progress - handle JSON type from database
  let generationProgress: GenerationProgress;

  // Extract modules_total and lessons_total from analysis_result if available (Stage 4+)
  let modulesTotal: number | undefined = undefined;
  let lessonsTotal: number = course.estimated_lessons || DEFAULT_LESSONS_COUNT;

  if (course.analysis_result && typeof course.analysis_result === 'object') {
    const analysisResult = course.analysis_result as {
      recommended_structure?: {
        total_sections?: number;
        total_lessons?: number;
      };
    };
    if (analysisResult.recommended_structure) {
      if (analysisResult.recommended_structure.total_sections) {
        modulesTotal = analysisResult.recommended_structure.total_sections;
      }
      if (analysisResult.recommended_structure.total_lessons) {
        lessonsTotal = analysisResult.recommended_structure.total_lessons;
      }
    }
  }

  if (course.generation_progress && typeof course.generation_progress === 'object') {
    // If progress exists, use it but ensure all required fields
    const progress = course.generation_progress as {
      steps?: unknown;
      message?: unknown;
      percentage?: unknown;
      current_step?: unknown;
      total_steps?: unknown;
      has_documents?: unknown;
      lessons_completed?: unknown;
      lessons_total?: unknown;
      modules_total?: unknown;
      started_at?: unknown;
      current_stage?: unknown;
      document_size?: unknown;
      estimated_completion?: unknown;
    };
    generationProgress = {
      steps: (progress.steps as GenerationStep[]) || [],
      message: (progress.message as string) || 'Initializing course generation...',
      percentage: (progress.percentage as number) || 0,
      current_step: (progress.current_step as number) || 0,
      total_steps: (progress.total_steps as number) || 6,
      has_documents: progress.has_documents !== undefined ? (progress.has_documents as boolean) : (course.has_files || false),
      lessons_completed: (progress.lessons_completed as number) || 0,
      lessons_total: lessonsTotal,
      modules_total: modulesTotal ?? (progress.modules_total as number) ?? undefined,
      started_at: progress.started_at ? new Date(progress.started_at as string | number) : new Date(course.created_at || Date.now()),
      current_stage: (progress.current_stage as string) || null,
      document_size: (progress.document_size as number) || null,
      estimated_completion: progress.estimated_completion ? new Date(progress.estimated_completion as string | number) : undefined,
    };
  } else {
    // Default progress if none exists
    generationProgress = {
      steps: [],
      message: 'Initializing course generation...',
      percentage: 0,
      current_step: 0,
      total_steps: 6,
      has_documents: course.has_files || false,
      lessons_completed: 0,
      lessons_total: lessonsTotal,
      modules_total: modulesTotal,
      started_at: new Date(course.created_at || Date.now()),
      current_stage: null,
      document_size: null,
    };
  }

  // Use generation_status for workflow state, fallback to 'pending' if not set
  const generationStatus = (course.generation_status || 'pending') as CourseStatus;

  // Get locale and messages for client components
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <GenerationErrorBoundary>
        <GenerationRealtimeProvider courseId={course.id} initialStatus={generationStatus}>
          <GenerationProgressContainerEnhanced
            courseId={course.id}
            slug={course.slug || ''}
            initialProgress={generationProgress}
            initialStatus={generationStatus}
            courseTitle={course.title || 'Untitled Course'}
            autoRedirect={true}
            redirectDelay={3000}
            userRole={userRole}
            failedAtStage={course.failed_at_stage}
            generationCode={course.generation_code}
          />
        </GenerationRealtimeProvider>
      </GenerationErrorBoundary>
    </NextIntlClientProvider>
  );
}