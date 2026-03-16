/**
 * Phase: Document Classification
 *
 * Classifies uploaded documents by importance for Stage 2 processing.
 * Classification determines token budget allocation in Stage 3.
 *
 * @module stages/stage2-document-processing/phases/phase-classification
 */

import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { type DocumentPriority, getPriorityLevel } from '@megacampus/shared-types';
import {
  planTournamentClassification,
  executeTournamentClassification,
  type DocumentForClassification,
} from '../utils/tournament-classification';
import { cache as redisCache } from '../../../shared/cache/redis';
import { createHash } from 'crypto';
import {
  type ClassificationResponse,
  type ComparativeClassificationResponse,
  CLASSIFICATION_INPUT_BUDGET,
  DOC_CLASS_CACHE_TTL,
  DOC_CLASS_CACHE_PREFIX,
  DOC_CLASS_CACHE_VERSION,
} from './classification-types';
import {
  fetchFileMetadata,
  fetchCourseContext,
  classifyDocument,
  classifyDocumentsComparatively,
  storeClassificationResults,
} from './classification-helpers';

// Re-export types for external consumers
export type { ClassificationInput } from './classification-types';

// ============================================================================
// Cache Key Builder
// ============================================================================

/**
 * Build cache key for document classification results
 *
 * Generates a deterministic cache key based on:
 * - File IDs (sorted for determinism)
 * - Course context (title + description)
 *
 * Uses SHA-256 hash truncated to 16 hex chars (64 bits of entropy).
 */
function buildDocClassCacheKey(
  courseId: string,
  fileIds: string[],
  courseContext: { title: string; description: string }
): string {
  const payload = JSON.stringify({
    fids: [...fileIds].sort(),
    title: courseContext.title,
    desc: courseContext.description,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `${DOC_CLASS_CACHE_PREFIX}:${DOC_CLASS_CACHE_VERSION}:${courseId}:${hash}`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Execute document classification phase using COMPARATIVE classification
 *
 * Makes a SINGLE LLM call with ALL documents for comparative ranking:
 * - Exactly 1 CORE document (most important)
 * - Up to 30% IMPORTANT documents
 * - Remaining SUPPLEMENTARY documents
 */
export async function executeDocumentClassificationComparative(
  courseId: string,
  fileIds: string[],
  organizationId: string
): Promise<DocumentPriority[]> {
  logger.info(
    {
      courseId,
      organizationId,
      fileCount: fileIds.length,
    },
    'Starting comparative document classification phase'
  );

  if (fileIds.length === 0) {
    logger.warn({ courseId }, 'No files to classify');
    return [];
  }

  const supabase = getSupabaseAdmin();

  // Step 1: Fetch file metadata for all documents
  logger.debug({ courseId, fileIds }, 'Fetching file metadata for comparative classification');
  const fileMetadataList = await fetchFileMetadata(supabase, fileIds, courseId);

  if (fileMetadataList.length === 0) {
    logger.warn({ courseId, fileIds }, 'No file metadata found');
    return [];
  }

  // Step 2: Fetch course context for better classification
  const courseContext = await fetchCourseContext(supabase, courseId);

  // Step 2.5: Check cache before LLM classification
  const cacheKey = buildDocClassCacheKey(courseId, fileIds, courseContext);
  const cached = await redisCache.get<DocumentPriority[]>(cacheKey);
  if (cached && cached.length > 0) {
    logger.info(
      { courseId, fileCount: fileIds.length, cacheKey, cacheStatus: 'hit' },
      'Document classification cache hit — skipping LLM call'
    );

    // Restore Date objects from JSON serialization (JSON.parse returns ISO strings, not Dates)
    const restored = cached.map(p => ({
      ...p,
      classified_at:
        typeof p.classified_at === 'string'
          ? new Date(p.classified_at)
          : p.classified_at instanceof Date
            ? p.classified_at
            : new Date(),
    }));

    // Still store results to DB (may have been cleared)
    const supabaseForStore = getSupabaseAdmin();
    await storeClassificationResults(supabaseForStore, courseId, restored);

    logger.info(
      { courseId, totalClassified: restored.length },
      'Document classification restored from cache'
    );

    return restored;
  }

  logger.debug({ courseId, cacheKey, cacheStatus: 'miss' }, 'Document classification cache miss');

  // Step 3: Calculate total summary tokens for budget decision
  const totalSummaryTokens = fileMetadataList.reduce((sum, file) => sum + file.summary_tokens, 0);

  const requiresTournament = totalSummaryTokens > CLASSIFICATION_INPUT_BUDGET;

  logger.info(
    {
      fileCount: fileMetadataList.length,
      totalSummaryTokens,
      budget: CLASSIFICATION_INPUT_BUDGET,
      requiresTournament,
    },
    'Classification strategy determined'
  );

  // Step 4: Execute appropriate classification strategy
  let comparativeResults: ComparativeClassificationResponse;
  try {
    if (requiresTournament) {
      logger.info(
        { totalSummaryTokens, budget: CLASSIFICATION_INPUT_BUDGET },
        'Using two-stage tournament classification (summaries exceed budget)'
      );

      const documents: DocumentForClassification[] = fileMetadataList.map(f => ({
        id: f.id,
        filename: f.filename,
        generated_title: f.generated_title,
        original_name: f.original_name,
        mime_type: f.mime_type,
        file_size: f.file_size,
        summary: f.content_preview,
        summaryTokens: f.summary_tokens,
      }));

      const plan = planTournamentClassification(documents, CLASSIFICATION_INPUT_BUDGET);
      comparativeResults = await executeTournamentClassification(plan, courseContext);
    } else {
      logger.debug(
        { fileCount: fileMetadataList.length },
        'Using single-stage comparative classification (summaries fit in budget)'
      );
      comparativeResults = await classifyDocumentsComparatively(fileMetadataList, courseContext);
    }
  } catch (error) {
    logger.error(
      {
        courseId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to classify documents comparatively, falling back to independent classification'
    );
    // Fallback to original independent classification
    return executeDocumentClassification(courseId, fileIds, organizationId);
  }

  // Step 4: Convert comparative results to DocumentPriority format
  const now = new Date();
  const documentPriorities: DocumentPriority[] = [];

  for (let i = 0; i < comparativeResults.classifications.length; i++) {
    const classification = comparativeResults.classifications[i];

    let importanceScore: number;

    switch (classification.priority) {
      case 'CORE':
        importanceScore = 0.95;
        break;
      case 'IMPORTANT':
        importanceScore = 0.75;
        break;
      case 'SUPPLEMENTARY':
        importanceScore = 0.5;
        break;
      default:
        throw new Error(`Unknown priority level: ${classification.priority as string}`);
    }

    documentPriorities.push({
      file_id: classification.id,
      priority: getPriorityLevel(importanceScore),
      priority_level: classification.priority,
      importance_score: importanceScore,
      order: i + 1,
      classification_rationale: `[Comparative] ${classification.rationale}`,
      classified_at: now,
    });
  }

  // Step 4.5: Cache classification results
  await redisCache.set(cacheKey, documentPriorities, { ttl: DOC_CLASS_CACHE_TTL });
  logger.debug({ courseId, cacheKey }, 'Document classification results cached');

  // Step 5: Store classifications
  await storeClassificationResults(supabase, courseId, documentPriorities);

  logger.info(
    {
      courseId,
      totalClassified: documentPriorities.length,
      coreCount: documentPriorities.filter(p => p.importance_score >= 0.9).length,
      importantCount: documentPriorities.filter(
        p => p.importance_score >= 0.7 && p.importance_score < 0.9
      ).length,
      supplementaryCount: documentPriorities.filter(p => p.importance_score < 0.7).length,
    },
    'Comparative document classification phase complete'
  );

  return documentPriorities;
}

/**
 * Execute document classification phase (ORIGINAL INDEPENDENT APPROACH)
 *
 * OLD APPROACH: Classifies each document INDEPENDENTLY in a loop.
 * This is kept as a fallback if comparative classification fails.
 */
export async function executeDocumentClassification(
  courseId: string,
  fileIds: string[],
  organizationId: string
): Promise<DocumentPriority[]> {
  logger.info(
    {
      courseId,
      organizationId,
      fileCount: fileIds.length,
    },
    'Starting document classification phase'
  );

  if (fileIds.length === 0) {
    logger.warn({ courseId }, 'No files to classify');
    return [];
  }

  const supabase = getSupabaseAdmin();

  // Step 1: Fetch file metadata for all documents
  logger.debug({ courseId, fileIds }, 'Fetching file metadata');
  const fileMetadataList = await fetchFileMetadata(supabase, fileIds, courseId);

  if (fileMetadataList.length === 0) {
    logger.warn({ courseId, fileIds }, 'No file metadata found');
    return [];
  }

  // Step 2: Fetch course context for better classification
  const courseContext = await fetchCourseContext(supabase, courseId);

  // Step 3: Classify each document using LLM
  const classificationResults: Array<{
    fileId: string;
    response: ClassificationResponse;
  }> = [];

  for (const fileMeta of fileMetadataList) {
    try {
      logger.debug({ fileId: fileMeta.id, filename: fileMeta.filename }, 'Classifying document');

      const response = await classifyDocument(fileMeta, courseContext);
      classificationResults.push({ fileId: fileMeta.id, response });

      logger.info(
        {
          fileId: fileMeta.id,
          filename: fileMeta.filename,
          importance_score: response.importance_score,
        },
        'Document classified'
      );
    } catch (error) {
      logger.error(
        {
          fileId: fileMeta.id,
          filename: fileMeta.filename,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to classify document, using default LOW priority'
      );

      // Fallback: assign LOW priority on error
      classificationResults.push({
        fileId: fileMeta.id,
        response: {
          importance_score: 0.3,
          classification_rationale: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}. Assigned default LOW priority.`,
        },
      });
    }
  }

  // Step 4: Sort by importance_score DESC and assign order
  const sortedResults = classificationResults.sort(
    (a, b) => b.response.importance_score - a.response.importance_score
  );

  // Step 5: Build DocumentPriority array
  const now = new Date();
  const documentPriorities: DocumentPriority[] = sortedResults.map((result, index) => ({
    file_id: result.fileId,
    priority: getPriorityLevel(result.response.importance_score),
    importance_score: result.response.importance_score,
    order: index + 1,
    classification_rationale: result.response.classification_rationale,
    classified_at: now,
  }));

  // Step 6: Store classifications
  await storeClassificationResults(supabase, courseId, documentPriorities);

  logger.info(
    {
      courseId,
      totalClassified: documentPriorities.length,
      highPriorityCount: documentPriorities.filter(p => p.priority === 'HIGH').length,
      lowPriorityCount: documentPriorities.filter(p => p.priority === 'LOW').length,
    },
    'Document classification phase complete'
  );

  return documentPriorities;
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Retrieve stored classification from file_catalog
 */
export async function getStoredClassification(fileId: string): Promise<DocumentPriority | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('file_catalog')
    .select('id, summary_metadata')
    .eq('id', fileId)
    .single();

  if (error || !data) {
    return null;
  }

  const metadata = data.summary_metadata as Record<string, unknown> | null;
  const classification = metadata?.classification as Record<string, unknown> | undefined;

  if (!classification) {
    return null;
  }

  return {
    file_id: data.id,
    priority: classification.priority as 'HIGH' | 'LOW',
    importance_score: classification.importance_score as number,
    order: classification.order as number,
    classification_rationale: classification.classification_rationale as string,
    classified_at: new Date(classification.classified_at as string),
  };
}

/**
 * Retrieve all classifications for a course
 */
export async function getCourseClassifications(courseId: string): Promise<DocumentPriority[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('file_catalog')
    .select('id, summary_metadata')
    .eq('course_id', courseId)
    .not('summary_metadata', 'is', null);

  if (error || !data) {
    logger.warn({ courseId, error }, 'Failed to fetch course classifications');
    return [];
  }

  const priorities: DocumentPriority[] = [];

  for (const file of data) {
    const metadata = file.summary_metadata as Record<string, unknown> | null;
    const classification = metadata?.classification as Record<string, unknown> | undefined;

    if (classification) {
      priorities.push({
        file_id: file.id,
        priority: classification.priority as 'HIGH' | 'LOW',
        importance_score: classification.importance_score as number,
        order: classification.order as number,
        classification_rationale: classification.classification_rationale as string,
        classified_at: new Date(classification.classified_at as string),
      });
    }
  }

  // Sort by order
  return priorities.sort((a, b) => a.order - b.order);
}
