/**
 * Stage 4 Analysis - Phase 4: Document Synthesis Service
 *
 * Synthesizes document summaries and analysis outputs into clear generation instructions
 * for Stage 5 (Course Structure Generation). Model configured via database (llm_model_config table).
 *
 * Document handling: receives full DocumentSummaryResult objects (budget-resolved by orchestrator).
 * Uses hardcoded 25K token split — not budget-aware. Synthesis needs broad coverage of all
 * documents rather than deep analysis, so equal split is acceptable.
 *
 * @module phase-4-synthesis
 */

import type {
  Phase1Output,
  Phase2Output,
  Phase3Output,
  Phase4Output,
} from '@megacampus/shared-types/analysis-result';
import { Phase4OutputSchema } from '@megacampus/shared-types';
import { getModelForPhase, getTextContent } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { extractJSON } from '@/shared/utils/json-repair';
import { logger } from '@/shared/logger';
import { createPromptService } from '@/shared/prompts/prompt-service';

/**
 * Input data for Phase 4 Document Synthesis
 */
export interface Phase4Input {
  /** Course UUID */
  course_id: string;
  /** Target language for course generation */
  language: string;
  /** Course topic */
  topic: string;
  /** Optional document summaries from Stage 3 */
  document_summaries?: DocumentSummary[] | null;
  /** Phase 1 output (course categorization) */
  phase1_output: Phase1Output;
  /** Phase 2 output (scope analysis) */
  phase2_output: Phase2Output;
  /** Phase 3 output (expert analysis) */
  phase3_output: Phase3Output;
  /** Clarifying answers from Phase 0.5 */
  clarifying_answers?: Array<{
    question: string;
    answer: string;
    priority: string;
    category: string | null;
  }>;
}

/**
 * Document summary structure from Stage 3
 */
export interface DocumentSummary {
  document_id: string;
  file_name: string;
  processed_content: string;
  processing_method: 'bypass' | 'detailed' | 'balanced' | 'aggressive';
  summary_metadata: {
    original_tokens: number;
    summary_tokens: number;
    compression_ratio: number;
    quality_score: number;
  };
}

interface RawPhase4Output {
  generation_guidance: unknown;
  generation_instructions?: unknown;
}

/**
 * Runs Phase 4: Document Synthesis
 *
 * Combines all analysis phases and document summaries into:
 * 1. generation_guidance - Structured guidance for Stage 5 Generation (tone, analogies, exercises)
 *
 * Model selection:
 * - Configured via database (llm_model_config table)
 * - Supports tier-based selection for different document counts
 *
 * @param input - Phase 4 input data
 * @returns Phase4Output with generation_guidance and metadata
 * @throws Error if LLM call fails or validation fails
 *
 * @example
 * const phase4Output = await runPhase4Synthesis({
 *   course_id: '550e8400-e29b-41d4-a716-446655440000',
 *   language: 'ru',
 *   topic: 'React Hooks',
 *   document_summaries: [...],
 *   phase1_output: { ... },
 *   phase2_output: { ... },
 *   phase3_output: { ... },
 * });
 */
export async function runPhase4Synthesis(input: Phase4Input): Promise<Phase4Output> {
  const startTime = Date.now();
  const documentCount = input.document_summaries?.length || 0;

  // Calculate total tokens from document summaries for dynamic tier selection
  // Phase 4 uses accurate summary_metadata.summary_tokens from Stage 3
  // (Unlike Phase 3 which uses character-based estimation for raw strings)
  const totalTokens =
    input.document_summaries?.reduce(
      (sum, doc) => sum + (doc.summary_metadata?.summary_tokens || 0),
      0
    ) || 0;

  // Model selection from database based on phase and tier
  // Language is passed to service which handles 'any' fallback for unknown languages
  const phaseName = documentCount < 3 ? 'stage_4_synthesis' : 'stage_4_expert';
  const model = await getModelForPhase(phaseName, input.course_id, totalTokens, input.language);
  const modelId = model.model || 'unknown';

  // Build synthesis prompt
  const prompt = await buildPhase4Prompt(input, documentCount);

  // Execute LLM call with observability tracking
  const result = await trackPhaseExecution(
    'stage_4_synthesis',
    input.course_id,
    modelId,
    async () => {
      const messages = [new SystemMessage(await getPhase4SystemPrompt()), new HumanMessage(prompt)];
      const response = await model.invoke(messages);

      const content = getTextContent(response.content);

      // Store trace data for orchestrator to log
      const promptText = messages
        .map(
          m => `${m._getType().toUpperCase()}:
${getTextContent(m.content)}`
        )
        .join('\n\n');
      storeTraceData(input.course_id, 'stage_4_synthesis', {
        promptText,
        completionText: content,
      });

      const usage = response.response_metadata?.usage as
        | { prompt_tokens?: number; completion_tokens?: number }
        | undefined;

      return {
        result: {
          content,
          usage: {
            input_tokens: usage?.prompt_tokens || 0,
            output_tokens: usage?.completion_tokens || 0,
          },
        },
        usage: {
          input_tokens: usage?.prompt_tokens || 0,
          output_tokens: usage?.completion_tokens || 0,
        },
      };
    }
  );

  // Parse and validate response with 5-layer repair cascade
  const rawOutput = result.content;
  let parsedOutput: RawPhase4Output | undefined;
  const repairMetadata: {
    layer_used?: string;
    repair_attempts?: number;
    models_tried: string[];
    successful_fields?: string[];
    regenerated_fields?: string[];
  } = {
    models_tried: [modelId],
  };

  // TIER 1: PREPROCESSING (before UnifiedRegenerator)
  // Extract JSON from markdown code blocks + strip thinking tags
  let preprocessedOutput = extractJSON(rawOutput);
  try {
    const parsedRaw = JSON.parse(preprocessedOutput) as RawPhase4Output;
    // Preprocess generation instructions enum fields
    if (parsedRaw.generation_instructions) {
      parsedRaw.generation_instructions = preprocessObject(
        parsedRaw.generation_instructions as Record<string, unknown>,
        {
          target_audience: 'enum',
          difficulty_level: 'enum',
        }
      );
    }
    preprocessedOutput = JSON.stringify(parsedRaw);
  } catch (error) {
    // CR-007: Use structured logger instead of console.*
    logger.warn(
      {
        phase: 'phase-4-synthesis',
        error: error instanceof Error ? error.message : String(error),
      },
      'Preprocessing failed, using raw output'
    );
  }

  try {
    // Attempt 0: Direct parse
    parsedOutput = JSON.parse(preprocessedOutput) as RawPhase4Output;
    // Direct parse succeeded
  } catch (parseError: unknown) {
    // Direct parse failed, using UnifiedRegenerator with all 5 layers

    // Use UnifiedRegenerator with all 5 layers + warning fallback (Stage 4)
    const regenerator = new UnifiedRegenerator<Phase4Output>({
      enabledLayers: [
        'auto-repair',
        'critique-revise',
        'partial-regen',
        'model-escalation',
        'emergency',
      ],
      maxRetries: 2,
      schema: Phase4OutputSchema,
      model: model,
      metricsTracking: true,
      stage: 'analyze',
      courseId: input.course_id,
      phaseId: 'stage_4_synthesis',
      allowWarningFallback: true, // Stage 4 advisory fields
      // Quality validator: ensure arrays not emptied by soft-filter (consistent with Stage 5 pattern)
      qualityValidator: data => {
        const guidance = data?.generation_guidance;
        // After Zod soft-validation, arrays may be empty if all LLM values were unknown
        // Return false to trigger retry instead of silent fallback in Phase5 assembly
        const hasVisuals =
          Array.isArray(guidance?.include_visuals) && guidance.include_visuals.length > 0;
        const hasExercises =
          Array.isArray(guidance?.exercise_types) && guidance.exercise_types.length > 0;
        return hasVisuals && hasExercises;
      },
    });

    const regenerationResult = await regenerator.regenerate({
      rawOutput: preprocessedOutput,
      originalPrompt: await buildPhase4Prompt(input, documentCount),
      parseError: parseError instanceof Error ? parseError.message : String(parseError),
    });

    if (regenerationResult.success && regenerationResult.data) {
      parsedOutput = regenerationResult.data as unknown as RawPhase4Output; // Phase4Output matches RawPhase4Output structurally but typed strictly

      // Map layer names for backward compatibility
      const layerMapping: Record<
        string,
        | 'layer1_repair'
        | 'layer2_revise'
        | 'layer3_partial'
        | 'layer4_120b'
        | 'layer5_emergency'
        | 'warning_fallback'
        | 'none'
      > = {
        'auto-repair': 'layer1_repair',
        'critique-revise': 'layer2_revise',
        'partial-regen': 'layer3_partial',
        'model-escalation': 'layer4_120b',
        emergency: 'layer5_emergency',
        warning_fallback: 'warning_fallback',
        failed: 'none',
      };

      repairMetadata.layer_used = layerMapping[regenerationResult.metadata.layerUsed] || 'none';
      repairMetadata.repair_attempts = regenerationResult.metadata.retryCount;
      repairMetadata.successful_fields = regenerationResult.metadata.successfulFields || [];
      repairMetadata.regenerated_fields = regenerationResult.metadata.regeneratedFields || [];
      repairMetadata.models_tried = [modelId, ...(regenerationResult.metadata.modelsUsed || [])];

      // UnifiedRegenerator succeeded - observability tracked by metrics
    } else {
      // CR-007: Use structured logger instead of console.*
      logger.error(
        { phase: 'phase-4-synthesis', error: regenerationResult.error },
        'ALL REPAIR LAYERS EXHAUSTED'
      );
      throw new Error(
        `Failed to parse Phase 4 JSON after all 5 repair layers. Error: ${regenerationResult.error}`
      );
    }
  }

  if (!parsedOutput) {
    throw new Error('Failed to obtain parsed output');
  }

  // Validate with Zod schema
  const validated = Phase4OutputSchema.parse({
    generation_guidance: parsedOutput.generation_guidance,
    phase_metadata: {
      duration_ms: Date.now() - startTime,
      model_used: modelId,
      tokens: {
        input: result.usage.input_tokens,
        output: result.usage.output_tokens,
        total: result.usage.input_tokens + result.usage.output_tokens,
      },
      quality_score: 0.0, // Will be updated after semantic validation
      retry_count: 0,
      document_count: documentCount,
    },
  });

  return validated;
}

/**
 * Truncates document content to stay within token budget
 *
 * Estimates tokens (~4 chars per token for English/Russian mix) and truncates
 * content to prevent LLM context overflow.
 *
 * @param content - Document processed_content string
 * @param maxTokens - Maximum tokens to allow (default: 10000)
 * @returns Truncated content with truncation note if needed
 */
function truncateDocumentContent(content: string, maxTokens: number = 10000): string {
  // Rough token estimation: ~4 characters per token (conservative for multilingual)
  const estimatedTokens = Math.ceil(content.length / 4);

  if (estimatedTokens <= maxTokens) {
    return content;
  }

  // Truncate to max tokens (4 chars per token)
  const maxChars = maxTokens * 4;
  const truncated = content.substring(0, maxChars);

  return `${truncated}\n\n[... Content truncated from ${estimatedTokens} to ${maxTokens} tokens to fit context window ...]`;
}

/**
 * Builds the Phase 4 synthesis prompt
 *
 * @param input - Phase 4 input data
 * @param documentCount - Number of documents to synthesize
 * @returns Formatted prompt string with token-aware truncation
 */
async function buildPhase4Prompt(input: Phase4Input, documentCount: number): Promise<string> {
  const { phase1_output, phase2_output, phase3_output, language } = input;

  // Determine output language based on course language
  const outputLanguage = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : language;

  // Extract key data from previous phases
  const category = phase1_output.course_category.primary;
  const totalLessons = phase2_output.recommended_structure.total_lessons;
  const totalSections = phase2_output.recommended_structure.total_sections;
  const researchFlagsCount = phase3_output.research_flags.length;

  // Build document summaries section with token-aware truncation
  // Target: ~25K tokens total for documents (to leave room for prompt structure)
  // With 3 docs: ~8K tokens per document
  const tokensPerDocument = documentCount > 0 ? Math.floor(25000 / documentCount) : 0;

  const documentSummariesSection =
    documentCount > 0
      ? `\n\nDOCUMENT SUMMARIES (${documentCount} documents):\n${input.document_summaries?.map((doc, idx) => `\n[Document ${idx + 1}: ${doc.file_name}]\n${truncateDocumentContent(doc.processed_content, tokensPerDocument)}`).join('\n')}`
      : '\n\n(No documents provided - course will be created from LLM knowledge)';

  // Build research flags section
  const researchFlagsSection =
    researchFlagsCount > 0
      ? `\n\nRESEARCH FLAGS (${researchFlagsCount} topics requiring up-to-date information):\n${phase3_output.research_flags.map(flag => `- ${flag.topic}: ${flag.context} [${flag.reason}]`).join('\n')}`
      : '';

  // Build clarifying context from user answers
  let clarifyingContext = '';
  if (input.clarifying_answers && input.clarifying_answers.length > 0) {
    clarifyingContext = '\n\nUSER CLARIFICATIONS (from Phase 0.5):\n';
    clarifyingContext += input.clarifying_answers
      .map((a, i) => `[Q${i + 1}] ${a.question}\n[A${i + 1}] ${a.answer}`)
      .join('\n\n');
  }

  // Pre-assemble phase outputs
  const phase1KeyConcepts = phase1_output.topic_analysis.key_concepts.join(', ');
  const phase2SectionsBreakdown = phase2_output.recommended_structure.sections_breakdown
    .map(
      section => `- ${section.area}: ${section.estimated_lessons} lessons (${section.importance})`
    )
    .join('\n');
  const phase3ProgressionLogic = phase3_output.pedagogical_strategy.progression_logic;

  // Generate Zod schema description for LLM
  const schemaDescription = zodToPromptSchema(Phase4OutputSchema);

  const promptService = createPromptService();
  return promptService.renderPrompt('stage4_phase4_synthesis_user', {
    outputLanguage,
    outputLanguageUpper: outputLanguage.toUpperCase(),
    schemaDescription,
    topic: input.topic,
    language: input.language,
    category,
    totalLessons: String(totalLessons),
    totalSections: String(totalSections),
    documentCount: String(documentCount),
    researchFlagsSection,
    phase1KeyConcepts,
    phase2SectionsBreakdown,
    phase3ProgressionLogic,
    documentSummariesSection,
    clarifyingContext,
  });
}

/**
 * System prompt for Phase 4 Document Synthesis
 *
 * @returns System prompt string
 */
async function getPhase4SystemPrompt(): Promise<string> {
  const promptService = createPromptService();
  return promptService.renderPrompt('stage4_phase4_synthesis_system', {});
}
