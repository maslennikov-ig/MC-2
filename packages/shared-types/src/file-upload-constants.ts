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
  premium: ['pdf', 'docx', 'pptx', 'html', 'txt', 'md', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'], // All formats WITH images
} as const;

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
 * - TRIAL/BASIC/STANDARD: 10 MB (files WITHOUT images, Docling for PDF/DOCX/PPTX/HTML)
 * - PREMIUM: 100 MB (files WITH images, PDF chunking, Vision API)
 */
export const FILE_SIZE_LIMITS_BY_TIER = {
  trial: 10 * 1024 * 1024, // 10 MB (all formats WITHOUT images)
  free: 5 * 1024 * 1024, // 5 MB (text-only)
  basic: 10 * 1024 * 1024, // 10 MB (text-only)
  standard: 10 * 1024 * 1024, // 10 MB (all formats WITHOUT images)
  premium: 100 * 1024 * 1024, // 100 MB (all formats WITH images + PDF chunking)
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
// Type Exports
// ============================================================================

export type MimeTypesByTier = typeof MIME_TYPES_BY_TIER;
export type FileExtensionsByTier = typeof FILE_EXTENSIONS_BY_TIER;
export type FileCountLimitsByTier = typeof FILE_COUNT_LIMITS_BY_TIER;
export type FileSizeLimitsByTier = typeof FILE_SIZE_LIMITS_BY_TIER;
export type TierKey = keyof MimeTypesByTier;
