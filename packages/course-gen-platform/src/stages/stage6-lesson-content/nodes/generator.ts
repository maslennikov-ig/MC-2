/**
 * Generator Node - Serial section-by-section content generation
 * @module stages/stage6-lesson-content/nodes/generator
 *
 * Replaces the Planner + Expander + Assembler + Smoother pipeline with a
 * single serial loop that generates content section-by-section with context window.
 *
 * Flow:
 * 1. Generate Introduction (using intro_blueprint)
 * 2. Loop through sections sequentially, accumulating context
 * 3. Generate Summary at the end
 * 4. Return full markdown content
 *
 * Context Window Strategy:
 * - Keep last ~5000 characters of generated content
 * - Include in prompt as <previous_context> section
 * - Enables natural transitions without separate Smoother node
 *
 * Input: lessonSpec, ragChunks, language
 * Output: generatedContent (full markdown), tokensUsed, durationMs
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
import { getLanguageName, getTokenMultiplier } from '@megacampus/shared-types';
import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import { createPromptService } from '@/shared/prompts/prompt-service';
import { formatRAGContextXML, filterChunksForSection } from '@/shared/prompts';

// ============================================================================
// CONSTANTS (reused from expander.ts)
// ============================================================================

/**
 * Minimum token limits per depth level (fallback/floor values)
 */
const DEPTH_TOKEN_LIMITS: Record<SectionDepthV2, number> = {
  summary: 1500,
  detailed_analysis: 3000,
  comprehensive: 6000,
};

/**
 * Scale factors for dynamic token calculation per depth level
 */
const DEPTH_SCALE_FACTORS: Record<SectionDepthV2, number> = {
  summary: 0.25,
  detailed_analysis: 0.5,
  comprehensive: 1.0,
};

/**
 * Depth-specific prompt guidance for content generation
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
 * Context window size in characters (last ~5000 chars)
 * Provides enough context for transitions without overwhelming the prompt
 */
const CONTEXT_WINDOW_CHARS = 5000;

/**
 * Valid depth values for runtime validation
 */
const VALID_DEPTHS: readonly SectionDepthV2[] = ['summary', 'detailed_analysis', 'comprehensive'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format key points as numbered list for prompt inclusion
 *
 * @param keyPoints - Array of key point strings from section spec
 * @returns Formatted numbered list (e.g., "1. Point A\n2. Point B") or empty string
 *
 * @example
 * formatKeyPointsList(['Learn TypeScript', 'Use generics'])
 * // Returns: "1. Learn TypeScript\n2. Use generics"
 */
function formatKeyPointsList(keyPoints: string[]): string {
  if (!keyPoints || keyPoints.length === 0) {
    return '';
  }
  return keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n');
}

/**
 * Parse token usage from ChatOpenAI response metadata
 *
 * Extracts total_tokens from OpenRouter/OpenAI response metadata.
 * Returns both the token count and a flag indicating if metadata was present.
 *
 * @param response - ChatOpenAI invoke response with response_metadata
 * @returns Object with tokens count and hasMeta flag for validation
 *
 * @example
 * const result = extractTokenUsage(response);
 * if (!result.hasMeta) {
 *   logger.warn('Token metadata missing');
 * }
 * totalTokens += result.tokens;
 */
function extractTokenUsage(response: Awaited<ReturnType<ChatOpenAI['invoke']>>): {
  tokens: number;
  hasMeta: boolean;
} {
  const metadata = response.response_metadata;
  if (metadata && typeof metadata === 'object') {
    const usage = (metadata as Record<string, unknown>).usage;
    if (usage && typeof usage === 'object') {
      const totalTokens = (usage as Record<string, unknown>).total_tokens;
      if (typeof totalTokens === 'number') {
        return { tokens: totalTokens, hasMeta: true };
      }
    }
  }
  return { tokens: 0, hasMeta: false };
}

/**
 * Extract last N characters from text for context window
 *
 * Used to provide previous content context to each section generation,
 * enabling natural transitions without a separate Smoother node.
 *
 * Smart truncation: Attempts to start at a paragraph boundary (double newline)
 * to avoid mid-sentence or mid-code-block truncation.
 *
 * @param text - Full accumulated content from previous sections
 * @param maxChars - Maximum characters to return (default: 5000)
 * @returns Context string: empty for first section, full text if short, or truncated with "..."
 *
 * @example
 * extractContextWindow('') // Returns: ''
 * extractContextWindow('Short text') // Returns: 'Short text'
 * extractContextWindow(longText, 5000) // Returns: '...\n\n[last ~5000 chars from paragraph boundary]'
 */
function extractContextWindow(text: string, maxChars: number = CONTEXT_WINDOW_CHARS): string {
  // First section has no context - return empty string explicitly
  if (text.length === 0) {
    return '';
  }

  // Short content - return as-is
  if (text.length <= maxChars) {
    return text;
  }

  // Long content - smart truncation at paragraph boundary
  const truncated = text.slice(-maxChars);

  // Try to find a paragraph boundary (double newline) in the first 500 chars
  // to avoid starting mid-sentence or mid-code-block
  const firstParagraphBreak = truncated.indexOf('\n\n');

  if (firstParagraphBreak > 0 && firstParagraphBreak < 500) {
    // Start from paragraph boundary for cleaner context
    return '...\n\n' + truncated.slice(firstParagraphBreak + 2);
  }

  // No suitable paragraph break found - use simple truncation
  return '...' + truncated;
}

/**
 * Calculate dynamic max tokens for section based on lesson duration and depth
 *
 * Formula: (duration × 250 × 1.5 × langMultiplier) / sectionCount × depthScale
 *
 * Factors:
 * - 250: Base words per minute of educational content consumption
 * - 1.5: Overhead multiplier accounting for:
 *   - Markdown formatting (headers, lists, code blocks)
 *   - Examples and explanations beyond core content
 *   - Buffer for LLM token estimation variance
 * - languageMultiplier: 1.0 for English, 1.3 for Russian (Cyrillic requires more tokens)
 * - depthScale: 0.25 (summary), 0.5 (detailed), 1.0 (comprehensive)
 *
 * The result is clamped to a minimum based on depth level to ensure adequate content.
 *
 * @param lessonSpec - Full lesson specification with duration and section count
 * @param section - Section with depth constraint
 * @param language - ISO language code ('en', 'ru')
 * @returns Maximum tokens to request from LLM
 *
 * @example
 * // 30-min Russian lesson with 6 sections, detailed_analysis depth
 * // Base: (30 * 250 * 1.5 * 1.3) / 6 = 2437 tokens
 * // With depth scale 0.5: 1218 tokens
 * // Min for detailed_analysis in Russian: 3000 * 1.3 = 3900
 * // Result: max(1218, 3900) = 3900 tokens
 */
function calculateMaxTokensForSection(
  lessonSpec: LessonSpecificationV2,
  section: SectionSpecV2,
  language: string
): number {
  const depth = section.constraints?.depth || 'detailed_analysis';
  const languageMultiplier = getTokenMultiplier(language);
  const sectionCount = lessonSpec.sections.length || 1;
  const durationMinutes = lessonSpec.estimated_duration_minutes || 15;

  // Base tokens per section = (duration × 250 × 1.5 × langMultiplier) / sectionCount
  // 250 = words/min for educational content, 1.5 = formatting/examples overhead
  const baseTokensPerSection = Math.ceil(
    (durationMinutes * 250 * 1.5 * languageMultiplier) / sectionCount
  );

  // Apply depth scaling
  const scaleFactor = DEPTH_SCALE_FACTORS[depth];
  const depthScaledTokens = Math.round(baseTokensPerSection * scaleFactor);

  // Take maximum of calculated and minimum required for depth
  const languageAdjustedMin = Math.ceil(DEPTH_TOKEN_LIMITS[depth] * languageMultiplier);
  const maxTokens = Math.max(depthScaledTokens, languageAdjustedMin);

  return maxTokens;
}

// ============================================================================
// INTRODUCTION GENERATION
// ============================================================================

/**
 * Generate introduction using intro_blueprint
 * Reused logic from assembler.ts
 */
async function generateIntroduction(
  lessonSpec: LessonSpecificationV2,
  language: string,
  model: ChatOpenAI
): Promise<{ content: string; tokensUsed: number }> {
  const hookExamples = {
    analogy: 'Start with a relatable comparison that connects the topic to everyday experience',
    statistic: 'Lead with a surprising or compelling statistic that grabs attention',
    challenge: 'Present a problem or challenge that the lesson will help solve',
    question: 'Open with a thought-provoking question that engages curiosity',
  };

  const prompt = `<context>
<lesson>
<title>${lessonSpec.title}</title>
<description>${lessonSpec.description}</description>
<target_audience>${lessonSpec.metadata.target_audience}</target_audience>
<tone>${lessonSpec.metadata.tone}</tone>
</lesson>

<introduction_blueprint>
<hook_strategy>${lessonSpec.intro_blueprint.hook_strategy}</hook_strategy>
<hook_topic>${lessonSpec.intro_blueprint.hook_topic}</hook_topic>
<key_objectives>${lessonSpec.intro_blueprint.key_learning_objectives}</key_objectives>
</introduction_blueprint>
</context>

<instructions>
Write an engaging introduction for this lesson (150-250 words).

Hook Strategy: ${lessonSpec.intro_blueprint.hook_strategy}
- ${hookExamples[lessonSpec.intro_blueprint.hook_strategy]}
- Use the hook topic: "${lessonSpec.intro_blueprint.hook_topic}"

Structure:
1. Opening hook (2-3 sentences) using the ${lessonSpec.intro_blueprint.hook_strategy} approach
2. Bridge to the lesson topic (1-2 sentences)
3. Preview of what learners will gain (${lessonSpec.intro_blueprint.key_learning_objectives})

Tone: ${lessonSpec.metadata.tone}
Audience: ${lessonSpec.metadata.target_audience}

<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, and explanation must be in ${getLanguageName(language)}.
DO NOT mix languages.
</output_language>

Write in markdown format. Do NOT include a header - just the introduction paragraphs.
</instructions>`;

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokenResult = extractTokenUsage(response);
  if (!tokenResult.hasMeta) {
    logger.warn(
      { phase: 'introduction' },
      'Token metadata missing in LLM response - usage tracking may be inaccurate'
    );
  }

  return {
    content,
    tokensUsed: tokenResult.tokens,
  };
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate summary/conclusion
 * Reused logic from assembler.ts
 */
async function generateSummary(
  lessonSpec: LessonSpecificationV2,
  sectionTitles: string[],
  language: string,
  model: ChatOpenAI
): Promise<{ content: string; tokensUsed: number }> {
  const objectivesList = lessonSpec.learning_objectives
    .map((lo) => `- ${lo.objective}`)
    .join('\n');

  const prompt = `<context>
<lesson>
<title>${lessonSpec.title}</title>
<target_audience>${lessonSpec.metadata.target_audience}</target_audience>
<tone>${lessonSpec.metadata.tone}</tone>
</lesson>

<sections_covered>
${sectionTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}
</sections_covered>

<learning_objectives>
${objectivesList}
</learning_objectives>
</context>

<instructions>
Write a concluding summary for this lesson (150-200 words).

Structure:
1. Brief recap of key concepts covered (2-3 sentences)
2. How the learning objectives were addressed (1-2 sentences)
3. Call to action or next steps (1-2 sentences)
4. Encouraging closing statement

Tone: ${lessonSpec.metadata.tone}
Audience: ${lessonSpec.metadata.target_audience}

<output_language>
MANDATORY: Write ALL content in ${getLanguageName(language)}.
Every word, header, example, and explanation must be in ${getLanguageName(language)}.
DO NOT mix languages.
</output_language>

Write in markdown format. Do NOT include a header - just the summary paragraphs.
</instructions>`;

  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokenResult = extractTokenUsage(response);
  if (!tokenResult.hasMeta) {
    logger.warn(
      { phase: 'summary' },
      'Token metadata missing in LLM response - usage tracking may be inaccurate'
    );
  }

  return {
    content,
    tokensUsed: tokenResult.tokens,
  };
}

// ============================================================================
// SECTION GENERATION (SERIAL)
// ============================================================================

/**
 * Generate a single section with context window
 */
async function generateSection(
  section: SectionSpecV2,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  previousContext: string,
  language: string,
  modelOverride: string | null = null
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

  logger.debug({
    sectionTitle: section.title,
    modelId,
    depth,
    maxTokens,
    previousContextLength: previousContext.length,
  }, 'Generating section with context window');

  // Create LLM instance with section-specific temperature and dynamic token limit
  const model = createOpenRouterModel(modelId, temperature, maxTokens);

  // Filter RAG chunks for this section
  const sectionChunks = filterChunksForSection(ragChunks, section.rag_context_id);
  if (sectionChunks.length === 0) {
    logger.warn(
      { sectionTitle: section.title, ragContextId: section.rag_context_id },
      'No RAG chunks found for section - content will be generated without reference materials'
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
    requiredKeywordsArr.length > 0
      ? requiredKeywordsArr.join(', ')
      : 'None specified';
  const prohibitedTerms =
    prohibitedTermsArr.length > 0
      ? prohibitedTermsArr.join(', ')
      : 'None specified';

  // Handle empty previousContext gracefully for first section
  const contextWindow = extractContextWindow(previousContext);
  const previousContextValue = contextWindow.trim()
    ? contextWindow
    : '<!-- First section: no previous context available -->';

  const prompt = await promptService.renderPrompt('stage6_serial_generator', {
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
    ragContext: ragContextXML,
    previousContext: previousContextValue,
  });

  // Generate content
  const response = await model.invoke(prompt);
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  const tokenResult = extractTokenUsage(response);
  if (!tokenResult.hasMeta) {
    logger.warn(
      { phase: 'section', sectionTitle: section.title },
      'Token metadata missing in LLM response - usage tracking may be inaccurate'
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

// ============================================================================
// MAIN GENERATOR NODE
// ============================================================================

/**
 * Generator Node - Serial section-by-section content generation
 *
 * Replaces the Planner + Expander + Assembler + Smoother pipeline with a
 * single serial loop. Generates content sequentially with context accumulation.
 *
 * Flow:
 * 1. Generate Introduction (using intro_blueprint)
 * 2. Loop through sections, accumulating context window
 * 3. Generate Summary
 * 4. Return full markdown
 *
 * @param state - Current graph state with lessonSpec and ragChunks
 * @returns Updated state with generatedContent and metrics
 */
export async function generatorNode(
  state: LessonGraphStateType
): Promise<LessonGraphStateUpdate> {
  const startTime = performance.now();
  const { lessonSpec, ragChunks, courseId, lessonUuid, language } = state;

  logger.info(
    {
      lessonId: lessonSpec.lesson_id,
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
    },
    'Generator node: Starting serial content generation'
  );

  // Log trace at start
  await logTrace({
    courseId,
    lessonId: lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'generator',
    stepName: 'generator_start',
    inputData: {
      lessonLabel: lessonSpec.lesson_id,
      lessonTitle: lessonSpec.title,
      moduleNumber: lessonSpec.lesson_id.split('.')[0],
      sectionCount: lessonSpec.sections.length,
      ragChunksCount: ragChunks.length,
      language,
    },
    durationMs: 0,
  });

  try {
    // Get temperature based on content archetype
    const temperature = getRecommendedTemperatureV2(
      lessonSpec.metadata.content_archetype
    );

    // Get model from ModelConfigService (database-driven, throws on failure)
    const modelConfigService = createModelConfigService();
    const modelId = state.modelOverride
      ?? (await modelConfigService.getModelForPhase('stage_6_refinement')).modelId;

    logger.info({
      lessonId: lessonSpec.lesson_id,
      modelId,
      source: state.modelOverride ? 'override' : 'database',
    }, 'Using model config for generator');

    // Create LLM instance for intro and summary generation
    const model = createOpenRouterModel(modelId, temperature, 4096);

    let totalTokens = 0;
    const contentParts: string[] = [];

    // ========================================================================
    // 1. GENERATE INTRODUCTION
    // ========================================================================
    logger.debug({ lessonId: lessonSpec.lesson_id }, 'Generating introduction');
    const introResult = await generateIntroduction(lessonSpec, language, model);
    totalTokens += introResult.tokensUsed;

    // Start building full content
    contentParts.push(`# ${lessonSpec.title}`);
    contentParts.push('');
    contentParts.push('## Introduction');
    contentParts.push('');
    contentParts.push(introResult.content);
    contentParts.push('');

    // Track accumulated content for context window
    let accumulatedContent = contentParts.join('\n');

    // ========================================================================
    // 2. GENERATE SECTIONS SEQUENTIALLY
    // ========================================================================
    const sectionTitles: string[] = [];

    for (const section of lessonSpec.sections) {
      logger.debug(
        { lessonId: lessonSpec.lesson_id, sectionTitle: section.title },
        'Generating section'
      );

      const sectionResult = await generateSection(
        section,
        lessonSpec,
        ragChunks,
        accumulatedContent, // Pass context window
        language,
        state.modelOverride
      );

      totalTokens += sectionResult.tokensUsed;
      sectionTitles.push(section.title);

      // Add section to content
      contentParts.push(`## ${section.title}`);
      contentParts.push('');
      contentParts.push(sectionResult.content);
      contentParts.push('');

      // Update accumulated content for next section's context
      accumulatedContent = contentParts.join('\n');

      // Warn if accumulated content is getting very large (>100K chars)
      if (accumulatedContent.length > 100_000) {
        logger.warn(
          {
            lessonId: lessonSpec.lesson_id,
            sectionTitle: section.title,
            accumulatedLength: accumulatedContent.length,
          },
          'Accumulated content exceeds 100K characters - consider breaking into smaller lessons'
        );
      }

      // Log section completion
      await logTrace({
        courseId,
        lessonId: lessonUuid || undefined,
        stage: 'stage_6',
        phase: 'generator',
        stepName: 'generator_section_complete',
        inputData: {
          lessonLabel: lessonSpec.lesson_id,
          sectionTitle: section.title,
          sectionIndex: lessonSpec.sections.indexOf(section) + 1,
          totalSections: lessonSpec.sections.length,
        },
        outputData: {
          contentLength: sectionResult.content.length,
          wordCount: sectionResult.content.split(/\s+/).filter(Boolean).length,
        },
        tokensUsed: sectionResult.tokensUsed,
        durationMs: 0,
      });
    }

    // ========================================================================
    // 3. GENERATE SUMMARY
    // ========================================================================
    logger.debug({ lessonId: lessonSpec.lesson_id }, 'Generating summary');
    const summaryResult = await generateSummary(lessonSpec, sectionTitles, language, model);
    totalTokens += summaryResult.tokensUsed;

    contentParts.push('## Summary');
    contentParts.push('');
    contentParts.push(summaryResult.content);
    contentParts.push('');

    // ========================================================================
    // 4. ASSEMBLE FINAL CONTENT
    // ========================================================================
    const generatedContent = contentParts.join('\n');
    const durationMs = Math.round(performance.now() - startTime);

    // Calculate metrics
    const wordCount = generatedContent.split(/\s+/).filter(Boolean).length;
    const avgSectionLength = Math.round(
      generatedContent.length / lessonSpec.sections.length
    );

    logger.info(
      {
        lessonId: lessonSpec.lesson_id,
        contentLength: generatedContent.length,
        wordCount,
        sectionsGenerated: sectionTitles.length,
        totalTokens,
        durationMs,
      },
      'Generator node: Serial content generation complete'
    );

    // Log trace at completion
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'generator',
      stepName: 'generator_complete',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
      },
      outputData: {
        contentLength: generatedContent.length,
        wordCount,
        sectionsGenerated: sectionTitles.length,
        totalSections: lessonSpec.sections.length,
        avgSectionLength,
        hasIntro: true,
        hasSummary: true,
        modelUsed: modelId,
      },
      tokensUsed: totalTokens,
      durationMs,
    });

    return {
      generatedContent,
      tokensUsed: totalTokens,
      durationMs,
      currentNode: 'selfReviewer',
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
      'Generator node: Serial content generation failed'
    );

    // Log trace on error
    await logTrace({
      courseId,
      lessonId: lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'generator',
      stepName: 'generator_error',
      inputData: {
        lessonLabel: lessonSpec.lesson_id,
        lessonTitle: lessonSpec.title,
        moduleNumber: lessonSpec.lesson_id.split('.')[0],
        language,
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    return {
      errors: [`Generator failed: ${errorMessage}`],
      currentNode: 'generator',
      durationMs,
    };
  }
}
