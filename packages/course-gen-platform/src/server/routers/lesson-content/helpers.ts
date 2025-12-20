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
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { AnalysisResult } from '@megacampus/shared-types/analysis-result';

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
): Promise<{ id: string; user_id: string; organization_id: string; language: Language }> {
  const supabase = getSupabaseAdmin();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, user_id, organization_id, language')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.warn({
      requestId,
      courseId,
      userId,
      error,
    }, 'Course not found');

    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  // Check ownership or same organization
  if (course.user_id !== userId && course.organization_id !== organizationId) {
    logger.warn({
      requestId,
      courseId,
      userId,
      organizationId,
      courseOwnerId: course.user_id,
      courseOrgId: course.organization_id,
    }, 'Course access denied');

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
  analysisResult?: AnalysisResult
): LessonSpecificationV2 {
  // Get RAG plan from document_relevance_mapping for this section
  const ragPlan = analysisResult?.document_relevance_mapping?.[String(sectionNumber)];

  // Track DRM usage for monitoring data quality
  const hasDRM = !!ragPlan;
  const primaryDocsCount = ragPlan?.primary_documents?.length ?? 0;
  const usedFallback = !hasDRM || primaryDocsCount === 0;

  logger.debug({
    requestId,
    lessonId,
    sectionNumber,
    hasDRM,
    primaryDocsCount,
    usedFallback,
    searchQueriesCount: ragPlan?.search_queries?.length ?? 0,
  }, usedFallback
    ? 'DRM fallback: searching all documents'
    : 'DRM found: filtering by primary_documents');

  // Build learning objectives with minimal structure
  const learningObjectives = (lesson.lesson_objectives || ['Complete this lesson']).map((text, idx) => ({
    id: `LO-${lessonId}-${idx + 1}`,
    objective: text.length >= 10 ? text : `Learn about ${lesson.lesson_title}`,
    bloom_level: 'understand' as const,
  }));

  // Build key points from key_topics
  const keyPoints = (lesson.key_topics || [lesson.lesson_title]).map(topic =>
    topic.length >= 5 ? topic : `Introduction to ${topic}`
  );

  logger.debug({
    requestId,
    lessonId,
    title: lesson.lesson_title,
    objectivesCount: learningObjectives.length,
    keyPointsCount: keyPoints.length,
  }, 'Building minimal lesson spec from course_structure');

  // Return minimal but valid LessonSpecificationV2
  return {
    lesson_id: lessonId,
    title: lesson.lesson_title,
    description: (lesson.lesson_objectives || [])[0] || `This lesson covers ${lesson.lesson_title}`,
    metadata: {
      target_audience: 'practitioner',
      tone: 'conversational-professional',
      compliance_level: 'standard',
      content_archetype: 'concept_explainer',
    },
    learning_objectives: learningObjectives,
    intro_blueprint: {
      hook_strategy: 'question',
      hook_topic: lesson.lesson_title,
      key_learning_objectives: learningObjectives.map(lo => lo.objective).join(', '),
    },
    sections: [
      {
        title: 'Main Content',
        content_archetype: 'concept_explainer',
        rag_context_id: 'default',
        constraints: {
          depth: 'detailed_analysis',
          required_keywords: lesson.key_topics || [],
          prohibited_terms: [],
        },
        key_points_to_cover: keyPoints,
      },
    ],
    exercises: [],
    rag_context: {
      primary_documents: ragPlan?.primary_documents?.length ? ragPlan.primary_documents : [],
      search_queries: ragPlan?.search_queries?.length ? ragPlan.search_queries : (lesson.key_topics || [lesson.lesson_title]),
      expected_chunks: 7,
    },
    estimated_duration_minutes: lesson.estimated_duration_minutes || 15,
    difficulty_level: lesson.difficulty_level || 'intermediate',
  };
}
