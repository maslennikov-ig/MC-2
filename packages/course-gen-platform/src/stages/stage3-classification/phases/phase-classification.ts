/**
 * Phase: Document Classification
 *
 * Classifies uploaded documents by importance for Stage 2 processing.
 * Classification determines token budget allocation in Stage 3.
 *
 * Classification criteria:
 * - HIGH priority (importance_score >= 0.7):
 *   - Primary course material (textbooks, syllabi, main lectures)
 *   - Critical reference documents
 *   - Regulatory/compliance documents
 * - LOW priority (importance_score < 0.7):
 *   - Supplementary presentations
 *   - Additional notes
 *   - Optional references
 *
 * @module stages/stage2-document-processing/phases/phase-classification
 */

import { z } from 'zod';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createOpenRouterModel } from '../../../shared/llm/langchain-models';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import {
  type DocumentPriority,
  DocumentPriorityLevelSchema,
  getPriorityLevel,
} from '@megacampus/shared-types';
import { tokenEstimator } from '../../../shared/llm/token-estimator';
import {
  planTournamentClassification,
  executeTournamentClassification,
  type DocumentForClassification,
} from '../utils/tournament-classification';
import { createPromptService } from '../../../shared/prompts/prompt-service';
import { createModelConfigService } from '../../../shared/llm/model-config-service';

// ============================================================================
// LLM Response Schema
// ============================================================================

/**
 * Schema for LLM classification response (per document)
 */
const ClassificationResponseSchema = z.object({
  importance_score: z
    .number()
    .min(0.0)
    .max(1.0)
    .describe('Importance score from 0.0 to 1.0. HIGH threshold: >= 0.7'),
  classification_rationale: z
    .string()
    .min(10)
    .describe('Reasoning for the classification decision'),
});

type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>;

/**
 * Schema for single document in comparative classification
 */
const ComparativeDocumentClassificationSchema = z.object({
  id: z.string().uuid().describe('Document UUID from database'),
  priority: DocumentPriorityLevelSchema.describe(
    'Priority level: CORE (exactly 1), IMPORTANT (up to 30%), or SUPPLEMENTARY (remaining)'
  ),
  rationale: z
    .string()
    .min(10)
    .describe('Brief explanation of why this document received this priority level'),
});

/**
 * Schema for comparative classification response from LLM
 */
const ComparativeClassificationResponseSchema = z.object({
  classifications: z
    .array(ComparativeDocumentClassificationSchema)
    .min(1)
    .describe('Classification results for all documents'),
});

type ComparativeClassificationResponse = z.infer<
  typeof ComparativeClassificationResponseSchema
>;

// ============================================================================
// Input Types
// ============================================================================

/**
 * File metadata for classification
 */
interface FileMetadata {
  id: string;
  filename: string;
  /** AI-generated meaningful title from Phase 6 summarization */
  generated_title: string | null;
  /** User-provided original filename at upload */
  original_name: string | null;
  mime_type: string;
  file_size: number;
  content_preview: string;
  summary_tokens: number;
}

/**
 * Input for document classification phase
 */
export interface ClassificationInput {
  courseId: string;
  fileIds: string[];
  organizationId: string;
  courseTitle?: string;
  courseDescription?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Classification input token budget
 * If all document summaries exceed this budget, use two-stage tournament classification
 */
const CLASSIFICATION_INPUT_BUDGET = 100_000; // tokens

// ============================================================================
// Helper Functions - Model Configuration
// ============================================================================

/**
 * Get model configuration for classification from database
 * Falls back to hardcoded values if database unavailable
 */
async function getClassificationModelConfig() {
  const modelConfigService = createModelConfigService();
  const config = await modelConfigService.getModelForPhase('stage_3_classification');
  return {
    modelId: config.modelId,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Execute document classification phase using COMPARATIVE classification
 *
 * NEW APPROACH: Makes a SINGLE LLM call with ALL documents for comparative ranking.
 * This ensures proper distribution of priority levels:
 * - Exactly 1 CORE document (most important)
 * - Up to 30% IMPORTANT documents
 * - Remaining SUPPLEMENTARY documents
 *
 * @param courseId - Course UUID
 * @param fileIds - Array of file UUIDs to classify
 * @param organizationId - Organization UUID
 * @returns Array of DocumentPriority results
 *
 * @example
 * ```typescript
 * const priorities = await executeDocumentClassificationComparative(
 *   'course-uuid',
 *   ['file1-uuid', 'file2-uuid'],
 *   'org-uuid'
 * );
 * ```
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
  const fileMetadataList = await fetchFileMetadata(supabase, fileIds);

  if (fileMetadataList.length === 0) {
    logger.warn({ courseId, fileIds }, 'No file metadata found');
    return [];
  }

  // Step 2: Fetch course context for better classification
  const courseContext = await fetchCourseContext(supabase, courseId);

  // Step 3: Calculate total summary tokens for budget decision
  const totalSummaryTokens = fileMetadataList.reduce(
    (sum, file) => sum + file.summary_tokens,
    0
  );

  const requiresTournament = totalSummaryTokens > CLASSIFICATION_INPUT_BUDGET;

  logger.info({
    fileCount: fileMetadataList.length,
    totalSummaryTokens,
    budget: CLASSIFICATION_INPUT_BUDGET,
    requiresTournament,
  }, 'Classification strategy determined');

  // Step 4: Execute appropriate classification strategy
  let comparativeResults: ComparativeClassificationResponse;
  try {
    if (requiresTournament) {
      logger.info(
        { totalSummaryTokens, budget: CLASSIFICATION_INPUT_BUDGET },
        'Using two-stage tournament classification (summaries exceed budget)'
      );

      // Convert FileMetadata to DocumentForClassification
      // Include generated_title and original_name for meaningful document references
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

      // Plan tournament
      const plan = planTournamentClassification(documents, CLASSIFICATION_INPUT_BUDGET);

      // Execute tournament
      comparativeResults = await executeTournamentClassification(plan, courseContext);
    } else {
      logger.debug(
        { fileCount: fileMetadataList.length },
        'Using single-stage comparative classification (summaries fit in budget)'
      );
      comparativeResults = await classifyDocumentsComparatively(
        fileMetadataList,
        courseContext
      );
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

  // Map comparative priority levels to importance scores
  for (let i = 0; i < comparativeResults.classifications.length; i++) {
    const classification = comparativeResults.classifications[i];

    // Convert DocumentPriorityLevel to importance_score and PriorityLevel
    let importanceScore: number;

    switch (classification.priority) {
      case 'CORE':
        importanceScore = 0.95; // Very high score
        break;
      case 'IMPORTANT':
        importanceScore = 0.75; // Above HIGH threshold (0.7)
        break;
      case 'SUPPLEMENTARY':
        importanceScore = 0.5; // Below HIGH threshold
        break;
      default:
        // This should never happen due to Zod validation
        throw new Error(`Unknown priority level: ${classification.priority as string}`);
    }

    documentPriorities.push({
      file_id: classification.id,
      priority: getPriorityLevel(importanceScore),
      priority_level: classification.priority, // CORE | IMPORTANT | SUPPLEMENTARY
      importance_score: importanceScore,
      order: i + 1, // Already ranked by LLM
      classification_rationale: `[Comparative] ${classification.rationale}`,
      classified_at: now,
    });
  }

  // Step 5: Store classifications
  await storeClassificationResults(supabase, courseId, documentPriorities);

  logger.info(
    {
      courseId,
      totalClassified: documentPriorities.length,
      coreCount: documentPriorities.filter((p) => p.importance_score >= 0.9).length,
      importantCount: documentPriorities.filter(
        (p) => p.importance_score >= 0.7 && p.importance_score < 0.9
      ).length,
      supplementaryCount: documentPriorities.filter((p) => p.importance_score < 0.7).length,
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
 *
 * @param courseId - Course UUID
 * @param fileIds - Array of file UUIDs to classify
 * @param organizationId - Organization UUID
 * @returns Array of DocumentPriority results
 *
 * @example
 * ```typescript
 * const priorities = await executeDocumentClassification(
 *   'course-uuid',
 *   ['file1-uuid', 'file2-uuid'],
 *   'org-uuid'
 * );
 * ```
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
  const fileMetadataList = await fetchFileMetadata(supabase, fileIds);

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
      logger.debug(
        { fileId: fileMeta.id, filename: fileMeta.filename },
        'Classifying document'
      );

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
  const documentPriorities: DocumentPriority[] = sortedResults.map(
    (result, index) => ({
      file_id: result.fileId,
      priority: getPriorityLevel(result.response.importance_score),
      importance_score: result.response.importance_score,
      order: index + 1,
      classification_rationale: result.response.classification_rationale,
      classified_at: now,
    })
  );

  // Step 6: Store classifications (if document_priorities table exists)
  // Note: This will be implemented when the table is created via migration
  await storeClassificationResults(supabase, courseId, documentPriorities);

  logger.info(
    {
      courseId,
      totalClassified: documentPriorities.length,
      highPriorityCount: documentPriorities.filter((p) => p.priority === 'HIGH')
        .length,
      lowPriorityCount: documentPriorities.filter((p) => p.priority === 'LOW')
        .length,
    },
    'Document classification phase complete'
  );

  return documentPriorities;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch file metadata from database
 *
 * NEW: Uses processed_content (summary) instead of markdown_content
 * Falls back to markdown_content if processed_content is not available
 *
 * Also fetches generated_title and original_name for meaningful document references
 */
async function fetchFileMetadata(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fileIds: string[]
): Promise<FileMetadata[]> {
  const { data, error } = await supabase
    .from('file_catalog')
    .select('id, filename, generated_title, original_name, mime_type, file_size, processed_content, markdown_content, summary_metadata')
    .in('id', fileIds);

  if (error) {
    logger.error({ error, fileIds }, 'Failed to fetch file metadata');
    throw new Error(`Failed to fetch file metadata: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((file) => {
    // Use processed_content (summary) if available, fallback to markdown_content
    const content = file.processed_content || file.markdown_content || '';

    // Get summary tokens from metadata, or estimate if not available
    const metadata = file.summary_metadata as { summary_tokens?: number } | null;
    const summaryTokens = metadata?.summary_tokens ||
      tokenEstimator.estimateTokens(content, detectLanguage(content));

    logger.debug({
      fileId: file.id,
      hasProcessedContent: !!file.processed_content,
      hasGeneratedTitle: !!file.generated_title,
      summaryTokens,
      contentLength: content.length,
    }, 'Loaded file for classification');

    return {
      id: file.id,
      filename: file.filename,
      generated_title: file.generated_title ?? null,
      original_name: file.original_name ?? null,
      mime_type: file.mime_type,
      file_size: file.file_size,
      content_preview: content, // Full summary, not truncated
      summary_tokens: summaryTokens,
    };
  });
}

/**
 * Fetch course context for classification
 */
async function fetchCourseContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  courseId: string
): Promise<{ title: string; description: string }> {
  const { data, error } = await supabase
    .from('courses')
    .select('title, course_description')
    .eq('id', courseId)
    .single();

  if (error) {
    logger.warn({ error, courseId }, 'Failed to fetch course context');
    return { title: '', description: '' };
  }

  return {
    title: data?.title || '',
    description: data?.course_description || '',
  };
}

/**
 * Classify a single document using LLM
 */
async function classifyDocument(
  fileMeta: FileMetadata,
  courseContext: { title: string; description: string }
): Promise<ClassificationResponse> {
  const modelConfig = await getClassificationModelConfig();
  const model = createOpenRouterModel(
    modelConfig.modelId,
    modelConfig.temperature,
    modelConfig.maxTokens
  );

  const [systemMsg, humanMsg] = await buildClassificationPrompt(
    fileMeta,
    courseContext
  );

  const response = await model.invoke([systemMsg, humanMsg]);
  const rawOutput = response.content as string;

  // Parse JSON response
  let parsed: unknown;
  try {
    // Handle potential markdown code block wrapping
    const jsonStr = extractJsonFromResponse(rawOutput);
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    logger.error(
      {
        fileId: fileMeta.id,
        rawOutput,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      },
      'Failed to parse LLM response as JSON'
    );
    throw new Error('Failed to parse classification response');
  }

  // Validate with Zod schema
  const validated = ClassificationResponseSchema.parse(parsed);

  return validated;
}

/**
 * Classify ALL documents in a single LLM call using comparative ranking
 *
 * Uses LangChain's withStructuredOutput for reliable JSON parsing
 */
async function classifyDocumentsComparatively(
  fileMetadataList: FileMetadata[],
  courseContext: { title: string; description: string }
): Promise<ComparativeClassificationResponse> {
  const modelConfig = await getClassificationModelConfig();
  const model = createOpenRouterModel(
    modelConfig.modelId,
    modelConfig.temperature,
    modelConfig.maxTokens
  );

  // Use withStructuredOutput for structured JSON responses
  const structuredModel = model.withStructuredOutput(
    ComparativeClassificationResponseSchema
  );

  const [systemMsg, humanMsg] = await buildComparativeClassificationPrompt(
    fileMetadataList,
    courseContext
  );

  const response = await structuredModel.invoke([systemMsg, humanMsg]);

  // Validate constraints
  validateComparativeResults(response, fileMetadataList.length);

  return response;
}

/**
 * Build comparative classification prompt for LLM
 */
async function buildComparativeClassificationPrompt(
  fileMetadataList: FileMetadata[],
  courseContext: { title: string; description: string }
): Promise<[SystemMessage, HumanMessage]> {
  const maxImportant = Math.ceil(fileMetadataList.length * 0.3);
  const promptService = createPromptService();

  // Build document list with previews
  // Use generated_title when available for meaningful document identification
  const documentDescriptions = fileMetadataList
    .map(
      (file, index) => {
        const hasGeneratedTitle = !!file.generated_title;
        return `
[Document ${index + 1}]
ID: ${file.id}
${hasGeneratedTitle ? `Title: ${file.generated_title}` : ''}
Filename: ${file.original_name || file.filename}
File Type: ${file.mime_type}
File Size: ${formatFileSize(file.file_size)}
Content Preview (first 1500 chars):
${file.content_preview.substring(0, 1500)}${file.content_preview.length > 1500 ? '...[truncated]' : ''}
---`;
      }
    )
    .join('\n');

  // Load and render prompt from database (with hardcoded fallback)
  const systemPromptText = await promptService.renderPrompt('stage3_classification_comparative', {
    maxImportant: String(maxImportant),
    totalDocuments: String(fileMetadataList.length),
    courseTitle: courseContext.title || 'Not specified',
    courseDescription: courseContext.description || 'Not specified',
    documentDescriptions: documentDescriptions,
  });

  const systemMessage = new SystemMessage(systemPromptText);

  const humanMessage = new HumanMessage(`Classify ALL ${fileMetadataList.length} documents comparatively. Remember:
- Exactly 1 CORE document
- Maximum ${maxImportant} IMPORTANT documents
- Remaining documents are SUPPLEMENTARY`);

  return [systemMessage, humanMessage];
}

/**
 * Validate comparative classification results against constraints
 */
function validateComparativeResults(
  results: ComparativeClassificationResponse,
  expectedCount: number
): void {
  const { classifications } = results;

  // Check count matches
  if (classifications.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} classifications, got ${classifications.length}`
    );
  }

  // Count priority levels
  const coreCount = classifications.filter((c) => c.priority === 'CORE').length;
  const importantCount = classifications.filter((c) => c.priority === 'IMPORTANT').length;
  const maxImportant = Math.ceil(expectedCount * 0.3);

  // Validate constraints
  if (coreCount !== 1) {
    logger.warn(
      { coreCount },
      'Comparative classification returned incorrect CORE count (expected exactly 1)'
    );
    // Auto-fix: promote highest ranked to CORE
    if (coreCount === 0 && classifications.length > 0) {
      classifications[0].priority = 'CORE';
      logger.info('Auto-fixed: promoted first document to CORE');
    }
  }

  if (importantCount > maxImportant) {
    logger.warn(
      { importantCount, maxImportant },
      'Comparative classification returned too many IMPORTANT documents'
    );
    // Auto-fix: demote excess to SUPPLEMENTARY
    let demotedCount = 0;
    for (let i = 0; i < classifications.length && demotedCount < importantCount - maxImportant; i++) {
      if (classifications[i].priority === 'IMPORTANT') {
        classifications[i].priority = 'SUPPLEMENTARY';
        demotedCount++;
      }
    }
    logger.info({ demotedCount }, 'Auto-fixed: demoted excess IMPORTANT to SUPPLEMENTARY');
  }
}

/**
 * Build classification prompt for LLM (ORIGINAL INDEPENDENT APPROACH)
 */
async function buildClassificationPrompt(
  fileMeta: FileMetadata,
  courseContext: { title: string; description: string }
): Promise<[SystemMessage, HumanMessage]> {
  const promptService = createPromptService();

  // Load and render prompt from database (with hardcoded fallback)
  const systemPromptText = await promptService.renderPrompt('stage3_classification_independent', {
    courseTitle: courseContext.title || 'Not specified',
    courseDescription: courseContext.description || 'Not specified',
    filename: fileMeta.filename,
    mimeType: fileMeta.mime_type,
    fileSize: formatFileSize(fileMeta.file_size),
    contentPreview: fileMeta.content_preview || '[No content available]',
  });

  const systemMessage = new SystemMessage(systemPromptText);

  const humanMessage = new HumanMessage(`Classify this document based on its importance and relevance to the course.`);

  return [systemMessage, humanMessage];
}

/**
 * Store classification results in database
 * Currently stores in file_catalog.summary_metadata as JSON
 * Will be updated to use document_priorities table when created
 */
async function storeClassificationResults(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  priorities: DocumentPriority[]
): Promise<void> {
  // Store classification in file_catalog.summary_metadata for each file
  // This allows retrieval without a dedicated table
  for (const priority of priorities) {
    try {
      // Get existing summary_metadata
      const { data: existingData } = await supabase
        .from('file_catalog')
        .select('summary_metadata')
        .eq('id', priority.file_id)
        .single();

      const existingMetadata = (existingData?.summary_metadata as Record<string, unknown>) || {};

      // Merge classification data
      const updatedMetadata = {
        ...existingMetadata,
        classification: {
          priority: priority.priority,
          importance_score: priority.importance_score,
          order: priority.order,
          classification_rationale: priority.classification_rationale,
          classified_at: priority.classified_at.toISOString(),
        },
      };

      // Update both summary_metadata and priority column
      const updateData: Record<string, unknown> = {
        summary_metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      };

      // Store priority_level (CORE/IMPORTANT/SUPPLEMENTARY) in priority column for UI
      if (priority.priority_level) {
        updateData.priority = priority.priority_level;
      }

      const { error } = await supabase
        .from('file_catalog')
        .update(updateData)
        .eq('id', priority.file_id);

      if (error) {
        logger.warn(
          { fileId: priority.file_id, error },
          'Failed to store classification in file_catalog'
        );
      }
    } catch (error) {
      logger.warn(
        {
          fileId: priority.file_id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error storing classification result'
      );
    }
  }

  logger.debug(
    { courseId, count: priorities.length },
    'Classification results stored in file_catalog.summary_metadata'
  );
}

/**
 * Truncate content to specified length
 * DEPRECATED: Now using full summaries, no truncation needed
 */
// function truncateContent(content: string, maxLength: number): string {
//   if (content.length <= maxLength) {
//     return content;
//   }
//   return `${content.substring(0, maxLength)}...[truncated]`;
// }

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 */
function extractJsonFromResponse(response: string): string {
  // Try to extract JSON from markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response.trim();
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detect document language using simple heuristic
 *
 * Checks for Cyrillic characters to detect Russian.
 * Falls back to English if no Cyrillic found.
 *
 * @param text - Text to analyze
 * @returns Language code ('rus' or 'eng')
 */
function detectLanguage(text: string): string {
  // Simple heuristic: check for Cyrillic characters
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicPattern.test(text.slice(0, 1000)); // Check first 1000 chars
  return hasCyrillic ? 'rus' : 'eng';
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Retrieve stored classification from file_catalog
 */
export async function getStoredClassification(
  fileId: string
): Promise<DocumentPriority | null> {
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
export async function getCourseClassifications(
  courseId: string
): Promise<DocumentPriority[]> {
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
