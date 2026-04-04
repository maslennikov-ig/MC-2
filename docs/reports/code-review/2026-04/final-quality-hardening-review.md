# Final Code Review: Stage 6 Quality Hardening (All Waves)

**Date**: 2026-04-04
**Reviewer**: Senior Code Review Agent (Claude Opus 4.6)
**Branch**: `develop` (uncommitted changes on top of `a64f4ff0`)
**Scope**: 18 modified/new files, ~683 lines added, ~73 removed

---

## Executive Summary

The changeset introduces a comprehensive quality hardening layer for Stage 6 lesson content generation. It spans three waves of work: prompt adjustments to reduce visual bias, deterministic autofix pipelines, a remediation contract mapping heuristic results to actions, a presentation critic LLM gate, and a course-level cross-lesson audit.

**Verdict**: The implementation is **sound and release-ready** with a few Important issues that should be addressed in a follow-up and several Suggestions for future improvement. No Critical bugs were found.

**Type-check**: PASS (both `shared-types` and `course-gen-platform`)
**Build**: PASS (bundle size 2.09 MB, within 2.5 MB threshold)
**Tests**: PASS (21/21 across 4 test files)

---

## 1. Plan Alignment Analysis

### 1.1 Wave 1 (v0.31.32-33): Prompt and Heuristic Fixes

- Prompt changes in `single-call-generator.ts` correctly soften visual element bias ("Use selectively when it materially improves understanding") and add audience-fit rules for non-technical audiences. Minimal, precise edits -- well done.
- The `extractContentBodyMarkdown` refactoring correctly decouples the function from `LessonContent` to work with `LessonContentBody` directly, enabling use in the cascade orchestrator before full `LessonContent` is assembled.

### 1.2 Wave 2 (v0.31.34): PRO TIP, Tables, Section Validation

- The `markdown-autofix.ts` module cleanly extracts and extends the previous inline autofix logic from `markdown-structure-filter.ts`.
- `normalizeCalloutMarkers` correctly handles `PRO TIP`, `PROTIP`, and quote-wrapped callouts.
- The old `applyMarkdownAutoFixes` in `markdown-structure-filter.ts` is now a thin delegate to the new module -- clean refactor.

### 1.3 Wave 3 (Current): Quality Hardening

- **Remediation contract** (`remediation.ts`): Correctly maps heuristic filter results to a severity-ordered action enum. The `bumpAction` monotonic escalation pattern is clean and correct.
- **Cascade integration** (`orchestrator.ts`): Runs the detailed heuristic filters after the legacy heuristic pass, as a second gate. No double-counting (see Section 4).
- **Feature flags** (`flags.ts`): All three new features are behind `FEATURE_STAGE6_*` environment variables. Clean, minimal implementation.
- **Presentation critic** (`presentation-critic.ts`): LLM-based gate with proper error handling, token budget (400 max output), and safe JSON parsing.
- **Course audit** (`course-audit.ts`): Cross-lesson quality checks for repeated content, code/callout anomalies, and audience drift.
- **QA telemetry** (`LessonQualitySignalsSchema`): Well-structured Zod schema with versioning, counters, flags, and critic metadata.

---

## 2. Issues Found

### 2.1 Important (Should Fix)

#### I-1: Duplicated `qaSignals` construction logic in `judge-refinement-helpers.ts`

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-refinement-helpers.ts` (lines 352-381)

The `handleNoVerdict` function builds `qaSignals` inline with the same structure as the `buildQaSignals` helper defined in `judge-node-helpers.ts` (lines 433-463). This is duplicated logic that will diverge if either is updated.

**Recommendation**: Extract `buildQaSignals` from `judge-node-helpers.ts` into a shared utility (or import it into `judge-refinement-helpers.ts`) and reuse it in `handleNoVerdict`. The function signature is:

```typescript
buildQaSignals(action: QualityRemediationAction | null): LessonQualitySignals | null
```

It currently closes over `qualitySummary` and `presentationCritic` from the outer scope, so it would need slight refactoring to accept those as parameters.

---

#### I-2: Presentation critic sends unbounded markdown to LLM without truncation

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/presentation-critic.ts` (lines 40-46)

The full lesson markdown is appended to the prompt without any size guard. While `maxTokens: 400` limits the output, the input could easily exceed the context window of `STAGE6_TIER_MODELS.simple` (currently `xiaomi/mimo-v2-flash`). If the lesson is 3000+ words, the input prompt could be 4000+ tokens.

**Recommendation**: Add a truncation guard for the markdown:

```typescript
const truncatedMarkdown =
  args.markdown.length > 12000
    ? args.markdown.slice(0, 12000) + '\n\n[... truncated for review ...]'
    : args.markdown;
```

This is non-blocking because the error is caught and returns a no-op result, but it wastes API calls that will predictably fail for long lessons.

---

#### I-3: Course audit `looksNonTechnicalAudience` regex matches `'novice'` as the fallback default

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/course-audit.ts` (line 144)

```typescript
return /(novice|beginner|non-technical|business|hr|manager|...)/i.test(audience || 'novice');
```

When `targetAudience` is `null`/`undefined`/empty, the fallback `'novice'` makes every lesson with no explicit audience treated as non-technical. This is conservative but may produce false positives for courses where the audience was simply not specified. Consider whether the intent is "fail-open" (treat unknown as non-technical) or "fail-closed" (skip audience checks when not specified).

**Recommendation**: If fail-open is intentional, add a comment documenting this design decision. If not, consider returning `false` when audience is unspecified:

```typescript
if (!audience) return false; // Cannot determine audience, skip audience-specific checks
```

---

#### I-4: The `getQaSignalsFromStoredRow` checks two different paths with different key casing

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts` (lines 49-65)

The function checks `row.metadata.qaSignals` (camelCase) and `row.content.metadata.qa_signals` (snake_case). This handles both the metadata column and the content JSON column, but the naming inconsistency could cause confusion. The Zod schema uses `qa_signals` (snake_case) while the graph state uses `qaSignals` (camelCase).

**Recommendation**: Add a comment explaining why both paths exist:

```typescript
// The lesson_contents table stores QA signals in two possible locations:
// 1. metadata.qaSignals — written by saveLessonContent/handlePartialSuccess
// 2. content.metadata.qa_signals — embedded in the LessonContent JSON via Zod schema
```

---

### 2.2 Suggestions (Nice to Have)

#### S-1: The `normalizeCalloutType` else branch is unreachable for non-whitespace markers

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/markdown-autofix.ts` (line 39)

For markers like `TIP`, `WARNING`, `NOTE`, `INFO`, `DANGER`, the else branch `marker.toUpperCase().replace(/\s+/g, ' ')` is effectively a no-op since these markers contain no whitespace. Consider simplifying:

```typescript
function normalizeCalloutType(marker: string): string {
  const stripped = marker.toUpperCase().replace(/\s+/g, '');
  return stripped === 'PROTIP' ? 'TIP' : stripped;
}
```

---

#### S-2: Test-then-replace pattern for global regex is slightly wasteful

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/markdown-autofix.ts` (lines 17-23, 26-29)

The `.test()` call followed by `.replace()` on a global regex traverses the string twice. While not a bug (ECMAScript spec resets `lastIndex` for `replace`), you could simplify by checking whether the replacement actually changed the string:

```typescript
const result = nextContent.replace(quoteWrappedPattern, ...);
if (result !== nextContent) {
  nextContent = result;
  fixedRules.add('quoteWrappedCallout');
}
```

---

#### S-3: `ANALOGY_MARKERS` regex `/как\b/i` may produce false positives in Russian

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/course-audit.ts` (line 35)

The word "как" is extremely common in Russian text (equivalent to "how/as/like"). This will match nearly every paragraph with 8+ words that contains "как" in any meaning, not just analogies. Consider restricting to analogy-specific patterns like `как\s+(?:если|будто)` or `подобно`.

**Recommendation**: Monitor false positive rates in production logs before tightening. The current implementation is conservative (flags for review, does not reject), so this is low risk.

---

#### S-4: Course audit heading repetition threshold of 3 may be low for large courses

**File**: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/course-audit.ts` (line 239)

```typescript
if (affectedLessons.length < 3) continue;
```

For a 20-lesson course, having 3 lessons with a heading like "Key Takeaways" or "How It Works" is normal. Consider making this threshold proportional to course size:

```typescript
const threshold = Math.max(3, Math.ceil(lessons.length * 0.25));
```

---

#### S-5: Missing test for the presentation critic gating path in the cascade orchestrator

The cascade orchestrator's integration of `runPresentationCritic` and its upgrade path (`qualitySummary` modification when critic returns `upgradedAction`) is untested. The test would need to mock `createOpenRouterModel` and verify that:

1. The critic is only invoked when `shouldRunPresentationCritic` is true and the feature flag is enabled.
2. The `qualitySummary.action` is upgraded when the critic returns a non-null `upgradedAction`.
3. The critic's findings are appended to `qualitySummary.reasons`.

---

## 3. Correctness Analysis

### 3.1 Remediation Contract Mapping

The `summarizeDetailedHeuristicResult` function correctly maps filter metrics to remediation actions with monotonic escalation via `bumpAction`. The thresholds are:

| Condition                       | Action        | Consistent with filter? |
| ------------------------------- | ------------- | ----------------------- |
| 0 sections                      | FULL_REGEN    | Yes (fatal)             |
| Critical/major markdown issues  | FULL_REGEN    | Yes                     |
| Duplicate headers (exact)       | FULL_REGEN    | Yes                     |
| 5+ callouts                     | FULL_REGEN    | Yes (hard cap)          |
| 3-4 callouts                    | WARN_ONLY     | Yes (soft cap)          |
| 4+ code blocks (non-technical)  | FULL_REGEN    | Yes                     |
| 1-3 code blocks (non-technical) | WARN_ONLY     | Yes                     |
| English headers                 | PARTIAL_REGEN | Yes                     |
| Content truncation              | FULL_REGEN    | Yes                     |
| Auto-fixed rules                | SAFE_AUTO_FIX | Yes                     |

All thresholds are internally consistent. The `shouldRunPresentationCritic` is only true when `action === WARN_ONLY`, which is the correct gating level (not too aggressive, not too permissive).

### 3.2 Decision Override in `makeJudgeDecision`

The forced action override at `judge-node-helpers.ts:303-316` correctly downgrades an `ACCEPT` decision to `TARGETED_FIX` when the deterministic quality guard requests `PARTIAL_REGEN`. It also correctly escalates to `ESCALATE_TO_HUMAN` for `REVIEW_REQUIRED`. The override only fires when the LLM judge would have accepted, so it never downgrades severity.

---

## 4. Double-Filtering Analysis (Special Attention Item)

**Concern**: The cascade orchestrator now runs TWO sets of heuristic filters:

1. `runHeuristicFilters` from `cascade/heuristic-helpers` (legacy, operates on `LessonContentBody`)
2. `runDetailedHeuristicFilters` from `filters/orchestrator` (new, operates on markdown string)

**Finding**: These are **not double-counting**. They serve different purposes:

1. The **legacy path** (`cascade/heuristic-helpers`) runs first and gates on basic structural checks (word count, section presence, etc.). If this fails, the function returns immediately with `REGENERATE` -- the detailed path never runs.

2. The **detailed path** (`filters/orchestrator`) runs only when the legacy path passes. It operates on the reconstructed markdown string and checks additional metrics: callout density, code block audience match, header language, markdown lint, section duplication. These checks produce a `QualityRemediationSummary` that may independently block or warn.

3. The detailed path's results are **merged into** `heuristicResults.warnings` (additive) and stored as separate properties (`detailedFilterResult`, `qualitySummary`, `presentationCritic`). The `score` and `failureReasons` from the legacy path are preserved -- no overwriting.

4. The detailed path can independently return early with `REGENERATE` or `ESCALATE_TO_HUMAN` if the `qualitySummary.action` warrants it.

**Conclusion**: The two-phase design is intentional and correct. The legacy path is fast and cheap (no markdown reconstruction needed). The detailed path adds richer analysis on the markdown representation. There is no double-counting of scores or conflation of results.

---

## 5. Feature Flag Safety

All three new features are safely gated:

| Feature             | Flag                                 | Default | Disable Impact                                                           |
| ------------------- | ------------------------------------ | ------- | ------------------------------------------------------------------------ |
| Course audit        | `FEATURE_STAGE6_COURSE_AUDIT`        | `false` | Skips cross-lesson checks at completion; auto-finalize proceeds normally |
| Presentation critic | `FEATURE_STAGE6_PRESENTATION_CRITIC` | `false` | Skips LLM critic call; `WARN_ONLY` actions stay as-is without upgrade    |
| Quality alerts      | `FEATURE_STAGE6_QUALITY_ALERTS`      | `false` | Suppresses `notifyCourseError` calls; review marking still happens       |

The `summarizeDetailedHeuristicResult` runs unconditionally (no flag), but it is purely deterministic and produces only a data summary -- it does not take any action on its own. The actions are gated by the cascade orchestrator's response to the summary.

**Regression risk**: LOW. When all flags are `false`, the cascade orchestrator still runs `runDetailedHeuristicFilters` and `summarizeDetailedHeuristicResult`, but:

- The presentation critic is skipped (flag check).
- The `FULL_REGEN`/`REVIEW_REQUIRED` blocking path still fires if the detailed filters detect critical issues. This is the desired behavior -- the detailed filters were always meant to catch issues that the legacy path misses, regardless of the flag.

---

## 6. Regression Risk Assessment

### 6.1 Low Risk

- **Prompt changes**: Softening visual element bias and adding audience-fit rules. These are additive constraints, not removals. Existing code_tutorial courses are unaffected (code snippets are explicitly allowed for `code_tutorial`).
- **QA telemetry**: The `qa_signals` field is optional in the Zod schema and optional in `LessonContentMetadata`. Existing lessons without it will not break.
- **Feature flags**: Default `false` means no behavior change in production until explicitly enabled.

### 6.2 Medium Risk

- **`extractContentBodyMarkdown` refactoring**: The original `extractContentMarkdown` is preserved as a thin wrapper calling the new function. Existing callers are unaffected. The only new caller is the cascade orchestrator.
- **`applyMarkdownAutoFixes` delegation**: Now delegates to `applyDeterministicQualityAutoFixes` which adds `normalizeCalloutMarkers` before the existing markdownlint fixes. The return type is compatible (`MarkdownAutoFixResult` vs `DeterministicQualityAutoFixResult` -- both have `content: string, fixedRules: string[]`).
- **`checkAndSetStage6Complete` expansion**: The SQL query now selects `content` and `metadata` columns (previously only `lesson_id, status, created_at`). This increases data transfer but the rows are already limited to the course's lessons. The additional processing (course audit) only runs when the feature flag is enabled.

### 6.3 Potential Concern

- The `countNonMermaidCodeBlocks` function was changed from `function` (private) to `export function` in `structural-checks.ts`. This is a non-breaking change (export-only), but it makes the function part of the module's public API. Future refactoring should account for external consumers.

---

## 7. Test Coverage Assessment

### 7.1 What is Tested

| Test File                                             | Coverage                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `prompt-hardening.test.ts` (2 tests)                  | Prompt template assertions for visual bias softening and audience-fit rules                                     |
| `quality-remediation.test.ts` (6 tests)               | All remediation action mappings: callout thresholds, code block thresholds, English headers, auto-fix recording |
| `course-audit.test.ts` (4 tests)                      | Repeated analogies, repeated exercises, code-block anomalies, mermaid-vs-code fence counting                    |
| `database-service.completion-check.test.ts` (9 tests) | Course completion check with course audit integration, target_audience propagation, auto-finalize downgrade     |

### 7.2 What is NOT Tested

- **Presentation critic** (`presentation-critic.ts`): No unit test. The LLM call and JSON parsing are untested. (S-5 above)
- **Cascade orchestrator integration**: The new detailed heuristic path in `executeCascadeEvaluation` is not directly tested. The existing cascade tests likely cover the legacy path but not the new `runDetailedHeuristicFilters` + `summarizeDetailedHeuristicResult` integration.
- **`makeJudgeDecision` override path**: The forced action override when `qualitySummary.action` is `PARTIAL_REGEN` or `REVIEW_REQUIRED` is not tested.
- **`markdown-autofix.ts`**: The `normalizeCalloutMarkers` and `applyDeterministicQualityAutoFixes` functions have no direct unit test (only indirectly via the prompt-hardening test that checks the template).

---

## 8. What Was Done Well

1. **Feature flag discipline**: Every new feature is gated behind an environment variable with `false` as the default. This is excellent production safety practice.

2. **Monotonic action escalation**: The `bumpAction` pattern ensures that combining multiple quality issues always escalates to the most severe action, never downgrades. This is a clean design.

3. **Zod schema versioning**: The `LessonQualitySignalsSchema` includes a `version` field defaulting to 1, enabling backward-compatible evolution of the telemetry format.

4. **Defensive error handling in presentation critic**: JSON parse failures, LLM timeouts, and unexpected response formats all fall through to a safe no-op return. The critic never blocks content on its own failure.

5. **Clean module separation**: The new `quality/` directory has a clear single-responsibility structure: flags, autofix, remediation mapping, critic, and course-level audit.

6. **Test coverage for the remediation contract**: All threshold boundaries are tested (3 vs 5 callouts, 1-3 vs 4 code blocks, etc.), which gives confidence that the mapping is correct.

7. **Backward-compatible API changes**: The `buildLessonContent` function gains an optional `qaSignals` parameter without breaking existing call sites. The `extractContentMarkdown` function is preserved as a thin wrapper.

---

## 9. File-by-File Summary

| File                                 | Change Type | Risk   | Notes                                                      |
| ------------------------------------ | ----------- | ------ | ---------------------------------------------------------- |
| `shared-types/src/lesson-content.ts` | New schema  | Low    | `LessonQualitySignalsSchema` added as optional on metadata |
| `quality/flags.ts`                   | New         | Low    | 3 feature flags, clean                                     |
| `quality/markdown-autofix.ts`        | New         | Low    | Callout normalization + markdownlint delegation            |
| `quality/remediation.ts`             | New         | Low    | Deterministic action mapping, well-tested                  |
| `quality/presentation-critic.ts`     | New         | Medium | LLM call, needs input truncation (I-2)                     |
| `quality/course-audit.ts`            | New         | Medium | Cross-lesson analysis, `novice` fallback concern (I-3)     |
| `judge/cascade/orchestrator.ts`      | Modified    | Medium | Dual heuristic path, verified correct (Section 4)          |
| `judge/cascade/types.ts`             | Modified    | Low    | Type extensions only                                       |
| `judge/filters/structural-checks.ts` | Modified    | Low    | Export visibility change only                              |
| `judge/judge-helpers.ts`             | Modified    | Low    | Optional param added to `buildLessonContent`               |
| `judge/markdown-structure-filter.ts` | Modified    | Low    | Delegation to new autofix module                           |
| `nodes/generator-node.ts`            | Modified    | Low    | Auto-fixes applied after generation                        |
| `nodes/judge-node-helpers.ts`        | Modified    | Medium | Decision override + qaSignals construction                 |
| `nodes/judge-refinement-helpers.ts`  | Modified    | Medium | Duplicated qaSignals logic (I-1)                           |
| `services/content-utils.ts`          | Modified    | Low    | Refactored to `extractContentBodyMarkdown`                 |
| `services/database-service.ts`       | Modified    | Medium | Course audit integration, expanded SQL query               |
| `services/job-processor.ts`          | Modified    | Low    | qaSignals propagation                                      |
| `execution/execute-stage6.ts`        | Modified    | Low    | qaSignals propagation                                      |
| `state.ts`                           | Modified    | Low    | New `qaSignals` annotation                                 |
| `single-call-generator.ts`           | Modified    | Low    | Prompt softening                                           |

---

## 10. Recommendations

### Before Release

- No blocking issues. All Important items can be addressed in a follow-up commit.

### Follow-up (Next Sprint)

1. Extract `buildQaSignals` into a shared utility to eliminate duplication (I-1).
2. Add input truncation to presentation critic (I-2).
3. Document the `novice` fallback behavior in `looksNonTechnicalAudience` (I-3).
4. Add a comment explaining the dual qaSignals storage paths (I-4).
5. Add unit tests for `presentation-critic.ts` and `markdown-autofix.ts`.

---

_Report generated by Senior Code Review Agent on 2026-04-04._
