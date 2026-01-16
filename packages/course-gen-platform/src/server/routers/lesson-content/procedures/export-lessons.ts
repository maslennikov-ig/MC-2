/**
 * Export Lessons (Markdown) Procedure
 * @module server/routers/lesson-content/procedures/export-lessons
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { exportLessonsInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Type for lesson content structure
 */
interface LessonContentData {
  intro?: string;
  sections?: Array<{
    title: string;
    content: string;
  }>;
  examples?: Array<{
    title: string;
    content: string;
    code?: string;
  }>;
  exercises?: Array<{
    question: string;
    hints?: string[];
    solution?: string;
  }>;
  summary?: string;
}

/**
 * Export lessons for a module as Markdown
 *
 * Purpose: Exports all lessons in a module to a single Markdown file.
 * Returns the content as a string along with suggested filename and count.
 *
 * Authorization:
 * - Requires authenticated user (protectedProcedure middleware)
 * - User must have access to the course (verifyCourseAccess check)
 * - Rate limited: 10 exports per minute per user
 *
 * Input:
 * - courseId: UUID of the course
 * - moduleNumber: Module number (1-based section order_index)
 *
 * Output:
 * - content: Full Markdown string
 * - filename: Suggested filename for download
 * - lessonsCount: Number of lessons included
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Module not found or empty -> 404 NOT_FOUND
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.exportLessons.query({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   moduleNumber: 1,
 * });
 * // { content: '# Module 1\n\n...', filename: 'module_1_course_name.md', lessonsCount: 5 }
 * ```
 */
export const exportLessons = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 exports per minute
  .input(exportLessonsInputSchema)
  .query(async ({ ctx, input }) => {
    const { courseId, moduleNumber } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info(
      { requestId, courseId, moduleNumber, userId: currentUser.id },
      'Export lessons request'
    );

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      const supabase = getSupabaseAdmin();

      // Step 2: Get course name for filename
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('title')
        .eq('id', courseId)
        .single();

      if (courseError) {
        logger.error({ requestId, courseId, error: courseError.message }, 'Failed to fetch course');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch course' });
      }

      // Step 3: Get section (module) info
      const { data: section, error: sectionError } = await supabase
        .from('sections')
        .select('id, title')
        .eq('course_id', courseId)
        .eq('order_index', moduleNumber)
        .single();

      if (sectionError || !section) {
        logger.warn({ requestId, courseId, moduleNumber, error: sectionError?.message }, 'Module not found');
        throw new TRPCError({ code: 'NOT_FOUND', message: `Module ${moduleNumber} not found` });
      }

      // Step 4: Get all lessons in module with their content
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_index,
          lesson_contents(
            content,
            status,
            metadata
          )
        `)
        .eq('section_id', section.id)
        .order('order_index', { ascending: true });

      if (lessonsError) {
        logger.error({ requestId, courseId, moduleNumber, error: lessonsError.message }, 'Failed to fetch lessons');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch lessons' });
      }

      if (!lessons || lessons.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No lessons found in this module' });
      }

      // Step 5: Format as Markdown
      const sectionTitle = section.title || `Module ${moduleNumber}`;
      let markdown = `# ${sectionTitle}\n\n`;
      markdown += `*Exported from course: ${course?.title || 'Unknown'}*\n\n`;
      markdown += `---\n\n`;

      let exportedCount = 0;

      for (const lesson of lessons) {
        // Get the latest content (first in array since ordered by created_at desc by default)
        const lessonContent = lesson.lesson_contents?.[0];

        // Extract the actual content from the nested structure
        // The content can be directly in lesson_contents.content or in lesson_contents.content.content
        let contentData: LessonContentData | null = null;

        if (lessonContent?.content) {
          const rawContent = lessonContent.content as Record<string, unknown>;
          // Check if content has nested structure (status, content, metadata at top level)
          if (rawContent.content && typeof rawContent.content === 'object') {
            contentData = rawContent.content as LessonContentData;
          } else {
            // Direct content structure
            contentData = rawContent as unknown as LessonContentData;
          }
        }

        if (!contentData) continue;

        markdown += `## ${lesson.order_index}. ${lesson.title}\n\n`;
        exportedCount++;

        // Intro
        if (contentData.intro) {
          markdown += `${contentData.intro}\n\n`;
        }

        // Sections
        if (contentData.sections && Array.isArray(contentData.sections)) {
          for (const contentSection of contentData.sections) {
            markdown += `### ${contentSection.title}\n\n`;
            markdown += `${contentSection.content}\n\n`;
          }
        }

        // Examples
        if (contentData.examples && Array.isArray(contentData.examples) && contentData.examples.length > 0) {
          markdown += `### Examples\n\n`;
          for (const example of contentData.examples) {
            markdown += `**${example.title}**\n\n`;
            markdown += `${example.content}\n\n`;
            if (example.code) {
              markdown += `\`\`\`\n${example.code}\n\`\`\`\n\n`;
            }
          }
        }

        // Exercises
        if (contentData.exercises && Array.isArray(contentData.exercises) && contentData.exercises.length > 0) {
          markdown += `### Exercises\n\n`;
          for (let i = 0; i < contentData.exercises.length; i++) {
            const ex = contentData.exercises[i];
            markdown += `**Exercise ${i + 1}:** ${ex.question}\n\n`;
            if (ex.hints && ex.hints.length > 0) {
              markdown += `*Hints:* ${ex.hints.join(', ')}\n\n`;
            }
          }
        }

        // Summary
        if (contentData.summary) {
          markdown += `### Summary\n\n`;
          markdown += `${contentData.summary}\n\n`;
        }

        markdown += `---\n\n`;
      }

      // Generate safe filename
      const safeCourseName = (course?.title || 'export')
        .replace(/[^a-zA-Z0-9\u0400-\u04FF]/g, '_')
        .substring(0, 50);
      const filename = `module_${moduleNumber}_${safeCourseName}.md`;

      logger.info(
        { requestId, courseId, moduleNumber, lessonsCount: exportedCount, totalLessons: lessons.length },
        'Exported lessons to Markdown'
      );

      return {
        content: markdown,
        filename,
        lessonsCount: exportedCount,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error(
        { requestId, error: error instanceof Error ? error.message : String(error) },
        'Export lessons failed'
      );
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to export lessons',
      });
    }
  });
