/**
 * OLX Course Template Generator
 * @module integrations/lms/openedx/olx/templates/course
 *
 * Generates course.xml file for Open edX OLX format.
 * The course.xml is the root element that references all chapters.
 */

import type { OlxCourseMeta } from '@megacampus/shared-types';
import { xmlEscape } from '../../utils/xml-escape';

/**
 * Generate course.xml content for Open edX OLX
 *
 * Creates the root course element with metadata and chapter references.
 * The course.xml file is the entry point for the OLX package.
 *
 * @param meta - Course metadata (org, course, run, display_name, language, dates)
 * @param chapters - Array of chapter url_names to reference
 * @returns XML string for course.xml file
 *
 * @example
 * ```typescript
 * const courseXml = generateCourseXml(
 *   {
 *     org: 'MegaCampus',
 *     course: 'AI101',
 *     run: 'self_paced',
 *     display_name: 'Основы ИИ',
 *     language: 'ru',
 *     start: '2025-01-01T00:00:00Z'
 *   },
 *   [
 *     { url_name: 'chapter_1' },
 *     { url_name: 'chapter_2' }
 *   ]
 * );
 * // Generates course.xml with chapter references
 * ```
 */
export function generateCourseXml(
  meta: OlxCourseMeta,
  chapters: Array<{ url_name: string }>
): string {
  const chapterRefs = chapters
    .map((chapter) => `  <chapter url_name="${xmlEscape(chapter.url_name)}"/>`)
    .join('\n');

  const startAttr = meta.start ? ` start="${xmlEscape(meta.start)}"` : '';
  const endAttr = meta.end ? ` end="${xmlEscape(meta.end)}"` : '';

  return `<course url_name="${xmlEscape(`${meta.org}_${meta.course}_${meta.run}`)}" display_name="${xmlEscape(meta.display_name)}" org="${xmlEscape(meta.org)}" course="${xmlEscape(meta.course)}" language="${xmlEscape(meta.language)}"${startAttr}${endAttr}>
${chapterRefs}
</course>
`;
}
