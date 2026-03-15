/**
 * RAG Context Cache Supabase Persistence
 * @module stages/stage5-generation/utils/rag-cache-persistence
 *
 * Supabase persistence layer for RAG context cache.
 * Extracted from rag-context-cache.ts to comply with max-lines rule.
 */

import { logger } from '@/shared/logger';
import type { RAGChunk } from './section-rag-retriever';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CachedRAGContext } from './rag-context-cache';

// ============================================================================
// SUPABASE TABLE TYPES (Schema T012)
// ============================================================================

/**
 * Temporary schema definition for rag_context_cache table
 * Overrides Database types until migration T012 is fully applied/generated
 */
interface RAGContextCacheTable {
  Row: {
    id: string;
    course_id: string;
    section_id: string;
    rag_context_id: string;
    chunks: RAGChunk[];
    coverage_score: number | null;
    search_queries_used: string[] | null;
    created_at: string;
    expires_at: string | null;
  };
  Insert: {
    id?: string;
    course_id: string;
    section_id: string;
    rag_context_id: string;
    chunks: RAGChunk[];
    coverage_score?: number | null;
    search_queries_used?: string[] | null;
    created_at?: string;
    expires_at?: string | null;
  };
  Update: {
    id?: string;
    course_id?: string;
    section_id?: string;
    rag_context_id?: string;
    chunks?: RAGChunk[];
    coverage_score?: number | null;
    search_queries_used?: string[] | null;
    created_at?: string;
    expires_at?: string | null;
  };
  Relationships: [];
}

// Augmented Database type for this file (simplified to avoid Omit issues)
type LocalDatabase = {
  public: {
    Tables: {
      rag_context_cache: RAGContextCacheTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ============================================================================
// PERSISTENCE OPERATIONS
// ============================================================================

/**
 * Persist cache entry to Supabase
 *
 * Uses rag_context_cache table from migration T012.
 */
export async function persistToSupabase(entry: CachedRAGContext): Promise<void> {
  try {
    const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

    const { error } = await supabase.from('rag_context_cache').upsert(
      {
        course_id: entry.courseId,
        section_id: entry.sectionId,
        rag_context_id: entry.ragContextId,
        chunks: entry.chunks,
        coverage_score: entry.coverageScore,
        search_queries_used: entry.searchQueriesUsed,
        created_at: entry.retrievedAt.toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
      },
      {
        onConflict: 'rag_context_id',
      }
    );

    if (error) {
      logger.warn(
        {
          err: error.message,
          ragContextId: entry.ragContextId,
        },
        '[RAG Cache] Failed to persist to Supabase'
      );
    } else {
      logger.debug(
        {
          ragContextId: entry.ragContextId,
        },
        '[RAG Cache] Persisted to Supabase'
      );
    }
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        ragContextId: entry.ragContextId,
      },
      '[RAG Cache] Supabase persistence error'
    );
  }
}

/**
 * Load cache entry from Supabase by context ID
 */
export async function loadFromSupabaseByContextId(
  ragContextId: string
): Promise<CachedRAGContext | null> {
  try {
    const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

    const { data, error } = await supabase
      .from('rag_context_cache')
      .select('*')
      .eq('rag_context_id', ragContextId)
      .single();

    if (error || !data) {
      return null;
    }

    const row = data as RAGContextCacheTable['Row'];

    // Check if expired
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      logger.debug(
        {
          ragContextId,
        },
        '[RAG Cache] Supabase entry expired'
      );
      return null;
    }

    return {
      ragContextId: row.rag_context_id,
      courseId: row.course_id,
      sectionId: row.section_id,
      chunks: row.chunks,
      retrievedAt: new Date(row.created_at),
      coverageScore: row.coverage_score || 0,
      searchQueriesUsed: row.search_queries_used || [],
    };
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        ragContextId,
      },
      '[RAG Cache] Failed to load from Supabase'
    );
    return null;
  }
}

/**
 * Load cache entries from Supabase for a course
 *
 * Called when persistence is enabled to hydrate memory cache.
 */
export async function loadCourseFromSupabase(courseId: string): Promise<CachedRAGContext[]> {
  try {
    const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

    const { data, error } = await supabase
      .from('rag_context_cache')
      .select('*')
      .eq('course_id', courseId)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      logger.warn(
        {
          err: error.message,
          courseId,
        },
        '[RAG Cache] Failed to load from Supabase'
      );
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const entries: CachedRAGContext[] = [];
    for (const item of data) {
      const row = item as RAGContextCacheTable['Row'];
      entries.push({
        ragContextId: row.rag_context_id,
        courseId: row.course_id,
        sectionId: row.section_id,
        chunks: row.chunks,
        retrievedAt: new Date(row.created_at),
        coverageScore: row.coverage_score || 0,
        searchQueriesUsed: row.search_queries_used || [],
      });
    }

    logger.debug(
      {
        courseId,
        entriesLoaded: entries.length,
      },
      '[RAG Cache] Loaded from Supabase'
    );

    return entries;
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        courseId,
      },
      '[RAG Cache] Supabase load error'
    );
    return [];
  }
}

/**
 * Clear course entries from Supabase
 */
export async function clearCourseFromSupabase(courseId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin() as unknown as SupabaseClient<LocalDatabase>;

    const { error } = await supabase.from('rag_context_cache').delete().eq('course_id', courseId);

    if (error) {
      logger.warn(
        {
          err: error.message,
          courseId,
        },
        '[RAG Cache] Failed to clear from Supabase'
      );
    } else {
      logger.debug(
        {
          courseId,
        },
        '[RAG Cache] Cleared from Supabase'
      );
    }
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        courseId,
      },
      '[RAG Cache] Supabase clear error'
    );
  }
}
