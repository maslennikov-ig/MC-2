import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';
import {
  deleteElementInputSchema,
  addElementInputSchema,
} from '@megacampus/shared-types/regeneration-types';
import type {
  DeleteElementResponse,
  AddElementResponse,
} from '@megacampus/shared-types/regeneration-types';
import {
  deleteElement as deleteStructureElement,
  addElement as addStructureElement,
} from '../../../../stages/stage5-generation/utils/course-structure-editor';
import { llmClient } from '../../../../shared/llm/client';
import {
  getElementAtPath,
} from '../_shared/helpers';

export const elementCrudRouter = {
  deleteElement: instructorProcedure
    .input(deleteElementInputSchema)
    .mutation(async ({ ctx, input }: { ctx: any, input: any }): Promise<DeleteElementResponse> => {
      const { courseId, elementPath, confirm } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
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

        const courseStructure = course.course_structure as CourseStructure | null;
        if (!courseStructure) {
          logger.warn({ requestId, courseId }, 'Course structure is null');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found',
          });
        }

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

        const result = deleteStructureElement(courseStructure, elementPath);

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

  addElement: instructorProcedure
    .input(addElementInputSchema)
    .mutation(async ({ ctx, input }: { ctx: any, input: any }): Promise<AddElementResponse> => {
      const { courseId, elementType, parentPath, position, userInstruction } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
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

        const courseStructure = course.course_structure as CourseStructure | null;
        if (!courseStructure) {
          logger.warn({ requestId, courseId }, 'Course structure is null');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found',
          });
        }

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

        const analysisResult = course.analysis_result as Record<string, unknown> | null;
        const courseTitle = course.title || 'Course';
        const recommendedStructure = analysisResult?.recommended_structure as Record<string, unknown> | undefined;
        const targetAudience = recommendedStructure?.target_audience || 'general learners';
        const difficultyLevel = recommendedStructure?.difficulty_level || 'intermediate';
        const detectedLanguage = (analysisResult?.detected_language as string) || 'en';

        let contextInfo = '';
        if (elementType === 'lesson' && isLessonPath) {
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

        let averageDuration = 15; 
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
            logger.error({ requestId, courseId, error: parseError, content: response.content }, 'Failed to parse LLM response for lesson');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'AI generation failed: invalid JSON response',
            });
          }
        } else {
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
      "practical_exercises": [{"exercise_type": "...", "exercise_title": "...", "exercise_description": "..."}]
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
            logger.error({ requestId, courseId, error: parseError, content: response.content }, 'Failed to parse LLM response for section');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'AI generation failed: invalid JSON response',
            });
          }
        }

        const result = addStructureElement(courseStructure, parentPath, generatedElement, position);

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
};