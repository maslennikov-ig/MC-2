/**
 * OLX Sequential Template Generator
 * @module integrations/lms/openedx/olx/templates/sequential
 *
 * Generates sequential XML files for Open edX OLX format.
 * Sequentials are subsections (lessons) that contain verticals (units).
 */

import type { OlxSequential } from '@megacampus/shared-types';
import { xmlEscape } from '../../utils/xml-escape';

/**
 * Generate sequential XML content for Open edX OLX
 *
 * Creates a sequential element with vertical references.
 * Each sequential maps to a MegaCampus Lesson (subsection within a chapter).
 *
 * @param sequential - Sequential data with url_name, display_name, and verticals
 * @returns XML string for sequential/{url_name}.xml file
 *
 * @example
 * ```typescript
 * const sequentialXml = generateSequentialXml({
 *   url_name: 'lesson_1',
 *   display_name: 'Урок 1: Основы машинного обучения',
 *   verticals: [
 *     { url_name: 'unit_1', display_name: 'Введение', components: [] },
 *     { url_name: 'unit_2', display_name: 'Практика', components: [] }
 *   ]
 * });
 * // Generates sequential XML with vertical references
 * ```
 */
export function generateSequentialXml(sequential: OlxSequential): string {
  const verticalRefs = sequential.verticals
    .map((vertical) => `  <vertical url_name="${xmlEscape(vertical.url_name)}"/>`)
    .join('\n');

  return `<sequential url_name="${xmlEscape(sequential.url_name)}" display_name="${xmlEscape(sequential.display_name)}">
${verticalRefs}
</sequential>
`;
}
