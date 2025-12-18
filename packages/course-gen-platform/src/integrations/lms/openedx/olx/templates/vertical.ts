/**
 * OLX Vertical Template Generator
 * @module integrations/lms/openedx/olx/templates/vertical
 *
 * Generates vertical XML files for Open edX OLX format.
 * Verticals are units (content containers) that hold components (HTML, video, problems, etc.).
 */

import type { OlxVertical } from '@megacampus/shared-types';
import { xmlEscape } from '../../utils/xml-escape';

/**
 * Generate vertical XML content for Open edX OLX
 *
 * Creates a vertical element with component references.
 * Each vertical is a unit (content block) within a sequential (lesson).
 *
 * @param vertical - Vertical data with url_name, display_name, and components
 * @returns XML string for vertical/{url_name}.xml file
 *
 * @example
 * ```typescript
 * const verticalXml = generateVerticalXml({
 *   url_name: 'unit_1',
 *   display_name: 'Введение в нейронные сети',
 *   components: [
 *     { type: 'html', url_name: 'content_1', display_name: 'Текст урока', content: '<p>...</p>' },
 *     { type: 'html', url_name: 'content_2', display_name: 'Примеры', content: '<p>...</p>' }
 *   ]
 * });
 * // Generates vertical XML with component references
 * ```
 */
export function generateVerticalXml(vertical: OlxVertical): string {
  const componentRefs = vertical.components
    .map((component) => `  <${component.type} url_name="${xmlEscape(component.url_name)}"/>`)
    .join('\n');

  return `<vertical url_name="${xmlEscape(vertical.url_name)}" display_name="${xmlEscape(vertical.display_name)}">
${componentRefs}
</vertical>
`;
}
