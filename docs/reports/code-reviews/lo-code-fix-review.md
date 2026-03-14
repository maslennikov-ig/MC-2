# Code Review: LO-Code Reference Leak Fix

**Date:** 2026-03-11
**Reviewer:** Senior Code Reviewer (Claude Opus 4.6)
**BASE_SHA:** `31e681eb`
**HEAD_SHA:** `9e3c2d31`
**Branch:** `develop`
**Files Changed:** 5 files, +205 / -6 lines

---

## 1. Executive Summary

The implementation is a well-structured defense-in-depth fix that correctly addresses the problem of internal Learning Objective codes (LO-X.X-X) leaking into student-facing lesson content. The approach is sound: prompt-level prohibition + output sanitization + unit tests. The code is clean, well-documented, and follows established project patterns. All 23 tests pass and type-check is clean.

However, this review identified one **Important** issue with the regex (newline consumption), several **Suggestions** for hardening, and documented the conscious trade-offs around incomplete source-level fix and whitespace artifacts.

**Verdict:** Approve with one recommended fix (newline consumption in `\s*`).

---

## 2. Plan Alignment Analysis

### 2.1 Planned vs. Implemented

| Plan Item                                                                   | Status             | Notes                                          |
| --------------------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| Step 1: `stripLOCodes()` + `stripLOCodesWithLogging()` in strip-metadata.ts | DONE               | Exact regex from plan. Well-documented.        |
| Step 2: Update 3 OUTPUT FORMAT sections in fix-templates.ts                 | DONE               | Lines 316, 440, 557. Exact wording from plan.  |
| Step 3a: Integrate in `parsePatcherResponse()` (task-executor-helpers.ts)   | DONE               | Line 135, after `stripLLMMetadataWithLogging`. |
| Step 3b: Integrate in `executePatch()` (patcher/index.ts)                   | DONE               | Line 207, after `stripLLMMetadataWithLogging`. |
| Step 4: 13 unit tests in strip-llm-metadata.test.ts                         | DONE               | 13 new tests in `describe('stripLOCodes')`.    |
| Step 5: SQL cleanup of existing data                                        | DONE (out of band) | Via Supabase MCP, not in git. Acceptable.      |

**All 5 planned steps are fully implemented. No deviations from the plan.**

### 2.2 Known Intentional Omissions

The plan explicitly acknowledged that `formatLearningObjectives()` in `fix-templates.ts:143` still formats LO IDs as `[${lo.id}]` in the prompt context sent to the LLM. This was an intentional decision: those IDs serve a purpose in the prompt (helping the LLM map objectives to content) and the defense-in-depth `stripLOCodes()` catches any leakage into the output.

The same pattern exists in 4 other files that were not changed:

- `prompt-cache.ts:628`
- `clev-voter.ts:198`
- `cascade/single-judge.ts:26`
- `self-reviewer/self-reviewer-prompt.ts:381`

These files format LO IDs for evaluation/judging contexts (not content generation), so they are correctly left unchanged. The output-level stripping in the two patcher code paths covers the content generation pipeline.

---

## 3. Regex Correctness Analysis

### 3.1 The Pattern

```
/\*{0,2}\[?\(?\bLO-\d+\.\d+[-.]?\d*\b\)?\]?\*{0,2}\s*[---:,\-]?\s*/g
```

### 3.2 Verified Correct Behavior

| Input              | Output   | Correct?            |
| ------------------ | -------- | ------------------- |
| `**LO-6.2.2** ---` | `""`     | Yes                 |
| `**LO-1.3-2**`     | `""`     | Yes                 |
| `[LO-1.2-3]`       | `""`     | Yes                 |
| `(LO-2.5-2):`      | `""`     | Yes                 |
| `**(LO-6.4-3)**`   | `""`     | Yes                 |
| `LO-1.2-3:`        | `""`     | Yes                 |
| `HELLO-1.2.3`      | no match | Yes (word boundary) |
| `ALO-1.2-3`        | no match | Yes (word boundary) |
| `POLO-1.2-3`       | no match | Yes (word boundary) |
| `v1.2.3`           | no match | Yes                 |

The `\b` word boundary correctly prevents false positives on words containing "LO-" as a substring.

### 3.3 Issues Found

#### IMPORTANT: `\s*` Consumes Newlines -- Potential Paragraph Merging

The trailing `\s*` in the regex matches `\n` characters in JavaScript. This means when an LO-code appears at the end of a line or paragraph, the regex can consume the paragraph break:

```
Input:  "Heading with **LO-1.2-3**\n\nContent paragraph."
Output: "Heading with Content paragraph."
                    ^-- paragraph break consumed
```

In the most common real-world scenario (LO-code inline within a paragraph with text following on the same line), this is not a problem. But if an LO-code appears at the end of a heading or paragraph followed by a blank line, the blank line gets consumed, merging two paragraphs.

**Risk Assessment:** Low-to-Medium. The 7 affected lessons showed LO-codes inline within text, not at paragraph boundaries. However, future occurrences could hit this. The fix is straightforward:

**Recommended fix:** Replace `\s*` with `[^\S\n]*` (match whitespace except newlines):

```typescript
const LO_CODE_PATTERN =
  /\*{0,2}\[?\(?\bLO-\d+\.\d+[-.]?\d*\b\)?\]?\*{0,2}[^\S\n]*[---:,\-]?[^\S\n]*/g;
```

This preserves the intent (clean up trailing spaces and separators after the LO-code) without consuming line breaks.

#### Suggestion: Partial Match on LO-1.2.3.4

The regex matches `LO-1.2.3` out of `LO-1.2.3.4`, leaving `.4` behind. This is unlikely to occur in practice since actual LO IDs follow the `X.X-X` or `X.X.X` pattern with at most 3 parts. No action needed.

#### Suggestion: Unbalanced Delimiter Matching

The `[?` and `]?` are independent optional matches, so `[LO-1.2-3)` (bracket open, paren close) is still matched. This is actually a feature rather than a bug -- it provides more aggressive cleanup. No action needed.

### 3.4 Whitespace Artifacts

After stripping, some residual whitespace can remain:

```
"чтобы выполнить **LO-1.3-2**. После"  -->  "чтобы выполнить . После"
```

The space before the period is a minor aesthetic artifact. The test explicitly asserts this behavior, confirming it is an accepted trade-off. A follow-up improvement could collapse double spaces, but this is cosmetic and low priority.

---

## 4. Integration Completeness

### 4.1 Code Paths Covered

The two integration points cover the content output pipeline completely:

1. **`executePatch()`** in `patcher/index.ts:207` -- catches LO-codes in standard patcher output (first iteration fixes).

2. **`parsePatcherResponse()`** in `task-executor-helpers.ts:135` -- catches LO-codes in coherence-preserving patcher output (multi-iteration refinement).

Both are placed correctly: after `stripLLMMetadataWithLogging()` and before validation checks. The order is logical since LLM metadata stripping (trailing) should run before LO-code stripping (inline).

### 4.2 Code Paths NOT Covered

There is no centralized sanitization at the database-write layer (`database-service.ts`). All sanitization happens at the output-of-LLM level. This is the correct architectural choice -- sanitizing at the source prevents propagation of bad data through any intermediate processing.

However, the initial content generation path (`nodes/generator/generator-content.ts`) does NOT call `stripLOCodes`. This is acceptable because:

- The content generator uses `lo.objective` (not `lo.id`), so it does not introduce LO-codes.
- The root cause is in the fix/refinement prompts where `formatLearningObjectives()` includes `lo.id`.

### 4.3 Note on `applyStandardPatch()`

The `applyStandardPatch()` function in `task-executor-helpers.ts` delegates to `executePatch()` from the patcher module, which already has the `stripLOCodesWithLogging()` call. So this path is covered transitively. Good.

---

## 5. Test Coverage Assessment

### 5.1 Coverage Summary

13 new tests added covering:

| Category                           | Tests | Status |
| ---------------------------------- | ----- | ------ |
| Clean content (no false positives) | 1     | Good   |
| Bold format `**LO-X.X-X**`         | 2     | Good   |
| Heading with LO-code               | 1     | Good   |
| Bold parens `**(LO-X.X-X)**`       | 1     | Good   |
| Parens with colon `(LO-X.X-X):`    | 1     | Good   |
| Bracket format `[LO-X.X-X]`        | 1     | Good   |
| Bare LO-code                       | 1     | Good   |
| Word boundary (no false positive)  | 1     | Good   |
| Idempotency                        | 1     | Good   |
| Multiple LO-codes in document      | 1     | Good   |
| Real DB example (PPG-9154)         | 1     | Good   |
| Empty string                       | 1     | Good   |
| Dotted sub-numbering (LO-6.2.2)    | 1     | Good   |

### 5.2 Test Coverage Gaps

#### Missing: `stripLOCodesWithLogging()` wrapper test

The logging wrapper is not directly tested. While it delegates to `stripLOCodes()` and the core function is well-tested, a test verifying that the logger is called when content is stripped would increase confidence.

**Priority:** Low. The wrapper is trivial (5 lines) and the pattern matches `stripLLMMetadataWithLogging()` which also has no dedicated test.

#### Missing: Newline-adjacent LO-code test

No test covers the scenario where an LO-code appears at a paragraph boundary:

```typescript
it('does not consume paragraph breaks when stripping', () => {
  const input = 'Paragraph about **LO-1.2-3**\n\nNext paragraph';
  const result = stripLOCodes(input);
  expect(result).toContain('\n\n');
});
```

This would have caught the `\s*` newline consumption issue identified in Section 3.3.

**Priority:** Medium. Should be added alongside the regex fix.

#### Missing: Comma-separated LO-codes test

The regex's trailing comma consumption means `LO-1.2-3, LO-4.5-6, description` collapses to just `description`. This is correct behavior but worth documenting with a test.

**Priority:** Low.

---

## 6. Code Quality Assessment

### 6.1 What Was Done Well

- **Module documentation:** Excellent JSDoc comments on both new functions with clear descriptions of behavior differences from `stripLLMMetadata` (trailing-only vs. whole-document).
- **Pattern documentation:** The 5 observed patterns are enumerated in comments above the regex constant.
- **Consistent logging:** `stripLOCodesWithLogging()` follows the exact same pattern as the existing `stripLLMMetadataWithLogging()` wrapper.
- **Defensive null check:** `if (!content) return content` handles empty/null input.
- **Code organization:** LO-code section is clearly delineated with comment separators, placed logically after the existing LLM metadata code.
- **Import hygiene:** Both integration files import only what they need.
- **Test quality:** Tests use real data from production (PPG-9154 example), test idempotency, and verify both positive matching and false-positive prevention.

### 6.2 Minor Observations

- **No `strippedFragment` in LO logging:** The `stripLLMMetadataWithLogging()` wrapper logs `strippedFragment` (first 200 chars of what was removed), but `stripLOCodesWithLogging()` only logs `strippedBytes`. This is acceptable since LO-codes are short and scattered (unlike trailing metadata blocks), so byte count is sufficient. The inconsistency is a conscious simplification.

- **Regex constant naming:** `LO_CODE_PATTERN` is clear and follows the convention of `METADATA_HEADING_PATTERNS` / `METADATA_LINE_PATTERNS` in the same file.

---

## 7. Prompt Template Changes

### 7.1 Changes Made

Three CRITICAL lines in the OUTPUT FORMAT sections were updated:

**Before:**

```
Do NOT include any commentary, summary of changes, meta-information, quality checklists, or scores.
```

**After:**

```
Do NOT include any commentary, summary of changes, meta-information, quality checklists, scores, or learning objective IDs (like LO-1.2-3).
```

This is a minimal, precise addition. The example `LO-1.2-3` is well-chosen as it matches the actual format the LLM sees in the prompt context.

### 7.2 Root Cause Not Fully Addressed

The `formatLearningObjectives()` function at line 143 still produces `[LO-x.x.x]` format in the prompt. This was an intentional decision documented in the plan. The LO IDs serve a purpose (mapping objectives to content). The three-layer defense (prompt prohibition + output stripping + prompt context) is a pragmatic approach.

A more thorough root-cause fix would modify `formatLearningObjectives()` to use a format less likely to be copied verbatim (e.g., numbering like `1)`, `2)` instead of `[LO-x.x.x]`). This is noted as a potential future improvement, not a blocker.

---

## 8. Issue Summary

### Critical (must fix)

None.

### Important (should fix)

| #   | Issue                   | Location                | Description                                                                                                                                                                                                                                                  |
| --- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I-1 | `\s*` consumes newlines | `strip-metadata.ts:162` | The trailing `\s*` in `LO_CODE_PATTERN` can consume `\n` characters, potentially merging paragraphs when an LO-code appears at a line/paragraph boundary. Replace `\s*` with `[^\S\n]*` in both positions. Add a regression test for paragraph preservation. |

### Suggestions (nice to have)

| #   | Suggestion                        | Location                     | Description                                                                                                                                                                                          |
| --- | --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | Post-strip whitespace collapse    | `strip-metadata.ts:175`      | After `content.replace(LO_CODE_PATTERN, '')`, consider collapsing double spaces: `.replace(/ {2,}/g, ' ')`. This would clean up artifacts like `"выполнить . После"`. Low priority -- cosmetic only. |
| S-2 | Add paragraph-boundary test       | `strip-llm-metadata.test.ts` | Add test: LO-code at end of line before `\n\n` should preserve the paragraph break.                                                                                                                  |
| S-3 | Add comma-separated test          | `strip-llm-metadata.test.ts` | Add test documenting behavior when multiple LO-codes are comma-separated.                                                                                                                            |
| S-4 | Consider root-cause refactor      | `fix-templates.ts:143`       | Future: change `formatLearningObjectives()` to avoid `[LO-x.x.x]` format. Use numbered list or just the objective text. Would reduce LLM copying tendency at the source.                             |
| S-5 | Consider centralized sanitization | `database-service.ts`        | Long-term: add a `sanitizeContent()` call at the database write layer as an additional safety net. Would catch leaks from any new code paths added in the future.                                    |

---

## 9. Files Reference

### Modified Files

| File                                                                                                                                 | Purpose                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/strip-metadata.ts`                            | New `stripLOCodes()` + `stripLOCodesWithLogging()` functions (lines 148-207)             |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/fix-templates.ts`                             | LO-code prohibition added to 3 CRITICAL output format instructions (lines 316, 440, 557) |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts`                             | Integration at line 207 (after stripLLMMetadataWithLogging)                              |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/task-executor-helpers.ts` | Integration at line 135 (after stripLLMMetadataWithLogging)                              |
| `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/strip-llm-metadata.test.ts`                  | 13 new tests in `describe('stripLOCodes')` block                                         |

### Related Files (not changed, reviewed for completeness)

| File                                                                                                                          | Relevance                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/prompt-cache.ts`                       | Uses `lo.id` at line 628 (evaluation context, not content gen)              |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts`                         | Uses `lo.id` at line 198 (voting/evaluation context)                        |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/single-judge.ts`               | Uses `lo.id` at line 26 (judge evaluation context)                          |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/self-reviewer/self-reviewer-prompt.ts` | Uses `lo.id` at line 381 (self-review context)                              |
| `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`                | Content persistence -- no sanitization layer (potential future improvement) |

### Plan Document

| File                                                        |
| ----------------------------------------------------------- |
| `/home/me/code/mc2/docs/plans/unified-wandering-raccoon.md` |

---

## 10. Verification Results

| Check                                          | Result                                |
| ---------------------------------------------- | ------------------------------------- |
| `pnpm --filter course-gen-platform type-check` | PASS (zero errors)                    |
| `npx vitest run strip-llm-metadata`            | PASS (23/23 tests, 1.46s)             |
| Git diff matches plan                          | Yes, all 5 files changed as specified |
| No untracked/uncommitted debris                | Clean (only plan document untracked)  |
