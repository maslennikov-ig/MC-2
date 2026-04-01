# Code Review: Content Quality Fixes (Stage 6)

**Date**: 2026-04-01
**Reviewer**: Senior Code Reviewer (automated)
**Branch**: develop
**Scope**: Fixes for 10 systemic content quality issues in Stage 6 lesson generation

---

## Executive Summary

The changeset addresses 8 of 10 reported quality issues through a combination of prompt engineering, post-generation safety nets, and heuristic filter additions. The implementation is well-structured, follows existing patterns, and passes both type-check and all unit tests. One important gap exists: the `checkHeaderLanguage` filter is implemented but not wired into the filter orchestrator, making it a dead code path. Several minor issues and one moderate risk are documented below.

**Overall verdict**: Approve with required fixes for one Important issue (B1).

---

## Files Reviewed

### Prompt Changes

- `packages/course-gen-platform/src/shared/prompts/stage6/single-call-generator.ts`
- `packages/course-gen-platform/src/shared/prompts/prompt-contracts.ts`

### Code Changes

- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-helpers.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts`

### New/Modified Filters

- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/structural-checks.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/content-quality.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/duplication-checks.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/orchestrator.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/types.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/filters/index.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts`

### Parser Updates

- `packages/course-gen-platform/src/stages/stage6-lesson-content/utils/markdown-parser.ts`
- `packages/web/lib/markdown-content-parser.ts`

### Test Updates

- `packages/course-gen-platform/tests/unit/shared/prompts/prompt-contract-validation.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/judge/duplication-checks.test.ts`

---

## Issue-by-Issue Correctness Analysis

### Issue 1: Repetitive analogy across lessons

**Fix**: Analogy rotation via `lessonIndex` in `formatGenerationGuidanceXML()`.
**Assessment**: Correct. Uses modulo rotation `(lessonIndex - 1) % analogies.length` to pick a different primary analogy per lesson. The fallback path (no lessonIndex or single analogy) preserves existing behavior. The `lessonIndex` is sourced from `lesson_context.course_position.lesson_index_in_course`, which is 1-based -- the `- 1` makes the modulo 0-based, so lesson 1 gets analogy 0, which is correct.

### Issue 2: Excessive [!TIP] callouts

**Fix**: New `checkCalloutDensity` filter + prompt instruction "use sparingly for genuinely important tips."
**Assessment**: Correct. Filter thresholds are reasonable (0-2 pass, 3-4 major, 5+ critical). The prompt change reinforces the constraint at generation time. Weighted at 0.03 in FILTER_WEIGHTS.

### Issue 3: Code blocks in non-technical courses

**Fix**: New `checkCodeBlockAudienceMatch` filter + conditional `{{codeBlockInstruction}}` in prompt.
**Assessment**: Correct. Code block instruction is only injected when `content_archetype === 'code_tutorial'`. The filter excludes Mermaid blocks correctly via `CODE_FENCE_NON_MERMAID_REGEX`. Weighted at 0.04.

### Issue 4: Duplicate exercises

**Fix**: Split `isTemplateHeavySection` into `isDigestSection` (fully exempt) and `isExerciseSection` (higher threshold 0.5).
**Assessment**: Correct. Previously both exercise and digest sections were fully exempt from overlap detection. Now exercises use a 0.5 threshold instead of full exemption, which catches genuine duplicate exercises while tolerating format boilerplate.

### Issue 5: English text in Russian courses

**Fix**: New `checkHeaderLanguage` filter.
**Assessment**: Partially implemented. The function is defined and works correctly (checks for Latin-dominant headers with >2 words), but **it is NOT wired into the orchestrator** (`runHeuristicFilters`) and NOT exported via `index.ts` or `heuristic-filter.ts`. This is dead code. See B1 below.

### Issue 6: Content truncation in callouts

**Fix**: Added Check 5 in `checkContentTruncation` for callout block truncation.
**Assessment**: Correct. Detects callout blocks where the last line is short (<20 chars) and lacks terminal punctuation -- a reliable truncation signal.

### Issue 7: Duplicate section titles

**Fix**: Exact-match pre-check (B4) with `similarity: 1.0` and escalated severity to `critical`.
**Assessment**: Correct. The exact-match pre-check skips the expensive Levenshtein distance calculation for identical headers. Severity escalation for exact duplicates is appropriate.

### Issue 8: Unwanted conclusion sections

**Fix**: `stripUnwantedConclusionSections` post-processor + conclusion-like headings added to both parsers.
**Assessment**: Correct. The function properly protects `lessonDigest`, `exercises`, and `introduction` headers before checking for conclusion patterns. The parser updates in both `markdown-parser.ts` and `markdown-content-parser.ts` (web) are kept in sync.

---

## Issue Categories

### Critical (must fix)

None found.

### Important (should fix)

**B1: `checkHeaderLanguage` is not wired into the orchestrator**

The `checkHeaderLanguage` function in `content-quality.ts` is implemented but:

1. NOT called from `runHeuristicFilters()` in `orchestrator.ts`
2. NOT exported from `index.ts`
3. NOT re-exported from `heuristic-filter.ts`
4. Has no weight in `FILTER_WEIGHTS`
5. Has no metric field in `HeuristicFilterResult.metrics`

This means Issue 5 (English headers in non-English courses) is NOT actually being caught by the filter pipeline. It will only be addressed at the prompt level (via the existing `outputLanguage` instruction), but the filter safety net is missing.

**Action required**: Wire `checkHeaderLanguage` into the orchestrator, add its weight to `FILTER_WEIGHTS` (will require rebalancing), add the metric field to `HeuristicFilterResult`, export it from both barrel files, and add unit tests.

### Suggestions (nice to have)

**S1: `let` vs `const` in `stripUnwantedConclusionSections`**

Line 669 of `generator-single-call.ts`:

```typescript
let strippedHeaders: string[] = [];
```

This array is only `.push()`-ed into, never reassigned. Should be `const` per project conventions.

**S2: Conclusion headings list is English/Russian only**

The `conclusionHeadings` array in `stripUnwantedConclusionSections` and `SUMMARY_HEADINGS` in `markdown-content-parser.ts` only cover English and Russian conclusion terms. For other supported languages (Spanish "Resumen", French "Resume", German "Zusammenfassung"), conclusion sections will not be stripped. This is acceptable if the primary use case is Russian/English, but worth noting for future multilingual expansion.

**S3: Missing unit tests for new filters**

`checkCalloutDensity`, `checkCodeBlockAudienceMatch`, and `checkHeaderLanguage` have no dedicated unit tests. The prompt contract test was updated for `codeBlockInstruction`, and the duplication tests cover the exercise/digest split -- but the structural-check additions lack isolated test coverage. Consider adding tests for edge cases:

- Callouts inside code blocks (should not count)
- Mermaid blocks not counted as code blocks
- Mixed-script headers (e.g., "API Ключевые концепции" -- 2 words Latin, 2 Cyrillic)

**S4: Duplicated conclusion heading lists**

The same conclusion-like headings appear in three places:

1. `stripUnwantedConclusionSections` in `generator-single-call.ts` (lines 643-655)
2. `SUMMARY_TERMS` in `markdown-parser.ts` (lines 95-102)
3. `SUMMARY_HEADINGS` in `markdown-content-parser.ts` (lines 51-63)

Consider extracting these to a shared constant in `@megacampus/shared-types` to avoid drift. Currently they are mostly aligned but not identical (the parser lists include regex patterns while the stripper uses plain strings).

**S5: `isDigestSection` regex overlap with `isExerciseSection`**

In `duplication-checks.ts`, `isDigestSection` matches `/(digest|краткое содержание|lesson digest)/i`. The term "lesson digest" is redundant because "digest" already matches it. Minor, no functional impact.

---

## Verification Results

| Check                                                                  | Result                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| TypeScript type-check (`pnpm --filter course-gen-platform type-check`) | PASS                                              |
| Prompt contract tests (57 tests)                                       | PASS                                              |
| Duplication check tests (10 tests)                                     | PASS                                              |
| FILTER_WEIGHTS sum                                                     | 1.0000 (correct)                                  |
| New exports in `index.ts` and `heuristic-filter.ts`                    | PASS (for calloutDensity, codeBlockAudienceMatch) |
| `checkHeaderLanguage` export                                           | MISSING (not exported or wired)                   |

---

## Architecture and Design Assessment

**Strengths**:

- The prompt-engineering + filter two-layer approach is sound: prompt changes reduce defect generation, filters catch what slips through
- Analogy rotation is elegant and minimal -- it leverages existing data (lesson index) without additional state
- The conclusion stripping safety net correctly protects legitimate sections (digest, exercises, introduction) using localized labels
- `FILTER_WEIGHTS` were properly rebalanced to sum to 1.0 after adding two new weights
- Test coverage for the duplication refactor is thorough, including edge cases (exact duplicates, exercise threshold, digest exemption)

**Concerns**:

- The `checkHeaderLanguage` dead code path suggests incomplete implementation or a missed integration step
- Three separate conclusion heading lists create a maintenance burden (see S4)

---

## Consistency with Existing Patterns

The implementation follows established patterns well:

- Filter functions return `FilterCheckResult & { ...extended fields }` -- consistent with all other filters
- Orchestrator uses `accumulateFilterResult()` helper -- consistent
- Prompt variable added to both TypeScript interface and prompt metadata -- consistent with contract-first approach
- `let` unused reassignment (S1) is the only minor style deviation

---

## Risk Assessment

| Risk                                                               | Likelihood | Impact | Mitigation                                                                     |
| ------------------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------ |
| `stripUnwantedConclusionSections` strips legitimate content        | Low        | Medium | Protected headings check; only matches exact conclusion terms via `startsWith` |
| Analogy rotation produces repetition with small analogy sets (1-2) | Low        | Low    | Fallback path preserves original behavior for single analogy                   |
| `checkHeaderLanguage` not wired (B1)                               | Confirmed  | Medium | English headers in Russian courses will not trigger filter failures            |
| Exercise overlap threshold (0.5) too high/too low                  | Low        | Low    | Can be tuned via constant; test validates boundary behavior                    |

---

## Recommendations

1. **Required**: Wire `checkHeaderLanguage` into the orchestrator, exports, and weight system (B1)
2. **Recommended**: Add unit tests for `checkCalloutDensity` and `checkCodeBlockAudienceMatch` (S3)
3. **Consider**: Extract conclusion heading constants to shared-types (S4)
4. **Minor**: Change `let strippedHeaders` to `const` (S1)
