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

import { getModelForPhase } from '@/shared/llm/langchain-models';
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
}

interface RawPhase3Output {
  pedagogical_strategy: unknown;
  exercise_types?: unknown[];
  expansion_areas?: unknown;
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
  // expansion_areas can be: array of areas, null (explicit no areas), or undefined (LLM omitted field)
  // All cases are valid - default to null if undefined
  expansion_areas: z
    .array(
      z.object({
        area: z.string().min(3),
        priority: z.enum(['critical', 'important', 'nice-to-have']),
        specific_requirements: z.array(z.string()).min(1), // Removed .max(5) - encourage comprehensive requirements
        estimated_lessons: z.number().min(1), // Removed .max(10) - let LLM decide optimal count
      })
    )
    .nullable()
    .optional(), // Allow undefined - LLM may omit field entirely
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
function buildPhase3Prompt(input: Phase3Input): string {
  const { topic, language, document_summaries, phase1_output, phase2_output } = input;

  // Determine output language based on course language
  const outputLanguage = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : language;

  // Build document context with token-aware truncation
  // Target: ~25K tokens total for documents (model context is limited)
  // With 3 docs: ~8K tokens per document
  const documentCount = document_summaries?.length || 0;
  const tokensPerDocument = documentCount > 0 ? Math.floor(25000 / documentCount) : 0;

  const documentContext =
    document_summaries && document_summaries.length > 0
      ? `\n\nDOCUMENT SUMMARIES (${documentCount} documents, truncated for context):\n${document_summaries.map((summary, idx) => `\n[Document ${idx + 1}]\n${truncateSummary(summary, tokensPerDocument)}`).join('\n\n')}`
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

  return `You are a senior curriculum architect with 20+ years of experience in adult education (andragogy) and instructional design. Your expertise includes pedagogical strategy, learning progression design, and identifying content gaps.

CRITICAL RULES:
1. ALL your response MUST be in ${outputLanguage.toUpperCase()} (the course target language is ${outputLanguage})
2. You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

===== CONTEXT FROM PREVIOUS PHASES =====

TOPIC: ${topic}
TARGET LANGUAGE FOR COURSE: ${outputLanguage} (ALL text content MUST be in ${outputLanguage.toUpperCase()})

CATEGORY: ${phase1_output.course_category.primary} (confidence: ${phase1_output.course_category.confidence})
COMPLEXITY: ${phase1_output.topic_analysis.complexity}
INFORMATION COMPLETENESS: ${phase1_output.topic_analysis.information_completeness}%
TARGET AUDIENCE: ${phase1_output.topic_analysis.target_audience}

SCOPE:
- Total lessons: ${phase2_output.recommended_structure.total_lessons}
- Estimated hours: ${phase2_output.recommended_structure.estimated_content_hours}h
- Lesson duration: ${phase2_output.recommended_structure.lesson_duration_minutes} minutes
- Total sections: ${phase2_output.recommended_structure.total_sections}${documentContext}${clarifyingContext}

===== YOUR TASKS =====

TASK 1: DESIGN PEDAGOGICAL STRATEGY

Design a comprehensive pedagogical strategy for this course:

1. assessment_approach (min 50 chars): How learners demonstrate understanding
   - Examples: "Progressive quizzes after each section", "Final capstone project", "Peer review exercises"
   - Provide comprehensive detail - no upper limit

2. progression_logic (min 100 chars): How difficulty increases across lessons
   - Explain the learning arc from beginner to mastery
   - Describe scaffolding strategy
   - Provide comprehensive detail - no upper limit

TASK 2: IDENTIFY EXPANSION AREAS (CONDITIONAL)

${
  phase1_output.topic_analysis.information_completeness < 80
    ? `Information completeness is ${phase1_output.topic_analysis.information_completeness}% (<80%), so identify expansion areas:

For each area needing more detail:
- area: Topic name (min 3 chars) - provide comprehensive detail
- priority: "critical" (must-have) | "important" (should-have) | "nice-to-have" (optional)
- specific_requirements: At least 1 specific item needed (e.g., "Add section on error handling patterns") - no upper limit
- estimated_lessons: How many lessons needed (min 1) - let pedagogical needs determine count

Return array of expansion areas, or null if none needed.`
    : 'Information completeness is adequate (≥80%). Set expansion_areas to null unless you identify critical gaps.'
}

NOTE ON FIELD LENGTHS:
- All string fields have minimum lengths to ensure quality
- NO upper limits - provide comprehensive, detailed responses
- Quality over brevity - thorough explanations are encouraged

LANGUAGE REQUIREMENT:
- ALL text content (assessment_approach, progression_logic, area, specific_requirements) MUST be in ${outputLanguage.toUpperCase()}

===== OUTPUT FORMAT =====

Respond ONLY with valid JSON (no markdown, no code blocks, no explanations):

{
  "pedagogical_strategy": {
    "assessment_approach": "string (min 50 chars, comprehensive detail encouraged)",
    "progression_logic": "string (min 100 chars, comprehensive detail encouraged)"
  },
  "expansion_areas": [
    {
      "area": "string",
      "priority": "critical" | "important" | "nice-to-have",
      "specific_requirements": ["string", "string"],
      "estimated_lessons": number
    }
  ] | null
}`;
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
  const prompt = buildPhase3Prompt(input);
  const mainPhaseStartTime = Date.now();
  const mainPhaseOutput = await trackPhaseExecution(
    'stage_4_expert',
    course_id,
    modelId,
    async () => {
      const response = await model.invoke(prompt);
      const content = response.content as string;
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
          throw new Error(`Phase 3 validation failed: ${JSON.stringify(validationError.errors)}`);
        }
        throw validationError;
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
    // Default to null if LLM omitted expansion_areas field entirely
    expansion_areas: mainPhaseOutput.expansion_areas ?? null,
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
