/**
 * Mermaid fallback marker helpers
 * @module stages/stage6-lesson-content/utils/mermaid-fallback-marker
 *
 * Legacy Mermaid fallback comments can exist in historical content.
 * New remediation flow uses structured markdown fallback instead of HTML comments.
 * Presence of this marker still indicates an unresolved legacy diagram failure.
 */

/**
 * Matches fallback HTML comments inserted by Mermaid fix pipeline.
 */
export const MERMAID_FALLBACK_COMMENT_REGEX =
  /<!--\s*Mermaid\s+[^>]*could not be rendered\.\s*Please review manually\.\s*-->/gi;

/**
 * Count fallback comments in markdown content.
 */
export function countMermaidFallbackComments(content: string): number {
  const matches = content.match(MERMAID_FALLBACK_COMMENT_REGEX);
  return matches ? matches.length : 0;
}
