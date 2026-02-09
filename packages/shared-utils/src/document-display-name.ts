/**
 * Document Display Name Utilities
 *
 * Provides consistent display name resolution for documents.
 * Priority: generated_title > original_name > filename
 *
 * Supports both snake_case (from DB) and camelCase (from TypeScript interfaces).
 */

/**
 * Document with optional name fields.
 * Supports both snake_case (from DB) and camelCase (from TypeScript interfaces).
 */
export interface DocumentNameFields {
  generated_title?: string | null;
  generatedTitle?: string | null;
  original_name?: string | null;
  originalName?: string | null;
  filename?: string | null;
}

/**
 * Get the best display name for a document.
 *
 * Priority order:
 * 1. generated_title - AI-generated meaningful title
 * 2. original_name - User-provided filename at upload
 * 3. filename - System filename (fallback)
 */
export function getDocumentDisplayName(
  doc: DocumentNameFields | null | undefined,
  fallback: string = 'Документ'
): string {
  if (!doc) return fallback;

  const generatedTitle = doc.generated_title ?? doc.generatedTitle;
  if (generatedTitle && typeof generatedTitle === 'string' && generatedTitle.trim()) {
    return generatedTitle.trim();
  }

  const originalName = doc.original_name ?? doc.originalName;
  if (originalName && typeof originalName === 'string' && originalName.trim()) {
    return originalName.trim();
  }

  if (doc.filename && typeof doc.filename === 'string' && doc.filename.trim()) {
    return doc.filename.trim();
  }

  return fallback;
}

/**
 * Check if document has a meaningful display name (not just system filename).
 */
export function hasHumanReadableName(doc: DocumentNameFields | null | undefined): boolean {
  if (!doc) return false;

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
 * Truncate display name if too long.
 */
export function truncateDisplayName(name: string, maxLength: number = 50): string {
  if (!name || name.length <= maxLength) return name;
  return name.slice(0, maxLength - 3) + '...';
}
