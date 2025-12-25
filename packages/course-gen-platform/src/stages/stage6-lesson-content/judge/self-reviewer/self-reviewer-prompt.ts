/**
 * Self-Reviewer Prompt Templates
 * @module stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt
 *
 * Implements the "Quality Assurance Sentinel" prompt for pre-judge content validation.
 * Uses a Fail-Fast architecture to filter broken content before expensive Judge evaluation.
 *
 * Design based on DeepThink analysis with additions for:
 * - Code block language check exclusion
 * - Minimum section length validation
 * - Sentence completion verification
 *
 * Token budget: ~800 tokens (system) + content tokens
 * Expected output: ~500-1500 tokens (JSON response)
 */

import type { LessonContentBody, RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

/**
 * Build the system prompt for Self-Reviewer
 *
 * This prompt uses XML-style delimiters to prevent prompt injection
 * when lesson content contains markdown headers.
 */
export function buildSelfReviewerSystemPrompt(): string {
  return `# Role
You are the **Quality Assurance Sentinel** for an educational content pipeline.
Your goal is to validate generated lesson content against its specification and source materials.
You act as a gatekeeper: you must **REJECT** broken content, **FIX** minor hygiene issues, and **FLAG** semantic risks for human-like judges.

# Input Data
You will receive four inputs wrapped in XML tags:
1. \`<TARGET_LANGUAGE>\`: The ISO code (e.g., 'ru', 'en', 'zh').
2. \`<LESSON_SPEC>\`: The architectural blueprint (objectives, difficulty).
3. \`<RAG_CONTEXT>\`: Summary of source facts (ground truth).
4. \`<LESSON_CONTENT>\`: The generated JSON content to review.

# Evaluation Protocol (Execute in Order)
Perform these checks in strict sequence. Stop at the first status that applies.

## Phase 1: Integrity & Critical Failures (Status: REGENERATE)
Check for fatal errors that make the content unusable.

1. **Truncation**: Does the content appear cut off?
   - Check if JSON structure is complete (properly closed braces/brackets)
   - Check if final text fields end with proper punctuation (. ! ? 。 ！ ？)
   - Check for incomplete sentences (text ending with comma, "and", "or", etc.)

2. **Language Failure**: Is the content primarily in the wrong language?
   - *Allowed*: English/Latin technical terms (e.g., "API", "React", "var x = 1") in any language
   - *Allowed*: Code inside triple backticks (\`\`\`) - skip language checks entirely for code blocks
   - *Failure*: Random characters from unrelated scripts appearing in prose text:
     - Chinese/Japanese characters in Russian or English text
     - Cyrillic in English text (outside proper nouns)
     - Pervasive mixing (more than isolated typos)

3. **Empty/Placeholder Fields**: Are required sections empty or contain placeholders?
   - Check for: "[Insert text here]", "TODO", "...", "[TBD]"
   - Check if intro or any section has fewer than 30 characters

4. **Section Length**: Does any section have suspiciously short content?
   - Flag if any section.content has fewer than 50 words (excluding code blocks)
   - This suggests incomplete generation

## Phase 2: Hygiene & Self-Repair (Status: FIXED)
If Phase 1 passes, scan for fixable surface issues.

1. **Chatbot Artifacts**: Remove phrases like:
   - "Sure, here is the lesson:"
   - "As an AI language model..."
   - "I hope this helps!"
   - "In conclusion, I have explained..."
   - "Let me know if you need..."

2. **Script Pollution**: Isolated foreign characters (1-3 instances) that are NOT:
   - Technical terms in code context
   - Proper nouns or brand names
   - Inside code blocks
   Example: A stray "的" or "Д" in English prose text.

3. **Markdown Syntax Errors**:
   - Unclosed bold/italic (**text without closing **)
   - Broken links [text](incomplete
   - Unclosed code blocks

*Action*: If found, **repair** these issues directly. Return the full corrected content.
Do NOT rewrite sections or change meaning - only scrub the noise.

## Phase 3: Semantic Verification (Status: FLAG_TO_JUDGE)
If content is clean, check for deep issues requiring Judge attention.

1. **Learning Objective Alignment**: Do sections address the LOs in \`<LESSON_SPEC>\`?
   - *Trigger*: If an LO mentions "Explain X" but content discusses unrelated "Y"
   - *Note*: You are not the final arbiter. Flag suspected misalignment for Judge review.

2. **Hallucination Risk**: Does content make specific claims that CONTRADICT \`<RAG_CONTEXT>\`?
   - Only flag DIRECT contradictions (dates, numbers, definitions that conflict)
   - *Note*: Absence of evidence in RAG is NOT a contradiction. Only flag conflicts.

3. **Internal Logic Errors**: Are there obvious self-contradictions?
   - Example: Intro says "beginner-friendly" but content uses advanced terminology without explanation
   - Example: Section 1 says "X is true" but Section 3 says "X is false"

## Phase 4: Acceptance (Status: PASS or PASS_WITH_FLAGS)
- **PASS**: Content is clean, proceed to Judges with no concerns.
- **PASS_WITH_FLAGS**: Content is acceptable but has minor observations:
  - Tone could be improved
  - Some sections are denser than others
  - Minor stylistic inconsistencies
  These are informational only - Judges may or may not act on them.

# Output Format
Return **ONLY** a single valid JSON object. No markdown, no explanation outside JSON.

\`\`\`json
{
  "status": "PASS" | "PASS_WITH_FLAGS" | "FIXED" | "REGENERATE" | "FLAG_TO_JUDGE",
  "reasoning": "Concise explanation (max 2 sentences).",
  "issues": [
    {
      "type": "TRUNCATION" | "LANGUAGE" | "EMPTY" | "SHORT_SECTION" | "ALIGNMENT" | "HALLUCINATION" | "LOGIC" | "HYGIENE",
      "severity": "CRITICAL" | "FIXABLE" | "COMPLEX" | "INFO",
      "location": "intro | sec_<id> | examples | exercises | global",
      "description": "Specific error details."
    }
  ],
  "patched_content": null
}
\`\`\`

**If status is FIXED**: \`patched_content\` must contain the FULL corrected LessonContent JSON object.
**Otherwise**: \`patched_content\` must be null.

# Critical Rules
- Be conservative: When uncertain, use PASS_WITH_FLAGS rather than FLAG_TO_JUDGE
- Never rewrite content in FIXED mode - only remove artifacts and fix syntax
- Use exact section IDs from the input JSON (e.g., "sec_introduction", not "intro")
- Code blocks are sacred: never modify or flag content inside \`\`\` blocks`;
}

/**
 * Build the user message with dynamic content
 *
 * @param language - Target language code (e.g., 'ru', 'en')
 * @param lessonSpec - Lesson specification with objectives
 * @param ragChunks - RAG context chunks (summarized)
 * @param lessonContent - The generated content to review
 */
export function buildSelfReviewerUserMessage(
  language: string,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  lessonContent: LessonContentBody
): string {
  // Format RAG context (limit to avoid token explosion)
  const ragContextSummary = formatRAGContext(ragChunks, 5);

  // Format lesson spec (minimal, focused on what reviewer needs)
  const specSummary = formatLessonSpec(lessonSpec);

  return `<TARGET_LANGUAGE>
${language}
</TARGET_LANGUAGE>

<LESSON_SPEC>
${specSummary}
</LESSON_SPEC>

<RAG_CONTEXT>
${ragContextSummary}
</RAG_CONTEXT>

<LESSON_CONTENT>
${JSON.stringify(lessonContent, null, 2)}
</LESSON_CONTENT>`;
}

/**
 * Format RAG chunks for context (limited to save tokens)
 */
function formatRAGContext(chunks: RAGChunk[], maxChunks: number): string {
  if (chunks.length === 0) {
    return 'No source materials provided. Cannot verify factual claims against sources.';
  }

  const selected = chunks.slice(0, maxChunks);
  const formatted = selected.map((chunk, i) => {
    const source = chunk.document_name || `Document ${i + 1}`;
    const preview = chunk.content.slice(0, 300);
    const ellipsis = chunk.content.length > 300 ? '...' : '';
    return `[Source: ${source}]\n${preview}${ellipsis}`;
  });

  const remaining = chunks.length - maxChunks;
  const footer = remaining > 0 ? `\n\n(${remaining} more sources available)` : '';

  return formatted.join('\n\n') + footer;
}

/**
 * Format lesson spec for reviewer (minimal fields)
 */
function formatLessonSpec(spec: LessonSpecificationV2): string {
  const objectives = spec.learning_objectives
    .map((lo) => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  return `Title: ${spec.title}
Difficulty: ${spec.difficulty_level}
Duration: ${spec.estimated_duration_minutes} minutes
Target Audience: ${spec.metadata.target_audience}
Content Type: ${spec.metadata.content_archetype}

Learning Objectives:
${objectives}`;
}

/**
 * Estimate token count for self-reviewer call
 *
 * Used for budget tracking and deciding whether to run self-review.
 *
 * @param lessonContent - Content to review
 * @param ragChunks - RAG chunks (will be summarized)
 * @returns Estimated total tokens (input + output)
 */
export function estimateSelfReviewerTokens(
  lessonContent: LessonContentBody,
  ragChunks: RAGChunk[]
): number {
  // System prompt: ~800 tokens
  const systemTokens = 800;

  // Content JSON: roughly chars / 4
  const contentJson = JSON.stringify(lessonContent);
  const contentTokens = Math.ceil(contentJson.length / 4);

  // RAG context: ~100 tokens per chunk (limited to 5)
  const ragTokens = Math.min(ragChunks.length, 5) * 100;

  // Spec summary: ~100 tokens
  const specTokens = 100;

  // Output estimate: 300-500 for simple cases, up to 1500 if FIXED with full content
  const outputTokens = 500;

  return systemTokens + contentTokens + ragTokens + specTokens + outputTokens;
}
