import type { GenerationJobInput } from '@megacampus/shared-types';
import type { SectionBreakdown } from '@megacampus/shared-types/analysis-schemas';

/**
 * Extract section from analysis_result
 *
 * @param input - Generation job input
 * @param sectionIndex - Section index (0-based)
 * @returns Section breakdown from analysis
 *
 * @throws Error if analysis_result is null or section index out of bounds
 */
export function extractSection(input: GenerationJobInput, sectionIndex: number): SectionBreakdown {
  if (!input.analysis_result) {
    throw new Error('Cannot generate sections: analysis_result is null (title-only scenario not supported for section generation)');
  }

  const sections = input.analysis_result.recommended_structure.sections_breakdown;

  if (sectionIndex < 0 || sectionIndex >= sections.length) {
    throw new Error(
      `Section index ${sectionIndex} out of bounds (0-${sections.length - 1})`
    );
  }

  return sections[sectionIndex];
}

/**
 * Estimate token usage (simplified approximation)
 *
 * @param prompt - Input prompt
 * @param response - Model response
 * @returns Estimated total tokens
 */
export function estimateTokens(prompt: string, response: string): number {
  // Rough approximation: 4 chars ≈ 1 token (English)
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.ceil(response.length / 4);
  return inputTokens + outputTokens;
}
