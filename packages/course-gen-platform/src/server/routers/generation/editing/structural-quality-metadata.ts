import type { SupabaseClient } from '@supabase/supabase-js';
import type { CourseStructure, Database, GenerationJobInput, Json } from '@megacampus/shared-types';
import { validateStructuralQuality } from '@/stages/stage5-generation/validators/structural-quality-validator';
import { throwOnSupabaseError } from '@/server/utils/supabase-query-guard';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function buildStage5StructuralQualityMetadataUpdate(
  supabase: SupabaseClient<Database>,
  courseId: string,
  structure: CourseStructure,
  requestId?: string
): Promise<Json> {
  const { data: course, error } = await supabase
    .from('courses')
    .select(
      'id, user_id, organization_id, title, settings, language, style, target_audience, difficulty, course_description, course_size, analysis_result, generation_metadata'
    )
    .eq('id', courseId)
    .single();

  throwOnSupabaseError(error, 'Course structural quality metadata', { requestId, courseId });

  if (!course) {
    throw new Error(`Course not found for structural quality metadata update: ${courseId}`);
  }

  const settings = asRecord(course.settings);
  const input: GenerationJobInput = {
    course_id: courseId,
    organization_id: course.organization_id,
    user_id: course.user_id,
    analysis_result: course.analysis_result as GenerationJobInput['analysis_result'],
    frontend_parameters: {
      course_title: course.title || '',
      language: course.language ?? undefined,
      style: course.style as GenerationJobInput['frontend_parameters']['style'],
      target_audience: course.target_audience ?? undefined,
      difficulty:
        course.difficulty === 'beginner' ||
        course.difficulty === 'intermediate' ||
        course.difficulty === 'advanced'
          ? course.difficulty
          : undefined,
      description: course.course_description ?? undefined,
      course_size: course.course_size as GenerationJobInput['frontend_parameters']['course_size'],
      desired_lessons_count:
        typeof settings.desired_lessons_count === 'number'
          ? settings.desired_lessons_count
          : undefined,
      desired_modules_count:
        typeof settings.desired_modules_count === 'number'
          ? settings.desired_modules_count
          : undefined,
      lesson_duration_minutes:
        typeof settings.lesson_duration_minutes === 'number'
          ? settings.lesson_duration_minutes
          : undefined,
      learning_outcomes: Array.isArray(settings.learning_outcomes)
        ? settings.learning_outcomes.filter((item): item is string => typeof item === 'string')
        : undefined,
      settings,
    },
    vectorized_documents: false,
  };

  const structuralResult = validateStructuralQuality({
    input,
    metadata: {
      estimated_duration_hours: structure.estimated_duration_hours,
      difficulty_level: structure.difficulty_level,
    },
    sections: structure.sections,
  });

  const existingMetadata = asRecord(course.generation_metadata);
  const existingQualityScores = asRecord(existingMetadata.quality_scores);

  return {
    ...existingMetadata,
    quality_scores: {
      ...existingQualityScores,
      structure: structuralResult,
    },
  } as unknown as Json;
}
