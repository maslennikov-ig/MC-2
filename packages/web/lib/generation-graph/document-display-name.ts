/**
 * Document Display Name Utilities - Single Source of Truth
 *
 * Provides consistent display name resolution for documents across the UI.
 * Priority: generated_title > original_name > filename
 *
 * Used by: useFileCatalog, Stage2Dashboard, PrioritizationView, etc.
 */

/**
 * Document with optional name fields
 * Supports both snake_case (from DB) and camelCase (from TypeScript interfaces)
 */
export interface DocumentNameFields {
  /** AI-generated title from Phase 6 summarization (snake_case) */
  generated_title?: string | null;
  /** AI-generated title from Phase 6 summarization (camelCase) */
  generatedTitle?: string | null;
  /** User-provided original filename (snake_case) */
  original_name?: string | null;
  /** User-provided original filename (camelCase) */
  originalName?: string | null;
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
 * @param doc - Document with name fields
 * @param fallback - Fallback value if no name is available (default: 'Документ')
 * @returns Best available display name
 *
 * @example
 * ```tsx
 * const name = getDocumentDisplayName(document);
 * // Returns: "Введение в программирование" (generated_title)
 * // Or: "lecture_01.pdf" (original_name fallback)
 * // Or: "a3b2c1d4..." (filename fallback)
 * ```
 */
export function getDocumentDisplayName(
  doc: DocumentNameFields | null | undefined,
  fallback: string = 'Документ'
): string {
  if (!doc) return fallback;

  // Check generated_title first (Phase 6 AI-generated)
  // Support both snake_case (from DB) and camelCase (from TS interfaces)
  const generatedTitle = doc.generated_title ?? doc.generatedTitle;
  if (generatedTitle && typeof generatedTitle === 'string' && generatedTitle.trim()) {
    return generatedTitle.trim();
  }

  // Then original_name (user-provided)
  const originalName = doc.original_name ?? doc.originalName;
  if (originalName && typeof originalName === 'string' && originalName.trim()) {
    return originalName.trim();
  }

  // Finally filename (system)
  if (doc.filename && typeof doc.filename === 'string' && doc.filename.trim()) {
    return doc.filename.trim();
  }

  return fallback;
}

/**
 * Check if document has a meaningful display name (not just system filename)
 *
 * @param doc - Document with name fields
 * @returns true if generated_title or original_name is available
 */
export function hasHumanReadableName(doc: DocumentNameFields | null | undefined): boolean {
  if (!doc) return false;

  // Support both snake_case and camelCase
  const generatedTitle = doc.generated_title ?? doc.generatedTitle;
  if (generatedTitle && typeof generatedTitle === 'string' && generatedTitle.trim()) {
    return true;
  }

  const originalName = doc.original_name ?? doc.originalName;
  if (originalName && typeof originalName === 'string' && originalName.trim()) {
    return true;
  }

  return false;
}

/**
 * Truncate display name if too long
 *
 * @param name - Display name to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated name with ellipsis if needed
 */
export function truncateDisplayName(name: string, maxLength: number = 50): string {
  if (!name || name.length <= maxLength) return name;
  return name.slice(0, maxLength - 3) + '...';
}
