/**
 * Auto-Approval Helpers
 * @module shared/auto-approval/helpers
 *
 * Extracted helper functions for the auto-approval service.
 * Contains stage-specific job builders and queueing logic to reduce
 * complexity and function length in the main index.ts module.
 */

import { getSupabaseAdmin } from '../supabase/admin';
import { addJob } from '../../orchestrator/queue';
import { createStage6Queue } from '../../stages/stage6-lesson-content/factory';
import type { Stage6JobInput } from '../../stages/stage6-lesson-content/types';
import {
  JobType,
  type JobData,
  type GenerationJobInput,
  type LessonSpecificationV2,
  type AnalysisResult,
  type CourseStyle,
  type Language,
} from '@megacampus/shared-types';
import { logger } from '../logger/index.js';
import type { Database } from '@megacampus/shared-types';
import type { CourseSettings } from '../../server/routers/generation/_shared/types';
import { isValidStyle, DEFAULT_COURSE_STYLE } from '@megacampus/shared-types/style-prompts';

// CR-008: Valid enum values for input validation
const VALID_TARGET_AUDIENCES = ['beginner', 'intermediate', 'advanced', 'mixed'] as const;
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
type ValidDifficulty = (typeof VALID_DIFFICULTIES)[number];

/** Check if value is a valid target audience enum */
function isValidTargetAudience(value: unknown): value is (typeof VALID_TARGET_AUDIENCES)[number] {
  return (
    typeof value === 'string' &&
    VALID_TARGET_AUDIENCES.includes(value as (typeof VALID_TARGET_AUDIENCES)[number])
  );
}

/** Check if value is a valid difficulty enum */
function isValidDifficulty(value: unknown): value is ValidDifficulty {
  return (
    typeof value === 'string' &&
    VALID_DIFFICULTIES.includes(value as (typeof VALID_DIFFICULTIES)[number])
  );
}

// Minimal course interface for auto-approval
export interface CourseForAutoApproval {
  user_id: string | null;
  organization_id: string;
  title: string | null;
  settings: unknown;
  language: string | null;
  style: string | null;
  target_audience: string | null;
  difficulty: string | null;
  course_description: string | null;
  course_size: string | null;
  analysis_result: unknown;
  organization: { tier: string | null } | { tier: string | null }[] | null;
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/** Extract base job data and priority from course */
export function buildBaseJobContext(course: CourseForAutoApproval, courseId: string) {
  const userId = course.user_id || 'system';
  const organizationId = course.organization_id;

  // Handle organization type (could be array or single object from Supabase select)
  const orgData = Array.isArray(course.organization) ? course.organization[0] : course.organization;
  const tier = orgData?.tier || 'free';
  const priority = tier === 'premium' ? 10 : tier === 'standard' ? 5 : 1;

  // Locale must be explicitly typed for JobData compatibility
  const locale: 'en' | 'ru' = course.language === 'en' ? 'en' : 'ru';

  const baseJobData = {
    organizationId,
    courseId,
    userId,
    createdAt: new Date().toISOString(),
    locale,
  };

  return { userId, organizationId, priority, locale, baseJobData };
}

// ============================================================================
// LESSON SPEC CONVERSION
// ============================================================================

/**
 * Convert simplified lesson data from course_structure to full LessonSpecificationV2
 * Required for Stage 6 generator which expects detailed section specifications
 */
export function convertToLessonSpecV2(
  lesson: {
    lesson_id: string;
    title: string;
    objectives: string[];
    topics: string[];
    duration_minutes: number;
  },
  _courseTitle: string
): LessonSpecificationV2 {
  // Create learning objectives with required V2 structure
  const learningObjectives = lesson.objectives.map((objective, index) => ({
    id: `LO-${lesson.lesson_id}.${index + 1}`,
    objective: objective.length >= 10 ? objective : `Understand and apply: ${objective}`,
    bloom_level: 'understand' as const,
  }));

  // Ensure at least one learning objective
  if (learningObjectives.length === 0) {
    learningObjectives.push({
      id: `LO-${lesson.lesson_id}.1`,
      objective: `Understand the key concepts of ${lesson.title}`,
      bloom_level: 'understand' as const,
    });
  }

  // Create sections from topics with V2 structure
  const sections = lesson.topics.map((topic, index) => ({
    title: topic,
    content_archetype: 'concept_explainer' as const,
    rag_context_id: `auto-section-${index + 1}`,
    constraints: {
      depth: 'detailed_analysis' as const,
      required_keywords: [] as string[],
      prohibited_terms: [] as string[],
    },
    key_points_to_cover: [topic.length >= 5 ? topic : `Key concepts of ${topic}`],
  }));

  // Ensure at least one section exists
  if (sections.length === 0) {
    const keyPoint =
      lesson.objectives.length > 0
        ? lesson.objectives[0].length >= 5
          ? lesson.objectives[0]
          : `Key concepts of ${lesson.objectives[0]}`
        : `Key concepts of ${lesson.title}`;
    sections.push({
      title: lesson.title,
      content_archetype: 'concept_explainer' as const,
      rag_context_id: 'auto-section-1',
      constraints: {
        depth: 'detailed_analysis' as const,
        required_keywords: [] as string[],
        prohibited_terms: [] as string[],
      },
      key_points_to_cover: [keyPoint],
    });
  }

  // Build key learning objectives string for intro (min 10 chars required)
  const keyLearningObjectivesStr =
    learningObjectives.map(lo => lo.objective).join('; ') ||
    `Learn key concepts of ${lesson.title}`;

  return {
    lesson_id: lesson.lesson_id,
    title: lesson.title,
    description:
      lesson.topics.length > 0
        ? `Lesson covering: ${lesson.topics.join(', ')}`
        : `Comprehensive coverage of ${lesson.title}`,
    metadata: {
      target_audience: 'practitioner' as const,
      tone: 'conversational-professional' as const,
      compliance_level: 'standard' as const,
      content_archetype: 'concept_explainer' as const,
    },
    learning_objectives: learningObjectives,
    intro_blueprint: {
      hook_strategy: 'question' as const,
      hook_topic: lesson.title,
      key_learning_objectives:
        keyLearningObjectivesStr.length >= 10
          ? keyLearningObjectivesStr
          : `Learn and understand ${lesson.title}`,
    },
    sections,
    exercises: [],
    rag_context: {
      primary_documents: ['auto-generated'],
      search_queries: [lesson.title, ...lesson.topics.slice(0, 2)].filter(Boolean),
      expected_chunks: 5,
    },
    estimated_duration_minutes: Math.min(Math.max(lesson.duration_minutes, 3), 45),
    difficulty_level: 'intermediate' as const,
  };
}

// ============================================================================
// STAGE-SPECIFIC JOB QUEUEING
// ============================================================================

/**
 * Queue Stage 3 (Document Classification) job
 */
export async function queueStage3Job(
  courseId: string,
  baseJobData: Record<string, unknown>,
  priority: number,
  idempotentJobId: string
): Promise<void> {
  const classificationJobData: JobData = {
    ...baseJobData,
    jobType: JobType.DOCUMENT_CLASSIFICATION,
  } as JobData;

  await addJob(JobType.DOCUMENT_CLASSIFICATION, classificationJobData, {
    priority,
    jobId: idempotentJobId,
  });
  logger.info(
    { courseId, nextStage: 3, jobId: idempotentJobId },
    'Queued DOCUMENT_CLASSIFICATION job'
  );
}

/**
 * Queue Stage 4 (Structure Analysis) job
 */
export async function queueStage4Job(
  courseId: string,
  course: CourseForAutoApproval,
  baseJobData: Record<string, unknown>,
  priority: number,
  idempotentJobId: string
): Promise<void> {
  const settings = (course.settings as CourseSettings) || {};
  const jobData: JobData = {
    ...baseJobData,
    jobType: JobType.STRUCTURE_ANALYSIS,
    title: course.title || undefined,
    settings: settings as Record<string, unknown>,
  } as JobData;

  await addJob(JobType.STRUCTURE_ANALYSIS, jobData, {
    priority,
    jobId: idempotentJobId,
  });
  logger.info({ courseId, nextStage: 4, jobId: idempotentJobId }, 'Queued STRUCTURE_ANALYSIS job');
}

/**
 * Queue Stage 5 (Structure Generation) job
 */
export async function queueStage5Job(
  courseId: string,
  course: CourseForAutoApproval,
  userId: string,
  organizationId: string,
  priority: number,
  idempotentJobId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const analysisResult = course.analysis_result;
  const { data: vectorizedFiles } = await supabase
    .from('file_catalog')
    .select('id, filename, processed_content')
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']);

  const hasVectorizedDocs = Boolean(vectorizedFiles && vectorizedFiles.length > 0);
  const documentSummaries = hasVectorizedDocs
    ? (
        vectorizedFiles as Array<{
          id: string;
          filename: string;
          processed_content: string | null;
        }>
      ).map(file => ({
        file_id: file.id,
        file_name: file.filename,
        summary: file.processed_content || '',
        key_topics: [],
      }))
    : [];

  const settings = (course.settings as CourseSettings) || {};
  const jobInput: GenerationJobInput = {
    course_id: courseId,
    organization_id: organizationId,
    user_id: userId,
    analysis_result: analysisResult as AnalysisResult | null,
    frontend_parameters: {
      course_title: course.title || '',
      language: course.language ?? undefined,
      style: (course.style && isValidStyle(course.style) ? course.style : undefined) as
        | CourseStyle
        | null
        | undefined,
      target_audience: isValidTargetAudience(course.target_audience)
        ? course.target_audience
        : undefined,
      difficulty: isValidDifficulty(course.difficulty) ? course.difficulty : 'intermediate',
      description: course.course_description ?? undefined,
      course_size: course.course_size as
        | 'micro'
        | 'mini'
        | 'compact'
        | 'standard'
        | 'comprehensive'
        | 'auto'
        | null
        | undefined,
      desired_lessons_count: settings.desired_lessons_count,
      desired_modules_count: settings.desired_modules_count,
      lesson_duration_minutes: settings.lesson_duration_minutes,
      learning_outcomes: settings.learning_outcomes,
    },
    vectorized_documents: hasVectorizedDocs,
    document_summaries: documentSummaries,
  };

  // Note: Stage 5 handler expects GenerationJobInput which is not part of JobData union
  // This is a known architectural mismatch - using type assertion with explicit typing
  await addJob(JobType.STRUCTURE_GENERATION, jobInput as unknown as JobData, {
    priority,
    jobId: idempotentJobId,
  });
  logger.info(
    { courseId, nextStage: 5, jobId: idempotentJobId },
    'Queued STRUCTURE_GENERATION job'
  );
}

/**
 * Queue Stage 6 (Lesson Content Generation) jobs - one per lesson
 */
export async function queueStage6Jobs(courseId: string, priority: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: courseData, error: fetchError } = await supabase
    .from('courses')
    .select('course_structure, language, style, title, analysis_result')
    .eq('id', courseId)
    .single();

  if (fetchError || !courseData?.course_structure) {
    throw new Error(`Course structure not found for Stage 6: ${fetchError?.message || 'no data'}`);
  }

  // Parse course structure to get all lessons
  const allLessons = parseCourseStructureLessons(courseData.course_structure);

  if (allLessons.length === 0) {
    throw new Error('No lessons found in course structure for Stage 6');
  }

  // Determine language and style
  const language = (courseData.language || 'ru') as Language;
  const style =
    courseData.style && isValidStyle(courseData.style) ? courseData.style : DEFAULT_COURSE_STYLE;

  const courseTitle = courseData.title || 'Untitled Course';
  const stage6Queue = createStage6Queue();

  try {
    let queuedCount = 0;
    for (const lesson of allLessons) {
      const lessonJobId = `auto-${courseId}-stage6-lesson-${lesson.lesson_id}`;
      const fullLessonSpec = convertToLessonSpecV2(lesson, courseTitle);

      const lessonJobData: Stage6JobInput = {
        lessonSpec: fullLessonSpec,
        courseId,
        language,
        style,
        ragChunks: [],
        ragContextId: null,
        analysisResult: courseData.analysis_result as AnalysisResult | undefined,
      };

      await stage6Queue.add(`lesson:${lesson.lesson_id}`, lessonJobData, {
        priority,
        jobId: lessonJobId,
      });
      queuedCount++;
    }

    // Update status to stage_6_generating so checkAndSetStage6Complete can track completion
    const { error: statusError } = await supabase
      .from('courses')
      .update({ generation_status: 'stage_6_generating' })
      .eq('id', courseId)
      .eq('generation_status', 'stage_6_init');

    if (statusError) {
      logger.warn(
        { courseId, error: statusError.message },
        'Failed to update status to stage_6_generating (non-fatal)'
      );
    }

    logger.info(
      {
        courseId,
        nextStage: 6,
        lessonCount: allLessons.length,
        queuedCount,
        jobIdPrefix: `auto-${courseId}-stage6-lesson-`,
        statusUpdated: !statusError,
        queue: 'stage6-lesson-content',
      },
      'Queued LESSON_CONTENT jobs to dedicated Stage 6 queue'
    );
  } catch (queueError) {
    // CR-002: Log error with partial progress info
    logger.error(
      {
        courseId,
        nextStage: 6,
        totalLessons: allLessons.length,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      },
      'Failed to queue Stage 6 jobs (partial jobs may exist, safe to retry due to idempotent jobIds)'
    );
    throw new Error(
      `Failed to queue Stage 6 jobs: ${queueError instanceof Error ? queueError.message : String(queueError)}`
    );
  }
}

// ============================================================================
// COURSE STRUCTURE PARSING
// ============================================================================

/** Raw lesson from course_structure JSON */
interface RawLesson {
  lesson_title: string;
  lesson_number: number;
  lesson_objectives?: string[];
  key_topics?: string[];
  estimated_duration_minutes?: number;
}

/** Raw section from course_structure JSON */
interface RawSection {
  section_title: string;
  section_number: number;
  lessons: RawLesson[];
}

/** Parsed course structure */
interface CourseStructure {
  sections: RawSection[];
}

/** Mapped lesson with computed lesson_id */
interface MappedLesson {
  lesson_id: string;
  title: string;
  objectives: string[];
  topics: string[];
  duration_minutes: number;
  section_number: number;
  lesson_number: number;
}

/**
 * Parse course_structure JSON into mapped lesson array.
 */
function parseCourseStructureLessons(courseStructure: unknown): MappedLesson[] {
  const structure = courseStructure as CourseStructure;

  return structure.sections.flatMap((section, sectionIndex) =>
    section.lessons.map((lesson, lessonIndex) => ({
      lesson_id: `${section.section_number ?? sectionIndex + 1}.${lesson.lesson_number ?? lessonIndex + 1}`,
      title: lesson.lesson_title,
      objectives: lesson.lesson_objectives || [],
      topics: lesson.key_topics || [],
      duration_minutes: lesson.estimated_duration_minutes || 15,
      section_number: section.section_number ?? sectionIndex + 1,
      lesson_number: lesson.lesson_number ?? lessonIndex + 1,
    }))
  );
}
