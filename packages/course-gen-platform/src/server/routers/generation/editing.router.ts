/**
 * Editing Router
 * @module server/routers/generation/editing
 *
 * Handles course content editing operations for Stage 4 and Stage 5 outputs.
 * Provides inline editing, element deletion/addition, and AI-powered regeneration.
 *
 * All endpoints require instructor or admin role (instructorProcedure).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import {
  updateFieldInputSchema,
  deleteElementInputSchema,
  addElementInputSchema,
  regenerateBlockInputSchema,
  regenerationResponseSchema,
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import type {
  DeleteElementResponse,
  AddElementResponse,
  RegenerationResponse,
} from '@megacampus/shared-types/regeneration-types';
import {
  applyFieldUpdate,
  deleteElement as deleteStructureElement,
  addElement as addStructureElement,
} from '../../../stages/stage5-generation/utils/course-structure-editor';
import { llmClient } from '../../../shared/llm/client';
import {
  detectContextTier,
  generateSemanticDiff,
  assembleStaticContext,
  assembleDynamicContext,
  getFieldValue,
} from '../../../shared/regeneration';
import { contextCacheManager } from '../../../shared/regeneration/context-cache-manager';
import {
  setNestedValue,
  normalizePathForValidation,
  getElementAtPath,
  canUserEditCourse,
} from './_shared/helpers';

/**
 * Editing Router - Course content editing operations
 *
 * Endpoints:
 * - updateField: Update a field in course analysis_result or course_structure
 * - deleteElement: Delete a lesson or section from Stage 5 course structure
 * - addElement: Add a lesson or section to Stage 5 course structure with AI generation
 * - regenerateBlock: Regenerate a block (field) using AI with smart context routing
 * - getEditPermissions: Check if the current user can edit a specific course
 */
export const editingRouter = router({
  /**
   * Update a field in course analysis_result or course_structure
   *
   * Purpose: Inline editing of Stage 4/5 output data
   * Authorization: Course owner only
   *
   * Input:
   * - courseId: UUID of the course to update
   * - stageId: 'stage_4' or 'stage_5' (determines which JSONB column to update)
   * - fieldPath: Nested field path (e.g., "topic_analysis.key_concepts")
   * - value: New value to set (can be any JSON-compatible type)
   *
   * Output:
   * - success: Boolean success flag
   * - fieldPath: The field path that was updated
   * - updatedAt: ISO timestamp of the update
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Not owner → 403 FORBIDDEN
   * - Invalid fieldPath → 400 BAD_REQUEST
   * - DB error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.editing.updateField.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   stageId: 'stage_4',
   *   fieldPath: 'topic_analysis.key_concepts',
   *   value: ['AI', 'Machine Learning', 'Deep Learning'],
   * });
   * // { success: true, fieldPath: '...', updatedAt: '2025-01-13T...' }
   * ```
   */
  updateField: instructorProcedure
    .input(updateFieldInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, stageId, fieldPath, value } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        // Step 1: Fetch course and verify ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, analysis_result, course_structure')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify course ownership
        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in updateField');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 2.5: Validate field path against whitelist
        const allowedFields = stageId === 'stage_4'
          ? STAGE4_EDITABLE_FIELDS
          : STAGE5_EDITABLE_FIELDS;

        // For Stage 5, normalize the path to match wildcard patterns in whitelist
        const normalizedFieldPath = stageId === 'stage_5'
          ? normalizePathForValidation(fieldPath)
          : fieldPath;

        if (!allowedFields.includes(normalizedFieldPath)) {
          logger.warn({
            requestId,
            courseId,
            stageId,
            fieldPath,
            normalizedFieldPath,
            allowedFields,
          }, 'Field path not in whitelist');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Field "${fieldPath}" is not editable`,
          });
        }

        // Step 3: Get current data based on stageId
        const currentData = stageId === 'stage_4'
          ? course.analysis_result
          : course.course_structure;

        if (!currentData) {
          logger.warn({ requestId, courseId, stageId }, 'Target data is null or undefined');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot update field: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
          });
        }

        // Step 4: Clone and update the data
        let updatedData: unknown;
        let recalculated: { sectionDuration?: number; courseDuration?: number } | undefined;

        try {
          if (stageId === 'stage_5') {
            // For Stage 5, use applyFieldUpdate which handles recalculation
            const result = applyFieldUpdate(
              currentData as CourseStructure,
              fieldPath,
              value
            );
            updatedData = result.updatedStructure;
            recalculated = result.recalculated;
          } else {
            // For Stage 4, use setNestedValue (mutable update)
            updatedData = structuredClone(currentData);
            setNestedValue(updatedData, fieldPath, value);
          }
        } catch (error) {
          logger.warn({
            requestId,
            courseId,
            fieldPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Invalid field path');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid field path: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        // Step 5: Update database
        const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
        const now = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('courses')
          .update({
            [updateColumn]: updatedData,
            updated_at: now,
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            stageId,
            fieldPath,
            error: updateError,
          }, 'Database update failed in updateField');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update field',
          });
        }

        // Step 6: Success response
        logger.info({
          requestId,
          courseId,
          stageId,
          fieldPath,
          recalculated,
        }, 'Field updated successfully');

        return {
          success: true,
          fieldPath,
          updatedAt: now,
          ...(recalculated && { recalculated }),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in updateField');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Delete a lesson or section from Stage 5 course structure
   *
   * Purpose: Safely delete elements from course structure with confirmation flow
   * Authorization: Course owner only
   *
   * Two-phase deletion flow:
   * 1. First call with confirm=false returns confirmation data (element details, impact)
   * 2. Second call with confirm=true performs actual deletion with recalculation
   *
   * Input:
   * - courseId: UUID of the course to update
   * - elementPath: Path to element (e.g., "sections[0].lessons[2]" or "sections[1]")
   * - confirm: If false (default), return confirmation data. If true, delete element.
   *
   * Output (when confirm=false):
   * - requiresConfirmation: Object with element details and impact summary
   *
   * Output (when confirm=true):
   * - success: Boolean success flag
   * - updatedAt: ISO timestamp of the update
   * - recalculated: Object with recalculated durations and lesson numbers
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Not owner → 403 FORBIDDEN
   * - Invalid elementPath → 400 BAD_REQUEST
   * - Course is generating → 409 CONFLICT
   * - DB error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * // Step 1: Get confirmation data
   * const confirmData = await trpc.generation.editing.deleteElement.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   elementPath: 'sections[0].lessons[2]',
   *   confirm: false,
   * });
   * // { requiresConfirmation: { elementType: 'lesson', title: '...', impactSummary: '...' } }
   *
   * // Step 2: Confirm deletion
   * const result = await trpc.generation.editing.deleteElement.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   elementPath: 'sections[0].lessons[2]',
   *   confirm: true,
   * });
   * // { success: true, updatedAt: '2025-01-13T...', recalculated: { ... } }
   * ```
   */
  deleteElement: instructorProcedure
    .input(deleteElementInputSchema)
    .mutation(async ({ ctx, input }): Promise<DeleteElementResponse> => {
      const { courseId, elementPath, confirm } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        // Step 1: Fetch course and verify ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, course_structure, generation_status')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify course ownership
        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in deleteElement');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 3: Validate course structure exists
        const courseStructure = course.course_structure as CourseStructure | null;
        if (!courseStructure) {
          logger.warn({ requestId, courseId }, 'Course structure is null');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found',
          });
        }

        // Step 4: Prevent deletion if course is generating
        const generationStatus = course.generation_status as string;
        const inProgressStatuses = [
          'generating', 'queued',
          'stage_2_init', 'stage_2_processing',
          'stage_3_init', 'stage_3_summarizing',
          'stage_4_init', 'stage_4_analyzing',
          'stage_5_init', 'stage_5_generating',
        ];

        if (inProgressStatuses.includes(generationStatus)) {
          logger.warn({ requestId, courseId, status: generationStatus }, 'Cannot delete while generating');
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot delete elements while course generation is in progress',
          });
        }

        // Step 5: Get element at path and determine type
        let element: Section | Lesson;
        try {
          element = getElementAtPath(courseStructure, elementPath);
        } catch (error) {
          logger.warn({
            requestId,
            courseId,
            elementPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Invalid element path in deleteElement');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid element path: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        const isSection = !elementPath.includes('.lessons[');

        // Step 6: If not confirmed, return confirmation data
        if (!confirm) {
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

        // Step 7: Apply deletion using course-structure-editor
        const result = deleteStructureElement(courseStructure, elementPath);

        // Step 8: Save to database
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            course_structure: result.updatedStructure,
            updated_at: now,
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            elementPath,
            error: updateError,
          }, 'Database update failed in deleteElement');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete element',
          });
        }

        // Step 9: Success response
        logger.info({
          requestId,
          courseId,
          elementPath,
          isSection,
          recalculated: result.recalculated,
        }, 'Element deleted successfully');

        return {
          success: true,
          updatedAt: now,
          recalculated: result.recalculated,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in deleteElement');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Add a lesson or section to Stage 5 course structure with AI generation
   *
   * Purpose: Create new elements in course structure using AI-assisted content generation
   * Authorization: Course owner only
   *
   * Input:
   * - courseId: UUID of the course to update
   * - elementType: 'lesson' or 'section'
   * - parentPath: Path to parent container (e.g., "sections[0].lessons" or "sections")
   * - position: Where to insert ('start', 'end', or numeric index)
   * - userInstruction: AI instruction for content generation (10-1000 chars)
   *
   * Output:
   * - success: Boolean success flag
   * - elementPath: Path to the newly created element
   * - updatedAt: ISO timestamp of the update
   * - generatedElement: The AI-generated lesson or section
   * - recalculated: Object with recalculated durations and lesson numbers
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Not owner → 403 FORBIDDEN
   * - Invalid parentPath → 400 BAD_REQUEST
   * - Course is generating → 409 CONFLICT
   * - AI generation error → 500 INTERNAL_SERVER_ERROR
   * - DB error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.editing.addElement.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   elementType: 'lesson',
   *   parentPath: 'sections[0].lessons',
   *   position: 'end',
   *   userInstruction: 'Create a lesson about REST API authentication using JWT tokens',
   * });
   * // { success: true, elementPath: 'sections[0].lessons[3]', ... }
   * ```
   */
  addElement: instructorProcedure
    .input(addElementInputSchema)
    .mutation(async ({ ctx, input }): Promise<AddElementResponse> => {
      const { courseId, elementType, parentPath, position, userInstruction } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        // Step 1: Fetch course and verify ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, course_structure, generation_status, analysis_result, title')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify course ownership
        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in addElement');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 3: Validate course structure exists
        const courseStructure = course.course_structure as CourseStructure | null;
        if (!courseStructure) {
          logger.warn({ requestId, courseId }, 'Course structure is null');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found',
          });
        }

        // Step 4: Prevent addition if course is generating
        const generationStatus = course.generation_status as string;
        const inProgressStatuses = [
          'generating', 'queued',
          'stage_2_init', 'stage_2_processing',
          'stage_3_init', 'stage_3_summarizing',
          'stage_4_init', 'stage_4_analyzing',
          'stage_5_init', 'stage_5_generating',
        ];

        if (inProgressStatuses.includes(generationStatus)) {
          logger.warn({ requestId, courseId, status: generationStatus }, 'Cannot add element while generating');
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cannot add elements while course generation is in progress',
          });
        }

        // Step 5: Validate parentPath format
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

        // Step 6: Extract context for AI generation
        const analysisResult = course.analysis_result as Record<string, unknown> | null;
        const courseTitle = course.title || 'Course';
        const recommendedStructure = analysisResult?.recommended_structure as Record<string, unknown> | undefined;
        const targetAudience = recommendedStructure?.target_audience || 'general learners';
        const difficultyLevel = recommendedStructure?.difficulty_level || 'intermediate';
        const detectedLanguage = (analysisResult?.detected_language as string) || 'en';

        // Step 7: Get context from adjacent elements
        let contextInfo = '';
        if (elementType === 'lesson' && isLessonPath) {
          // Extract section index from parentPath
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

        // Step 8: Calculate average lesson duration from existing lessons
        let averageDuration = 15; // Default 15 minutes
        if (elementType === 'lesson' && isLessonPath) {
          const sectionMatch = parentPath.match(/sections\[(\d+)\]/);
          if (sectionMatch) {
            const sectionIdx = parseInt(sectionMatch[1], 10);
            const section = courseStructure.sections[sectionIdx];
            if (section && section.lessons.length > 0) {
              const totalDuration = section.lessons.reduce((sum, l) => sum + l.estimated_duration_minutes, 0);
              averageDuration = Math.round(totalDuration / section.lessons.length);
            }
          }
        }

        // Step 9: Generate element content using LLM
        let generatedElement: Lesson | Section;

        if (elementType === 'lesson') {
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
4. practical_exercises (3-5 items, each with exercise_type, exercise_title, exercise_description)
5. estimated_duration_minutes (use ${averageDuration} minutes)
6. lesson_number (will be recalculated, use 0)

Return ONLY valid JSON matching this structure:
{
  "lesson_number": 0,
  "lesson_title": "...",
  "lesson_objectives": ["...", "..."],
  "key_topics": ["...", "..."],
  "estimated_duration_minutes": ${averageDuration},
  "practical_exercises": [
    {
      "exercise_type": "...",
      "exercise_title": "...",
      "exercise_description": "..."
    }
  ]
}`;

          const response = await llmClient.generateCompletion(lessonPrompt, {
            model: 'openai/gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 2000,
            systemPrompt: 'You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.',
          });

          try {
            generatedElement = JSON.parse(response.content) as Lesson;
          } catch (parseError) {
            logger.error({
              requestId,
              courseId,
              error: parseError,
              content: response.content,
            }, 'Failed to parse LLM response for lesson');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'AI generation failed: invalid JSON response',
            });
          }
        } else {
          // Generate section
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
- practical_exercises (3-5 items with exercise_type, exercise_title, exercise_description)
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
      "estimated_duration_minutes": ${averageDuration},
      "practical_exercises": [
        {"exercise_type": "...", "exercise_title": "...", "exercise_description": "..."}
      ]
    }
  ]
}`;

          const response = await llmClient.generateCompletion(sectionPrompt, {
            model: 'openai/gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 4000,
            systemPrompt: 'You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.',
          });

          try {
            generatedElement = JSON.parse(response.content) as Section;
          } catch (parseError) {
            logger.error({
              requestId,
              courseId,
              error: parseError,
              content: response.content,
            }, 'Failed to parse LLM response for section');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'AI generation failed: invalid JSON response',
            });
          }
        }

        // Step 10: Apply addition using course-structure-editor
        const result = addStructureElement(courseStructure, parentPath, generatedElement, position);

        // Step 11: Calculate element path
        let elementPath = '';
        if (elementType === 'lesson') {
          const sectionMatch = parentPath.match(/sections\[(\d+)\]/);
          if (sectionMatch) {
            const sectionIdx = parseInt(sectionMatch[1], 10);
            const section = result.updatedStructure.sections[sectionIdx];
            let lessonIdx = -1;

            if (position === 'start') {
              lessonIdx = 0;
            } else if (position === 'end') {
              lessonIdx = section.lessons.length - 1;
            } else if (typeof position === 'number') {
              lessonIdx = position;
            }

            elementPath = `sections[${sectionIdx}].lessons[${lessonIdx}]`;
          }
        } else {
          // Section
          let sectionIdx = -1;
          if (position === 'start') {
            sectionIdx = 0;
          } else if (position === 'end') {
            sectionIdx = result.updatedStructure.sections.length - 1;
          } else if (typeof position === 'number') {
            sectionIdx = position;
          }
          elementPath = `sections[${sectionIdx}]`;
        }

        // Step 12: Save to database
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            course_structure: result.updatedStructure,
            updated_at: now,
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            parentPath,
            error: updateError,
          }, 'Database update failed in addElement');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add element',
          });
        }

        // Step 13: Success response
        logger.info({
          requestId,
          courseId,
          elementType,
          elementPath,
          recalculated: result.recalculated,
        }, 'Element added successfully');

        return {
          success: true,
          elementPath,
          updatedAt: now,
          generatedElement,
          recalculated: result.recalculated,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in addElement');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Regenerate a block (field) of Stage 4 or Stage 5 output using AI
   *
   * Purpose: Smart regeneration of specific fields using context-aware AI with semantic diff tracking
   * Authorization: Course owner (instructor/admin only)
   *
   * Input:
   * - courseId: UUID of the course to update
   * - stageId: 'stage_4' or 'stage_5' (determines which JSONB column to read/update)
   * - blockPath: Nested field path (e.g., "topic_analysis.key_concepts")
   * - userInstruction: AI instruction for regeneration (1-500 chars)
   *
   * Output:
   * - regenerated_content: The new field value
   * - pedagogical_change_log: Explanation of changes
   * - alignment_score: 1-5 score indicating alignment with original
   * - bloom_level_preserved: Whether Bloom's taxonomy level was maintained
   * - concepts_added: List of concepts added
   * - concepts_removed: List of concepts removed
   *
   * Smart Context Routing:
   * - Detects context tier from user instruction (atomic/local/structural/global)
   * - Assembles appropriate context based on tier (100-5000 tokens)
   * - Uses XML-structured prompts for LLM clarity
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Not owner → 403 FORBIDDEN
   * - Invalid blockPath → 400 BAD_REQUEST
   * - AI generation error → 500 INTERNAL_SERVER_ERROR
   * - DB error → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.editing.regenerateBlock.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   stageId: 'stage_4',
   *   blockPath: 'topic_analysis.key_concepts',
   *   userInstruction: 'Make this simpler for beginners',
   * });
   * // { regenerated_content: [...], pedagogical_change_log: '...', ... }
   * ```
   */
  regenerateBlock: instructorProcedure
    .input(regenerateBlockInputSchema)
    .mutation(async ({ ctx, input }): Promise<RegenerationResponse> => {
      const { courseId, stageId, blockPath, userInstruction } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        // Step 1: Fetch course and verify ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, analysis_result, course_structure')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        // Step 2: Verify course ownership
        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in regenerateBlock');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 3: Get current data based on stageId
        const currentData = stageId === 'stage_4'
          ? course.analysis_result
          : course.course_structure;

        if (!currentData) {
          logger.warn({ requestId, courseId, stageId }, 'Target data is null or undefined');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot regenerate: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
          });
        }

        // Step 4: Detect context tier using smart routing
        const tier = detectContextTier(userInstruction);

        logger.info({
          requestId,
          courseId,
          stageId,
          blockPath,
          tier,
          instruction: userInstruction.slice(0, 100),
        }, 'RegenerateBlock: Context tier detected');

        // Step 5: Assemble context with caching
        // Check cache for static context
        const cacheKey = contextCacheManager.getCacheKey(courseId, tier);
        let staticContextContent: string;
        let staticTokenEstimate: number;
        let cacheHit = false;

        const cachedStatic = contextCacheManager.get(cacheKey);
        if (cachedStatic) {
          staticContextContent = cachedStatic.content;
          staticTokenEstimate = cachedStatic.tokenEstimate;
          cacheHit = true;

          logger.info({
            requestId,
            courseId,
            tier,
            cacheKey,
            tokenEstimate: staticTokenEstimate,
          }, 'RegenerateBlock: Static context cache hit');
        } else {
          // Assemble and cache static context
          const staticContext = await assembleStaticContext({
            courseId,
            stageId,
            blockPath,
            tier,
            analysisResult: course.analysis_result as any,
            courseStructure: course.course_structure as any,
          });

          staticContextContent = staticContext.content;
          staticTokenEstimate = staticContext.tokenEstimate;

          // Cache for future requests
          contextCacheManager.set(cacheKey, staticContextContent, staticTokenEstimate);

          logger.info({
            requestId,
            courseId,
            tier,
            cacheKey,
            tokenEstimate: staticTokenEstimate,
          }, 'RegenerateBlock: Static context assembled and cached');
        }

        // Always assemble dynamic context (not cached)
        const dynamicContext = await assembleDynamicContext({
          courseId,
          stageId,
          blockPath,
          tier,
          analysisResult: course.analysis_result as any,
          courseStructure: course.course_structure as any,
        });

        const dynamicContextContent = dynamicContext.content;
        const dynamicTokenEstimate = dynamicContext.tokenEstimate;

        logger.info({
          requestId,
          courseId,
          blockPath,
          tier,
          staticTokens: staticTokenEstimate,
          dynamicTokens: dynamicTokenEstimate,
          totalTokens: staticTokenEstimate + dynamicTokenEstimate,
          cacheHit,
        }, 'RegenerateBlock: Context assembled (static + dynamic)');

        // Step 6: Build system prompt with static context (cacheable)
        const systemPrompt = `You are an expert instructional designer. Generate valid JSON only, no markdown or explanations.

<static_context>
${staticContextContent}
</static_context>

<requirements>
  - Preserve the pedagogical intent and Bloom's taxonomy level
  - Maintain consistency with surrounding content
  - Return ONLY valid JSON with the following structure:
  {
    "regenerated_content": <the new field value>,
    "pedagogical_change_log": "<explanation of changes>",
    "alignment_score": <1-5>,
    "bloom_level_preserved": <true/false>,
    "concepts_added": ["..."],
    "concepts_removed": ["..."]
  }
</requirements>`;

        // Step 7: Build user prompt with dynamic context (not cacheable)
        const userPrompt = `<regeneration_task>
  <instruction>${userInstruction}</instruction>
  <target_field>${blockPath}</target_field>

  <dynamic_context>
${dynamicContextContent}
  </dynamic_context>
</regeneration_task>`;

        // Step 8: Call LLM with cache control enabled
        logger.info({
          requestId,
          courseId,
          blockPath,
          model: 'openai/gpt-4o-mini',
          enableCaching: true,
        }, 'RegenerateBlock: Calling LLM with cache control');

        const llmResponse = await llmClient.generateCompletion(userPrompt, {
          model: 'openai/gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2000,
          systemPrompt,
          enableCaching: true, // Enable OpenRouter/Anthropic prompt caching
        });

        // Step 8: Parse and validate LLM response
        let regenerationData: RegenerationResponse;
        try {
          // Remove markdown code blocks if present
          let cleanedContent = llmResponse.content.trim();
          if (cleanedContent.startsWith('```json')) {
            cleanedContent = cleanedContent.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
          } else if (cleanedContent.startsWith('```')) {
            cleanedContent = cleanedContent.replace(/```\n?/g, '').replace(/```\n?$/g, '');
          }

          const parsedResponse = JSON.parse(cleanedContent);
          regenerationData = regenerationResponseSchema.parse(parsedResponse);
        } catch (parseError) {
          logger.error({
            requestId,
            courseId,
            blockPath,
            error: parseError,
            content: llmResponse.content,
          }, 'Failed to parse LLM response for regenerateBlock');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'AI generation failed: invalid JSON response',
          });
        }

        logger.info({
          requestId,
          courseId,
          blockPath,
          alignmentScore: regenerationData.alignment_score,
          bloomPreserved: regenerationData.bloom_level_preserved,
        }, 'RegenerateBlock: LLM response parsed and validated');

        // Step 9: Extract target content for semantic diff
        const sourceData = stageId === 'stage_4' ? currentData : currentData;
        const targetContent = getFieldValue(sourceData, blockPath);

        // Step 10: Generate semantic diff
        const semanticDiff = await generateSemanticDiff({
          original: targetContent,
          regenerated: regenerationData.regenerated_content,
          fieldPath: blockPath,
          blockType: blockPath.split('.').pop() || blockPath,
          llmChangeLog: regenerationData.pedagogical_change_log,
        });

        logger.info({
          requestId,
          courseId,
          blockPath,
          changeType: semanticDiff.changeType,
          alignmentScore: semanticDiff.alignmentScore,
        }, 'RegenerateBlock: Semantic diff generated');

        // Step 10: Update the field in the database
        const updatedData = structuredClone(currentData);
        try {
          setNestedValue(updatedData, blockPath, regenerationData.regenerated_content);
        } catch (error) {
          logger.warn({
            requestId,
            courseId,
            blockPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Invalid field path in regenerateBlock');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid field path: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
        const now = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('courses')
          .update({
            [updateColumn]: updatedData,
            updated_at: now,
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            stageId,
            blockPath,
            error: updateError,
          }, 'Database update failed in regenerateBlock');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update regenerated content',
          });
        }

        // Step 11: Success response
        logger.info({
          requestId,
          courseId,
          stageId,
          blockPath,
          tier,
          staticTokens: staticTokenEstimate,
          dynamicTokens: dynamicTokenEstimate,
          totalTokens: staticTokenEstimate + dynamicTokenEstimate,
          inputTokens: llmResponse.inputTokens,
          outputTokens: llmResponse.outputTokens,
        }, 'RegenerateBlock: Completed successfully');

        return {
          regenerated_content: regenerationData.regenerated_content,
          pedagogical_change_log: regenerationData.pedagogical_change_log,
          alignment_score: regenerationData.alignment_score,
          bloom_level_preserved: regenerationData.bloom_level_preserved,
          concepts_added: regenerationData.concepts_added,
          concepts_removed: regenerationData.concepts_removed,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in regenerateBlock');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Get edit permissions for a course
   *
   * Purpose: Check if the current user can edit a specific course.
   * Returns edit permissions along with ownership and role information.
   *
   * Authorization: Requires instructor or admin role (instructorProcedure)
   *
   * Input:
   * - courseId: UUID of the course to check permissions for
   *
   * Output:
   * - canEdit: Boolean indicating if user can edit the course
   * - isOwner: Boolean indicating if user is the course owner
   * - role: User's role (admin, instructor, or student)
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - User not authenticated → 401 UNAUTHORIZED
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.editing.getEditPermissions.query({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   * });
   * // { canEdit: true, isOwner: true, role: 'instructor' }
   * ```
   */
  getEditPermissions: instructorProcedure
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      // Fetch course with minimal fields needed for permission check
      const { data: course, error } = await supabase
        .from('courses')
        .select('id, user_id, organization_id')
        .eq('id', courseId)
        .single();

      if (error || !course) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found',
        });
      }

      // Calculate edit permissions
      const canEdit = canUserEditCourse(
        { user_id: course.user_id, organization_id: course.organization_id },
        { id: ctx.user.id, role: ctx.user.role }
      );

      return {
        canEdit,
        isOwner: course.user_id === ctx.user.id,
        role: ctx.user.role,
      };
    }),
});
