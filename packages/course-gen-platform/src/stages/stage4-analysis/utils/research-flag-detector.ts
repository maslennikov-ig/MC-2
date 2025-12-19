/**
 * Research Flag Detector Utility
 *
 * Conservative LLM-based detection for time-sensitive content.
 * Used by Phase 3 Expert Analysis.
 *
 * Goal: <5% research flag rate (minimize false positives)
 *
 * @module research-flag-detector
 */

import { getModelForPhase } from '@/shared/llm/langchain-models';
import { trackPhaseExecution } from './observability';
import type { ResearchFlag } from '@megacampus/shared-types/analysis-result';
import { estimateTokenCount } from '@megacampus/shared-types';
import { z } from 'zod';

export interface ResearchFlagInput {
  topic: string;
  course_category: string;
  document_summaries?: string[];
  /** Language for dynamic tier selection (ru, en, or undefined for 'any' fallback) */
  language?: string;
}

/**
 * Zod schema for research flag validation
 */
const ResearchFlagSchema = z.array(
  z.object({
    topic: z.string().min(3),
    reason: z.string().min(3),
    context: z.string().min(50).max(200),
  })
);

/**
 * Builds the research flag detection prompt
 *
 * @param input - Topic and context for analysis
 * @returns LLM prompt string
 */
/**
 * Truncate document summary to fit within token budget
 * @param summary - Document summary text
 * @param maxTokens - Maximum tokens allowed
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

function buildResearchFlagPrompt(input: ResearchFlagInput): string {
  const { topic, course_category, document_summaries } = input;

  // Build document context with token-aware truncation
  // For research flags: ~5K tokens per document (less context needed than full analysis)
  const documentCount = document_summaries?.length || 0;
  const tokensPerDocument = documentCount > 0 ? Math.floor(15000 / documentCount) : 0;

  const documentContext =
    document_summaries && document_summaries.length > 0
      ? `\n\nDOCUMENT SUMMARIES (${documentCount} documents, truncated for context):\n${document_summaries.map((summary, idx) => `\n[Document ${idx + 1}]\n${truncateSummary(summary, tokensPerDocument)}`).join('\n\n')}`
      : '';

  return `You are a senior curriculum architect with 20+ years of experience. Your task is to identify time-sensitive content that requires active research.

===== CONTEXT =====

TOPIC: ${topic}
CATEGORY: ${course_category}${documentContext}

===== TASK: DETECT RESEARCH FLAGS (CONSERVATIVE) =====

CRITICAL: Be VERY conservative with research flags. Flag ONLY if BOTH conditions are met:
1. Information becomes outdated within 6 months (not just annually)
2. Explicit references to laws/regulations/tech versions/current events

FLAGGABLE EXAMPLES:
- Legal: "Постановление 1875", "GDPR compliance 2024", "procurement law amendments"
- Technology: "React 19 features", "Node.js 22 breaking changes", "TypeScript 5.5 updates"
- Events: "2024 market trends", "current geopolitical situation"

NON-FLAGGABLE EXAMPLES (DO NOT FLAG):
- General concepts: "functions", "loops", "OOP", "async/await"
- Timeless skills: "communication", "leadership", "time management"
- Creative techniques: "watercolor painting", "Tarot reading", "meditation"
- Established patterns: "design patterns", "SOLID principles", "REST API design"

For each flagged topic:
{
  "topic": "Постановление 1875",
  "reason": "regulation_updates" | "technology_trends" | "current_events",
  "context": "Why this needs research (50-200 chars)"
}

Return empty array [] if no research needed (better to under-flag than over-flag).

===== OUTPUT FORMAT =====

Respond ONLY with valid JSON array (no markdown, no code blocks, no explanations):

[
  {
    "topic": "string",
    "reason": "string",
    "context": "string (50-200 chars)"
  }
]

Or [] if no flags needed.`;
}

/**
 * Detects research flags for time-sensitive content
 *
 * Conservative detection - flag ONLY if BOTH conditions met:
 * 1. Information becomes outdated within 6 months
 * 2. Explicit references to laws/regulations/tech versions
 *
 * Uses 120B model for expert-level judgment.
 *
 * @param input - Topic and context for analysis
 * @param course_id - Course ID for tracking (optional, defaults to 'standalone')
 * @returns Array of research flags (can be empty)
 * @throws Error if LLM call fails or validation fails
 *
 * @example
 * const flags = await detectResearchFlags({
 *   topic: 'React 19 Server Components',
 *   course_category: 'programming',
 *   document_summaries: ['Summary of React 19 docs...']
 * });
 */
export async function detectResearchFlags(
  input: ResearchFlagInput,
  course_id: string = 'standalone'
): Promise<ResearchFlag[]> {
  // Estimate token count from document summaries for dynamic tier selection
  const estimatedTokenCount = input.document_summaries
    ? estimateTokenCount(input.document_summaries, input.language)
    : 0;

  // Use 120B model for expert-level judgment (with dynamic tier selection)
  // Language is passed to service which handles 'any' fallback for unknown languages
  const model = await getModelForPhase('stage_4_expert', course_id, estimatedTokenCount, input.language);
  const modelId = model.model || 'openai/gpt-oss-120b'; // Get modelId from ChatOpenAI instance

  // Build prompt
  const prompt = buildResearchFlagPrompt(input);

  // Execute with observability tracking
  const result = await trackPhaseExecution(
    'research_flag_detection',
    course_id,
    modelId,
    async () => {
      // Call LLM
      const response = await model.invoke(prompt);
      const content = response.content as string;

      // Parse JSON response
      let parsedOutput: unknown;
      try {
        parsedOutput = JSON.parse(content);
      } catch (parseError) {
        throw new Error(
          `Research flag detector returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
      }

      // Validate with Zod schema
      let validated: z.infer<typeof ResearchFlagSchema>;
      try {
        validated = ResearchFlagSchema.parse(parsedOutput);
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          throw new Error(
            `Research flag validation failed: ${JSON.stringify(validationError.errors)}`
          );
        }
        throw validationError;
      }

      // Extract token usage from response metadata
      const usage = {
        input_tokens: (response as { usage_metadata?: { input_tokens?: number } }).usage_metadata
          ?.input_tokens || 0,
        output_tokens: (response as { usage_metadata?: { output_tokens?: number } }).usage_metadata
          ?.output_tokens || 0,
      };

      return {
        result: validated,
        usage,
      };
    }
  );

  return result;
}
