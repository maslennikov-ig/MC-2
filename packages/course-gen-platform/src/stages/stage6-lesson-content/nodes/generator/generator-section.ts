/**
 * Generator Section Functions
 * @module stages/stage6-lesson-content/nodes/generator/generator-section
 *
 * Section generation with context window for smooth transitions.
 * Exported for use by section-regenerator for partial content fixes.
 */

import { logger } from '@/shared/logger';
import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import {
  getRecommendedTemperatureV2,
  type SectionSpecV2,
  type LessonSpecificationV2,
} from '@megacampus/shared-types/lesson-specification-v2';
import {
  getLanguageName,
  getTokenMultiplier,
  getStylePrompt,
  DEFAULT_COURSE_STYLE,
} from '@megacampus/shared-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { formatRAGContextXML, filterChunksForSection } from '@/shared/prompts';
import {
  VALID_DEPTHS,
  DEPTH_PROMPT_GUIDANCE,
  calculateDynamicContextWindow,
} from './generator-constants';
import {
  formatKeyPointsList,
  formatInterLessonContextXML,
  extractContextWindow,
  calculateMaxTokensForSection,
  extractTokenUsageWithFallback,
} from './generator-helpers';

/**
 * Generate a single section with context window
 *
 * Exported for use by section-regenerator for partial content fixes.
 *
 * @param section - Section specification with title, depth, key points
 * @param lessonSpec - Full lesson specification
 * @param ragChunks - RAG context chunks for this section
 * @param previousContext - Accumulated content from previous sections
 * @param language - ISO language code ('en', 'ru')
 * @param modelOverride - Optional model ID override
 * @param style - Course content style (e.g., 'gamified', 'professional')
 * @returns Generated section content and token usage
 */
export async function generateSection(
  section: SectionSpecV2,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  previousContext: string,
  language: string,
  modelOverride: string | null = null,
  style: string | null = null
): Promise<{ content: string; tokensUsed: number }> {
  const startTime = performance.now();

  // Get temperature based on section's content archetype
  const temperature = getRecommendedTemperatureV2(section.content_archetype);

  // Get depth with validation
  const depth = section.constraints?.depth || 'detailed_analysis';
  if (!section.constraints?.depth) {
    logger.warn(
      { sectionTitle: section.title },
      'Section missing depth constraint, defaulting to detailed_analysis'
    );
  }

  // Validate depth value at runtime (catches data corruption or spec issues)
  if (!VALID_DEPTHS.includes(depth)) {
    logger.error(
      { sectionTitle: section.title, invalidDepth: depth, lessonId: lessonSpec.lesson_id },
      'Invalid depth value detected in section constraints'
    );
    throw new Error(
      `Invalid depth value "${depth}" for section "${section.title}". ` +
        `Valid values: ${VALID_DEPTHS.join(', ')}`
    );
  }

  // Get model from ModelConfigService (database-driven, throws on failure)
  const modelConfigService = createModelConfigService();
  const phaseConfig = await modelConfigService.getModelForPhase('stage_6_section_expander');
  const modelId = modelOverride ?? phaseConfig.modelId;

  // Calculate maxTokens dynamically
  const maxTokens = calculateMaxTokensForSection(lessonSpec, section, language);

  // Get style prompt for content generation (with defensive fallback)
  let stylePrompt: string;
  try {
    stylePrompt = getStylePrompt(style);
  } catch (error) {
    logger.warn(
      { style, error: error instanceof Error ? error.message : String(error) },
      'Failed to get style prompt, using default'
    );
    stylePrompt = getStylePrompt(DEFAULT_COURSE_STYLE);
  }

  logger.debug(
    {
      sectionTitle: section.title,
      modelId,
      depth,
      maxTokens,
      style: style || 'professional (default)',
      previousContextLength: previousContext.length,
    },
    'Generating section with context window'
  );

  // Create LLM instance with section-specific temperature and dynamic token limit
  const model = createOpenRouterModel(modelId, temperature, maxTokens);

  // Filter RAG chunks for this section
  const sectionChunks = filterChunksForSection(ragChunks, section.rag_context_id);
  // Only warn if documents were available (ragChunks not empty) but none matched this section
  // If ragChunks is empty, it means course has no documents - already logged in retriever
  if (sectionChunks.length === 0 && ragChunks.length > 0) {
    logger.warn(
      {
        sectionTitle: section.title,
        ragContextId: section.rag_context_id,
        totalChunks: ragChunks.length,
      },
      'No RAG chunks matched this section - content will be generated without section-specific reference materials'
    );
  }
  const ragContextXML = formatRAGContextXML(sectionChunks, 15000);

  // Build prompt using centralized prompt service
  const promptService = createPromptService();
  const depthGuidance = DEPTH_PROMPT_GUIDANCE[depth];

  // Safely access optional arrays with defaults
  const requiredKeywordsArr = section.constraints?.required_keywords || [];
  const prohibitedTermsArr = section.constraints?.prohibited_terms || [];
  const requiredKeywords =
    requiredKeywordsArr.length > 0 ? requiredKeywordsArr.join(', ') : 'None specified';
  const prohibitedTerms =
    prohibitedTermsArr.length > 0 ? prohibitedTermsArr.join(', ') : 'None specified';

  // Calculate dynamic context window based on lesson duration and language
  const durationMinutes = lessonSpec.estimated_duration_minutes || 15;
  const dynamicWindowSize = calculateDynamicContextWindow(durationMinutes, language);

  logger.debug(
    {
      sectionTitle: section.title,
      lessonId: lessonSpec.lesson_id,
      durationMinutes,
      language,
      languageMultiplier: getTokenMultiplier(language),
      dynamicWindowSize,
      previousContextLength: previousContext.length,
    },
    'Calculated dynamic context window for section'
  );

  // Handle empty previousContext gracefully for first section
  const contextWindow = extractContextWindow(previousContext, dynamicWindowSize);
  const previousContextValue = contextWindow.trim()
    ? contextWindow
    : '<!-- First section: no previous context available -->';

  // Log if inter-lesson context is not available
  if (!lessonSpec.lesson_context) {
    logger.debug(
      { lessonId: lessonSpec.lesson_id, sectionTitle: section.title },
      'No inter-lesson context available (first lesson or context not generated)'
    );
  }

  const prompt = await promptService.renderPrompt('stage6_serial_generator', {
    lessonTitle: lessonSpec.title,
    targetAudience: lessonSpec.metadata.target_audience,
    tone: lessonSpec.metadata.tone,
    difficulty: lessonSpec.difficulty_level,
    sectionTitle: section.title,
    contentArchetype: section.content_archetype,
    depth,
    depthGuidance,
    // Provide fallback if key_points_to_cover is empty (required by prompt template)
    keyPoints: formatKeyPointsList(section.key_points_to_cover || []) || `1. ${section.title}`,
    requiredKeywords,
    prohibitedTerms,
    outputLanguage: getLanguageName(language),
    ragContext: ragContextXML,
    previousContext: previousContextValue,
    // Inter-lesson context for coherence (optional, rendered as XML string)
    interLessonContext: formatInterLessonContextXML(lessonSpec.lesson_context),
    // Course content style (e.g., gamified, professional, storytelling)
    stylePrompt,
  });

  // Generate content
  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  const tokenResult = extractTokenUsageWithFallback(response, prompt, language);
  if (tokenResult.isEstimated) {
    logger.debug(
      { phase: 'section', sectionTitle: section.title, estimatedTokens: tokenResult.tokens },
      'Token usage estimated from content length (model did not report usage)'
    );
  }

  logger.debug(
    {
      sectionTitle: section.title,
      contentLength: content.length,
      tokensUsed: tokenResult.tokens,
      maxTokens,
      depth,
      durationMs: Math.round(performance.now() - startTime),
      chunksUsed: sectionChunks.length,
    },
    'Generator: Section generation complete'
  );

  return {
    content,
    tokensUsed: tokenResult.tokens,
  };
}
