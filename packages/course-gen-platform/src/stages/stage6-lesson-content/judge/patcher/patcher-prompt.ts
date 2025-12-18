/**
 * Patcher prompt template for surgical content edits
 * @module stages/stage6-lesson-content/judge/patcher/patcher-prompt
 *
 * Builds prompts for the Patcher agent that performs surgical edits on lesson content.
 * The patcher makes targeted fixes to specific areas while preserving context coherence.
 *
 * Token budget: ~800 tokens max response
 */

import type { PatcherInput } from '@megacampus/shared-types';

/**
 * Check if instructions contain markdown rule references
 * @param instructions - Fix instructions from refinement event
 * @returns True if markdown rules detected (MD001, MD040, etc.)
 */
export function isMarkdownStructureIssue(instructions: string): boolean {
  const markdownRulePattern = /\bMD0\d{2}\b/;
  return markdownRulePattern.test(instructions);
}

/**
 * Build prompt for Patcher LLM call
 *
 * The patcher makes surgical edits to specific areas of content.
 * It preserves context coherence using anchors from adjacent sections.
 *
 * Token budget: ~800 tokens max response
 *
 * @param input - PatcherInput with content, instructions, context anchors
 * @returns Formatted prompt string
 */
export function buildPatcherPrompt(input: PatcherInput): string {
  const scopeInstruction = input.contextWindow.scope === 'paragraph'
    ? `Focus on the area between: "${input.contextWindow.startQuote}" and "${input.contextWindow.endQuote}"`
    : input.contextWindow.scope === 'section'
      ? 'Apply changes throughout this section while maintaining flow'
      : 'Apply changes with awareness of global lesson context';

  // Build context anchors section
  const contextSection = [];
  if (input.contextAnchors.prevSectionEnd) {
    contextSection.push(`Previous section ends with: "${input.contextAnchors.prevSectionEnd}"`);
  } else {
    contextSection.push('This is the first section.');
  }
  if (input.contextAnchors.nextSectionStart) {
    contextSection.push(`Next section starts with: "${input.contextAnchors.nextSectionStart}"`);
  } else {
    contextSection.push('This is the last section.');
  }

  // Add markdown-specific guidance if needed
  const markdownGuidance = isMarkdownStructureIssue(input.instructions)
    ? `
## MARKDOWN STRUCTURE GUIDANCE
For markdown structure fixes:
- MD001 (heading increment): Fix heading levels to increment by one (h1 → h2 → h3)
- MD040 (code block language): Add language identifier after opening fence (e.g., \`\`\`typescript)
- MD025 (single h1): Remove duplicate H1 headings, keep only the main title
- MD045 (image alt text): Add descriptive alt text to images: ![Description](url)
- MD031/MD032: Add blank lines before and after code blocks and lists
- For code blocks without language, detect the language from content context`
    : '';

  return `You are a precise content editor. Apply the following surgical fix to the educational content.

## SECTION TITLE
${input.sectionTitle}

## ORIGINAL CONTENT
${input.originalContent}

## FIX INSTRUCTIONS
${input.instructions}

## CONTEXT FOR COHERENCE
${contextSection.join('\n')}

## TARGET AREA
${scopeInstruction}
${markdownGuidance}

## OUTPUT REQUIREMENTS
1. Return ONLY the corrected section content
2. Preserve all text that doesn't need fixing
3. Maintain coherent transitions with adjacent sections
4. Keep the same approximate length (within 10%)
5. Do NOT add commentary or explanations

CORRECTED CONTENT:`;
}

/**
 * Build system prompt for Patcher
 *
 * Defines the agent's role and operating guidelines for surgical edits.
 *
 * @returns System prompt string
 */
export function buildPatcherSystemPrompt(): string {
  return `You are an expert educational content editor specializing in surgical fixes.

Your role:
- Apply precise fixes to specific issues without disrupting surrounding content
- Maintain consistency in tone, style, and terminology
- Preserve learning objectives and pedagogical structure
- Ensure smooth transitions between sections

Guidelines:
- Fix ONLY what is explicitly requested
- Do not introduce new content beyond the fix
- Preserve any examples, exercises, or key points
- Match the original writing style
- For markdown issues: maintain proper heading hierarchy, add code block languages, ensure accessibility (alt text)`;
}
