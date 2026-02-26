import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import type {
  DeleteElementResponse,
  AddElementResponse,
} from '@megacampus/shared-types/regeneration-types';
import {
  deleteElement as deleteStructureElement,
  addElement as addStructureElement,
  ensureStableIdsAndSchemaVersionInMemory,
} from '../../../../stages/stage5-generation/utils/course-structure-editor';
import { llmClient } from '../../../../shared/llm/client';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';
import { DEFAULT_MODEL_ID } from '@megacampus/shared-types';
import { getElementAtPath } from '../_shared/helpers';
import { logger } from '../../../../shared/logger/index.js';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';
import { writeCourseNodes } from '../../../../shared/course-nodes/writer';
import { assertStableIds } from '../../../../shared/course-nodes/feature-flags';

/**
 * Fetch course and validate authorization
 */
async function fetchAndValidateCourse(
  supabase: SupabaseClient<Database>,
  courseId: string,
  userId: string,
  requestId: string
) {
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select(
      'id, user_id, organization_id, course_structure, generation_status, analysis_result, title'
    )
    .eq('id', courseId)
    .single();

  throwOnSupabaseError(courseError, 'Course', { requestId, userId, courseId });
  if (!course) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Course not found',
    });
  }

  return course;
}

/**
 * Validate that generation is not in progress
 */
function validateNotGenerating(generationStatus: string, courseId: string, requestId: string) {
  const inProgressStatuses = [
    'generating',
    'queued',
    'stage_2_init',
    'stage_2_processing',
    'stage_3_init',
    'stage_3_summarizing',
    'stage_4_init',
    'stage_4_analyzing',
    'stage_5_init',
    'stage_5_generating',
  ];

  if (inProgressStatuses.includes(generationStatus)) {
    logger.warn(
      { requestId, courseId, status: generationStatus },
      'Cannot modify elements while generating'
    );
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Cannot modify elements while course generation is in progress',
    });
  }
}

/**
 * Build confirmation response for delete operation
 */
function buildDeleteConfirmation(
  element: Section | Lesson,
  elementPath: string
): DeleteElementResponse {
  const isSection = !elementPath.includes('.lessons[');

  if (isSection) {
    const section = element as Section;
    return {
      requiresConfirmation: {
        elementType: 'section',
        title: section.section_title,
        lessonCount: section.lessons.length,
        impactSummary: `Удаление секции "${section.section_title}" удалит ${section.lessons.length} ${section.lessons.length === 1 ? 'урок' : section.lessons.length < 5 ? 'урока' : 'уроков'} и пересчитает длительность курса.`,
      },
    };
  } else {
    const lesson = element as Lesson;
    return {
      requiresConfirmation: {
        elementType: 'lesson',
        title: lesson.lesson_title,
        impactSummary: `Удаление урока "${lesson.lesson_title}" пересчитает нумерацию уроков и длительность секции.`,
      },
    };
  }
}

/**
 * Handle delete element operation
 */
export async function handleDeleteElement(
  supabase: SupabaseClient<Database>,
  courseId: string,
  elementPath: string,
  confirm: boolean,
  _userId: string,
  requestId: string,
  courseStructure: CourseStructure
): Promise<DeleteElementResponse> {
  let element: Section | Lesson;
  try {
    element = getElementAtPath(courseStructure, elementPath);
  } catch (error) {
    logger.warn(
      {
        requestId,
        courseId,
        elementPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Invalid element path in deleteElement'
    );
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid element path: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  if (!confirm) {
    return buildDeleteConfirmation(element, elementPath);
  }

  const result = deleteStructureElement(courseStructure, elementPath);
  const structureToPersist = ensureStableIdsAndSchemaVersionInMemory(result.updatedStructure);
  assertStableIds(structureToPersist);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('courses')
    .update({
      course_structure: structureToPersist,
      updated_at: now,
    })
    .eq('id', courseId);

  if (updateError) {
    logger.error(
      {
        requestId,
        courseId,
        elementPath,
        error: updateError,
      },
      'Database update failed in deleteElement'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to delete element',
    });
  }

  // Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
  const structureForNodes = structureToPersist;
  await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err =>
    logger.warn(
      { courseId, error: err instanceof Error ? err.message : String(err) },
      'course_nodes dual-write failed (non-fatal)'
    )
  );

  const isSection = !elementPath.includes('.lessons[');
  logger.info(
    {
      requestId,
      courseId,
      elementPath,
      isSection,
      recalculated: result.recalculated,
    },
    'Element deleted successfully'
  );

  return {
    success: true,
    updatedAt: now,
    recalculated: result.recalculated,
  };
}

/**
 * Extract context information for LLM prompt
 */
function extractContextInfo(
  elementType: 'lesson' | 'section',
  parentPath: string,
  courseStructure: CourseStructure
): string {
  let contextInfo = '';

  if (elementType === 'lesson' && parentPath.includes('.lessons')) {
    const sectionMatch = parentPath.match(/sections\[(\d+)\]/);
    if (sectionMatch) {
      const sectionIdx = parseInt(sectionMatch[1], 10);
      const section = courseStructure.sections[sectionIdx];
      if (section) {
        contextInfo = `Section: "${section.section_title}"\n`;
        contextInfo += `Section Description: ${section.section_description}\n`;
        if (section.lessons.length > 0) {
          const lastLesson = section.lessons[section.lessons.length - 1];
          contextInfo += `Previous Lesson: "${lastLesson.lesson_title}"\n`;
          contextInfo += `Topics: ${lastLesson.key_topics.join(', ')}\n`;
        }
      }
    }
  } else if (elementType === 'section' && courseStructure.sections.length > 0) {
    const lastSection = courseStructure.sections[courseStructure.sections.length - 1];
    contextInfo = `Previous Section: "${lastSection.section_title}"\n`;
    contextInfo += `Description: ${lastSection.section_description}\n`;
  }

  return contextInfo;
}

/**
 * Calculate average lesson duration from parent section
 */
function calculateAverageDuration(parentPath: string, courseStructure: CourseStructure): number {
  let averageDuration = 15;

  const sectionMatch = parentPath.match(/sections\[(\d+)\]/);
  if (sectionMatch) {
    const sectionIdx = parseInt(sectionMatch[1], 10);
    const section = courseStructure.sections[sectionIdx];
    if (section && section.lessons.length > 0) {
      const totalDuration = section.lessons.reduce(
        (sum, l) => sum + l.estimated_duration_minutes,
        0
      );
      averageDuration = Math.round(totalDuration / section.lessons.length);
    }
  }

  return averageDuration;
}

/**
 * Generate lesson via LLM
 */
async function generateLesson(
  courseTitle: string,
  targetAudience: string,
  difficultyLevel: string,
  detectedLanguage: string,
  contextInfo: string,
  userInstruction: string,
  averageDuration: number,
  requestId: string,
  courseId: string
): Promise<Lesson> {
  const lessonPrompt = `You are an expert instructional designer. Generate a detailed lesson for an online course.

Course Context:
- Title: "${courseTitle}"
- Target Audience: ${targetAudience}
- Difficulty: ${difficultyLevel}
- Language: ${detectedLanguage}

${contextInfo}

User Instruction:
${userInstruction}

Generate a lesson with:
1. lesson_title (5-500 chars)
2. lesson_objectives (1-5 items, each 10-600 chars, start with action verbs)
3. key_topics (2-10 items, each 5-300 chars)
4. estimated_duration_minutes (use ${averageDuration} minutes)
5. lesson_number (will be recalculated, use 0)

Return ONLY valid JSON matching this structure:
{
  "lesson_number": 0,
  "lesson_title": "...",
  "lesson_objectives": ["...", "..."],
  "key_topics": ["...", "..."],
  "estimated_duration_minutes": ${averageDuration}
}`;

  // Get model config from database (inline_element_crud phase)
  const modelConfigService = createModelConfigService();
  let lessonModelId = DEFAULT_MODEL_ID;
  let lessonTemperature = 0.7;
  let lessonMaxTokens = 2000;

  try {
    const config = await modelConfigService.getModelForPhase('inline_element_crud', courseId);
    lessonModelId = config.modelId || DEFAULT_MODEL_ID;
    lessonTemperature = config.temperature;
    lessonMaxTokens = config.maxTokens;
  } catch {
    logger.warn(
      { requestId, courseId },
      'ModelConfigService unavailable for inline_element_crud, using defaults'
    );
  }

  const response = await llmClient.generateCompletion(lessonPrompt, {
    model: lessonModelId,
    temperature: lessonTemperature,
    maxTokens: lessonMaxTokens,
    systemPrompt:
      'You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.',
  });

  try {
    return JSON.parse(response.content) as Lesson;
  } catch (parseError) {
    logger.error(
      { requestId, courseId, error: parseError, content: response.content },
      'Failed to parse LLM response for lesson'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'AI generation failed: invalid JSON response',
    });
  }
}

/**
 * Generate section via LLM
 */
async function generateSection(
  courseTitle: string,
  targetAudience: string,
  difficultyLevel: string,
  detectedLanguage: string,
  contextInfo: string,
  userInstruction: string,
  averageDuration: number,
  requestId: string,
  courseId: string
): Promise<Section> {
  const sectionPrompt = `You are an expert instructional designer. Generate a detailed section for an online course.

Course Context:
- Title: "${courseTitle}"
- Target Audience: ${targetAudience}
- Difficulty: ${difficultyLevel}
- Language: ${detectedLanguage}

${contextInfo}

User Instruction:
${userInstruction}

Generate a section with:
1. section_title (10-600 chars)
2. section_description (20-2000 chars)
3. learning_objectives (1-5 items, each 10-600 chars, start with action verbs)
4. section_number (will be recalculated, use 0)
5. lessons (1-3 initial lessons, each with all required fields)

Each lesson must have:
- lesson_number (use 0, will be recalculated)
- lesson_title (5-500 chars)
- lesson_objectives (1-5 items, each 10-600 chars)
- key_topics (2-10 items, each 5-300 chars)
- estimated_duration_minutes (${averageDuration} minutes)

Return ONLY valid JSON matching this structure:
{
  "section_number": 0,
  "section_title": "...",
  "section_description": "...",
  "learning_objectives": ["...", "..."],
  "lessons": [
    {
      "lesson_number": 0,
      "lesson_title": "...",
      "lesson_objectives": ["...", "..."],
      "key_topics": ["...", "..."],
      "estimated_duration_minutes": ${averageDuration}
    }
  ]
}`;

  // Get model config from database (inline_element_crud phase)
  const sectionModelConfigService = createModelConfigService();
  let sectionModelId = DEFAULT_MODEL_ID;
  let sectionTemperature = 0.7;
  let sectionMaxTokens = 4000;

  try {
    const config = await sectionModelConfigService.getModelForPhase(
      'inline_element_crud',
      courseId
    );
    sectionModelId = config.modelId || DEFAULT_MODEL_ID;
    sectionTemperature = config.temperature;
    sectionMaxTokens = config.maxTokens;
  } catch {
    logger.warn(
      { requestId, courseId },
      'ModelConfigService unavailable for inline_element_crud (section), using defaults'
    );
  }

  const response = await llmClient.generateCompletion(sectionPrompt, {
    model: sectionModelId,
    temperature: sectionTemperature,
    maxTokens: sectionMaxTokens,
    systemPrompt:
      'You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.',
  });

  try {
    return JSON.parse(response.content) as Section;
  } catch (parseError) {
    logger.error(
      { requestId, courseId, error: parseError, content: response.content },
      'Failed to parse LLM response for section'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'AI generation failed: invalid JSON response',
    });
  }
}

/**
 * Calculate element path after insertion
 */
function calculateElementPath(
  elementType: 'lesson' | 'section',
  parentPath: string,
  position: 'start' | 'end' | number,
  updatedStructure: CourseStructure
): string {
  if (elementType === 'lesson') {
    const sectionMatch = parentPath.match(/sections\[(\d+)\]/);
    if (sectionMatch) {
      const sectionIdx = parseInt(sectionMatch[1], 10);
      const section = updatedStructure.sections[sectionIdx];
      let lessonIdx = -1;

      if (position === 'start') {
        lessonIdx = 0;
      } else if (position === 'end') {
        lessonIdx = section.lessons.length - 1;
      } else if (typeof position === 'number') {
        lessonIdx = position;
      }

      return `sections[${sectionIdx}].lessons[${lessonIdx}]`;
    }
  } else {
    let sectionIdx = -1;
    if (position === 'start') {
      sectionIdx = 0;
    } else if (position === 'end') {
      sectionIdx = updatedStructure.sections.length - 1;
    } else if (typeof position === 'number') {
      sectionIdx = position;
    }
    return `sections[${sectionIdx}]`;
  }

  return '';
}

/**
 * Handle add element operation
 */
export async function handleAddElement(
  supabase: SupabaseClient<Database>,
  courseId: string,
  elementType: 'lesson' | 'section',
  parentPath: string,
  position: 'start' | 'end' | number,
  userInstruction: string,
  _userId: string,
  requestId: string,
  course: {
    course_structure: unknown;
    analysis_result: unknown;
    title: string | null;
  }
): Promise<AddElementResponse> {
  const courseStructure = course.course_structure as CourseStructure;
  const analysisResult = course.analysis_result as Record<string, unknown> | null;
  const courseTitle = course.title || 'Course';

  const recommendedStructure = analysisResult?.recommended_structure as
    | Record<string, unknown>
    | undefined;
  const targetAudience =
    typeof recommendedStructure?.target_audience === 'string'
      ? recommendedStructure.target_audience
      : 'general learners';
  const difficultyLevel =
    typeof recommendedStructure?.difficulty_level === 'string'
      ? recommendedStructure.difficulty_level
      : 'intermediate';
  const detectedLanguage = (analysisResult?.detected_language as string) || 'en';

  const contextInfo = extractContextInfo(elementType, parentPath, courseStructure);
  const averageDuration = calculateAverageDuration(parentPath, courseStructure);

  let generatedElement: Lesson | Section;

  if (elementType === 'lesson') {
    generatedElement = await generateLesson(
      courseTitle,
      targetAudience,
      difficultyLevel,
      detectedLanguage,
      contextInfo,
      userInstruction,
      averageDuration,
      requestId,
      courseId
    );
  } else {
    generatedElement = await generateSection(
      courseTitle,
      targetAudience,
      difficultyLevel,
      detectedLanguage,
      contextInfo,
      userInstruction,
      averageDuration,
      requestId,
      courseId
    );
  }

  const result = addStructureElement(courseStructure, parentPath, generatedElement, position);
  const elementPath = calculateElementPath(
    elementType,
    parentPath,
    position,
    result.updatedStructure
  );

  const structureToPersist = ensureStableIdsAndSchemaVersionInMemory(result.updatedStructure);
  assertStableIds(structureToPersist);
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('courses')
    .update({
      course_structure: structureToPersist,
      updated_at: now,
    })
    .eq('id', courseId);

  if (updateError) {
    logger.error(
      {
        requestId,
        courseId,
        parentPath,
        error: updateError,
      },
      'Database update failed in addElement'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to add element',
    });
  }

  // Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
  const structureForNodes = structureToPersist;
  await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err =>
    logger.warn(
      { courseId, error: err instanceof Error ? err.message : String(err) },
      'course_nodes dual-write failed (non-fatal)'
    )
  );

  logger.info(
    {
      requestId,
      courseId,
      elementType,
      elementPath,
      recalculated: result.recalculated,
    },
    'Element added successfully'
  );

  return {
    success: true,
    elementPath,
    updatedAt: now,
    generatedElement,
    recalculated: result.recalculated,
  };
}

/**
 * Validate path patterns
 */
export function validateElementPaths(elementType: 'lesson' | 'section', parentPath: string): void {
  const isLessonPath = parentPath.includes('.lessons');
  const isSectionPath = parentPath === 'sections';

  if (elementType === 'lesson' && !isLessonPath) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid parentPath for lesson: must end with ".lessons"',
    });
  }

  if (elementType === 'section' && !isSectionPath) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid parentPath for section: must be "sections"',
    });
  }
}

export { fetchAndValidateCourse, validateNotGenerating };
