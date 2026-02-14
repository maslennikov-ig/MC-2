# Plan: Single-Call Lesson Generation (Stage 6)

## Context

Stage 6 generates lesson content via section-by-section approach: 1 intro + N section calls + 1 summary + 1 exercises = N+3 LLM calls per lesson. For a 5-min lesson with 6 sections, that's 9 LLM calls, each told "Aim for 500-1000 words" — producing 5000+ words instead of ~750.

A/B tests (`scripts/test-single-call-generation.ts`) proved single-call generates 661-880 words for 5-min lessons (target ~750) with quality 7-8.5/10, fewer hallucinations, and better formatting than multi-call approaches.

Additionally, the current "lesson digest" (`summary_preview`) is just the first 2 learning objectives joined — not a real content summary. This causes discrepancies between the digest and actual lesson content. The single-call approach generates a real digest as part of the output.

## Files to Modify

| File                                                                        | Action                                    |
| --------------------------------------------------------------------------- | ----------------------------------------- |
| `src/shared/prompts/stage6-prompts.ts`                                      | Add `stage6_single_call_generator` prompt |
| `src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts` | **NEW** — single-call generation function |
| `src/stages/stage6-lesson-content/nodes/generator/generator-constants.ts`   | Add single-call constants                 |
| `src/stages/stage6-lesson-content/nodes/generator-node.ts`                  | Replace serial loop with single-call      |
| `src/stages/stage6-lesson-content/state.ts`                                 | Add `lessonDigest` field                  |

### Files NOT modified (must stay working)

| File                                      | Why                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `generator-section.ts`                    | Used by section-regenerator for targeted fixes after judge                    |
| `generator-content.ts`                    | Keep for reference; imports stay for backward compat                          |
| `generator-helpers.ts`                    | `formatInterLessonContextXML()`, `formatGenerationGuidanceXML()` reused as-is |
| Self-reviewer, Judge, Section-regenerator | All parse H2 boundaries — agnostic to generation method                       |

## Step 1: New Prompt — `stage6_single_call_generator`

**File**: `src/shared/prompts/stage6-prompts.ts`

Add to `stage6Prompts` array. Based on tested prompt from `buildSingleCallPrompt()` but enhanced with production features.

**Key prompt blocks**:

- `<lesson_specification>` — title, description, duration, target_word_count, audience, tone, difficulty, LOs, sections_to_cover, intro_blueprint
- `<reference_material>` — `{{ragContext}}` (ALL RAG chunks for the lesson, not per-section)
- `<rag_validation>` — instructions to verify chunk relevance before using (copied from existing `stage6_serial_generator`)
- `{{interLessonContext}}` — XML from `formatInterLessonContextXML()` (previous/next lesson info, covered concepts)
- `{{generationGuidance}}` — XML from `formatGenerationGuidanceXML()` (analogies, examples, assessment approach from Stage 4)
- `<content_style>` — `{{stylePrompt}}`
- `<visual_toolkit>` — compact version (Mermaid, LaTeX, callouts, tables, code blocks)
- `<output_language>` — mandatory language directive
- `<task>` — structure, word budget, anti-repetition rules, exercise format, lesson digest instruction

**Task block structure**:

```
Write a COMPLETE lesson for {{durationMinutes}}-minute reading session.
Target: ~{{targetWordCount}} words total (excluding exercises and digest).

STRUCTURE (## headers):
1. ## {{introductionHeader}} — Hook + LO preview (100-150 words)
2. Content sections — one ## per topic from sections_to_cover
3. ## {{summaryHeader}} — Recap + next steps (80-120 words)
4. ## {{exercisesHeader}} — Exactly 2 exercises with localized labels
5. ## Lesson Digest — 3-5 sentence factual summary of lesson content

CRITICAL RULES:
- Be concise. No recaps between sections. 1-sentence transitions max.
- Cover ALL topics proportionally to word budget.
- At least 1 visual element (diagram/table/callout) in the lesson.
- Use reference_material ONLY when relevant to the topic.
```

**Exercise format** uses localized labels: `{{exerciseLabel}}`, `{{taskLabel}}`, `{{hintLabel}}`, `{{sampleAnswerLabel}}`, etc. from `getContentLabels(language)`.

**Variables**: 20+ variables (all from existing helpers + new word budget vars).

## Step 2: Single-Call Constants

**File**: `src/stages/stage6-lesson-content/nodes/generator/generator-constants.ts`

```typescript
export const WORDS_PER_MINUTE = 150;
export const TOKENS_PER_WORD_RATIO = 1.8;
export const SINGLE_CALL_MIN_TOKENS = 2048;
export const SINGLE_CALL_MAX_TOKENS = 16384;
export const SINGLE_CALL_RAG_BUDGET_CHARS = 20000;
```

## Step 3: New Module — `generator-single-call.ts`

**File**: `src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts`

### Main function

```typescript
export async function generateLessonSingleCall(
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  language: string,
  modelOverride: string | null,
  style: string | null,
  analysisResult: AnalysisResult | null
): Promise<{
  content: string; // Full markdown WITHOUT digest section
  lessonDigest: string; // Extracted 3-5 sentence digest
  tokensUsed: number;
}>;
```

**Implementation**:

1. **Calculate word budget**: `durationMinutes * WORDS_PER_MINUTE`

2. **Prepare RAG context** (CRITICAL — user requirement):
   - Deduplicate all `ragChunks` by `chunk_id`
   - Sort by `relevance_score` descending
   - Format via `formatRAGContextXML(deduplicatedChunks, SINGLE_CALL_RAG_BUDGET_CHARS)`
   - This replaces per-section filtering — single-call sees ALL relevant chunks

3. **Prepare inter-lesson context**: `formatInterLessonContextXML(lessonSpec.lesson_context)`

4. **Prepare generation guidance**: `formatGenerationGuidanceXML(analysisResult)`

5. **Prepare style prompt**: `getStylePrompt(style)` with try/catch fallback

6. **Get localized labels**: `getContentLabels(language)` for all header/exercise labels

7. **Build sections list**: Filter out "Conclusion" sections, format as numbered list

8. **Render prompt** via `createPromptService().renderPrompt('stage6_single_call_generator', vars)`

9. **Calculate maxTokens**:

   ```
   clamp(ceil(targetWordCount * TOKENS_PER_WORD_RATIO * getTokenMultiplier(language)),
         SINGLE_CALL_MIN_TOKENS, SINGLE_CALL_MAX_TOKENS)
   ```

10. **Get model**: `ModelConfigService.getModelForPhase('stage_6_refinement')` with override

11. **Invoke LLM**: `createOpenRouterModel(modelId, temperature, maxTokens).invoke(prompt)`

12. **Extract tokens**: `extractTokenUsageWithFallback(response, prompt, language)`

13. **Extract digest**: Call `extractLessonDigest(responseContent)`

14. **Return** `{ content, lessonDigest, tokensUsed }`

### Digest extraction helper

```typescript
export function extractLessonDigest(markdown: string): {
  content: string; // markdown without digest
  digest: string; // extracted digest text
};
```

- Regex: `/^## (?:Lesson Digest|Краткое содержание урока).*$/im`
- Extract everything after this header until EOF
- Remove the digest section from markdown
- Trim both parts
- If no digest found: return original content + empty digest + log warning

## Step 4: Add `lessonDigest` to State

**File**: `src/stages/stage6-lesson-content/state.ts`

Add after `generatedContent`:

```typescript
/** Lesson digest — factual summary of generated content for next-lesson context */
lessonDigest: Annotation<string | null>({
  reducer: (x, y) => y ?? x,
  default: () => null,
}),
```

## Step 5: Rewrite `generatorNode()`

**File**: `src/stages/stage6-lesson-content/nodes/generator-node.ts`

Replace the function body (keep signature identical).

**New flow**:

1. Extract state fields (same as current)
2. Log trace at start (same)
3. Call `generateLessonSingleCall(lessonSpec, ragChunks, language, modelOverride, style, analysisResult)`
4. Run `runMermaidFixPipeline()` on full content (one call instead of per-section)
5. Run `validateGeneratedContent()` for prompt leakage
6. Calculate metrics (wordCount, H2 count)
7. Log trace at completion
8. Return: `{ generatedContent, lessonDigest, tokensUsed, durationMs, currentNode: 'selfReviewer' }`

**Removed**: serial section loop, accumulatedContent, per-section mermaid fix, per-section trace logs.

**Preserved**: `generateSection` re-export (for section-regenerator).

## Downstream Compatibility Verification

### Self-Reviewer

- Input: `state.generatedContent` (raw markdown string)
- Parses via `parseMarkdownSections()` looking for H2 headers
- Single-call output has identical H2 structure: `## Introduction`, `## [sections]`, `## Summary`, `## Exercises`
- **Result: Fully compatible, no changes needed**

### Judge (Heuristic Filters)

- Input: parsed via `parseMarkdownContent()` → `LessonContentBody`
- Checks: word count, required sections (intro/summary/exercises), keyword coverage, Flesch-Kincaid (EN only)
- Word count check is WARNING, not blocker
- Single-call output has same sections with proportionally correct sizes
- **Result: Fully compatible, no changes needed**

### Section-Regenerator

- Uses `generateSection()` from `generator-section.ts` for targeted fixes
- Receives specific section to regenerate + context from surrounding content
- `generateSection()` is NOT modified — still uses `stage6_serial_generator` prompt
- **Result: Fully compatible, no changes needed**

### Mermaid Fix Pipeline

- Currently runs per-section with `maxLLMFixes: 5` per lesson
- Will now run once on full content — same budget applies
- **Result: Fully compatible, no changes needed**

### Markdown Parsers

- `parseMarkdownSections()` — splits on `^## ` boundaries
- `parseMarkdownContent()` — extracts intro, sections, exercises, summary
- Both are agnostic to how content was generated
- **Result: Fully compatible, no changes needed**

## RAG Context Handling (Important)

**Current** (per-section): `filterChunksForSection(ragChunks, section.rag_context_id)` → max 5 chunks per section.

**New** (single-call): All RAG chunks deduplicated and included with `SINGLE_CALL_RAG_BUDGET_CHARS = 20000` limit. The prompt includes `<rag_validation>` instructions telling the model to verify chunk relevance before using content (same instructions as current `stage6_serial_generator`).

This is better because:

- Model sees full RAG context and can draw connections between sections
- No risk of relevant chunk being filtered out for wrong section
- RAG validation instructions prevent hallucination from irrelevant chunks

## Verification

1. **Unit tests**: `extractLessonDigest()` — correct extraction, missing digest, edge cases
2. **Type-check**: `pnpm type-check` — all types compile
3. **Integration test**: Run `pnpm tsx scripts/test-single-call-generation.ts --lessons 1.1,1.2,4.1,6.2` — verify output quality matches previous test results
4. **Full pipeline test**: Generate a lesson through the complete Stage 6 pipeline (generator → self-reviewer → judge) and verify all nodes process correctly
5. **Self-reviewer validation**: Check that self-reviewer PASS/FIXED/REGENERATE decisions work with single-call output
6. **Section-regenerator**: Trigger a section regeneration to verify `generateSection()` still works for targeted fixes
