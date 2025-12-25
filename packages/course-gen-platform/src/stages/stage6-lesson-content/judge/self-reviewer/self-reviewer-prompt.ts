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

import type { RAGChunk } from '@megacampus/shared-types/lesson-content';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';

/**
 * Language-specific token multipliers
 * Non-Latin scripts use more tokens per character
 */
const TOKEN_MULTIPLIERS: Record<string, number> = {
  'en': 1.0,    // Baseline - Latin script
  'ru': 1.33,   // Cyrillic
  'zh': 2.67,   // Chinese
  'ja': 2.0,    // Japanese
  'ko': 2.0,    // Korean
  'ar': 1.5,    // Arabic
  'hi': 1.5,    // Hindi/Devanagari
};

/**
 * Sanitize text for safe prompt interpolation
 * Prevents prompt injection by escaping all XML special characters
 * and removing potential CDATA markers that could break XML structure
 */
function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  return text
    // Escape XML special characters (& must be first)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Remove CDATA markers that could break XML structure
    .replace(/\]\]>/g, ']]&gt;')
    .replace(/<!\[CDATA\[/gi, '&lt;![CDATA[')
    // Limit consecutive newlines (prevent structure breaking)
    .replace(/\n{4,}/g, '\n\n\n');
}

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
2. \`<LESSON_SPEC>\`: The architectural blueprint (objectives, difficulty, required elements).
3. \`<RAG_CONTEXT>\`: Summary of source facts (ground truth).
4. \`<LESSON_CONTENT>\`: The generated content to review.

# Protected Content (NEVER modify)
The following content types are SACRED - never flag, modify, or suggest changes:
- Code blocks (\`\`\`language ... \`\`\`) - all content inside is untouchable
- Mermaid diagrams (\`\`\`mermaid ... \`\`\`) - critical for visual learning
- LaTeX formulas ($...$ or $$...$$) - mathematical notation
- Image references ![alt](url)

# Evaluation Protocol (Execute in Order)
Perform these checks in strict sequence. Stop at the first status that applies.

## Phase 1: Integrity & Critical Failures (Status: REGENERATE)
Check for fatal errors that make the content unusable.

1. **Truncation**: Does the content appear cut off?
   - Check if final text fields end with proper punctuation (. ! ? 。 ！ ？)
   - Check for incomplete sentences (ending with comma, "and", "or", etc.)
   - Check if Mermaid/code blocks are properly closed

2. **Language Failure**: Is the content primarily in the wrong language?
   - *Allowed*: English/Latin technical terms (API, React, TypeScript) in any language
   - *Allowed*: ALL content inside code/mermaid blocks - skip language checks entirely
   - *Failure*: Random unrelated script characters in prose (Chinese in Russian, etc.)

3. **Empty/Placeholder Fields**: Are required sections empty or contain placeholders?
   - Check for: "[Insert text here]", "TODO", "...", "[TBD]", "PLACEHOLDER"
   - Check if intro or any section has fewer than 30 characters

4. **Section Length**: Does any section have suspiciously short content?
   - Flag if any section has fewer than 50 words (excluding code/mermaid blocks)
   - This suggests incomplete generation

5. **Missing Required Elements**: Check against \`<LESSON_SPEC>\`:
   - If spec requires examples: are code examples present?
   - If spec requires exercises: is there an exercises section?
   - If spec mentions diagrams: are mermaid blocks present?

## Phase 2: Structure & Hygiene (Status: FIXED or FLAG_TO_JUDGE)
If Phase 1 passes, check structure and fixable issues.

### Fixable Issues (FIXED):
1. **Chatbot Artifacts**: Phrases like:
   - "Sure, here is the lesson:", "As an AI language model..."
   - "I hope this helps!", "Let me know if you need..."
   - "In conclusion, I have explained..."

2. **Script Pollution**: Isolated foreign characters (1-3) NOT in:
   - Technical terms, proper nouns, code blocks, mermaid blocks

3. **Markdown Syntax Errors**:
   - Unclosed bold/italic (**text without closing)
   - Broken links [text](incomplete
   - Unclosed code blocks (count opening vs closing \`\`\`)

### Structure Issues (FLAG_TO_JUDGE):
4. **Heading Hierarchy** (MD001): Check heading levels
   - Valid: # → ## → ### (increment by one)
   - Invalid: # → ### (skipped ##)
   - Flag if heading hierarchy is broken

5. **Code Block Languages** (MD040): Check all code blocks
   - Each \`\`\` should have a language identifier (\`\`\`typescript, \`\`\`python, etc.)
   - Exception: \`\`\`mermaid is valid, \`\`\`text is valid
   - Flag unlabeled code blocks

6. **Duplicate Content**: Check for repeated paragraphs
   - Flag if same paragraph (>50 chars) appears twice

## Phase 3: Semantic Verification (Status: FLAG_TO_JUDGE)
Check for deep issues requiring Judge attention.

1. **Learning Objective Alignment**: Do sections address the LOs?
   - Flag if an LO mentions "Explain X" but content discusses unrelated "Y"
   - Check each LO has corresponding content coverage

2. **Hallucination Risk**: Does content CONTRADICT \`<RAG_CONTEXT>\`?
   - Only flag DIRECT contradictions (dates, numbers, definitions)
   - Absence of evidence in RAG is NOT a contradiction

3. **Internal Logic Errors**: Self-contradictions?
   - Intro says "beginner-friendly" but uses unexplained advanced terms
   - Section 1 says "X is true" but Section 3 says "X is false"

4. **Difficulty Mismatch**: Content vs stated difficulty level
   - Beginner content using advanced concepts without explanation
   - Advanced content that's too basic for the stated level

## Phase 4: Acceptance (Status: PASS or PASS_WITH_FLAGS)
- **PASS**: Content is clean, proceed to Judges with no concerns.
- **PASS_WITH_FLAGS**: Acceptable with minor observations (informational only):
  - Tone could be improved
  - Section density varies
  - Minor stylistic inconsistencies
  - Code blocks present but could use more comments

# Output Format
CRITICAL: Return ONLY raw JSON. No markdown code blocks.
Start with { and end with }.

{
  "status": "PASS" | "PASS_WITH_FLAGS" | "FIXED" | "REGENERATE" | "FLAG_TO_JUDGE",
  "reasoning": "Concise explanation (max 2 sentences).",
  "issues": [
    {
      "type": "TRUNCATION" | "LANGUAGE" | "EMPTY" | "SHORT_SECTION" | "MISSING_ELEMENT" | "HEADING_HIERARCHY" | "CODE_BLOCK_LANG" | "DUPLICATE" | "ALIGNMENT" | "HALLUCINATION" | "LOGIC" | "DIFFICULTY" | "HYGIENE",
      "severity": "CRITICAL" | "FIXABLE" | "COMPLEX" | "INFO",
      "location": "intro | sec_<id> | examples | exercises | global",
      "description": "Specific error details."
    }
  ]
}

IMPORTANT: Do NOT include patched_content field. Fixes are automated.

# Critical Rules
- Be conservative: When uncertain, use PASS_WITH_FLAGS rather than FLAG_TO_JUDGE
- NEVER modify content inside code blocks or mermaid blocks
- Use exact section IDs from the input (e.g., "sec_introduction")
- Mermaid diagrams are critical infrastructure - verify they are intact, never flag their content`;
}

/**
 * Build the user message with dynamic content
 *
 * @param language - Target language code (e.g., 'ru', 'en')
 * @param lessonSpec - Lesson specification with objectives
 * @param ragChunks - RAG context chunks (summarized)
 * @param lessonContent - The generated content to review (raw markdown)
 */
export function buildSelfReviewerUserMessage(
  language: string,
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  lessonContent: string
): string {
  // Format RAG context (limit to avoid token explosion)
  const ragContextSummary = formatRAGContext(ragChunks, 5);

  // Format lesson spec (minimal, focused on what reviewer needs)
  const specSummary = formatLessonSpec(lessonSpec);

  return `<TARGET_LANGUAGE>
${sanitizeForPrompt(language)}
</TARGET_LANGUAGE>

<LESSON_SPEC>
${sanitizeForPrompt(specSummary)}
</LESSON_SPEC>

<RAG_CONTEXT>
${sanitizeForPrompt(ragContextSummary)}
</RAG_CONTEXT>

<LESSON_CONTENT>
${sanitizeForPrompt(lessonContent)}
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
 * @param lessonContent - Content to review (raw markdown string)
 * @param ragChunks - RAG chunks (will be summarized)
 * @param language - Target language code (e.g., 'ru', 'en')
 * @returns Estimated total tokens (input + output)
 */
export function estimateSelfReviewerTokens(
  lessonContent: string,
  ragChunks: RAGChunk[],
  language: string = 'en'
): number {
  const multiplier = TOKEN_MULTIPLIERS[language] || 1.0;

  // System prompt: ~1200 tokens (expanded with production-grade checks)
  const systemTokens = 1200;

  // For non-Latin scripts, multiplier affects chars->tokens conversion rate
  // Latin (en): ~4 chars/token, Cyrillic (ru): ~3 chars/token, CJK: ~1.5 chars/token
  // Formula: chars / (baseCharsPerToken / multiplier)
  const charsPerToken = 4 / multiplier;
  const contentTokens = Math.ceil(lessonContent.length / charsPerToken);

  // RAG context: ~100 tokens per chunk (limited to 5), also affected by language
  const ragTokens = Math.min(ragChunks.length, 5) * Math.ceil(100 * multiplier);

  // Spec summary: ~100 tokens (also affected by language)
  const specTokens = Math.ceil(100 * multiplier);

  // Output estimate: 300-500 for simple cases, up to 1500 if FIXED with full content
  const outputTokens = 500;

  return systemTokens + contentTokens + ragTokens + specTokens + outputTokens;
}
