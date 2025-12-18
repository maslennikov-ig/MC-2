/**
 * Phase 1: Basic Classification Service
 *
 * Performs course categorization, contextual language generation, and topic analysis.
 * Uses 20B model for efficient classification with English-only output.
 *
 * Core Tasks:
 * 1. Course Category Detection (6 categories with confidence scoring)
 * 2. Contextual Language Generation (category-adapted motivational templates)
 * 3. Topic Analysis (complexity, target audience, key concepts extraction)
 *
 * Model: Always 20B (simple classification task, cost-effective)
 * Output Language: Always English (regardless of input language)
 * Quality: Semantic similarity validation with 0.75 threshold
 *
 * @module phase-1-classifier
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getModelForPhase } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import { buildContextualLanguagePromptSection } from '../utils/contextual-language';
import type { Phase1Output } from '@megacampus/shared-types/analysis-result';
import { Phase1OutputSchema } from '@megacampus/shared-types/analysis-schemas';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { stripThinkingTags } from '@/shared/utils/json-repair';
import { normalizePhase1Output } from '@/shared/utils/structure-normalizer';

/**
 * Input data for Phase 1 Classification
 */
export interface Phase1Input {
  /** Course UUID */
  course_id: string;
  /** Input language (ISO 639-1) - for context only, output is always English */
  language: string;
  /** Course topic (3-200 chars) */
  topic: string;
  /** Optional detailed requirements from user */
  answers?: string | null;
  /** Optional document summaries from Stage 3 */
  document_summaries?: Array<{
    document_id: string;
    file_name: string;
    processed_content: string;
  }> | null;
  /** Target audience level */
  target_audience?: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  /** Lesson duration in minutes */
  lesson_duration_minutes?: number;
}


/**
 * Builds the classification prompt for Phase 1
 *
 * @param input - Phase 1 input data
 * @returns Formatted prompt messages for LLM
 */
function buildClassificationPrompt(input: Phase1Input): [SystemMessage, HumanMessage] {
  // Build contextual language template section
  const contextualLanguageSection = buildContextualLanguagePromptSection();

  // Generate Zod schema description for LLM
  const schemaDescription = zodToPromptSchema(Phase1OutputSchema);

  // Determine output language based on course language
  const outputLanguage = input.language === 'en' ? 'English' : input.language === 'ru' ? 'Russian' : input.language;

  const systemMessage = new SystemMessage(`You are an expert curriculum architect with 15+ years of experience in adult education (andragogy).

Your task is to analyze course topics and classify them into one of 6 categories, generate contextual motivational language, and perform topic analysis.

CRITICAL RULES:
1. ALL output MUST be in ${outputLanguage.toUpperCase()} (the course target language is ${outputLanguage})
2. You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

3. Use category-specific templates for contextual language
4. Ensure all character length constraints are met
5. Extract 3-10 key concepts and 5-15 domain keywords

FIELD FORMATS:
- theory_practice_ratio: Format "XX:YY" where XX+YY=100 (e.g., "30:70", "50:50", "70:30")

CATEGORIES (with examples):
- professional: Business skills, technical training, certifications (e.g., "Project Management", "Python Programming")
- personal: Self-help, life skills, wellness (e.g., "Time Management", "Healthy Cooking")
- creative: Art, music, design, writing (e.g., "Digital Art", "Creative Writing")
- hobby: Leisure activities, crafts, games (e.g., "Chess", "Photography")
- spiritual: Meditation, mindfulness, philosophy (e.g., "Mindfulness", "Stoic Philosophy")
- academic: Formal education subjects (e.g., "Calculus", "World History")

${contextualLanguageSection}`);

  /**
   * Truncates document content to stay within token budget
   *
   * @param content - Document processed_content string
   * @param maxTokens - Maximum tokens to allow
   * @returns Truncated content with note if truncated
   */
  function truncateContent(content: string, maxTokens: number): string {
    const estimatedTokens = Math.ceil(content.length / 4);

    if (estimatedTokens <= maxTokens) {
      return content;
    }

    const maxChars = maxTokens * 4;
    const truncated = content.substring(0, maxChars);

    return `${truncated}\n[... Truncated from ${estimatedTokens} to ${maxTokens} tokens ...]`;
  }

  // Build context from document summaries with token-aware truncation
  // Target: ~25K tokens total for documents
  // With 3 docs: ~8K tokens per document
  let documentContext = '';
  if (input.document_summaries && input.document_summaries.length > 0) {
    const documentCount = input.document_summaries.length;
    const tokensPerDocument = Math.floor(25000 / documentCount);

    documentContext = '\n\nDOCUMENT SUMMARIES (from Stage 3 processing, truncated for context):\n';
    documentContext += input.document_summaries
      .map((doc, index) => `[Document ${index + 1}: ${doc.file_name}]\n${truncateContent(doc.processed_content, tokensPerDocument)}`)
      .join('\n\n');
  }

  const humanMessage = new HumanMessage(`COURSE INFORMATION:
Topic: ${input.topic}
Target Language: ${outputLanguage} (ALL OUTPUT MUST BE IN ${outputLanguage.toUpperCase()})
Target Audience: ${input.target_audience || 'mixed'}
Lesson Duration: ${input.lesson_duration_minutes || 15} minutes
${input.answers ? `\nUser Requirements:\n${input.answers}` : ''}${documentContext}

TASK:
1. Classify this course into the most appropriate category
2. Generate contextual motivational language adapted to the category
3. Analyze topic complexity and identify key concepts
4. Extract domain keywords relevant to this topic
5. Assess information completeness and identify missing elements

IMPORTANT: Generate ALL text content (contextual_language, topic_analysis descriptions, key_concepts, domain_keywords) in ${outputLanguage.toUpperCase()}.
Output MUST be valid JSON with all text fields in ${outputLanguage}.`);

  return [systemMessage, humanMessage];
}

/**
 * Runs Phase 1 Classification with UnifiedRegenerator (5-layer retry)
 *
 * @param input - Phase 1 input data
 * @returns Complete Phase1Output with metadata
 * @throws Error if all retry attempts fail
 */
export async function runPhase1Classification(input: Phase1Input): Promise<Phase1Output> {
  const courseId = input.course_id;
  const startTime = Date.now();

  // Get base model (20B)
  const model = await getModelForPhase('stage_4_classification');
  const modelId = model.model || 'openai/gpt-oss-20b';

  // Build prompt
  const [systemMsg, humanMsg] = buildClassificationPrompt(input);
  const promptMessages = [systemMsg, humanMsg];

  // Track execution with observability
  const result = await trackPhaseExecution(
    'stage_4_classification',
    courseId,
    modelId,
    async () => {
      // Invoke LLM
      const response = await model.invoke(promptMessages);
      const rawOutput = response.content as string;

      // Store trace data for orchestrator to log
      const promptText = promptMessages.map(m => `${m._getType().toUpperCase()}:\n${m.content}`).join('\n\n');
      storeTraceData(courseId, 'stage_4_classification', {
        promptText,
        completionText: rawOutput,
      });

      // TIER 1: PREPROCESSING (before UnifiedRegenerator)
      // Step 1: Strip thinking tags (Qwen3, DeepSeek models add <think> blocks)
      const hasThinkingTags = /<think|<thinking|<reasoning|<analysis|\[THINK\]/i.test(rawOutput);
      let preprocessedOutput = stripThinkingTags(rawOutput);

      // DEBUG: Log raw output to understand what model returns
      if (hasThinkingTags) {
        console.log('[Phase 1] Detected thinking tags in raw output, stripped them');
        console.log('[Phase 1] Raw output preview (first 500 chars):', rawOutput.substring(0, 500));
        console.log('[Phase 1] Stripped output preview (first 500 chars):', preprocessedOutput.substring(0, 500));
      }

      // Step 2: Try to parse and preprocess enums
      try {
        const parsedRaw = JSON.parse(preprocessedOutput);
        const preprocessed = preprocessObject(parsedRaw, {
          course_category: 'enum',
          target_audience: 'enum',
          primary_strategy: 'enum',
          // Phase 1 specific enum fields
        });
        preprocessedOutput = JSON.stringify(preprocessed);
      } catch (error) {
        // If preprocessing fails, continue with stripped output (UnifiedRegenerator will handle)
        console.warn('[Phase 1] Preprocessing JSON parse failed, continuing with stripped output:', error);
        console.warn('[Phase 1] Stripped output preview (first 1000 chars):', preprocessedOutput.substring(0, 1000));
      }

      // Extract core schema (without phase_metadata)
      const Phase1CoreSchema = Phase1OutputSchema.omit({ phase_metadata: true });

      // Setup UnifiedRegenerator with all 5 layers + structure normalizer + warning fallback
      const regenerator = new UnifiedRegenerator<Omit<Phase1Output, 'phase_metadata'>>({
        enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
        maxRetries: 3,
        stage: 'analyze',
        courseId,
        phaseId: 'stage_4_classification',
        schema: Phase1CoreSchema,
        model: model,
        metricsTracking: true,
        allowWarningFallback: true, // Stage 4 advisory fields
        // NEW: Structure normalizer for handling variable LLM outputs
        structureNormalizer: normalizePhase1Output,
        normalizerContext: { topic: input.topic, courseId },
        validateSchemaInLayer1: true, // Validate against Zod, trigger partial-regen if needed
      });

      // Regenerate with retry layers
      const regenResult = await regenerator.regenerate({
        rawOutput: preprocessedOutput,
        originalPrompt: promptMessages.map(m => m.content).join('\n\n'),
      });

      // Validate regeneration result
      if (!regenResult.success || !regenResult.data) {
        throw new Error(
          `Phase 1 classification failed: ${regenResult.error || 'No data returned from regenerator'}`
        );
      }

      // Data is now properly normalized by structure normalizer + validated by Zod in Layer 1
      const data = regenResult.data as Omit<Phase1Output, 'phase_metadata'>;

      // Log layer used for observability (useful for monitoring normalization effectiveness)
      console.log(`[Phase 1] Completed via ${regenResult.metadata.layerUsed}, keys: ${Object.keys(data).join(', ')}`);

      // Final safety check (should never fail after normalization + Zod validation)
      if (!data.course_category?.primary) {
        console.error('[Phase 1] CRITICAL: course_category.primary missing after normalization!');
        console.error('[Phase 1] Data:', JSON.stringify(data, null, 2).substring(0, 2000));
        throw new Error(
          'Phase 1 classification failed: Missing required field course_category.primary'
        );
      }

      const endTime = Date.now();

      // Extract token usage from regeneration metadata
      const usage = {
        input_tokens: 0, // Will be updated by LangChain if available
        output_tokens: 0,
      };

      // Construct complete output with metadata
      const output: Phase1Output = {
        ...(data as Omit<Phase1Output, 'phase_metadata'>),
        phase_metadata: {
          duration_ms: endTime - startTime,
          model_used: regenResult.metadata.modelsUsed?.join(' → ') || modelId,
          tokens: {
            input: usage.input_tokens,
            output: usage.output_tokens,
            total: usage.input_tokens + usage.output_tokens,
          },
          quality_score: 0.0, // Will be updated by semantic validation later
          retry_count: regenResult.metadata.retryCount,
        },
      };

      return {
        result: output,
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        },
      };
    }
  );

  return result;
}

/**
 * Updates quality score for Phase 1 output after semantic validation
 *
 * @param output - Phase 1 output to update
 * @param qualityScore - Semantic similarity score (0-1)
 * @returns Updated Phase1Output with quality score
 */
export function updatePhase1QualityScore(
  output: Phase1Output,
  qualityScore: number
): Phase1Output {
  return {
    ...output,
    phase_metadata: {
      ...output.phase_metadata,
      quality_score: qualityScore,
    },
  };
}
