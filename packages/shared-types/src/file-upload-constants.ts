/**
 * File Upload Constants - Single Source of Truth
 * @module file-upload-constants
 *
 * This module provides all file upload related constants used across the platform.
 * All other packages should import from here (or via @megacampus/shared-types).
 *
 * Updated 2025-10-27: Tier-based file restrictions
 */

// ============================================================================
// MIME Types by Tier
// ============================================================================

/**
 * MIME type restrictions by tier
 *
 * FREE: No uploads
 * TRIAL: Same as STANDARD (all formats WITHOUT images, 7-day evaluation)
 * BASIC: TXT, MD only (plain text, no Docling/OCR)
 * STANDARD: PDF, DOCX, PPTX, HTML, TXT, MD - files WITHOUT images (max 10 MB, Docling/OCR)
 * PREMIUM: All formats WITH images (PNG, JPG, GIF) - max 100 MB with PDF chunking + Vision API
 */
export const MIME_TYPES_BY_TIER = {
  trial: [
    // TRIAL tier: Same as STANDARD (all formats WITHOUT images for 7-day evaluation)
    'application/pdf', // PDF (without images)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX (without images)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX (without images)
    'text/html', // HTML
    'text/plain', // TXT
    'text/markdown', // MD
  ],
  free: [] as string[], // No uploads allowed
  basic: [
    // BASIC tier: Plain text formats only (no document processing needed)
    'text/plain', // TXT
    'text/markdown', // MD
  ],
  standard: [
    // STANDARD tier: All formats WITHOUT images (Docling/OCR, images ignored/removed)
    'application/pdf', // PDF (without images)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX (without images)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX (without images)
    'text/html', // HTML
    'text/plain', // TXT
    'text/markdown', // MD
  ],
  premium: [
    // PREMIUM tier: All formats including images
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/html',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/svg+xml',
    'image/webp',
    // Premium-only structured formats (FR-016). Every one of these is converted
    // by the pinned Docling stack with its own backend; none is Standard/Trial.
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'text/csv', // CSV
    'application/vnd.oasis.opendocument.text', // ODT
    'application/vnd.oasis.opendocument.spreadsheet', // ODS
    'application/vnd.oasis.opendocument.presentation', // ODP
    'application/epub+zip', // EPUB
    'text/x-tex', // LaTeX
  ],
} as const;

// ============================================================================
// File Extensions by Tier
// ============================================================================

/**
 * File extensions by tier (for display purposes)
 */
export const FILE_EXTENSIONS_BY_TIER = {
  trial: ['pdf', 'docx', 'pptx', 'html', 'txt', 'md'], // Same as STANDARD (no images)
  free: [],
  basic: ['txt', 'md'],
  standard: ['pdf', 'docx', 'pptx', 'html', 'txt', 'md'], // All formats WITHOUT images
  premium: [
    'pdf',
    'docx',
    'pptx',
    'html',
    'txt',
    'md',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
    'webp',
    // Premium-only structured formats
    'xlsx',
    'csv',
    'odt',
    'ods',
    'odp',
    'epub',
    'tex',
  ],
} as const;

// ============================================================================
// Extension <-> MIME Agreement
// ============================================================================

/**
 * MIME types each extension is allowed to be declared as.
 *
 * The FIRST entry is canonical: it is what the platform stores and what every
 * downstream routing decision reads. The rest are the types real browsers and
 * operating systems actually send for that extension, which is why the list
 * exists at all — a `.md` picked in Chrome arrives as `text/plain`, and a `.csv`
 * on a machine with Excel installed arrives as `application/vnd.ms-excel`.
 *
 * Tolerating those variants is not the same as trusting the client. The rule is
 * that a declared type must belong to the extension the file actually carries,
 * so a `.pdf` announced as `text/plain` — or an executable renamed `.pdf` and
 * announced as `application/pdf` — is refused, while an honest file whose
 * browser guessed differently is not (FR-017).
 *
 * `application/vnd.ms-excel` appears only as a CSV alias. It is also the
 * canonical type of `.xls`, but `.xls` is not an accepted extension on any tier,
 * so the extension gate refuses it before this map is consulted.
 */
export const MIME_TYPES_BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  html: ['text/html'],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/x-markdown', 'text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  svg: ['image/svg+xml'],
  webp: ['image/webp'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  odt: ['application/vnd.oasis.opendocument.text'],
  ods: ['application/vnd.oasis.opendocument.spreadsheet'],
  odp: ['application/vnd.oasis.opendocument.presentation'],
  epub: ['application/epub+zip'],
  tex: ['text/x-tex', 'application/x-tex', 'text/x-latex', 'text/plain'],
} as const;

/**
 * Lowercased extension of a filename, without the dot.
 *
 * Returns null when there is no extension to speak of, including the
 * dotfile case (`.gitignore` has no extension, it has a name).
 */
export function fileExtensionOf(filename: string): string | null {
  const base = filename.split(/[\\/]/u).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/**
 * The MIME type the platform stores for an extension, ignoring what the client
 * declared. Routing reads this, so a browser's guess can never decide whether a
 * document goes to Docling or to the plain-text path.
 */
export function canonicalMimeTypeForExtension(extension: string): string | null {
  return MIME_TYPES_BY_EXTENSION[extension.toLowerCase()]?.[0] ?? null;
}

/**
 * Whether a declared MIME type is one this extension is allowed to carry.
 *
 * An unknown extension agrees with nothing: the tier extension list is the
 * allowlist, and anything outside it has already failed.
 */
export function mimeTypeMatchesExtension(extension: string, mimeType: string): boolean {
  const allowed = MIME_TYPES_BY_EXTENSION[extension.toLowerCase()];
  if (!allowed) return false;
  return allowed.includes(mimeType.trim().toLowerCase());
}

// ============================================================================
// File Count Limits by Tier
// ============================================================================

/**
 * File count limits by tier
 */
export const FILE_COUNT_LIMITS_BY_TIER = {
  trial: 3, // Same as STANDARD
  free: 0,
  basic: 1,
  standard: 3,
  premium: 10,
} as const;

// ============================================================================
// File Size Limits by Tier
// ============================================================================

/**
 * File size limits by tier (in bytes)
 * - FREE: 5 MB (text-only)
 * - BASIC: 10 MB (text-only)
 * - TRIAL/STANDARD: 30 MB (all formats WITHOUT images, Docling for PDF/DOCX/PPTX/HTML)
 * - PREMIUM: 100 MB (files WITH images, PDF chunking, Vision API)
 */
export const FILE_SIZE_LIMITS_BY_TIER = {
  trial: 30 * 1024 * 1024, // 30 MB (all formats WITHOUT images)
  free: 5 * 1024 * 1024, // 5 MB (text-only)
  basic: 10 * 1024 * 1024, // 10 MB (text-only)
  standard: 30 * 1024 * 1024, // 30 MB (all formats WITHOUT images)
  premium: 100 * 1024 * 1024, // 100 MB (files WITH images + PDF chunking)
} as const;

// ============================================================================
// Global Maximum File Size
// ============================================================================

/**
 * Maximum file size (global, for backward compatibility)
 * @deprecated Use FILE_SIZE_LIMITS_BY_TIER instead
 */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// ============================================================================
// Unified FILE_UPLOAD Object
// ============================================================================

/**
 * Unified file upload constants object
 * Provides backward compatibility with web/lib/constants.ts FILE_UPLOAD
 *
 * MAX_SIZE_BYTES/MAX_SIZE_MB: Premium tier max (100MB)
 * MAX_FILES: Premium tier max (10)
 * ALLOWED_TYPES/ALLOWED_EXTENSIONS: Standard tier (most common use case)
 */
export const FILE_UPLOAD = {
  /** Maximum file size in bytes (premium tier max) */
  MAX_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
  /** Maximum file size in MB (premium tier max) */
  MAX_SIZE_MB: 100,
  /** Maximum files per upload (premium tier max) */
  MAX_FILES: 10,

  /**
   * Allowed MIME types mapped to extensions (standard tier)
   * @deprecated Use MIME_TYPES_BY_TIER for tier-specific validation
   */
  get ALLOWED_TYPES(): Record<string, string[]> {
    return {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/html': ['.html'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    };
  },

  /**
   * Allowed file extensions (standard tier)
   * @deprecated Use FILE_EXTENSIONS_BY_TIER for tier-specific validation
   */
  get ALLOWED_EXTENSIONS(): readonly string[] {
    return ['.pdf', '.docx', '.pptx', '.html', '.txt', '.md'] as const;
  },
} as const;

// ============================================================================
// Tier Order (for upgrade suggestions)
// ============================================================================

/**
 * Tier hierarchy from lowest to highest privileges
 * Used for upgrade suggestions and tier comparisons
 */
export const TIER_ORDER: readonly ['free', 'basic', 'trial', 'standard', 'premium'] = [
  'free',
  'basic',
  'trial',
  'standard',
  'premium',
] as const;

/**
 * Display names for tiers (user-friendly)
 */
export const TIER_DISPLAY_NAMES: Record<string, string> = {
  free: 'Free',
  trial: 'Trial',
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type MimeTypesByTier = typeof MIME_TYPES_BY_TIER;
export type FileExtensionsByTier = typeof FILE_EXTENSIONS_BY_TIER;
export type FileCountLimitsByTier = typeof FILE_COUNT_LIMITS_BY_TIER;
export type FileSizeLimitsByTier = typeof FILE_SIZE_LIMITS_BY_TIER;
export type TierKey = keyof MimeTypesByTier;

/**
 * Type guard to check if a string is a valid tier key
 */
export function isValidTierKey(value: string | undefined | null): value is TierKey {
  return value !== undefined && value !== null && TIER_ORDER.includes(value as TierKey);
}
