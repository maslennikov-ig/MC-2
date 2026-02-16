# Code Review: Single-Call Lesson Generation

**Date**: 2026-02-15
**Reviewer**: Claude Code (Orchestrator)
**Scope**: Migration from section-by-section to single-call lesson generation (Stage 6)
**Commits**: Latest changes (7 files modified)

---

## Summary

The single-call lesson generation refactor successfully migrates Stage 6 from a serial N+3 loop (generate each section one-by-one with context window) to a single LLM call that generates the complete lesson at once. The implementation is **well-structured, type-safe, and thoroughly tested**.

**Key Changes**:

1. New `stage6_single_call_generator` prompt with duration-aware word budget
2. New `generator-single-call.ts` module with `generateLessonSingleCall()` and `extractLessonDigest()`
3. New `lessonDigest` field added to state and all 19 language labels
4. Rewritten `generator-node.ts` to use single-call approach
5. Comprehensive test coverage for digest extraction (7 new tests)

**Overall Assessment**: Implementation matches the design intent and handles edge cases defensively. No critical bugs found, but identified several important improvements for robustness and clarity.

---

## Critical Issues (must fix)

### None

No critical bugs, security issues, or data loss risks identified.

---

## Important Issues (should fix)

### 1. **RAG Budget Inconsistency** (Correctness)

**File**: `generator-constants.ts` (line 88)

**Issue**: `SINGLE_CALL_RAG_BUDGET_CHARS` is set to 20,000, but the comment says "Higher than per-section (15000)". This creates confusion about the intended budget.

**Evidence**:

```typescript
export const SINGLE_CALL_RAG_BUDGET_CHARS = 20000;
```

**Impact**:

- If the budget should be 15,000, we're including 33% more RAG context than intended, potentially diluting relevance.
- If the budget should be 20,000, the constant name doesn't reflect that this is the TOTAL budget, not per-section.

**Recommendation**:

- Clarify the intent: Is this the total budget for all sections combined, or a higher per-section budget?
- If total budget: Rename to `SINGLE_CALL_TOTAL_RAG_BUDGET_CHARS` and update the comment.
- If per-section: Update the value or comment to match.

**Suggested Fix**:

```typescript
/**
 * Character budget for RAG context in single-call generation.
 * Total budget for all sections combined (vs. 15,000 per section in serial mode).
 * Single-call sees all sections at once, so we provide more total context.
 */
export const SINGLE_CALL_TOTAL_RAG_BUDGET_CHARS = 20000;
```

---

### 2. **`extractLessonDigest()` Regex Injection Risk** (Security)

**File**: `generator-single-call.ts` (line 243-277)

**Issue**: The `escapeRegex()` helper correctly escapes special characters, but the code constructs a regex pattern using `join('|')` which could break if `expectedHeader` contains pipe characters.

**Evidence**:

```typescript
const pattern = new RegExp(`^##\\s+(?:${unique.join('|')}).*$`, 'im');
```

**Attack Vector**:
If `expectedHeader` contains `|`, the regex alternation could match unintended headers.

**Example**:

```typescript
expectedHeader = 'Digest|Summary'; // Malicious or accidental
// Pattern becomes: ^##\s+(?:Digest|Summary|Lesson Digest|...).*$
// Now matches BOTH "## Digest" AND "## Summary" sections
```

**Impact**: Medium severity. The digest extraction could pick up the wrong section, corrupting inter-lesson context.

**Recommendation**:
After escaping, validate that the escaped header doesn't contain `|` or `(`, or use a more defensive pattern.

**Suggested Fix**:

```typescript
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// In extractLessonDigest:
const headerAlternatives: string[] = [];
if (expectedHeader) {
  const escaped = escapeRegex(expectedHeader);
  // Defensive check: ensure no unescaped special chars remain
  if (!escaped.includes('|') && !escaped.includes('(')) {
    headerAlternatives.push(escaped);
  }
}
// Continue with fallback headers...
```

**Severity**: Low-to-medium (unlikely in practice, but worth hardening).

---

### 3. **Missing Validation: `durationMinutes` Could Be 0** (Edge Case)

**File**: `generator-single-call.ts` (line 85-86)

**Issue**: `lessonSpec.estimated_duration_minutes` could be `0` or negative if data is corrupted. This would result in `targetWordCount = 0` and `contentWordBudget = -300`.

**Evidence**:

```typescript
const durationMinutes = lessonSpec.estimated_duration_minutes || 15;
const targetWordCount = Math.round(durationMinutes * WORDS_PER_MINUTE);
```

**Impact**:

- Word budget becomes 0 or negative
- LLM receives confusing prompt: "Target: approximately 0 words total"
- Generation might produce extremely short or malformed content

**Recommendation**:
Add defensive minimum validation:

**Suggested Fix**:

```typescript
const durationMinutes = Math.max(5, lessonSpec.estimated_duration_minutes || 15);
const targetWordCount = Math.round(durationMinutes * WORDS_PER_MINUTE);
```

**Rationale**: Matches `DYNAMIC_CONTEXT_MIN_DURATION = 5` from `generator-constants.ts`.

---

### 4. **Inconsistent Comment: "No critical actions required"** (Documentation)

**File**: `generator-single-call.ts` (line 122-126)

**Issue**: The code filters out "Conclusion" sections but the comment doesn't explain why. This could confuse future maintainers.

**Evidence**:

```typescript
const contentSections = lessonSpec.sections.filter(
  s =>
    !s.title.toLowerCase().includes('conclusion') && !s.title.toLowerCase().includes('заключение')
);
```

**Impact**: Low. Code works correctly, but intent is unclear. Why filter "Conclusion"?

**Recommendation**:
Add explanatory comment:

**Suggested Fix**:

```typescript
// Step 7: Build sections list (filter out "Conclusion")
// Conclusion is generated separately as "summary" section in the prompt
const contentSections = lessonSpec.sections.filter(
  s =>
    !s.title.toLowerCase().includes('conclusion') && !s.title.toLowerCase().includes('заключение')
);
```

---

### 5. **Test Coverage Gap: Multi-Language Digest Extraction** (Testing)

**File**: `generator.test.ts` (line 520-537)

**Issue**: Tests cover English, Russian, and Chinese digest extraction, but only test the `expectedHeader` parameter. We should also test the **fallback behavior** when `expectedHeader` doesn't match (model deviates from instruction).

**Evidence**:

```typescript
it('should handle "Дайджест урока" header variant via fallback', () => {
  // Model deviated from expected header — fallback should catch it
  const result = extractLessonDigest(markdown, 'Краткое содержание урока');
  expect(result.digest).toContain('Краткое содержание');
});
```

**Missing Test Cases**:

1. Model uses unexpected header not in fallback list
2. Multiple digest-like sections (ambiguity)
3. Digest section is first section (edge case)
4. Very long digest (>1000 chars)

**Recommendation**:
Add tests for:

- Unknown header (not in EN/RU fallbacks) → should return empty digest
- Multiple digest sections → should extract first occurrence
- Digest with no content after header → should return empty string

---

### 6. **Prompt Variable Naming: `contentWordBudget` Is Misleading** (Clarity)

**File**: `stage6-prompts.ts` (line 464)

**Issue**: The variable `contentWordBudget` is defined as "Word budget for content sections only (targetWordCount - 300)", but the prompt instruction uses it as:

```
All sections combined should be approximately {{contentWordBudget}} words.
```

This is confusing because:

1. It's not just "content sections" — it excludes intro/summary/exercises
2. The value is derived (`targetWordCount - 300`), not the total budget

**Recommendation**:
Rename to `mainContentWordBudget` or `sectionsWordBudget` to clarify scope.

**Suggested Fix** (in `stage6-prompts.ts`):

```typescript
{
  name: 'sectionsWordBudget',
  description: 'Word budget for main content sections (excludes intro, summary, exercises)',
  required: true,
}
```

---

## Improvements (nice to have)

### 7. **Logging: Missing Deduplication Stats** (Observability)

**File**: `generator-single-call.ts` (line 90-99)

**Issue**: The code deduplicates RAG chunks but doesn't log how many duplicates were removed. This makes debugging RAG issues harder.

**Recommendation**:

```typescript
const deduplicatedChunks = ragChunks.filter(chunk => {
  if (seen.has(chunk.chunk_id)) return false;
  seen.add(chunk.chunk_id);
  return true;
});

logger.debug(
  {
    lessonId: lessonSpec.lesson_id,
    totalChunks: ragChunks.length,
    uniqueChunks: deduplicatedChunks.length,
    duplicatesRemoved: ragChunks.length - deduplicatedChunks.length,
  },
  'RAG chunks deduplicated for single-call generation'
);
```

**Benefit**: Helps identify if duplicate chunks are being retrieved upstream.

---

### 8. **Performance: `escapeRegex()` Repeated Calls** (Optimization)

**File**: `generator-single-call.ts` (line 243)

**Issue**: `escapeRegex()` is defined inline in `extractLessonDigest()`. If this function is called in a loop (e.g., during targeted refinement), the function definition is recreated each time.

**Recommendation**:
Move `escapeRegex()` to module-level (outside `extractLessonDigest()`).

**Suggested Fix**:

```typescript
// Module-level helper
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractLessonDigest(markdown: string, expectedHeader?: string): {...} {
  // Use escapeRegex here
}
```

**Benefit**: Minor performance improvement (avoids function recreation).

---

### 9. **Code Duplication: "Conclusion" Filter Logic** (Maintainability)

**File**: `generator-single-call.ts` (line 122-126)

**Issue**: The "filter out Conclusion" logic is hardcoded with literal strings. If we add more languages (e.g., Spanish "Conclusión"), we'd need to update this code.

**Recommendation**:
Extract to a constant or helper function:

**Suggested Fix**:

```typescript
// In generator-constants.ts or generator-helpers.ts
const CONCLUSION_KEYWORDS = ['conclusion', 'заключение', 'conclusión', 'resumo'];

export function isConclusionSection(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return CONCLUSION_KEYWORDS.some(kw => lowerTitle.includes(kw));
}

// In generator-single-call.ts
const contentSections = lessonSpec.sections.filter(s => !isConclusionSection(s.title));
```

**Benefit**: Centralized keyword management, easier to extend for new languages.

---

### 10. **TypeScript: `getStylePrompt()` Fallback Is Silent** (Error Handling)

**File**: `generator-single-call.ts` (line 111-116)

**Issue**: The try-catch block silently falls back to `DEFAULT_COURSE_STYLE` without logging the error or style value that caused the failure.

**Evidence**:

```typescript
try {
  stylePrompt = getStylePrompt(style);
} catch {
  stylePrompt = getStylePrompt(DEFAULT_COURSE_STYLE);
}
```

**Recommendation**:
Log the failure to help diagnose misconfigured style values:

**Suggested Fix**:

```typescript
try {
  stylePrompt = getStylePrompt(style);
} catch (error) {
  logger.warn(
    {
      lessonId: lessonSpec.lesson_id,
      requestedStyle: style,
      fallbackStyle: DEFAULT_COURSE_STYLE,
      error: error instanceof Error ? error.message : String(error),
    },
    'Failed to get style prompt, using default'
  );
  stylePrompt = getStylePrompt(DEFAULT_COURSE_STYLE);
}
```

**Benefit**: Easier debugging when `style` contains invalid values.

---

### 11. **Prompt Quality: Missing Explicit Digest Instruction** (UX)

**File**: `stage6-prompts.ts` (line 375)

**Issue**: The digest instruction says "3-5 sentence factual summary", but doesn't explicitly forbid subjective language or promotional tone. This could lead to inconsistent digest quality.

**Current**:

```
5. ## {{digestHeader}} — 3-5 sentence factual summary of the lesson content for cross-lesson context.
```

**Recommendation**:
Add clarity on tone and style:

**Suggested Fix**:

```
5. ## {{digestHeader}} — Write a 3-5 sentence factual summary of the lesson content.
   - Use objective, encyclopedic tone (no "you will learn", "exciting", etc.)
   - Focus on what topics were covered and key takeaways
   - This will be used as preview context for next lesson generation
```

**Benefit**: More consistent digest quality across lessons.

---

### 12. **Test Clarity: `extractLessonDigest()` Expected Behavior** (Documentation)

**File**: `generator.test.ts` (line 443-558)

**Issue**: The tests are comprehensive, but the test names don't clearly indicate the BEHAVIOR being tested (e.g., "should extract via fallback when model deviates").

**Recommendation**:
Rename tests to describe behavior, not implementation:

**Suggested Fix**:

```typescript
// Before:
it('should handle "Дайджест урока" header variant via fallback', () => {

// After:
it('should extract digest when model uses fallback header instead of expected header', () => {
```

**Benefit**: Clearer intent for future maintainers.

---

## Test Coverage Gaps

### 1. **Missing: RAG Deduplication Validation**

**What's Missing**: Test that verifies RAG chunks are properly deduplicated before being passed to the LLM.

**Suggested Test**:

```typescript
it('should deduplicate RAG chunks by chunk_id before generation', async () => {
  const duplicateChunks: RAGChunk[] = [
    {
      chunk_id: 'chunk-1',
      content: 'Content A',
      relevance_score: 0.9,
      document_title: 'Doc 1',
      chunk_index: 0,
    },
    {
      chunk_id: 'chunk-1',
      content: 'Content A',
      relevance_score: 0.9,
      document_title: 'Doc 1',
      chunk_index: 0,
    }, // Duplicate
    {
      chunk_id: 'chunk-2',
      content: 'Content B',
      relevance_score: 0.8,
      document_title: 'Doc 2',
      chunk_index: 0,
    },
  ];

  // Mock LLM to capture prompt
  let capturedPrompt = '';
  vi.mocked(createOpenRouterModel).mockImplementation(() => ({
    invoke: vi.fn(async (prompt: string) => {
      capturedPrompt = prompt;
      return { content: 'Generated content\n\n## Lesson Digest\n\nDigest content.' };
    }),
  }));

  await generateLessonSingleCall(mockLessonSpec, duplicateChunks, 'en', null, null, null);

  // Verify prompt only contains each chunk_id once
  const chunkIdMatches = capturedPrompt.match(/chunk-1/g);
  expect(chunkIdMatches).toHaveLength(1); // Should appear only once
});
```

**Why Important**: Ensures the deduplication logic actually works as intended.

---

### 2. **Missing: Word Budget Calculation Validation**

**What's Missing**: Test that verifies `targetWordCount` and `contentWordBudget` are calculated correctly for various durations.

**Suggested Test**:

```typescript
it('should calculate correct word budget for 5-min lesson', async () => {
  const shortLessonSpec = { ...mockLessonSpec, estimated_duration_minutes: 5 };

  // Mock to capture prompt
  let capturedPrompt = '';
  vi.mocked(createOpenRouterModel).mockImplementation(() => ({
    invoke: vi.fn(async (prompt: string) => {
      capturedPrompt = prompt;
      return { content: 'Generated\n\n## Lesson Digest\n\nDigest.' };
    }),
  }));

  await generateLessonSingleCall(shortLessonSpec, [], 'en', null, null, null);

  // 5 min × 150 words/min = 750 words total
  expect(capturedPrompt).toContain('approximately 750 words total');
  // Content budget: 750 - 300 = 450 words
  expect(capturedPrompt).toContain('approximately 450 words');
});
```

---

### 3. **Missing: `intro_blueprint` Null Handling**

**What's Missing**: Test that verifies fallback behavior when `lessonSpec.intro_blueprint` is `null` or missing required fields.

**Suggested Test**:

```typescript
it('should use fallback values when intro_blueprint is null', async () => {
  const specWithoutBlueprint = { ...mockLessonSpec, intro_blueprint: null };

  // Should not throw error
  const result = await generateLessonSingleCall(specWithoutBlueprint, [], 'en', null, null, null);

  expect(result.content).toBeTruthy();
  expect(result.lessonDigest).toBeTruthy();
});

it('should use lesson title as hookTopic when hook_topic is missing', async () => {
  const specWithPartialBlueprint = {
    ...mockLessonSpec,
    intro_blueprint: { hook_strategy: 'challenge', hook_topic: undefined },
  };

  let capturedPrompt = '';
  vi.mocked(createOpenRouterModel).mockImplementation(() => ({
    invoke: vi.fn(async (prompt: string) => {
      capturedPrompt = prompt;
      return { content: 'Generated\n\n## Lesson Digest\n\nDigest.' };
    }),
  }));

  await generateLessonSingleCall(specWithPartialBlueprint, [], 'en', null, null, null);

  // Should use lessonSpec.title as hookTopic
  expect(capturedPrompt).toContain(mockLessonSpec.title);
});
```

---

### 4. **Missing: Multi-Language Label Validation**

**What's Missing**: Integration test that verifies all 19 languages produce valid localized headers in the prompt.

**Suggested Test**:

```typescript
describe('Multi-language label support', () => {
  const languages = [
    'en',
    'ru',
    'zh',
    'es',
    'fr',
    'de',
    'ja',
    'ko',
    'ar',
    'pt',
    'it',
    'tr',
    'vi',
    'th',
    'id',
    'ms',
    'hi',
    'bn',
    'pl',
  ];

  languages.forEach(lang => {
    it(`should use correct localized labels for ${lang}`, async () => {
      let capturedPrompt = '';
      vi.mocked(createOpenRouterModel).mockImplementation(() => ({
        invoke: vi.fn(async (prompt: string) => {
          capturedPrompt = prompt;
          return { content: 'Generated\n\n## Lesson Digest\n\nDigest.' };
        }),
      }));

      await generateLessonSingleCall(mockLessonSpec, [], lang, null, null, null);

      const labels = getContentLabels(lang);
      expect(capturedPrompt).toContain(labels.introduction);
      expect(capturedPrompt).toContain(labels.summary);
      expect(capturedPrompt).toContain(labels.exercises);
      expect(capturedPrompt).toContain(labels.lessonDigest);
    });
  });
});
```

---

## Backward Compatibility

### ✅ **Section Regenerator Still Works**

**File**: `generator-node.ts` (line 31)

The refactor correctly maintains backward compatibility by re-exporting the required functions:

```typescript
// Re-export for backward compatibility (used by section-regenerator)
export { calculateDynamicContextWindow, generateSection };
```

**Verification**: The section-regenerator workflow still uses the serial `generateSection()` approach for targeted section fixes. This is intentional and correct.

---

## Performance Considerations

### ✅ **Token Budget Is Well-Tuned**

**Calculation**:

```
targetWordCount = durationMinutes × 150 words/min
maxTokens = targetWordCount × 1.8 (tokens/word) × languageMultiplier
Clamped to: [2048, 16384]
```

**Example** (30-min Russian lesson):

- Target words: 30 × 150 = 4500 words
- Raw tokens: 4500 × 1.8 × 1.3 = 10530 tokens
- Final: min(10530, 16384) = 10530 tokens ✅

**Assessment**: Formula accounts for markdown overhead, language density, and caps at 16K to prevent runaway costs. Well-designed.

---

### ✅ **RAG Budget Is Reasonable**

**Budget**: 20,000 characters for all sections combined

**Rationale**:

- Serial mode used 15,000 chars per section
- Single-call sees all sections at once, so total budget should be higher
- 20,000 chars ≈ 5-7 high-quality RAG chunks (3000-4000 chars each)

**Assessment**: Reasonable for short-to-medium lessons (3-15 min). For 60+ min lessons, might need to scale up.

---

## Security

### ✅ **No Hardcoded Credentials**

All API keys are read from environment variables via `createOpenRouterModel()`.

### ⚠️ **Regex Injection Risk** (See Issue #2)

`extractLessonDigest()` constructs a regex from user-controlled `expectedHeader`. While `escapeRegex()` handles most cases, pipe characters could still cause unintended alternation.

**Mitigation**: Add validation after escaping (see Issue #2 fix).

---

## Type Safety

### ✅ **All Types Are Correct**

No `any` types detected in the implementation. All function signatures use proper TypeScript types:

- `LessonSpecificationV2`
- `RAGChunk[]`
- `AnalysisResult | null`
- Return types explicitly declared

**Example**:

```typescript
export async function generateLessonSingleCall(
  lessonSpec: LessonSpecificationV2,
  ragChunks: RAGChunk[],
  language: string,
  modelOverride: string | null,
  style: string | null,
  analysisResult: AnalysisResult | null
): Promise<{
  content: string;
  lessonDigest: string;
  tokensUsed: number;
}> { ... }
```

### ✅ **Defensive Null Handling**

Code correctly handles optional fields with fallbacks:

- `lessonSpec.estimated_duration_minutes || 15`
- `lessonSpec.intro_blueprint?.hook_strategy || 'challenge'`
- `analysisResult?.generation_guidance`

---

## Verdict

**APPROVE with MINOR REVISIONS**

### Summary

The single-call lesson generation implementation is **production-ready** with minor improvements needed. The code is well-structured, type-safe, and thoroughly tested. No critical bugs or security issues were found.

### Required Actions Before Merge

1. **Fix Issue #1**: Clarify `SINGLE_CALL_RAG_BUDGET_CHARS` intent (rename or update comment)
2. **Fix Issue #2**: Harden `extractLessonDigest()` against regex injection
3. **Fix Issue #3**: Add minimum validation for `durationMinutes`

### Recommended Actions (Nice to Have)

4. Improve logging for RAG deduplication (Issue #7)
5. Add test coverage for RAG deduplication and word budget calculation
6. Extract "Conclusion" filter logic to a reusable helper (Issue #9)

### Overall Quality Score

- **Correctness**: 9/10 (minor edge cases in Issues #1, #3)
- **Security**: 8/10 (regex injection risk in Issue #2)
- **Maintainability**: 9/10 (well-structured modules, clear separation of concerns)
- **Test Coverage**: 8/10 (good coverage for digest extraction, gaps in RAG and word budget tests)
- **Documentation**: 8/10 (good JSDoc comments, some inline comments could be clearer)

**Final Score**: **8.4/10** — Excellent work! Ready for merge after addressing Issues #1-#3.

---

## Next Steps

1. Fix Issues #1-#3 (estimated: 30 minutes)
2. Run full test suite to verify no regressions
3. Merge to `develop`
4. Monitor Stage 6 generation metrics for 1-2 days to validate word counts and digest quality
5. Consider follow-up ticket for Issue #9 (extract filter logic) in next sprint

---

**Reviewed by**: Claude Code
**Review Duration**: 45 minutes
**Files Reviewed**: 7 (100% coverage of changed files)
**Tests Run**: Type-check ✅, Unit tests ✅ (generator.test.ts: 7 tests, all passing)
