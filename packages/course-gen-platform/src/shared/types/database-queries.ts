/**
 * TypeScript type definitions for Supabase database query results
 *
 * This file contains interfaces for all database tables and query results
 * to ensure type safety throughout the application.
 *
 * @module shared/types/database-queries
 */

/**
 * File catalog table row
 */
export interface FileCatalogRow {
  id: string;
  organization_id: string;
  course_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  hash: string;
  mime_type: string;
  vector_status: 'pending' | 'indexing' | 'indexed' | 'failed';
  original_file_id: string | null;
  reference_count: number;
  parsed_content: string | null;
  markdown_content: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Organization table row
 */
export interface OrganizationRow {
  id: string;
  name: string;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  created_at: string;
  updated_at: string;
}

/**
 * Organization deduplication stats view/table
 */
export interface OrganizationDeduplicationStats {
  organization_id: string;
  original_files_count: number;
  reference_files_count: number;
  storage_saved_bytes: number;
  total_storage_used_bytes: number;
}

/**
 * Duplicate file search result (from find_duplicate_file RPC)
 */
export interface DuplicateFileResult {
  file_id: string;
  storage_path: string;
  parsed_content: string | null;
  markdown_content: string | null;
}

/**
 * Qdrant vector payload structure
 */
export interface QdrantVectorPayload {
  chunk_id?: string;
  document_id?: string;
  course_id?: string;
  organization_id?: string;
  indexed_at?: string;
  last_updated?: string;
  [key: string]: unknown;
}
