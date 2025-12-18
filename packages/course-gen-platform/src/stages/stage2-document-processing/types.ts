/**
 * Stage 2: Document Processing Types
 *
 * Type definitions for document processing pipeline phases
 */

import { DoclingDocument } from './docling/types.js';
import { ImageMetadata } from '../../shared/embeddings/index.js';

/**
 * Type-safe interface for file metadata with organization tier
 * Represents the shape of data returned from Supabase when querying
 * file_catalog with joined organizations table
 */
export interface FileWithOrganization {
  mime_type: string;
  organization_id: string;
  organizations: {
    tier: 'free' | 'trial' | 'basic' | 'standard' | 'premium';
  } | null;
}

/**
 * Document processing statistics
 */
export interface ProcessingStats {
  markdown_length: number;
  pages: number;
  images: number;
  tables: number;
  sections: number;
  processing_time_ms: number;
}

/**
 * Document processing result
 */
export interface DocumentProcessingResult {
  markdown: string;
  json: DoclingDocument;
  images: ImageMetadata[];
  stats: ProcessingStats;
  /** Optional document summarization result (Phase 7) */
  summarization?: {
    success: boolean;
    method: 'full_text' | 'hierarchical';
    summaryTokens: number;
    qualityScore: number;
  };
}

/**
 * Tier-specific processing options
 */
export interface TierProcessingOptions {
  tier: string;
  mimeType: string;
  enableDocling: boolean;
  enableImageExtraction: boolean;
  enableOCR: boolean;
}
