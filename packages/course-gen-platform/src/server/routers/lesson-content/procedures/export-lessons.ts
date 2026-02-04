/**
 * Export Lessons (Markdown) Procedure
 * @module server/routers/lesson-content/procedures/export-lessons
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { exportLessonsInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { getContentLabels, validateLanguageCode } from '@megacampus/shared-types';

/**
 * Escape markdown special characters and HTML to prevent XSS
 * @param text - Raw text to escape
 * @returns Escaped text safe for markdown output
 */
function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '\\`');
}

/**
 * Escape only HTML tags for content that should preserve markdown formatting
 * (e.g., lesson content that's already markdown)
 * @param text - Raw text to escape
 * @returns Text with HTML escaped but markdown preserved
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Zod schema for runtime validation of lesson content structure
 * This provides type-safe parsing with proper error handling
 */
const LessonContentDataSchema = z.object({
  intro: z.string().optional(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      })
    )
    .optional(),
  examples: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
        code: z.string().optional(),
      })
    )
    .optional(),
  exercises: z
    .array(
      z.object({
        question: z.string(),
        hints: z.array(z.string()).optional(),
        solution: z.string().optional(),
      })
    )
    .optional(),
  summary: z.string().optional(),
});

/**
 * Type for lesson content structure (inferred from Zod schema)
 */
type LessonContentData = z.infer<typeof LessonContentDataSchema>;

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
  // Rate limiter is per-user (uses ctx.user.id), so abuse only affects the attacker themselves.
  // This runs before verifyCourseAccess but the security impact is minimal:
  // - Invalid courseIds still count toward rate limit, but only for that user
  // - Other users are unaffected (separate rate limit buckets)
  // TODO: Consider course-scoped rate limiting if export abuse becomes an issue
  .use(createRateLimiter({ requests: 10, window: 60 }))
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
        .select('title, language')
        .eq('id', courseId)
        .single();

      if (courseError) {
        logger.error({ requestId, courseId, error: courseError.message }, 'Failed to fetch course');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch course' });
      }

      const courseLanguage = validateLanguageCode(course?.language);
      const labels = getContentLabels(courseLanguage);

      // Step 3: Get section (module) info
      const { data: section, error: sectionError } = await supabase
        .from('sections')
        .select('id, title')
        .eq('course_id', courseId)
        .eq('order_index', moduleNumber)
        .single();

      if (sectionError || !section) {
        logger.warn(
          { requestId, courseId, moduleNumber, error: sectionError?.message },
          'Module not found'
        );
        throw new TRPCError({ code: 'NOT_FOUND', message: `Module ${moduleNumber} not found` });
      }

      // Step 4: Get all lessons in module with their latest completed content
      // Uses database view for performance (1 row per lesson instead of N content versions)
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons_with_latest_content')
        .select('lesson_id, lesson_title, order_index, content')
        .eq('section_id', section.id)
        .order('order_index', { ascending: true });

      if (lessonsError) {
        logger.error(
          { requestId, courseId, moduleNumber, error: lessonsError.message },
          'Failed to fetch lessons'
        );
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch lessons' });
      }

      if (!lessons || lessons.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No lessons found in this module' });
      }

      // Step 5: Format as Markdown (with XSS protection)
      const sectionTitle = escapeMarkdown(section.title || `Module ${moduleNumber}`);
      let markdown = `# ${sectionTitle}\n\n`;
      markdown += `*Exported from course: ${escapeMarkdown(course?.title || 'Unknown')}*\n\n`;
      markdown += `---\n\n`;

      let exportedCount = 0;

      for (const lesson of lessons) {
        // Content already filtered (completed only, latest version) by database view

        // Extract and validate the actual content from the nested structure
        // The content can be directly in lesson_contents.content or in lesson_contents.content.content
        let contentData: LessonContentData | null = null;

        if (lesson.content) {
          const rawContent = lesson.content as Record<string, unknown>;
          // Check if content has nested structure (status, content, metadata at top level)
          const nestedContent =
            rawContent.content && typeof rawContent.content === 'object'
              ? rawContent.content
              : rawContent;

          // Use Zod safeParse for type-safe validation
          const parsed = LessonContentDataSchema.safeParse(nestedContent);
          if (parsed.success) {
            contentData = parsed.data;
          } else {
            logger.warn(
              { lessonId: lesson.lesson_id, requestId, errors: parsed.error.flatten() },
              'Invalid lesson content structure, skipping lesson'
            );
            // Continue to next lesson instead of crashing
          }
        }

        if (!contentData) continue;

        // Escape lesson title (user-generated)
        markdown += `## ${lesson.order_index}. ${escapeMarkdown(lesson.lesson_title || '')}\n\n`;
        exportedCount++;

        // Intro - escape HTML only to preserve markdown formatting
        if (contentData.intro) {
          markdown += `${escapeHtml(contentData.intro)}\n\n`;
        }

        // Sections
        if (contentData.sections && Array.isArray(contentData.sections)) {
          for (const contentSection of contentData.sections) {
            markdown += `### ${escapeMarkdown(contentSection.title)}\n\n`;
            markdown += `${escapeHtml(contentSection.content)}\n\n`;
          }
        }

        // Examples
        if (
          contentData.examples &&
          Array.isArray(contentData.examples) &&
          contentData.examples.length > 0
        ) {
          markdown += `### ${labels.examples}\n\n`;
          for (const example of contentData.examples) {
            markdown += `**${escapeMarkdown(example.title)}**\n\n`;
            markdown += `${escapeHtml(example.content)}\n\n`;
            if (example.code) {
              // Code blocks - escape HTML but preserve code formatting
              markdown += `\`\`\`\n${escapeHtml(example.code)}\n\`\`\`\n\n`;
            }
          }
        }

        // Exercises
        if (
          contentData.exercises &&
          Array.isArray(contentData.exercises) &&
          contentData.exercises.length > 0
        ) {
          markdown += `### ${labels.exercises}\n\n`;
          for (let i = 0; i < contentData.exercises.length; i++) {
            const ex = contentData.exercises[i];
            markdown += `**${labels.exercise} ${i + 1}:** ${escapeHtml(ex.question)}\n\n`;
            if (ex.hints && ex.hints.length > 0) {
              markdown += `*${labels.hints}:* ${ex.hints.map(h => escapeHtml(h)).join(', ')}\n\n`;
            }
          }
        }

        // Summary
        if (contentData.summary) {
          markdown += `### ${labels.summary}\n\n`;
          markdown += `${escapeHtml(contentData.summary)}\n\n`;
        }

        markdown += `---\n\n`;
      }

      // Generate safe filename with improved sanitization
      // - Keep alphanumeric, Cyrillic, spaces, and hyphens
      // - Collapse multiple spaces/underscores
      // - Trim leading/trailing underscores
      const safeCourseName =
        (course?.title || 'export')
          .replace(/[^a-zA-Z0-9\u0400-\u04FF\s-]/g, '') // Remove invalid chars but keep spaces and hyphens
          .replace(/\s+/g, '_') // Replace spaces with single underscore
          .replace(/-+/g, '-') // Collapse multiple hyphens
          .replace(/_+/g, '_') // Collapse multiple underscores
          .replace(/^[_-]+|[_-]+$/g, '') // Trim underscores/hyphens from start/end
          .substring(0, 50) || 'export'; // Fallback if empty after sanitization
      const filename = `module_${moduleNumber}_${safeCourseName}.md`;

      logger.info(
        {
          requestId,
          courseId,
          moduleNumber,
          lessonsCount: exportedCount,
          totalLessons: lessons.length,
        },
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
