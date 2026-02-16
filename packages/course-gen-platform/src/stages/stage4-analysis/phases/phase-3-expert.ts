/**
 * Stage 4 Analysis - Phase 3: Deep Expert Analysis
 *
 * Critical quality phase using database-configured model.
 * Designs pedagogical strategy, identifies expansion areas, and detects research flags.
 *
 * Key responsibilities:
 * - Pedagogical strategy design (assessment_approach, progression_logic)
 * - Expansion areas identification (if information_completeness < 80%)
 * - Research flag detection (CONSERVATIVE - minimize false positives)
 *
 * Model: Configured via database (llm_model_config table)
 * Temperature: 0.5 (more conservative for expert analysis)
 * Max tokens: 8000
 *
 * @module phase-3-expert
 */

import { getModelForPhase, getTextContent } from '@/shared/llm/langchain-models';
import { trackPhaseExecution, storeTraceData } from '../utils/observability';
import { detectResearchFlags } from '../utils/research-flag-detector';
import type {
  Phase3Output,
  Phase1Output,
  Phase2Output,
} from '@megacampus/shared-types/analysis-result';
import { estimateTokenCount } from '@megacampus/shared-types';
import { z } from 'zod';
import { UnifiedRegenerator } from '@/shared/regeneration';
import { zodToPromptSchema } from '@/shared/utils/zod-to-prompt-schema';
import { preprocessObject } from '@/shared/validation/preprocessing';
import { extractJSON } from '@/shared/utils/json-repair';
import type { AIMessage } from '@langchain/core/messages';
import { logger } from '@/shared/logger';
import { createPromptService } from '@/shared/prompts/prompt-service';

/**
 * Input data for Phase 3 Expert Analysis
 */
export interface Phase3Input {
  course_id: string;
  language: string;
  topic: string;
  document_summaries?: string[] | null;
  phase1_output: Phase1Output;
  phase2_output: Phase2Output;
  /** Clarifying answers from Phase 0.5 */
  clarifying_answers?: Array<{
    question: string;
    answer: string;
    priority: string;
    category: string | null;
  }>;
  /** Budget allocation context from Stage 4 Budget Allocator */
  budget_context?: {
    documents: Array<{
      file_name: string;
      mode: 'full_text' | 'summary';
      priority: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
      tokens: number;
    }>;
    totalTokens: number;
  };
}

interface RawPhase3Output {
  pedagogical_strategy: unknown;
  exercise_types?: unknown[];
}

/**
 * Zod schema for Phase 3 output validation
 * Note: research_flags handled separately by research-flag-detector utility
 * Architectural principle: .min() is critical (blocks), .max() is recommendation (non-blocking)
 */
const Phase3OutputSchema = z.object({
  pedagogical_strategy: z.object({
    assessment_approach: z.string().min(50), // How learners demonstrate understanding
    progression_logic: z.string().min(100), // How difficulty increases across lessons
  }),
});

/**
 * Truncates a single document summary to stay within token budget
 *
 * Estimates tokens (~4 chars per token) and truncates if needed.
 *
 * @param summary - Document summary string
 * @param maxTokens - Maximum tokens to allow
 * @returns Truncated summary with note if truncated
 */
function truncateSummary(summary: string, maxTokens: number): string {
  const estimatedTokens = Math.ceil(summary.length / 4);

  if (estimatedTokens <= maxTokens) {
    return summary;
  }

  const maxChars = maxTokens * 4;
  const truncated = summary.substring(0, maxChars);

  return `${truncated}\n[... Truncated from ${estimatedTokens} to ${maxTokens} tokens ...]`;
}

/**
 * Builds the expert analysis prompt for Phase 3
 *
 * @param input - Phase 3 input data
 * @returns LLM prompt string with token-aware truncation
 */
async function buildPhase3Prompt(input: Phase3Input): Promise<string> {
  const { topic, language, document_summaries, phase1_output, phase2_output } = input;

  // Determine output language based on course language
  const outputLanguage = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : language;

  // Build document context with budget-aware truncation
  // Uses per-document token allocation from Budget Allocator when available
  // Falls back to equal 25K split when no budget context
  // INVARIANT: budget_context.documents order MUST match document_summaries order
  // Both are derived from resolvedDocumentSummaries in the orchestrator
  const documentCount = document_summaries?.length || 0;
  const budgetDocs = input.budget_context?.documents;
  const DEFAULT_TOTAL_DOC_TOKENS = 25_000;

  const getTokenBudget = (idx: number): number => {
    if (budgetDocs?.[idx]) return budgetDocs[idx].tokens;
    return documentCount > 0 ? Math.floor(DEFAULT_TOTAL_DOC_TOKENS / documentCount) : 0;
  };

  const documentContext =
    document_summaries && document_summaries.length > 0
      ? `\n\nDOCUMENT CONTEXT (${documentCount} documents):\n${document_summaries
          .map((summary, idx) => {
            const budget = getTokenBudget(idx);
            const priorityLabel = budgetDocs?.[idx]
              ? ` [${budgetDocs[idx].priority}, ${budgetDocs[idx].mode}]`
              : '';
            return `\n[Document ${idx + 1}${priorityLabel}]\n${truncateSummary(summary, budget)}`;
          })
          .join('\n\n')}`
      : '';

  // Build clarifying context from user answers
  let clarifyingContext = '';
  if (input.clarifying_answers && input.clarifying_answers.length > 0) {
    clarifyingContext = '\n\nUSER CLARIFICATIONS (from Phase 0.5):\n';
    clarifyingContext += input.clarifying_answers
      .map((a, i) => `[Q${i + 1}] ${a.question}\n[A${i + 1}] ${a.answer}`)
      .join('\n\n');
  }

  // Generate Zod schema description for LLM
  const schemaDescription = zodToPromptSchema(Phase3OutputSchema);

  const promptService = createPromptService();
  return promptService.renderPrompt('stage4_phase3_expert', {
    outputLanguage,
    outputLanguageUpper: outputLanguage.toUpperCase(),
    schemaDescription,
    topic,
    category: String(phase1_output.course_category.primary),
    categoryConfidence: String(phase1_output.course_category.confidence),
    complexity: String(phase1_output.topic_analysis.complexity),
    informationCompleteness: String(phase1_output.topic_analysis.information_completeness),
    targetAudience: String(phase1_output.topic_analysis.target_audience),
    totalLessons: String(phase2_output.recommended_structure.total_lessons),
    estimatedHours: String(phase2_output.recommended_structure.estimated_content_hours),
    lessonDurationMinutes: String(phase2_output.recommended_structure.lesson_duration_minutes),
    totalSections: String(phase2_output.recommended_structure.total_sections),
    documentContext,
    clarifyingContext,
  });
}

export async function runPhase3Expert(input: Phase3Input): Promise<Phase3Output> {
  const { course_id, topic, document_summaries, phase1_output, language } = input;
  let totalDurationMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Estimate token count from document summaries for dynamic tier selection
  // Phase 3 receives raw summary strings - use character-based estimation
  // (Phase 4 uses accurate summary_metadata.summary_tokens when available)
  const estimatedTokenCount = document_summaries
    ? estimateTokenCount(document_summaries, language)
    : 0;

  const model = await getModelForPhase('stage_4_expert', course_id, estimatedTokenCount, language);
  const modelId = model.model || 'unknown';
  const prompt = await buildPhase3Prompt(input);
  const mainPhaseStartTime = Date.now();
  const mainPhaseOutput = await trackPhaseExecution(
    'stage_4_expert',
    course_id,
    modelId,
    async () => {
      const response = await model.invoke(prompt);
      const content = getTextContent(response.content);
      storeTraceData(course_id, 'stage_4_expert', { promptText: prompt, completionText: content });
      // Extract JSON from markdown code blocks + strip thinking tags
      let preprocessedContent = extractJSON(content);
      try {
        const parsedRaw = JSON.parse(preprocessedContent) as RawPhase3Output;
        // No enum preprocessing needed for pedagogical_strategy (only has string fields)
        if (parsedRaw.exercise_types && Array.isArray(parsedRaw.exercise_types)) {
          parsedRaw.exercise_types = parsedRaw.exercise_types.map((ex: unknown) =>
            typeof ex === 'string'
              ? ex
              : preprocessObject(ex as Record<string, unknown>, { type: 'enum' })
          );
        }
        preprocessedContent = JSON.stringify(parsedRaw);
      } catch (error) {
        // CR-007: Use structured logger instead of console.*
        logger.warn(
          {
            phase: 'phase-3-expert',
            error: error instanceof Error ? error.message : String(error),
          },
          'Preprocessing failed, using raw output'
        );
      }
      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(preprocessedContent);
        // Direct parse succeeded
      } catch (parseError) {
        // Direct parse failed, using UnifiedRegenerator (All 5 layers)
        const regenerator = new UnifiedRegenerator<unknown>({
          enabledLayers: [
            'auto-repair',
            'critique-revise',
            'partial-regen',
            'model-escalation',
            'emergency',
          ],
          maxRetries: 3,
          schema: Phase3OutputSchema,
          model: model,
          metricsTracking: true,
          stage: 'analyze',
          courseId: input.course_id,
          phaseId: 'stage_4_expert',
          allowWarningFallback: true,
        });
        const result = await regenerator.regenerate({
          rawOutput: preprocessedContent,
          originalPrompt: prompt,
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        });
        if (result.success && result.data) {
          parsedOutput = result.data;
          // UnifiedRegenerator succeeded - observability tracked by metrics
        } else {
          throw new Error(`Phase 3 validation failed after repair: ${result.error}`);
        }
      }
      let validated: z.infer<typeof Phase3OutputSchema>;
      try {
        validated = Phase3OutputSchema.parse(parsedOutput);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          // Route Zod validation failures through UnifiedRegenerator
          logger.warn(
            {
              phase: 'phase-3-expert',
              errors: validationError.errors,
            },
            'Zod validation failed, routing through UnifiedRegenerator'
          );
          const regenerator = new UnifiedRegenerator<z.infer<typeof Phase3OutputSchema>>({
            enabledLayers: [
              'auto-repair',
              'critique-revise',
              'partial-regen',
              'model-escalation',
              'emergency',
            ],
            maxRetries: 3,
            schema: Phase3OutputSchema,
            model: model,
            metricsTracking: true,
            stage: 'analyze',
            courseId: input.course_id,
            phaseId: 'stage_4_expert',
            allowWarningFallback: true,
          });
          const result = await regenerator.regenerate({
            rawOutput: preprocessedContent,
            originalPrompt: prompt,
            parseError: `Zod validation failed: ${JSON.stringify(validationError.errors)}`,
          });
          if (result.success && result.data) {
            validated = Phase3OutputSchema.parse(result.data);
          } else {
            throw new Error(`Phase 3 validation failed after repair: ${result.error}`);
          }
        } else {
          throw validationError;
        }
      }
      const responseMetadata = (response as AIMessage).response_metadata as
        | { usage?: { input_tokens?: number; output_tokens?: number } }
        | undefined;
      const usage = {
        input_tokens: responseMetadata?.usage?.input_tokens ?? 0,
        output_tokens: responseMetadata?.usage?.output_tokens ?? 0,
      };
      totalInputTokens += usage.input_tokens;
      totalOutputTokens += usage.output_tokens;
      return { result: validated, usage };
    }
  );
  totalDurationMs += Date.now() - mainPhaseStartTime;
  const research_flags = await detectResearchFlags(
    {
      topic,
      course_category: phase1_output.course_category.primary,
      document_summaries: document_summaries || undefined,
      language: language === 'ru' || language === 'en' ? language : undefined,
    },
    course_id
  );
  const phase3Output: Phase3Output = {
    pedagogical_strategy: mainPhaseOutput.pedagogical_strategy,
    research_flags,
    phase_metadata: {
      duration_ms: totalDurationMs,
      model_used: modelId,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
      quality_score: 0,
      retry_count: 0,
    },
  };
  return phase3Output;
}
