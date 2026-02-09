/**
 * DOMPurify configuration constants — Single Source of Truth.
 *
 * Two profiles: permissive for user-submitted rich text, restrictive for LLM output.
 */

/** Tags allowed in user-submitted rich text (web forms, editors). */
export const RICH_TEXT_ALLOWED_TAGS = [
  'b',
  'i',
  'em',
  'strong',
  'a',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
] as const;

/** Attributes allowed on rich text tags. */
export const RICH_TEXT_ALLOWED_ATTR = ['href', 'title', 'target'] as const;

/** Tags allowed in LLM-generated content (highly restrictive). */
export const LLM_OUTPUT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br'] as const;

/** No attributes allowed on LLM-generated content. */
export const LLM_OUTPUT_ALLOWED_ATTR = [] as const;
