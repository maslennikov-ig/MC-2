/**
 * Stage 2 Document Processing Orchestrator Helpers
 *
 * Core orchestration functions and initialization helpers.
 * Split into focused modules:
 * - orchestrator-progress-helpers.ts: Progress updates and course status
 * - orchestrator-phase-helpers.ts: Individual phase execution
 *
 * @module stages/stage2-document-processing/orchestrator-helpers
 */

import type { DocumentPriorityLevel, Json } from '@megacampus/shared-types';
import type { DocumentProcessingResult, FileWithOrganization } from './types';
import { getPriorityWeight } from '../../shared/constants/priority-weights';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { logTrace } from '../../shared/trace-logger';
import { getTranslator, type Locale } from '../../shared/i18n';
import { cacheFileMarkdown } from '../../shared/cache/file-content-cache';

// Re-export PhaseContext for backward compatibility
export type { PhaseContext } from './orchestrator-phase-helpers';

// Re-export phase execution functions
export {
  processDocument,
  executeVectorIndexing,
  executeSummarization,
  finalizeProcessing,
} from './orchestrator-phase-helpers';

// Re-export progress update functions
export {
  updateDocumentProcessingProgress,
  updateCourseProgressInDB,
} from './orchestrator-progress-helpers';

/**
 * Initialize processing phase
 * Steps 1-2: Get metadata and determine processing strategy
 */
export async function initializeProcessing(context: {
  fileId: string;
  filePath: string;
  courseId: string;
  organizationId: string;
  locale: Locale;
  tier: string;
  mimeType: string;
  priority: DocumentPriorityLevel;
  priorityWeight: number;
  job: { updateProgress: (progress: number) => Promise<void> };
}): Promise<{ usePlainText: boolean }> {
  const { fileId, courseId, locale, tier, mimeType, priority, priorityWeight, job } = context;
  const t = getTranslator(locale);

  logger.info(
    {
      fileId,
      filePath: context.filePath,
      courseId,
    },
    'Starting document processing orchestration'
  );

  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'init',
    stepName: 'start',
    inputData: { fileId, filePath: context.filePath, organizationId: context.organizationId },
    durationMs: 0,
  });

  // Update progress
  await job.updateProgress(5);

  const { updateCourseProgressInDB } = await import('./orchestrator-progress-helpers');
  await updateCourseProgressInDB(courseId, t('stage2.init'));

  // Determine processing strategy
  const usePlainText = shouldUsePlainTextProcessing(tier, mimeType);

  logger.info(
    {
      fileId,
      tier,
      mimeType,
      priority,
      priorityWeight,
      usePlainText,
    },
    'File metadata retrieved'
  );

  return { usePlainText };
}

/**
 * Check if plain text processing should be used
 */
function shouldUsePlainTextProcessing(tier: string, mimeType: string): boolean {
  if (tier === 'basic') {
    return true;
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return true;
  }

  return false;
}

/**
 * Get file metadata including organization tier and priority
 */
export async function getFileMetadata(fileId: string): Promise<{
  tier: string;
  mimeType: string;
  priority: DocumentPriorityLevel;
  priorityWeight: number;
}> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('file_catalog')
    .select('mime_type, organization_id, priority, organizations(tier)')
    .eq('id', fileId)
    .single();

  if (error || !data) {
    logger.error({ err: error, fileId }, 'Failed to fetch file metadata');
    throw new Error(`Failed to fetch file metadata: ${error?.message || 'File not found'}`);
  }

  const fileData = data as unknown as FileWithOrganization;

  if (!fileData.organizations?.tier) {
    throw new Error(
      `Organization tier not found for file ${fileId}. ` +
        `Organization ID: ${fileData.organization_id}. ` +
        `This may indicate a database integrity issue.`
    );
  }

  const priority = fileData.priority ?? 'SUPPLEMENTARY';
  const priorityWeight = getPriorityWeight(priority, { fileId });

  return {
    tier: fileData.organizations.tier,
    mimeType: fileData.mime_type,
    priority,
    priorityWeight,
  };
}

/**
 * Store processed document data in file_catalog
 */
export async function storeProcessedDocument(
  fileId: string,
  processingResult: DocumentProcessingResult,
  courseId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('file_catalog')
    .update({
      parsed_content: processingResult.json as unknown as Json,
      markdown_content: processingResult.markdown,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fileId);

  if (error) {
    logger.error({ err: error, fileId }, 'Failed to store processed document');
    throw new Error(`Failed to store processed document: ${error.message}`);
  }

  void cacheFileMarkdown(courseId, fileId, processingResult.markdown);

  logger.info(
    {
      fileId,
      markdown_length: processingResult.markdown.length,
      json_size: JSON.stringify(processingResult.json).length,
    },
    'Processed document stored successfully'
  );
}

/**
 * Update vector_status in file_catalog
 */
export async function updateVectorStatus(
  fileId: string,
  status: 'pending' | 'indexing' | 'indexed' | 'failed'
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('file_catalog')
    .update({ vector_status: status, updated_at: new Date().toISOString() })
    .eq('id', fileId);

  if (error) {
    logger.error({ err: error, fileId, status }, 'Failed to update vector status');
    throw new Error(`Failed to update vector status: ${error.message}`);
  }

  logger.info({ fileId, status }, 'Vector status updated');
}
