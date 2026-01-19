/**
 * Auto-Approval Service for Automatic Generation Mode
 *
 * Handles automatic stage transitions when generation_mode = 'automatic'.
 * Instead of waiting for user approval, automatically proceeds to next stage.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../supabase/admin';
import { addJob } from '../../orchestrator/queue';
import {
  JobType,
  JobData,
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

type GenerationStatus = Database['public']['Enums']['generation_status'];

/**
 * Convert simplified lesson data from course_structure to full LessonSpecificationV2
 * Required for Stage 6 generator which expects detailed section specifications
 *
 * LessonSpecificationV2 schema requires:
 * - lesson_id: "section.lesson" format (e.g., "1.1")
 * - title, description
 * - metadata: { target_audience, tone, compliance_level, content_archetype }
 * - learning_objectives: [{ id, objective, bloom_level }]
 * - intro_blueprint: { hook_strategy, hook_topic, key_learning_objectives }
 * - sections: [{ title, content_archetype, rag_context_id, constraints, key_points_to_cover }]
 * - exercises: []
 * - rag_context: { primary_documents, search_queries, expected_chunks }
 * - estimated_duration_minutes
 * - difficulty_level
 */
function convertToLessonSpecV2(
  lesson: {
    lesson_id: string;
    title: string;
    objectives: string[];
    topics: string[];
    duration_minutes: number;
  },
  _courseTitle: string // Reserved for future use (e.g., course context in intro)
): LessonSpecificationV2 {
  // Create learning objectives with required V2 structure: id, objective, bloom_level
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

// Minimal course interface for auto-approval
interface CourseForAutoApproval {
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

/**
 * Handle stage completion with automatic mode support
 *
 * If generation_mode = 'automatic':
 *   - Auto-approve and transition to next stage
 *   - Queue next stage job
 *
 * If generation_mode = 'semi_automatic':
 *   - Set status to awaiting_approval (current behavior)
 */
export async function handleStageCompletion(
  courseId: string,
  currentStage: number,
  supabase?: SupabaseClient
): Promise<{ autoApproved: boolean; nextStage?: number }> {
  const db = supabase || getSupabaseAdmin();

  // Fetch course with generation mode
  const { data: course, error } = await db
    .from('courses')
    .select(
      'generation_mode, user_id, organization_id, title, settings, language, style, target_audience, difficulty, course_description, course_size, analysis_result, organization:organizations(tier)'
    )
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.error({ courseId, error }, 'Failed to fetch course for auto-approval');
    throw new Error(`Course not found: ${courseId}`);
  }

  // Check if automatic mode
  const isAutomatic = course.generation_mode === 'automatic';

  if (!isAutomatic) {
    // Semi-automatic: set to awaiting_approval
    const awaitingStatus = `stage_${currentStage}_awaiting_approval` as GenerationStatus;
    await db
      .from('courses')
      .update({
        generation_status: awaitingStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    logger.info(
      { courseId, currentStage, status: awaitingStatus },
      'Stage awaiting approval (semi-automatic)'
    );
    return { autoApproved: false };
  }

  // Automatic mode: proceed to next stage
  logger.info({ courseId, currentStage }, 'Auto-approving stage (automatic mode)');

  const nextStage = currentStage + 1;
  const completeStatus = `stage_${currentStage}_complete` as GenerationStatus;
  const nextStatus = `stage_${nextStage}_init` as GenerationStatus;

  // Different stages use different status suffixes:
  // - Stage 4: stage_4_analyzing
  // - Stage 5: stage_5_generating
  // - Stage 6: stage_6_generating
  const statusSuffix = currentStage === 4 ? 'analyzing' : 'generating';
  const expectedCurrentStatus = `stage_${currentStage}_${statusSuffix}` as GenerationStatus;

  // IDEMPOTENCY CHECK: Only proceed if course is in expected state
  // This prevents duplicate job creation on retry or race conditions
  const { data: currentCourse, error: statusError } = await db
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single();

  if (statusError || !currentCourse) {
    logger.warn({ courseId, error: statusError }, 'Failed to check course status for idempotency');
  } else {
    const currentStatus = currentCourse.generation_status as GenerationStatus;
    // Already processed - skip duplicate processing
    if (currentStatus === nextStatus || currentStatus === completeStatus) {
      logger.info(
        { courseId, currentStage, currentStatus },
        'Stage already transitioned (idempotent skip)'
      );
      return { autoApproved: true, nextStage };
    }
    // Not in expected state - something is wrong
    if (currentStatus !== expectedCurrentStatus) {
      logger.warn(
        {
          courseId,
          currentStage,
          expectedStatus: expectedCurrentStatus,
          actualStatus: currentStatus,
        },
        'Course not in expected state for auto-approval, skipping'
      );
      return { autoApproved: false };
    }
  }

  // FSM requires two-step transition: analyzing -> complete -> next_init
  // First: Set current stage to complete (required by FSM validation)
  // Use conditional update to prevent race conditions
  // CR-001 FIX: Check both error AND row count to detect silent failures
  const { data: updateResult, error: updateError } = await db
    .from('courses')
    .update({
      generation_status: completeStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId)
    .eq('generation_status', expectedCurrentStatus) // Only update if still in expected state
    .select('id');

  // CR-001: Check if update actually affected a row (empty result = race condition)
  if (updateError || !updateResult || updateResult.length === 0) {
    logger.warn(
      { courseId, error: updateError, rowsUpdated: updateResult?.length ?? 0 },
      'Failed to update status (race condition or status changed)'
    );
    return { autoApproved: false };
  }

  logger.debug({ courseId, status: completeStatus }, 'Stage marked complete');

  // Second: Transition to next stage init
  await db
    .from('courses')
    .update({
      generation_status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  // Queue next stage job based on stage number
  try {
    await queueNextStageJob(courseId, nextStage, course);
  } catch (queueError) {
    // Rollback status on job queueing failure
    const rollbackStatus = `stage_${currentStage}_complete` as GenerationStatus;
    logger.error(
      {
        courseId,
        nextStage,
        error: queueError instanceof Error ? queueError.message : String(queueError),
      },
      'Failed to queue next stage job, rolling back status'
    );

    await db
      .from('courses')
      .update({
        generation_status: rollbackStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    throw new Error(
      `Failed to queue stage ${nextStage}: ${queueError instanceof Error ? queueError.message : String(queueError)}`
    );
  }

  logger.info({ courseId, currentStage, nextStage }, 'Stage auto-approved, next stage queued');
  return { autoApproved: true, nextStage };
}

/**
 * Queue the appropriate job for the next stage
 */
async function queueNextStageJob(
  courseId: string,
  nextStage: number,
  course: CourseForAutoApproval
): Promise<void> {
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

  // IDEMPOTENCY: Use deterministic jobId to prevent duplicate jobs
  // BullMQ will reject job if one with same ID already exists
  const idempotentJobId = `auto-${courseId}-stage${nextStage}`;

  switch (nextStage) {
    case 3: {
      // Stage 3: Document Classification
      const classificationJobData: JobData = {
        ...baseJobData,
        jobType: JobType.DOCUMENT_CLASSIFICATION,
      };

      await addJob(JobType.DOCUMENT_CLASSIFICATION, classificationJobData, {
        priority,
        jobId: idempotentJobId,
      });
      logger.info(
        { courseId, nextStage: 3, jobId: idempotentJobId },
        'Queued DOCUMENT_CLASSIFICATION job'
      );
      break;
    }

    case 4: {
      // Stage 4: Structure Analysis
      // Note: Handler fetches documents from DB, no need to pass them
      const settings = (course.settings as CourseSettings) || {};
      // Use simplified StructureAnalysisJobData schema (handler fetches from DB)
      const jobData: JobData = {
        ...baseJobData,
        jobType: JobType.STRUCTURE_ANALYSIS,
        title: course.title || undefined,
        settings: settings as Record<string, unknown>,
      };

      await addJob(JobType.STRUCTURE_ANALYSIS, jobData, {
        priority,
        jobId: idempotentJobId,
      });
      logger.info(
        { courseId, nextStage: 4, jobId: idempotentJobId },
        'Queued STRUCTURE_ANALYSIS job'
      );
      break;
    }

    case 5: {
      // Stage 5: Structure Generation
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
          // Convert null to undefined for cleaner optional fields (nullish schema accepts both)
          // CR-008: Validate enums to prevent invalid values from breaking Zod
          language: course.language ?? undefined,
          style: (course.style && isValidStyle(course.style) ? course.style : undefined) as
            | CourseStyle
            | null
            | undefined,
          target_audience: isValidTargetAudience(course.target_audience)
            ? course.target_audience
            : undefined,
          difficulty: isValidDifficulty(course.difficulty) ? course.difficulty : undefined,
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
      break;
    }

    case 6: {
      // Stage 6: Lesson Content Generation
      // Fetch course structure to get lesson specs
      const supabase = getSupabaseAdmin();
      const { data: courseData, error: fetchError } = await supabase
        .from('courses')
        .select('course_structure, language, style, title')
        .eq('id', courseId)
        .single();

      if (fetchError || !courseData?.course_structure) {
        throw new Error(
          `Course structure not found for Stage 6: ${fetchError?.message || 'no data'}`
        );
      }

      // Parse course structure to get all lessons
      // Note: Stage 5 generates structure with different field names than LessonSpecificationV2
      interface RawLesson {
        lesson_title: string;
        lesson_number: number;
        lesson_objectives?: string[];
        key_topics?: string[];
        estimated_duration_minutes?: number;
      }
      interface RawSection {
        section_title: string;
        section_number: number;
        lessons: RawLesson[];
      }
      interface CourseStructure {
        sections: RawSection[];
      }

      const structure = courseData.course_structure as unknown as CourseStructure;

      // Map raw lessons to include generated lesson_id based on section and lesson numbers
      interface MappedLesson {
        lesson_id: string;
        title: string;
        objectives: string[];
        topics: string[];
        duration_minutes: number;
        section_number: number;
        lesson_number: number;
      }

      const allLessons: MappedLesson[] = structure.sections.flatMap((section, sectionIndex) =>
        section.lessons.map((lesson, lessonIndex) => ({
          // Use "section.lesson" format (e.g., "1.1") for compatibility with lesson-resolver
          lesson_id: `${section.section_number ?? sectionIndex + 1}.${lesson.lesson_number ?? lessonIndex + 1}`,
          title: lesson.lesson_title,
          objectives: lesson.lesson_objectives || [],
          topics: lesson.key_topics || [],
          duration_minutes: lesson.estimated_duration_minutes || 15,
          section_number: section.section_number ?? sectionIndex + 1,
          lesson_number: lesson.lesson_number ?? lessonIndex + 1,
        }))
      );

      if (allLessons.length === 0) {
        throw new Error('No lessons found in course structure for Stage 6');
      }

      // Determine language and style
      const language = (courseData.language || 'ru') as Language;
      const style =
        courseData.style && isValidStyle(courseData.style)
          ? courseData.style
          : DEFAULT_COURSE_STYLE;

      // CR-002 FIX: Wrap job queueing in try-catch to handle partial failures
      // Note: BullMQ idempotent jobIds prevent duplicate jobs on retry
      const courseTitle = courseData.title || 'Untitled Course';
      try {
        let queuedCount = 0;
        for (const lesson of allLessons) {
          const lessonJobId = `auto-${courseId}-stage6-lesson-${lesson.lesson_id}`;
          // Convert simplified lesson data to full LessonSpecificationV2 format
          // Stage 6 generator requires detailed section specifications
          const fullLessonSpec = convertToLessonSpecV2(lesson, courseTitle);
          const lessonJobData: JobData = {
            ...baseJobData,
            jobType: JobType.LESSON_CONTENT,
            lessonSpec: fullLessonSpec,
            ragChunks: [], // Handler fetches RAG chunks via retrieveLessonContext()
            ragContextId: null, // Handler manages context cache
            language,
            style,
          };

          await addJob(JobType.LESSON_CONTENT, lessonJobData, {
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
          .eq('generation_status', 'stage_6_init'); // Only update if still in init state

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
          },
          'Queued LESSON_CONTENT jobs for all lessons'
        );
      } catch (queueError) {
        // CR-002: Log error with partial progress info
        // Note: Already queued jobs are idempotent, safe to retry entire operation
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
      break;
    }

    default:
      logger.warn({ courseId, nextStage }, 'Unknown next stage for auto-queue');
  }
}

export { handleStageCompletion as default };
