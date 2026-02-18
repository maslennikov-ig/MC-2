/**
 * Lesson Content Helper Functions
 * @module server/routers/lesson-content/helpers
 *
 * Shared utility functions for lesson content router procedures.
 */

import { TRPCError } from '@trpc/server';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { Language } from '@megacampus/shared-types';
import type {
  LessonSpecificationV2,
  LessonContext,
} from '@megacampus/shared-types/lesson-specification-v2';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';
import {
  inferTargetAudience,
  mapTone,
  inferBloomLevel,
  inferContentArchetype,
  inferHookStrategy,
  mapDepth,
} from '../../../stages/stage5-generation/utils/semantic-scaffolding';

export type LessonFromStructure = {
  lesson_number: number;
  lesson_title: string;
  lesson_objectives?: string[];
  key_topics?: string[];
  estimated_duration_minutes?: number;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
};

export type SectionFromStructure = {
  section_number?: number;
  section_title: string;
  lessons: LessonFromStructure[];
};

// ── Shared lesson/section utility functions ──

export function buildLessonId(sectionNumber: number, lessonOrder: number): string {
  return `${sectionNumber}.${lessonOrder}`;
}

export function resolveSectionNumber(section: SectionFromStructure, sectionIndex: number): number {
  return section.section_number ?? sectionIndex + 1;
}

export function parseLessonId(
  lessonId: string
): { sectionNum: number; lessonOrder: number } | null {
  const match = lessonId.match(/^(\d+)\.(\d+)$/);
  if (!match) return null;

  const sectionNum = parseInt(match[1], 10);
  const lessonOrder = parseInt(match[2], 10);

  if (sectionNum <= 0 || lessonOrder <= 0) return null;

  return { sectionNum, lessonOrder };
}

export function findLessonByOrder(
  section: SectionFromStructure,
  lessonOrder: number
): LessonFromStructure | null {
  const lesson = section.lessons[lessonOrder - 1];
  return lesson ?? null;
}

/**
 * Verify user has access to course (course owner or same organization)
 *
 * @param courseId - Course UUID
 * @param userId - User UUID
 * @param organizationId - User's organization UUID
 * @param requestId - Request ID for logging
 * @returns Course data if access allowed
 * @throws TRPCError if course not found or access denied
 */
export async function verifyCourseAccess(
  courseId: string,
  userId: string,
  organizationId: string,
  requestId: string
): Promise<{
  id: string;
  user_id: string;
  organization_id: string;
  language: Language;
  style: string | null;
}> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, language, style')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.warn(
      {
        requestId,
        courseId,
        userId,
        error,
      },
      'Course not found'
    );

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn(
      {
        requestId,
        courseId,
        userId,
        organizationId,
        courseOwnerId: course.user_id,
        courseOrgId: course.organization_id,
      },
      'Course access denied'
    );

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this course',
    });
  }

  return {
    id: course.id,
    user_id: course.user_id,
    organization_id: course.organization_id,
    language: (course.language || 'en') as Language, // Default to English if not set
    style: course.style ?? null,
  };
}

/**
 * Build LessonContext from course_structure data.
 *
 * Constructs a complete LessonContext object providing inter-lesson coherence
 * information: previous/next lesson references, already-covered concepts, and
 * the lesson's position within the course hierarchy.
 *
 * @param lessonId - Lesson ID in format "section.lesson" (e.g., "1.2")
 * @param sectionNumber - Section number (1-based)
 * @param courseStructure - The full course structure with sections array
 * @returns Populated LessonContext object
 */
function buildLessonContextFromStructure(
  lessonId: string,
  sectionNumber: number,
  courseStructure: { sections: SectionFromStructure[] }
): LessonContext {
  const sections = courseStructure.sections;

  // Build flat ordered list of all lessons across the entire course
  const allLessons: Array<{
    id: string;
    title: string;
    objectives: string[];
    keyTopics: string[];
    sectionTitle: string;
    sectionIndex: number;
  }> = [];

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const sNum = section.section_number ?? si + 1;
    for (let li = 0; li < section.lessons.length; li++) {
      const lesson = section.lessons[li];
      allLessons.push({
        id: `${sNum}.${li + 1}`,
        title: lesson.lesson_title,
        objectives: lesson.lesson_objectives || [],
        keyTopics: lesson.key_topics || [],
        sectionTitle: section.section_title,
        sectionIndex: sNum,
      });
    }
  }

  const currentIdx = allLessons.findIndex(l => l.id === lessonId);

  // Guard: if lessonId not found in flat list, return minimal context
  if (currentIdx === -1) {
    return {
      previous_lesson: null,
      next_lesson: null,
      concepts_already_covered: [],
      terms_already_defined: [],
      course_position: {
        lesson_index_in_module: parseInt(lessonId.split('.')[1] ?? '1', 10) || 1,
        total_lessons_in_module: 1,
        module_index: sectionNumber,
        total_modules: sections.length,
        lesson_index_in_course: 1,
        total_lessons_in_course: allLessons.length || 1,
        module_title: `Module ${sectionNumber}`,
      },
    };
  }

  const current = allLessons[currentIdx];

  // Previous lesson context
  const prev = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const previous_lesson = prev
    ? {
        lesson_id: prev.id,
        title: prev.title,
        key_concepts: prev.keyTopics.slice(0, 5),
      }
    : null;

  // Next lesson context (no summary_preview per schema)
  const next = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const next_lesson = next
    ? {
        lesson_id: next.id,
        title: next.title,
        key_concepts: next.keyTopics.slice(0, 3),
      }
    : null;

  // Accumulate unique key_topics from all lessons before the current one (max 20)
  const concepts_already_covered: string[] = [];
  for (let i = 0; i < currentIdx && concepts_already_covered.length < 20; i++) {
    for (const topic of allLessons[i].keyTopics) {
      if (!concepts_already_covered.includes(topic) && concepts_already_covered.length < 20) {
        concepts_already_covered.push(topic);
      }
    }
  }

  // Terms already defined = key_topics from the immediately preceding lesson only
  const terms_already_defined = prev ? prev.keyTopics.slice(0, 10) : [];

  // Course position metadata
  const currentSection = sections.find((s, i) => (s.section_number ?? i + 1) === sectionNumber);
  const lessonsInModule = currentSection?.lessons.length ?? 1;
  const lessonOrderInModule = parseInt(lessonId.split('.')[1] ?? '1', 10);

  const course_position = {
    lesson_index_in_module: lessonOrderInModule,
    total_lessons_in_module: lessonsInModule,
    module_index: sectionNumber,
    total_modules: sections.length,
    lesson_index_in_course: currentIdx + 1,
    total_lessons_in_course: allLessons.length,
    module_title: current?.sectionTitle ?? `Module ${sectionNumber}`,
  };

  return {
    previous_lesson,
    next_lesson,
    concepts_already_covered,
    terms_already_defined,
    course_position,
  };
}

/**
 * Build minimal LessonSpecificationV2 from course_structure lesson data
 *
 * Creates a simplified but valid LessonSpecificationV2 object from the basic
 * lesson data stored in course_structure. This is used for partial regeneration
 * when full semantic scaffolding specs are not available.
 *
 * @param lessonId - Lesson ID in format "section.lesson"
 * @param lesson - Lesson data from course_structure
 * @param sectionNumber - Section number (1-based)
 * @param requestId - Request ID for logging
 * @param analysisResult - Optional analysis result for RAG context
 * @returns Minimal but valid LessonSpecificationV2 object
 */
export function buildMinimalLessonSpec(
  lessonId: string,
  lesson: {
    lesson_title: string;
    lesson_objectives?: string[];
    key_topics?: string[];
    estimated_duration_minutes?: number;
    difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
  },
  sectionNumber: number,
  requestId: string,
  analysisResult?: AnalysisResult | null,
  courseStructure?: { sections: SectionFromStructure[] }
): LessonSpecificationV2 {
  // Get RAG plan from document_relevance_mapping for this section
  const ragPlan = analysisResult?.document_relevance_mapping?.[String(sectionNumber)];

  // Track DRM usage for monitoring data quality
  const hasDRM = !!ragPlan;
  const primaryDocsCount = ragPlan?.primary_documents?.length ?? 0;
  const usedFallback = !hasDRM || primaryDocsCount === 0;

  logger.debug(
    {
      requestId,
      lessonId,
      sectionNumber,
      hasDRM,
      primaryDocsCount,
      usedFallback,
      searchQueriesCount: ragPlan?.search_queries?.length ?? 0,
    },
    usedFallback
      ? 'DRM fallback: searching all documents'
      : 'DRM found: filtering by primary_documents'
  );

  // Create a minimal SectionBreakdown for inference functions
  // This allows us to reuse semantic-scaffolding inference
  const sectionBreakdown: SectionBreakdown = {
    area: lesson.lesson_title,
    estimated_lessons: 1,
    importance: 'normal',
    learning_objectives: lesson.lesson_objectives || [],
    key_topics: lesson.key_topics || [],
    pedagogical_approach: '',
    difficulty: lesson.difficulty_level,
  };

  // Infer metadata from analysisResult (use defaults if not available)
  const inferredTargetAudience = inferTargetAudience(analysisResult);
  const inferredTone = mapTone(analysisResult?.generation_guidance?.tone);
  const inferredContentArchetype = inferContentArchetype(sectionBreakdown);
  const inferredHookStrategy = inferHookStrategy(
    lesson.lesson_objectives || [],
    lesson.key_topics || []
  );
  const inferredComplianceLevel =
    inferredContentArchetype === 'legal_warning' ? 'strict' : 'standard';
  const inferredDepth = mapDepth(lesson.difficulty_level, 'normal');

  logger.debug(
    {
      requestId,
      lessonId,
      inferredTargetAudience,
      inferredTone,
      inferredContentArchetype,
      inferredHookStrategy,
      inferredComplianceLevel,
      inferredDepth,
    },
    'Inferred semantic scaffolding values for minimal lesson spec'
  );

  // Build learning objectives with inferred Bloom levels
  const learningObjectives = (lesson.lesson_objectives || ['Complete this lesson']).map(
    (text, idx) => ({
      id: `LO-${lessonId}-${idx + 1}`,
      objective: text.length >= 10 ? text : `Learn about ${lesson.lesson_title}`,
      bloom_level: inferBloomLevel(text),
    })
  );

  // Build key points from key_topics
  const keyPoints = (lesson.key_topics || [lesson.lesson_title]).map(topic =>
    topic.length >= 5 ? topic : `Introduction to ${topic}`
  );

  logger.debug(
    {
      requestId,
      lessonId,
      title: lesson.lesson_title,
      objectivesCount: learningObjectives.length,
      keyPointsCount: keyPoints.length,
    },
    'Building minimal lesson spec from course_structure'
  );

  // Build sections from key_topics (like Stage 5 does) instead of hardcoded "Main Content"
  // This ensures section titles match the actual content topics
  const keyTopics = lesson.key_topics || [];
  const sections: LessonSpecificationV2['sections'] = [];

  if (keyTopics.length === 0) {
    // No key_topics: use lesson title as the single content section
    sections.push({
      title: lesson.lesson_title,
      content_archetype: inferredContentArchetype,
      rag_context_id: String(sectionNumber),
      constraints: {
        depth: inferredDepth,
        required_keywords: [],
        prohibited_terms: [],
      },
      key_points_to_cover: [`Understand the core concepts of ${lesson.lesson_title}`],
    });
  } else {
    // Create a section for each key_topic (matching Stage 5 behavior)
    for (const topic of keyTopics) {
      sections.push({
        title: topic,
        content_archetype: inferredContentArchetype,
        rag_context_id: String(sectionNumber),
        constraints: {
          depth: inferredDepth,
          required_keywords: [],
          prohibited_terms: [],
        },
        key_points_to_cover: [`Define and explain ${topic}`],
      });
    }
  }

  // Always add Conclusion section (matching Stage 5 behavior, required by heuristic filter)
  sections.push({
    title: 'Conclusion',
    content_archetype: inferredContentArchetype,
    rag_context_id: String(sectionNumber),
    constraints: {
      depth: 'summary', // Conclusions are always summary depth
      required_keywords: [],
      prohibited_terms: [],
    },
    key_points_to_cover: ['Key takeaways from this lesson', 'Next steps for learners'],
  });

  // Build the base minimal but valid LessonSpecificationV2
  const spec: LessonSpecificationV2 = {
    lesson_id: lessonId,
    title: lesson.lesson_title,
    description: (lesson.lesson_objectives || [])[0] || `This lesson covers ${lesson.lesson_title}`,
    metadata: {
      target_audience: inferredTargetAudience,
      tone: inferredTone,
      compliance_level: inferredComplianceLevel,
      content_archetype: inferredContentArchetype,
    },
    learning_objectives: learningObjectives,
    intro_blueprint: {
      hook_strategy: inferredHookStrategy,
      hook_topic: lesson.lesson_title,
      key_learning_objectives: learningObjectives.map(lo => lo.objective).join(', '),
    },
    sections,
    exercises: [],
    rag_context: {
      primary_documents: ragPlan?.primary_documents?.length ? ragPlan.primary_documents : [],
      search_queries: ragPlan?.search_queries?.length
        ? ragPlan.search_queries
        : lesson.key_topics || [lesson.lesson_title],
      expected_chunks: 7,
    },
    estimated_duration_minutes: lesson.estimated_duration_minutes || 15,
    difficulty_level: lesson.difficulty_level || 'intermediate',
  };

  // Build lesson_context from courseStructure if available
  if (courseStructure) {
    spec.lesson_context = buildLessonContextFromStructure(lessonId, sectionNumber, courseStructure);

    logger.debug(
      {
        requestId,
        lessonId,
        moduleIndex: spec.lesson_context.course_position?.module_index,
        lessonIndexInCourse: spec.lesson_context.course_position?.lesson_index_in_course,
        totalLessons: spec.lesson_context.course_position?.total_lessons_in_course,
        hasPrevious: spec.lesson_context.previous_lesson !== null,
        hasNext: spec.lesson_context.next_lesson !== null,
        conceptsCoveredCount: spec.lesson_context.concepts_already_covered.length,
      },
      'lesson_context built from course_structure'
    );
  }

  return spec;
}

/**
 * Transition a course's generation_status through the FSM to stage_6_generating.
 *
 * Handles all valid starting states:
 * - stage_5_awaiting_approval → stage_6_init → stage_6_generating
 * - stage_5_complete          → stage_6_init → stage_6_generating
 * - stage_6_init              → stage_6_generating
 * - stage_6_complete          → stage_6_generating  (re-generation of missing/partial content)
 * - stage_6_generating        → no-op (already in target state)
 *
 * Logs a warning if the current status is not in the set of allowed statuses.
 *
 * @param courseId  - Course UUID
 * @param requestId - Request ID for structured logging
 */
export async function transitionToStage6Generating(
  courseId: string,
  requestId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: statusData } = await supabase
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single();

  const currentStatus = statusData?.generation_status;

  const statusesAllowingStage6 = [
    'stage_5_complete',
    'stage_5_awaiting_approval',
    'stage_6_init',
    'stage_6_generating',
    'stage_6_complete',
  ];

  if (currentStatus === 'stage_5_awaiting_approval' || currentStatus === 'stage_5_complete') {
    logger.info(
      { requestId, courseId, currentStatus },
      currentStatus === 'stage_5_awaiting_approval'
        ? 'Auto-approving Stage 5 and starting Stage 6'
        : 'Starting Stage 6 from stage_5_complete'
    );

    // FSM requires intermediate step through stage_6_init
    await supabase.from('courses').update({ generation_status: 'stage_6_init' }).eq('id', courseId);

    const { error: updateError } = await supabase
      .from('courses')
      .update({ generation_status: 'stage_6_generating' })
      .eq('id', courseId);

    if (updateError) {
      logger.error(
        { requestId, courseId, error: updateError },
        'Failed to update generation_status to stage_6_generating'
      );
    }
  } else if (currentStatus === 'stage_6_init') {
    logger.info({ requestId, courseId, currentStatus }, 'Starting Stage 6 generation');

    const { error: updateError } = await supabase
      .from('courses')
      .update({ generation_status: 'stage_6_generating' })
      .eq('id', courseId);

    if (updateError) {
      logger.error(
        { requestId, courseId, error: updateError },
        'Failed to update generation_status to stage_6_generating'
      );
    }
  } else if (currentStatus === 'stage_6_complete') {
    // Re-generation: transition back to generating for new/missing content
    const { error: updateError } = await supabase
      .from('courses')
      .update({ generation_status: 'stage_6_generating' })
      .eq('id', courseId);

    if (updateError) {
      logger.error(
        { requestId, courseId, error: updateError },
        'Failed to update generation_status to stage_6_generating'
      );
    }
  } else if (!statusesAllowingStage6.includes(currentStatus || '')) {
    logger.warn({ requestId, courseId, currentStatus }, 'Course not ready for Stage 6 generation');
  }
  // stage_6_generating → no-op, already in target state
}
