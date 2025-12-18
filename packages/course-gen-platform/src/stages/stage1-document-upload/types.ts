/**
 * Stage 1: Document Upload Types
 *
 * Type definitions for the document upload pipeline phases.
 * Stage 1 is NOT a BullMQ job - it's a synchronous tRPC endpoint.
 *
 * @module stages/stage1-document-upload/types
 */

import type { Tier } from '@megacampus/shared-types';

// ============================================================================
// Input Types
// ============================================================================

/**
 * Stage 1 input for document upload
 * Matches tRPC uploadFile endpoint input schema
 */
export interface Stage1Input {
  /** UUID of the course to upload to */
  courseId: string;
  /** UUID of the organization */
  organizationId: string;
  /** UUID of the authenticated user */
  userId: string;
  /** Original filename */
  filename: string;
  /** File size in bytes (declared by client) */
  fileSize: number;
  /** MIME type of the file */
  mimeType: string;
  /** Base64-encoded file content */
  fileContent: string;
}

/**
 * Context passed through pipeline phases
 * Contains resolved metadata and state accumulated during processing
 */
export interface Stage1Context {
  /** Input data from request */
  input: Stage1Input;
  /** Resolved organization tier */
  tier: Tier;
  /** Course title for messages */
  courseTitle: string;
  /** Current file count for the course */
  currentFileCount: number;
}

// ============================================================================
// Phase Output Types
// ============================================================================

/**
 * Output from Phase 1: Validation
 * Contains validation results and resolved context
 */
export interface Phase1ValidationOutput {
  /** Whether validation passed */
  valid: boolean;
  /** Organization tier */
  tier: Tier;
  /** Course title for messages */
  courseTitle: string;
  /** Current file count for course */
  currentFileCount: number;
  /** Duration of phase execution in milliseconds */
  durationMs: number;
}

/**
 * Output from Phase 2: Storage
 * Contains file storage results and metadata
 */
export interface Phase2StorageOutput {
  /** Generated file UUID */
  fileId: string;
  /** Relative storage path from cwd */
  storagePath: string;
  /** SHA256 hash of file content */
  fileHash: string;
  /** Actual file size after decoding */
  actualSize: number;
  /** Duration of phase execution in milliseconds */
  durationMs: number;
  /** Whether file was deduplicated (reused existing content) */
  deduplicated: boolean;
  /** Original file ID if deduplicated */
  originalFileId?: string;
  /** Number of vectors duplicated (if deduplicated) */
  vectorsDuplicated?: number;
}

// ============================================================================
// Output Types
// ============================================================================

/**
 * Stage 1 output after successful upload
 */
export interface Stage1Output {
  /** Generated file UUID */
  fileId: string;
  /** Relative storage path from cwd */
  storagePath: string;
  /** Vector processing status - always 'pending' after upload */
  vectorStatus: 'pending';
  /** SHA256 hash of file content for deduplication */
  fileHash: string;
  /** Success message for user */
  message: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Stage 1 error with rollback information
 */
export interface Stage1Error {
  /** Error code matching tRPC error codes */
  code: 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL_SERVER_ERROR' | 'UNAUTHORIZED';
  /** Error message */
  message: string;
  /** Whether quota was reserved and needs rollback */
  quotaReserved: boolean;
  /** Amount of quota reserved (for rollback) */
  quotaAmount?: number;
  /** File path if file was written (for cleanup) */
  filePath?: string;
}

// ============================================================================
// Rollback Types
// ============================================================================

/**
 * Rollback context for error recovery
 * Tracks resources that need cleanup on failure
 */
export interface RollbackContext {
  /** Whether quota has been reserved */
  quotaReserved: boolean;
  /** Amount of quota reserved */
  quotaAmount: number;
  /** Organization ID for quota rollback */
  organizationId: string;
  /** File path if file was written */
  filePath?: string;
  /** File ID if database record was created */
  fileId?: string;
}
