/**
 * Section-Expander Prompt Templates for Section Regeneration
 * @module stages/stage6-lesson-content/judge/section-expander/expander-prompt
 *
 * Provides prompt templates for regenerating entire sections using LLM with RAG grounding.
 * Used when Patcher's surgical edits are insufficient and section-level changes are needed.
 *
 * Token budget: ~1500 tokens max response
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md
 * - packages/shared-types/src/judge-types.ts (SectionExpanderInput)
 */

import type { SectionExpanderInput, TargetedIssue } from '@megacampus/shared-types';
import { getLanguageName } from '@megacampus/shared-types';

/**
 * Build prompt for Section-Expander LLM call
 *
 * The expander regenerates an entire section, using RAG chunks for grounding.
 * It addresses multiple issues while preserving learning objectives.
 *
 * Token budget: ~1500 tokens max response
 *
 * @param input - SectionExpanderInput with issues, RAG chunks, learning objectives
 * @returns Formatted prompt string
 *
 * @example
 * ```typescript
 * const input: SectionExpanderInput = {
 *   sectionId: 'sec_introduction',
 *   sectionTitle: 'Introduction to Machine Learning',
 *   originalContent: '...',
 *   issues: [...targetedIssues],
 *   ragChunks: [...referenceTexts],
 *   learningObjectives: ['Understand basic ML concepts', 'Identify ML types'],
 *   contextAnchors: {
 *     prevSectionEnd: 'We will explore these concepts in detail.',
 *     nextSectionStart: 'Let us begin with supervised learning.'
 *   },
 *   targetWordCount: 400,
 * };
 *
 * const prompt = buildExpanderPrompt(input);
 * // Use with LLM service at temperature 0.7-0.8
 * ```
 */
export function buildExpanderPrompt(input: SectionExpanderInput): string {
  // Format issues for the prompt
  const issuesList = input.issues
    .map((issue, idx) => {
      const fixInfo = issue.suggestedFix ? ` → Fix: ${issue.suggestedFix}` : '';
      return `${idx + 1}. [${issue.criterion}] ${issue.description}${fixInfo}`;
    })
    .join('\n');

  // Format learning objectives
  const objectives = input.learningObjectives
    .map((obj, idx) => `${idx + 1}. ${obj}`)
    .join('\n');

  // Format RAG chunks (if available)
  const ragContext = input.ragChunks.length > 0
    ? input.ragChunks
        .map((chunk) => {
          // Handle different chunk formats
          if (typeof chunk === 'string') return chunk;
          if (chunk.content) return chunk.content;
          if (chunk.text) return chunk.text;
          return JSON.stringify(chunk);
        })
        .join('\n\n---\n\n')
    : 'No additional reference materials provided.';

  // Format context anchors
  const prevContext = input.contextAnchors.prevSectionEnd
    ? `Previous section ends with: "${input.contextAnchors.prevSectionEnd}"`
    : 'This is the first section.';

  const nextContext = input.contextAnchors.nextSectionStart
    ? `Next section starts with: "${input.contextAnchors.nextSectionStart}"`
    : 'This is the last section.';

  // Get language name for output instruction (same pattern as assembler/smoother)
  const languageName = getLanguageName(input.language || 'en');

  return `You are an expert educational content writer. Regenerate the following section to address identified issues.

## SECTION INFORMATION
Title: ${input.sectionTitle}
Target word count: ${input.targetWordCount || 300} words (±10%)

## LEARNING OBJECTIVES FOR THIS SECTION
${objectives}

## ISSUES TO ADDRESS
${issuesList}

## ORIGINAL CONTENT (for reference)
${input.originalContent}

## REFERENCE MATERIALS (RAG)
Use these materials for factual grounding:
${ragContext}

## CONTEXT FOR COHERENCE
${prevContext}
${nextContext}

<output_language>
MANDATORY: Write ALL content in ${languageName}.
Every word, example, and explanation must be in ${languageName}.
DO NOT mix languages.
</output_language>

## OUTPUT REQUIREMENTS
1. Write a complete new section addressing ALL listed issues
2. Ground factual claims in the provided reference materials
3. Achieve the learning objectives
4. Maintain smooth transitions with adjacent sections
5. Include relevant examples where appropriate
6. Keep within the target word count
7. Return ONLY the section content (no headers, no commentary)

REGENERATED SECTION:`;
}

/**
 * Build system prompt for Section-Expander
 *
 * Provides the LLM with role context and guidelines for section regeneration.
 *
 * @returns System prompt string
 *
 * @example
 * ```typescript
 * const systemPrompt = buildExpanderSystemPrompt();
 * // Use as system message in LLM call
 * ```
 */
export function buildExpanderSystemPrompt(): string {
  return `You are an expert educational content creator specializing in course material.

Your expertise:
- Writing clear, engaging educational content
- Structuring information for effective learning
- Grounding content in source materials (RAG)
- Maintaining pedagogical best practices

Guidelines:
- Address ALL identified issues in the regenerated content
- Use the reference materials to ensure factual accuracy
- Include practical examples to illustrate concepts
- Write at an appropriate level for the target audience
- Ensure smooth flow from previous content to next content

PROTECTED CONTENT (preserve from original if present):
- Mermaid diagrams (\`\`\`mermaid ... \`\`\`) - copy them exactly as-is
- Code blocks (\`\`\`language ... \`\`\`) - preserve working code examples
- LaTeX formulas ($...$ or $$...$$) - keep mathematical notation intact
- Image references ![alt](url) - preserve image links exactly

When regenerating a section that contains these elements:
1. Keep Mermaid diagrams in their original position unless explicitly flagged
2. Preserve code blocks unless the issue specifically mentions code problems
3. Integrate protected content smoothly into the new narrative`;
}

/**
 * Format issues into actionable requirements
 *
 * Converts TargetedIssue objects into clear, actionable requirements
 * for the LLM to address during section regeneration.
 *
 * @param issues - Array of TargetedIssue objects
 * @returns Array of formatted requirement strings
 *
 * @example
 * ```typescript
 * const issues: TargetedIssue[] = [
 *   {
 *     criterion: 'factual_accuracy',
 *     description: 'Incorrect definition of supervised learning',
 *     suggestedFix: 'Use the definition from the textbook',
 *     // ... other fields
 *   },
 * ];
 *
 * const requirements = formatIssuesAsRequirements(issues);
 * // ['Ensure factual accuracy: Incorrect definition of supervised learning']
 * ```
 */
export function formatIssuesAsRequirements(issues: TargetedIssue[]): string[] {
  return issues.map((issue) => {
    switch (issue.criterion) {
      case 'factual_accuracy':
        return `Ensure factual accuracy: ${issue.description}`;
      case 'learning_objective_alignment':
        return `Better align with learning objectives: ${issue.description}`;
      case 'pedagogical_structure':
        return `Improve structure: ${issue.description}`;
      case 'clarity_readability':
        return `Improve clarity: ${issue.description}`;
      case 'engagement_examples':
        return `Add engagement/examples: ${issue.description}`;
      case 'completeness':
        return `Address completeness gap: ${issue.description}`;
      default:
        return `Address: ${issue.description}`;
    }
  });
}

/**
 * RAG chunk format - union type for different chunk formats
 */
type RagChunk = string | { content: string } | { text: string };

/**
 * Extract RAG chunk text content
 *
 * Helper to safely extract text content from various RAG chunk formats.
 *
 * @param chunk - RAG chunk in any supported format (string, object with content/text)
 * @returns Text content of the chunk
 *
 * @example
 * ```typescript
 * const chunk1 = "Plain text chunk";
 * const chunk2 = { content: "Object with content", metadata: {} };
 * const chunk3 = { text: "Object with text field" };
 *
 * extractRagChunkText(chunk1); // "Plain text chunk"
 * extractRagChunkText(chunk2); // "Object with content"
 * extractRagChunkText(chunk3); // "Object with text field"
 * ```
 */
export function extractRagChunkText(chunk: RagChunk): string {
  if (typeof chunk === 'string') return chunk;
  if ('content' in chunk) return chunk.content;
  if ('text' in chunk) return chunk.text;
  return JSON.stringify(chunk);
}

/**
 * Default target word count for sections
 */
const DEFAULT_TARGET_WORD_COUNT = 300;

/**
 * Validate target word count
 *
 * Ensures the target word count is within reasonable bounds
 * for a section (50-2000 words).
 *
 * @param count - Proposed word count
 * @returns Validated word count within bounds
 *
 * @example
 * ```typescript
 * validateTargetWordCount(100); // 100
 * validateTargetWordCount(5000); // 2000 (clamped to max)
 * validateTargetWordCount(20); // 50 (clamped to min)
 * validateTargetWordCount(undefined); // 300 (default)
 * validateTargetWordCount(NaN); // 300 (default)
 * validateTargetWordCount(-100); // 300 (default)
 * ```
 */
export function validateTargetWordCount(count: number | undefined): number {
  if (count === undefined || count === null || Number.isNaN(count) || count <= 0) {
    return DEFAULT_TARGET_WORD_COUNT;
  }
  return Math.max(50, Math.min(2000, count));
}

