/**
 * Helper functions for document classification
 * @module stages/stage3-classification/phases/classification-helpers
 *
 * Extracted from phase-classification.ts to comply with max-lines rule.
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createOpenRouterModel } from '../../../shared/llm/langchain-models';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { DocumentPriority } from '@megacampus/shared-types';
import { tokenEstimator } from '../../../shared/llm/token-estimator';
import { createPromptService } from '../../../shared/prompts/prompt-service';
import { createModelConfigService } from '../../../shared/llm/model-config-service';
import { formatFileSize } from '@/shared/workspace-utils';
import {
  getCachedFileProcessedContent,
  getCachedFileMarkdown,
} from '../../../shared/cache/file-content-cache';
import {
  ClassificationResponseSchema,
  ComparativeClassificationResponseSchema,
  type ClassificationResponse,
  type ComparativeClassificationResponse,
  type FileMetadata,
} from './classification-types';

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Get model configuration for classification from database
 * Falls back to hardcoded values if database unavailable
 */
export async function getClassificationModelConfig() {
  const modelConfigService = createModelConfigService();
  const config = await modelConfigService.getModelForPhase('stage_3_classification');
  return {
    modelId: config.modelId,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetch file metadata from database
 *
 * Uses processed_content (summary) instead of markdown_content
 * Falls back to markdown_content if processed_content is not available
 */
export async function fetchFileMetadata(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fileIds: string[],
  courseId: string
): Promise<FileMetadata[]> {
  if (fileIds.length === 0) return [];

  // Step 1: Try Redis for content (processed_content preferred, fallback to markdown)
  const contentMap = new Map<string, string>();
  await Promise.all(
    fileIds.map(async fid => {
      const cached =
        (await getCachedFileProcessedContent(courseId, fid)) ||
        (await getCachedFileMarkdown(courseId, fid));
      if (cached) contentMap.set(fid, cached);
    })
  );

  const missedIds = fileIds.filter(id => !contentMap.has(id));

  logger.debug(
    {
      courseId,
      fileCount: fileIds.length,
      cacheHits: contentMap.size,
      cacheMisses: missedIds.length,
    },
    'Redis cache-aside check for file content'
  );

  // Step 2: Query Supabase for metadata (light query, no content columns)
  const { data, error } = await supabase
    .from('file_catalog')
    .select('id, filename, generated_title, original_name, mime_type, file_size, summary_metadata')
    .in('id', fileIds);

  if (error) {
    logger.error({ error, fileIds }, 'Failed to fetch file metadata');
    throw new Error(`Failed to fetch file metadata: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Step 3: For cache misses, batch-fetch content from Supabase
  if (missedIds.length > 0) {
    const { data: contentData, error: contentError } = await supabase
      .from('file_catalog')
      .select('id, processed_content, markdown_content')
      .in('id', missedIds);
    if (contentError) {
      logger.warn(
        { courseId, missedIds, error: contentError.message },
        '[Stage3] Supabase fallback for file content failed — files will have empty content'
      );
    }
    for (const d of contentData || []) {
      const c = d.processed_content || d.markdown_content || '';
      if (c) contentMap.set(d.id, c);
    }
  }

  // Step 4: Build results
  return data.map(file => {
    const content = contentMap.get(file.id) || '';

    // Get summary tokens from metadata, or estimate if not available
    const metadata = file.summary_metadata as { summary_tokens?: number } | null;
    const summaryTokens =
      metadata?.summary_tokens || tokenEstimator.estimateTokens(content, detectLanguage(content));

    logger.debug(
      {
        fileId: file.id,
        hasContent: content.length > 0,
        hasGeneratedTitle: !!file.generated_title,
        summaryTokens,
        contentLength: content.length,
        cacheHit: contentMap.has(file.id),
      },
      'Loaded file for classification'
    );

    return {
      id: file.id,
      filename: file.filename,
      generated_title: file.generated_title ?? null,
      original_name: file.original_name ?? null,
      mime_type: file.mime_type,
      file_size: file.file_size,
      content_preview: content,
      summary_tokens: summaryTokens,
    };
  });
}

/**
 * Fetch course context for classification
 */
export async function fetchCourseContext(
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

// ============================================================================
// LLM Classification
// ============================================================================

/**
 * Classify a single document using LLM
 */
export async function classifyDocument(
  fileMeta: FileMetadata,
  courseContext: { title: string; description: string }
): Promise<ClassificationResponse> {
  const modelConfig = await getClassificationModelConfig();
  const model = createOpenRouterModel(
    modelConfig.modelId,
    modelConfig.temperature,
    modelConfig.maxTokens
  );

  const [systemMsg, humanMsg] = await buildClassificationPrompt(fileMeta, courseContext);

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
 */
export async function classifyDocumentsComparatively(
  fileMetadataList: FileMetadata[],
  courseContext: { title: string; description: string }
): Promise<ComparativeClassificationResponse> {
  const modelConfig = await getClassificationModelConfig();
  const model = createOpenRouterModel(
    modelConfig.modelId,
    modelConfig.temperature,
    modelConfig.maxTokens
  );

  const structuredModel = model.withStructuredOutput(ComparativeClassificationResponseSchema);

  const [systemMsg, humanMsg] = await buildComparativeClassificationPrompt(
    fileMetadataList,
    courseContext
  );

  const response = await structuredModel.invoke([systemMsg, humanMsg]);

  validateComparativeResults(response, fileMetadataList.length);

  return response;
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build comparative classification prompt for LLM
 */
export async function buildComparativeClassificationPrompt(
  fileMetadataList: FileMetadata[],
  courseContext: { title: string; description: string }
): Promise<[SystemMessage, HumanMessage]> {
  const maxImportant = Math.ceil(fileMetadataList.length * 0.3);
  const promptService = createPromptService();

  const documentDescriptions = fileMetadataList
    .map((file, index) => {
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
    })
    .join('\n');

  const systemPromptText = await promptService.renderPrompt('stage3_classification_comparative', {
    maxImportant: String(maxImportant),
    totalDocuments: String(fileMetadataList.length),
    courseTitle: courseContext.title || 'Not specified',
    courseDescription: courseContext.description || 'Not specified',
    documentDescriptions: documentDescriptions,
  });

  const systemMessage = new SystemMessage(systemPromptText);

  const humanMessage =
    new HumanMessage(`Classify ALL ${fileMetadataList.length} documents comparatively. Remember:
- Exactly 1 CORE document
- Maximum ${maxImportant} IMPORTANT documents
- Remaining documents are SUPPLEMENTARY`);

  return [systemMessage, humanMessage];
}

/**
 * Build classification prompt for LLM (ORIGINAL INDEPENDENT APPROACH)
 */
export async function buildClassificationPrompt(
  fileMeta: FileMetadata,
  courseContext: { title: string; description: string }
): Promise<[SystemMessage, HumanMessage]> {
  const promptService = createPromptService();

  const systemPromptText = await promptService.renderPrompt('stage3_classification_independent', {
    courseTitle: courseContext.title || 'Not specified',
    courseDescription: courseContext.description || 'Not specified',
    filename: fileMeta.filename,
    mimeType: fileMeta.mime_type,
    fileSize: formatFileSize(fileMeta.file_size),
    contentPreview: fileMeta.content_preview || '[No content available]',
  });

  const systemMessage = new SystemMessage(systemPromptText);

  const humanMessage = new HumanMessage(
    `Classify this document based on its importance and relevance to the course.`
  );

  return [systemMessage, humanMessage];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate comparative classification results against constraints
 */
export function validateComparativeResults(
  results: ComparativeClassificationResponse,
  expectedCount: number
): void {
  const { classifications } = results;

  if (classifications.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} classifications, got ${classifications.length}`);
  }

  const coreCount = classifications.filter(c => c.priority === 'CORE').length;
  const importantCount = classifications.filter(c => c.priority === 'IMPORTANT').length;
  const maxImportant = Math.ceil(expectedCount * 0.3);

  if (coreCount !== 1) {
    logger.warn(
      { coreCount },
      'Comparative classification returned incorrect CORE count (expected exactly 1)'
    );
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
    let demotedCount = 0;
    for (
      let i = 0;
      i < classifications.length && demotedCount < importantCount - maxImportant;
      i++
    ) {
      if (classifications[i].priority === 'IMPORTANT') {
        classifications[i].priority = 'SUPPLEMENTARY';
        demotedCount++;
      }
    }
    logger.info({ demotedCount }, 'Auto-fixed: demoted excess IMPORTANT to SUPPLEMENTARY');
  }
}

// ============================================================================
// Storage
// ============================================================================

/**
 * Store classification results in database
 */
export async function storeClassificationResults(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  priorities: DocumentPriority[]
): Promise<void> {
  for (const priority of priorities) {
    try {
      const { data: existingData } = await supabase
        .from('file_catalog')
        .select('summary_metadata')
        .eq('id', priority.file_id)
        .single();

      const existingMetadata = (existingData?.summary_metadata as Record<string, unknown>) || {};

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

      const updateData: Record<string, unknown> = {
        summary_metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      };

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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 */
export function extractJsonFromResponse(response: string): string {
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response.trim();
}

/**
 * Detect document language using simple heuristic
 */
export function detectLanguage(text: string): string {
  const cyrillicPattern = /[\u0400-\u04FF]/;
  const hasCyrillic = cyrillicPattern.test(text.slice(0, 1000));
  return hasCyrillic ? 'rus' : 'eng';
}
