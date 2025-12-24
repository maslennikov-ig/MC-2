/**
 * Document Display Name Utilities - Backend Version
 *
 * Provides consistent display name resolution for documents in backend contexts.
 * Priority: generated_title > original_name > filename
 *
 * This mirrors the frontend utility in packages/web/lib/generation-graph/document-display-name.ts
 *
 * @module shared/utils/document-display-name
 */

/**
 * Document with optional name fields
 */
export interface DocumentNameFields {
  /** AI-generated title from Phase 6 summarization */
  generated_title?: string | null;
  /** User-provided original filename */
  original_name?: string | null;
  /** System filename (may be hash) */
  filename?: string | null;
}

/**
 * Get the best display name for a document
 *
 * Priority order:
 * 1. generated_title - AI-generated meaningful title (Phase 6)
 * 2. original_name - User-provided filename at upload
 * 3. filename - System filename (fallback)
 *
 * @param file - File catalog row or partial
 * @param fallback - Fallback value if no name available
 * @returns Best available name
 *
 * @example
 * ```typescript
 * const name = getDocumentDisplayName({
 *   generated_title: 'Introduction to Python Programming',
 *   original_name: 'lecture_01.pdf',
 *   filename: 'a3b2c1d4...'
 * });
 * // Returns: "Introduction to Python Programming"
 * ```
 */
export function getDocumentDisplayName(
  file: DocumentNameFields | null | undefined,
  fallback: string = 'Unknown Document'
): string {
  if (!file) return fallback;

  // Check generated_title first (Phase 6 AI-generated)
  if (file.generated_title && typeof file.generated_title === 'string' && file.generated_title.trim()) {
    return file.generated_title.trim();
  }

  // Then original_name (user-provided)
  if (file.original_name && typeof file.original_name === 'string' && file.original_name.trim()) {
    return file.original_name.trim();
  }

  // Finally filename (system)
  if (file.filename && typeof file.filename === 'string' && file.filename.trim()) {
    return file.filename.trim();
  }

  return fallback;
}

/**
 * Check if document has a meaningful display name (not just system filename)
 *
 * @param file - Document with name fields
 * @returns true if generated_title or original_name is available
 */
export function hasHumanReadableName(file: DocumentNameFields | null | undefined): boolean {
  if (!file) return false;

  if (file.generated_title && typeof file.generated_title === 'string' && file.generated_title.trim()) {
    return true;
  }

  if (file.original_name && typeof file.original_name === 'string' && file.original_name.trim()) {
    return true;
  }

  return false;
}

/**
 * Truncate display name if too long
 *
 * @param name - Display name to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated name with ellipsis if needed
 */
export function truncateDisplayName(name: string, maxLength: number = 100): string {
  if (!name || name.length <= maxLength) return name;
  return name.slice(0, maxLength - 3) + '...';
}
