/**
 * Expander Node - Parallel section expansion
 * @module stages/stage6-lesson-content/nodes/expander
 *
 * Second node in the lesson generation pipeline.
 * Expands each section from the outline into full content using parallel LLM calls.
 *
 * Input: outline, lessonSpec.sections, ragChunks
 * Output: expandedSections (Map<sectionTitle, content>), tokensUsed, durationMs
 */

import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  getRecommendedTemperatureV2,
  type SectionSpecV2,
  type LessonSpecificationV2,
  type SectionDepthV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import { getLanguageName } from '@megacampus/shared-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type {
  LessonGraphStateType,
  LessonGraphStateUpdate,
  ExpandedSection,
} from '../state';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { formatRAGContextXML, filterChunksForSection } from '@/shared/prompts';

// NOTE: Hardcoded model constants have been removed.
// Model selection is now entirely database-driven via ModelConfigService.
// See: packages/course-gen-platform/src/shared/llm/model-config-service.ts

/**
 * Token limits per depth level
 * - summary: 1500 tokens (200-400 words ~ 1200 tokens, with buffer)
 * - detailed_analysis: 3000 tokens (500-1000 words ~ 2500 tokens, with buffer)
 * - comprehensive: 6000 tokens (1000+ words ~ 5000 tokens, with buffer)
 */
const DEPTH_TOKEN_LIMITS: Record<SectionDepthV2, number> = {
  summary: 1500,
  detailed_analysis: 3000,
  comprehensive: 6000,
};

/**
 * Depth-specific prompt guidance for content generation
 * Provides explicit instructions based on depth level
 */
const DEPTH_PROMPT_GUIDANCE: Record<SectionDepthV2, string> = {
  summary:
    'Keep content concise and focused. Use bullet points where appropriate. Aim for 200-400 words.',
  detailed_analysis:
    'Provide thorough coverage with examples. Include explanations and context. Aim for 500-1000 words.',
  comprehensive:
    'Create exhaustive content with multiple examples, detailed explanations, and edge cases. Aim for 1000+ words.',
};

/**
 * Maximum concurrent section expansions
 * Prevents rate limiting and memory issues
 */
const MAX_CONCURRENT_EXPANSIONS = 5;


/**
 * Format key points as numbered list
 *
 * @param keyPoints - Key points to cover
 * @returns Formatted numbered list
 */
function formatKeyPointsList(keyPoints: string[]): string {
  if (!keyPoints || keyPoints.length === 0) {
    return '';
  }
  return keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n');
}

/**
 * Parse token usage from ChatOpenAI response
 */
function extractTokenUsage(response: Awaited<ReturnType<ChatOpenAI['invoke']>>): number {
  const metadata = response.response_metadata;
  if (metadata && typeof metadata === 'object') {
    const usage = (metadata as Record<string, unknown>).usage;
    if (usage && typeof usage === 'object') {
      const totalTokens = (usage as Record<string, unknown>).total_tokens;
      if (typeof totalTokens === 'number') {
        return totalTokens;
      }
    }
  }
  return 0;
}

/**
 * Expand a single section
 *
 * @param section - Section specification
 * @param outline - Lesson outline
 * @param lessonSpec - Full lesson specification
 * @param ragChunks - All RAG chunks for the lesson
 * @param language - Target language for content
 * @param modelOverride - Optional model override for fallback retry
 * @returns Expanded section with content and metrics
 */
async function expandSection(
  section: SectionSpecV2,
  outline: string,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  language: string,
  modelOverride: string | null = null
): Promise<ExpandedSection> {
  const startTime = performance.now();

  // Get temperature based on section's content archetype
  const temperature = getRecommendedTemperatureV2(section.content_archetype);

  // Get depth-based max tokens limit (default to detailed_analysis if constraints undefined)
  const depth = section.constraints?.depth || 'detailed_analysis';
  const maxTokens = DEPTH_TOKEN_LIMITS[depth];

  // Get model from ModelConfigService (database-driven, throws on failure)
  // Use modelOverride if present (for fallback retry strategy)
  const modelConfigService = createModelConfigService();
  const modelId = modelOverride
    ?? (await modelConfigService.getModelForPhase('stage_6_refinement')).modelId;

  logger.debug({
    sectionTitle: section.title,
    modelId,
    source: modelOverride ? 'override' : 'database',
  }, 'Using model config for section expansion');

  // Create LLM instance with section-specific temperature and depth-based token limit
  const model = createOpenRouterModel(modelId, temperature, maxTokens);

  // Filter RAG chunks for this section
  const sectionChunks = filterChunksForSection(ragChunks, section.rag_context_id);
  const ragContextXML = formatRAGContextXML(sectionChunks, 15000);

  // Build prompt using centralized prompt service
  const promptService = createPromptService();
  const depthGuidance = DEPTH_PROMPT_GUIDANCE[depth];

  // Safely access optional arrays with defaults
  const requiredKeywordsArr = section.constraints?.required_keywords || [];
  const prohibitedTermsArr = section.constraints?.prohibited_terms || [];
  const requiredKeywords =
    requiredKeywordsArr.length > 0
      ? requiredKeywordsArr.join(', ')
      : 'None specified';
  const prohibitedTerms =
    prohibitedTermsArr.length > 0
      ? prohibitedTermsArr.join(', ')
      : 'None specified';

  const prompt = await promptService.renderPrompt('stage6_expander', {
    lessonTitle: lessonSpec.title,
    targetAudience: lessonSpec.metadata.target_audience,
    tone: lessonSpec.metadata.tone,
    difficulty: lessonSpec.difficulty_level,
    sectionTitle: section.title,
    contentArchetype: section.content_archetype,
    depth,
    depthGuidance,
    keyPoints: formatKeyPointsList(section.key_points_to_cover || []),
    requiredKeywords,
    prohibitedTerms,
    outputLanguage: getLanguageName(language),
    lessonOutline: outline,
    ragContext: ragContextXML,
  });

  // Generate content
  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokensUsed = extractTokenUsage(response);

  logger.debug(
    {
      sectionTitle: section.title,
      contentLength: content.length,
      tokensUsed,
      maxTokens,
      depth,
      model: modelId,
      durationMs: Math.round(performance.now() - startTime),
      chunksUsed: sectionChunks.length,
    },
    'Expander: Section expansion complete'
  );

  return {
    title: section.title,
    content,
    chunksUsed: sectionChunks.map((c) => c.chunk_id),
    tokensUsed,
  };
}

/**
 * Process sections in batches to limit concurrency
 *
 * @param sections - All sections to expand
 * @param outline - Lesson outline
 * @param lessonSpec - Full lesson specification
 * @param ragChunks - All RAG chunks
 * @param batchSize - Maximum concurrent expansions
 * @param language - Target language for content
 * @param modelOverride - Optional model override for fallback retry
 * @returns All expanded sections and accumulated errors
 */
async function expandSectionsInBatches(
  sections: SectionSpecV2[],
  outline: string,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  batchSize: number,
  language: string,
  modelOverride: string | null = null
): Promise<{ sections: ExpandedSection[]; errors: string[] }> {
  const expandedSections: ExpandedSection[] = [];
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < sections.length; i += batchSize) {
    const batch = sections.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map((section) =>
        expandSection(section, outline, lessonSpec, ragChunks, language, modelOverride)
      )
    );

    batchResults.forEach((result, batchIndex) => {
      const sectionIndex = i + batchIndex;
      const sectionTitle = sections[sectionIndex].title;

      if (result.status === 'fulfilled') {
        expandedSections.push(result.value);
      } else {
        const errorMsg = `Section "${sectionTitle}" expansion failed: ${result.reason}`;
        errors.push(errorMsg);
        logger.warn({ sectionTitle, error: result.reason }, errorMsg);
      }
    });
  }

  return { sections: expandedSections, errors };
}

/**
 * Expander Node - Expand each section from outline into full content
 *
 * This node processes sections in parallel (with concurrency limits)
 * to generate detailed content for each section of the lesson.
 *
 * Features:
 * - Per-section temperature based on content archetype
 * - Section-specific RAG context filtering
 * - Parallel processing with configurable batch size
 * - Graceful handling of partial failures
 *
 * @param state - Current graph state with outline and lessonSpec
 * @returns Updated state with expandedSections map and metrics
 */
export async function expanderNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, outline, ragChunks, courseId, lessonUuid, language } = state;

  // Validate prerequisites
  if (!outline) {
    logger.error(
      { lessonId: lessonSpec.lesson_id },
      'Expander node: No outline available'
    );
    return {
      errors: ['Expander failed: No outline available from planner'],
      currentNode: 'expander',
    };
  }

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
    },
    'Expander node: Starting parallel section expansion'
  );

  // Log trace at start
  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'expander',
    stepName: 'expander_start',
    inputData: {
      lessonLabel: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
      language,
    },
    durationMs: 0,
  });

  try {
    // Expand all sections in batches
    const { sections: expandedSectionsList, errors } =
      await expandSectionsInBatches(
        lessonSpec.sections,
        outline,
        lessonSpec,
        ragChunks,
        MAX_CONCURRENT_EXPANSIONS,
        language,
        state.modelOverride
      );

    // Convert to Map for state
    const expandedSections = new Map<string, ExpandedSection>();
    let totalTokens = 0;

    expandedSectionsList.forEach((section) => {
      expandedSections.set(section.title, section);
      totalTokens += section.tokensUsed;
    });

    const durationMs = Math.round(performance.now() - startTime);

    // Check if we have at least some sections
    if (expandedSections.size === 0) {
      logger.error(
        { lessonId: lessonSpec.lesson_id, errors },
        'Expander node: All sections failed to expand'
      );
      return {
        errors: ['Expander failed: No sections could be expanded', ...errors],
        currentNode: 'expander',
        durationMs,
      };
    }

    // Log success (even partial)
    const successRate = expandedSections.size / lessonSpec.sections.length;
    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        expandedCount: expandedSections.size,
        totalCount: lessonSpec.sections.length,
        successRate: `${Math.round(successRate * 100)}%`,
        totalTokens,
        durationMs,
      },
      'Expander node: Section expansion complete'
    );

    // Calculate average section length
    let totalContentLength = 0;
    expandedSections.forEach((section) => {
      totalContentLength += section.content.length;
    });
    const avgSectionLength = expandedSections.size > 0
      ? Math.round(totalContentLength / expandedSections.size)
      : 0;

    // Calculate totalWords and build per-section stats
    let totalWords = 0;
    const expandedSectionsArray: Array<{
      title: string;
      wordCount: number;
      ragChunksUsed: number;
    }> = [];

    expandedSections.forEach((section) => {
      const wordCount = section.content.split(/\s+/).filter(Boolean).length;
      totalWords += wordCount;
      expandedSectionsArray.push({
        title: section.title,
        wordCount,
        ragChunksUsed: section.chunksUsed.length,
      });
    });

    // Get model used for logging (already validated in expandSection)
    const modelConfigService = createModelConfigService();
    const modelUsed = state.modelOverride
      ?? (await modelConfigService.getModelForPhase('stage_6_refinement')).modelId;

    // Log trace at completion
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'expander',
      stepName: 'expander_complete',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        language,
      },
      outputData: {
        expandedCount: expandedSections.size,
        totalCount: lessonSpec.sections.length,
        successRate: Math.round(successRate * 100),
        completedSections: expandedSections.size,
        totalSections: lessonSpec.sections.length,
        avgSectionLength,
        totalWords,
        expandedSections: expandedSectionsArray,
        modelUsed,
      },
      tokensUsed: totalTokens,
      durationMs,
    });

    return {
      expandedSections,
      tokensUsed: totalTokens,
      durationMs,
      errors: errors.length > 0 ? errors : [],
      currentNode: 'assembler',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const durationMs = Math.round(performance.now() - startTime);

    logger.error(
      {
        lessonId: lessonSpec.lesson_id,
        error: errorMessage,
      },
      'Expander node: Section expansion failed'
    );

    // Log trace on error
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'expander',
      stepName: 'expander_error',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        language,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      errors: [`Expander failed: ${errorMessage}`],
      currentNode: 'expander',
      durationMs,
    };
  }
}
