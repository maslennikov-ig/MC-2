/**
 * OLX Chapter Template Generator
 * @module integrations/lms/openedx/olx/templates/chapter
 *
 * Generates chapter XML files for Open edX OLX format.
 * Chapters are top-level sections that contain sequentials (subsections/lessons).
 */

import type { OlxChapter } from '@megacampus/shared-types';
import { xmlEscape } from '../../utils/xml-escape';

/**
 * Generate chapter XML content for Open edX OLX
 *
 * Creates a chapter element with sequential references.
 * Each chapter maps to a MegaCampus Section (top-level course division).
 *
 * @param chapter - Chapter data with url_name, display_name, and sequentials
 * @returns XML string for chapter/{url_name}.xml file
 *
 * @example
 * ```typescript
 * const chapterXml = generateChapterXml({
 *   url_name: 'chapter_1',
 *   display_name: 'Введение в искусственный интеллект',
 *   sequentials: [
 *     { url_name: 'lesson_1', display_name: 'Урок 1', verticals: [] },
 *     { url_name: 'lesson_2', display_name: 'Урок 2', verticals: [] }
 *   ]
 * });
 * // Generates chapter XML with sequential references
 * ```
 */
export function generateChapterXml(chapter: OlxChapter): string {
  const sequentialRefs = chapter.sequentials
    .map((sequential) => `  <sequential url_name="${xmlEscape(sequential.url_name)}"/>`)
    .join('\n');

  return `<chapter url_name="${xmlEscape(chapter.url_name)}" display_name="${xmlEscape(chapter.display_name)}">
${sequentialRefs}
</chapter>
`;
}
