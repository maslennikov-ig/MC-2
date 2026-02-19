# Code Review: stage6-ru-keyword-coverage

**Branch**: `fix/stage6-ru-keyword-coverage`
**Base**: `develop`
**Date**: 2026-02-19
**Reviewer**: Claude Sonnet 4.6 (automated)
**Verdict**: **REQUEST_CHANGES** (1 P1 bug, 1 P2 reliability issue, several P2-P3 improvements)

---

## 1. Summary

This branch delivers three well-scoped change groups to Stage 6:

1. **Russian keyword coverage** — Snowball stemmer for Cyrillic morphology, language-aware thresholds (RU 35%, EN 50%), Bloom taxonomy stop-word exclusion, `normalizeLanguageCode()` helper.
2. **Completion check and regeneration resilience** — fail-open `review_required` paths, `runCompletionCheck` closure, rejected-content persistence, truncation continuation caps, model telemetry enrichment.
3. **Model usage tracking** — `regenerateCount`, `truncationCount`, `rejectedTokens`, `lastGenerationTokens`, `selectedModel`/`fallbackModel`/`selectedModelTier` propagated through state, metrics, and DB metadata.

**Overall quality**: The implementation is solid. The stemming approach is correct and well-tested. The fail-open strategy for truncation and max-retry paths is the right architectural choice. Type-check passes cleanly on `course-gen-platform`. Eight new test files with good edge-case coverage.

One **P1 functional bug** was found: the `regenerationMode: null` reducer interaction means a `null` return from `generatorNode` does not clear the mode in state. In most paths this is harmless (selfReviewer always overwrites it on the next loop iteration), but there is one edge case in the judge-regeneration path where this can cause unintended truncation-continuation behaviour. See Issue I-1.

---

## 2. Issues (Bugs)

### I-1 — `regenerationMode: null` does not clear state; judge-path re-entry may use stale mode [P1]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator-node.ts`, lines 230 and 269
**Also affected**: `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts`, line 292

**Description**:

The `regenerationMode` Annotation uses the reducer `(x, y) => y ?? x`. Because `null ?? x` evaluates to `x`, returning `regenerationMode: null` from `generatorNode` is a no-op — the old value is kept.

In the normal regeneration loop (selfReviewer → generator → selfReviewer), this is harmless because selfReviewer unconditionally overwrites the mode via `buildRegenerateTelemetryUpdate`. However there is one path where it matters:

1. Generator runs in `truncation_continuation` mode and produces content.
2. SelfReviewer PASSES (content is good enough after continuation).
3. Judge evaluates and returns `REGENERATE` (quality below threshold).
4. `finalizeJudgeResult` sets `regenerationMode: 'full_regenerate'` (correct, non-null, overrides).
5. Generator runs again — correctly does a full regeneration.

So far so good. But consider the equivalent path where the judge's `handleNoVerdict` (in `judge-refinement-helpers.ts`, line 298) executes and `recommendation === 'REGENERATE'`: it sets `needsRegeneration = true` but does **not** set `regenerationMode` at all (the field is absent from the return object in `handleNoVerdict`). In that case the stale `truncation_continuation` remains in state, and the next generator invocation incorrectly re-enters the continuation path.

`handleNoVerdict` return object (lines 351-362 in `judge-refinement-helpers.ts`):

```typescript
return {
  currentNode: 'judge',
  qualityScore: cascadeResult?.finalScore,
  judgeRecommendation: recommendation,
  needsRegeneration,        // true
  needsHumanReview,
  lessonContent: ...,
  retryCount: ...,
  tokensUsed: ...,
  durationMs,
  progressSummary: syntheticProgress,
  // regenerationMode is MISSING — stale value persists
};
```

**Suggested fix**:

Option A (minimal, targeted): Add `regenerationMode` to `handleNoVerdict` return:

```typescript
return {
  // ... existing fields
  regenerationMode: needsRegeneration ? 'full_regenerate' : null,
};
```

Option B (root cause, more robust): Change the reducer so that explicit `null` clears the field:

```typescript
// state.ts
regenerationMode: Annotation<'full_regenerate' | 'truncation_continuation' | null>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => null,
}),
```

With this reducer, `null` clears the mode and `undefined` (absent) keeps the old value.

Option A is safer in the short term since it doesn't touch the shared reducer contract. Option B is architecturally cleaner.

---

### I-2 — `markForReview` uses `insert` (not `upsert`); duplicate rows on BullMQ retry [P2]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`, line 162

**Description**:

`markForReview` inserts a new row into `lesson_contents` with `status: 'review_required'`. BullMQ retries the same job on transient failures (up to `MAX_RETRIES: 3`). If `processStage6Job` reaches the catch block more than once for the same lesson, multiple `review_required` rows are written for the same `lesson_id`. The `checkAndSetStage6Complete` function picks the latest row (correct), but the extra rows pollute the audit trail and may complicate admin tooling that expects one row per lesson.

The same job also calls `markForReview` in the `needsReview` path (line 665) followed by `runCompletionCheck()`, and again in the catch block (line 794). If the content-save succeeds but the subsequent `runCompletionCheck` throws and BullMQ retries, both paths may fire.

`handlePartialSuccess` correctly uses `upsert` with `onConflict: 'lesson_id'`. `markForReview` should do the same, or at minimum add a uniqueness check before inserting.

**Suggested fix** (align with `handlePartialSuccess` pattern):

```typescript
// Replace insert with upsert
const { error: failedContentError } = await supabaseAdmin.from('lesson_contents').upsert(
  {
    lesson_id: lessonUuid,
    course_id: courseId,
    status: 'review_required',
    metadata: { ... },
    generation_attempt: 1,
  },
  { onConflict: 'lesson_id' }
);
```

---

## 3. Improvements

### R-1 — Bloom verb stop-list covers only bare infinitives; inflected Russian verbs leak into keyword pool [P2]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/heuristic-helpers.ts`, lines 247-317

**Description**:

The `commonWords` set contains Russian Bloom verbs in their bare infinitive form (e.g., `понять`, `применить`, `объяснить`). Learning objectives may use these in other conjugations (`понимать`, `применять`, `оценивать`, `анализировать`) which are not in the set and therefore leak through as content keywords, inflating the denominator and making coverage appear lower than it is.

For example, an objective "студент должен уметь применять принципы" has `применять` (4 chars+) as a keyword because it is not in `commonWords`. If the content says `применяет` or `применение`, the stemmer would match both to `применя`, so coverage would be correct — but if neither appears the objective inflates the denominator unfairly.

**Suggested fix**: Extend the stop-list with common imperfective counterparts of the listed verbs, or apply stemming to the stop-word check:

```typescript
// Instead of exact set membership, check if word stems to a Bloom-verb stem
const bloomVerbStems = new Set([
  russianStemmer.stem('понять'), // поня
  russianStemmer.stem('применить'), // примен
  russianStemmer.stem('объяснить'), // объясн
  // ...
]);

for (const word of cyrillicWords) {
  const stem = russianStemmer.stem(word.toLowerCase());
  if (!bloomVerbStems.has(stem) && !commonWords.has(word.toLowerCase())) {
    keywords.add(word.toLowerCase());
  }
}
```

---

### R-2 — Module-level stemmer instantiation is eager; will throw at import time if package missing [P2]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/heuristic-helpers.ts`, line 23

```typescript
const russianStemmer = newStemmer('russian'); // module level
```

**Description**:

If `snowball-stemmers` is unavailable (corrupted install, missing in Docker image layer, etc.) this throws at module import time and crashes the entire worker process rather than falling back gracefully. Because this is in the cascade evaluator's critical path, it would take down all concurrent lesson jobs, not just the one hitting the bad content.

**Suggested fix**: Lazy-initialize with a try/catch fallback:

```typescript
let russianStemmer: { stem: (w: string) => string } | null = null;
function getRussianStemmer() {
  if (!russianStemmer) {
    try {
      russianStemmer = newStemmer('russian');
    } catch {
      logger.warn('snowball-stemmers unavailable; Russian keyword stemming disabled');
      russianStemmer = { stem: (w: string) => w }; // identity fallback
    }
  }
  return russianStemmer;
}
```

Then call `getRussianStemmer()` inside `stemRussianText` and `matchKeywordInText`.

---

### R-3 — `extractJudgeModels` is duplicated in two files [P2]

**File 1**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts`, lines 517-531
**File 2**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-refinement-helpers.ts`, lines 365-379

**Description**:

Identical private function defined in both files. Any change to the model extraction logic must be applied twice. This is the duplication explicitly called out in the review request.

**Suggested fix**: Extract to a shared location such as `../judge/judge-output-builder.ts` (already imported by both files) or a new `judge-model-utils.ts`:

```typescript
// In judge-output-builder.ts (or new judge-model-utils.ts)
export function extractJudgeModels(
  enrichedOutput: ReturnType<typeof buildEnrichedJudgeOutput>
): string[] {
  const models = new Set<string>();
  if (enrichedOutput.singleJudge?.model) models.add(enrichedOutput.singleJudge.model);
  for (const vote of enrichedOutput.votes ?? []) {
    if (vote.model_id) models.add(vote.model_id);
  }
  return Array.from(models);
}
```

---

### R-4 — `handlePartialSuccess` silently returns on `result.errors.length === 0` even when `isReviewRequired` is true [P2]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`, lines 37-40

```typescript
const isReviewRequired = result.reviewInfo?.needsReview === true;
if (!result.lessonContent || (!isReviewRequired && result.errors.length === 0)) {
  return;
}
```

**Description**:

When `isReviewRequired = true` AND `result.errors.length === 0` (a clean review_required with no errors), the condition `!isReviewRequired && result.errors.length === 0` evaluates to `false && true = false`, so the function proceeds (correct). However, the logic is non-obvious and the guard is inverted. The intent is "skip if: no content, OR (not review required AND no errors)". De Morgan inversion of the proceed-condition would be clearer:

```typescript
// Proceed if: has content AND (is review required OR has errors)
if (!result.lessonContent) return;
if (!isReviewRequired && result.errors.length === 0) return;
```

This is a readability issue only but could introduce a bug if someone modifies the condition without careful analysis.

---

### R-5 — `generation_attempt` hardcoded to `1` in `markForReview` [P3]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`, line 180

**Description**:

`markForReview` always inserts with `generation_attempt: 1`. When this is called on the second or third BullMQ retry of a job (not just the first), the attempt count will be wrong. The context object already includes `regenerateCount` but it is not used to populate `generation_attempt`.

**Suggested fix**:

```typescript
generation_attempt: (context.regenerateCount ?? 0) + 1,
```

---

### R-6 — Truncation continuation prompt is an inline template string; should use prompt service [P3]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator/generator-single-call.ts`, lines 296-318

**Description**:

The `generateTruncationContinuation` function embeds the prompt as a raw template literal directly in the code, bypassing the `PromptService` that all other prompts use. This makes it untestable without running the full LLM call, invisible to prompt version tracking, and harder to internationalize if needed.

```typescript
const prompt = `<task>
You are repairing a lesson markdown that was truncated.
...
</task>`;
```

**Suggested fix**: Register a `stage6_truncation_continuation` prompt template in the prompt service and use `promptService.renderPrompt(...)`. If keeping the inline approach for simplicity, at minimum extract it to a named constant in `generator-constants.ts` so it can be referenced in tests.

---

### R-7 — `CYRILLIC_WORD_REGEX` uses lowercase-only range; content lowercased before matching [P3]

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/heuristic-helpers.ts`, line 15

```typescript
const CYRILLIC_WORD_REGEX = /[а-яё]{4,}/g;
```

**Description**:

The regex only matches lowercase Cyrillic. This is currently safe because `allText` is lowercased before being passed to `stemRussianText`. However it is a latent bug: if the call to `stemRussianText` is ever refactored to accept non-lowercased text, the regex silently misses uppercase words without any obvious error.

**Suggested fix**: Add the case-insensitive flag for robustness, or add a comment explaining the dependency on pre-lowercasing:

```typescript
const CYRILLIC_WORD_REGEX = /[а-яё]{4,}/gi; // text must be lowercased before use
```

---

### R-8 — `updateStateWithSections` in `generation-state.ts` does not propagate new `sections_breakdown` [P3]

**File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/generation-state.ts`, lines 589-592 (Stage 5 change)

```typescript
modelUsed: {
  ...state.modelUsed,
  sections: result.model,
  sections_breakdown: state.modelUsed.sections_breakdown, // copies OLD breakdown, not new
},
```

**Description**:

The Stage 5 change adds `sections_breakdown` to track per-section model usage. In `updateStateWithSections` the new breakdown is copied from the old state (`state.modelUsed.sections_breakdown`) rather than being updated from the section result. The actual breakdown population is done in `generation-phases.ts` via `sectionModelBreakdown` and assigned to `state.modelUsed.sections_breakdown` through the state annotation. The `updateStateWithSections` copy is therefore always the initial empty array from `initializeState`, and gets overwritten by the phases code. This appears accidentally correct but is confusing. The copy in `updateStateWithSections` should either not touch `sections_breakdown` (use spread only) or be removed.

---

## 4. Security

No security vulnerabilities found.

- Supabase queries use parameterized RPC calls and client-library query builders — no SQL injection vectors.
- No secrets or credentials in code.
- `markForReview` writes arbitrary `reason` strings to JSONB metadata (not to user-visible fields), so XSS is not a concern.
- The truncation continuation prompt inserts `lessonSpec.title` and section names into the prompt; these come from Stage 5 output (not direct user input), and are within a task prompt sent to an internal LLM — low risk.

---

## 5. Test Coverage

**Positive assessment**: Coverage is extensive for the new functionality. The 8 new test files cover:

- Stemming and keyword coverage for Russian (exact match, declension, Bloom verbs, threshold boundaries) — `heuristic-helpers.test.ts`
- Conditional edge routing for truncation cap and retry exhaustion — `conditional-edges.test.ts`
- Self-reviewer model escalation and truncation detection — `self-reviewer-truncation-escalation.test.ts`, `self-reviewer-llm-model-used.test.ts`
- Completion check logic including rejected-content exclusion — `database-service.completion-check.test.ts`
- Model selector tier routing — `model-selector.test.ts`

**Gaps to address**:

| Gap                                           | Priority | Description                                                                                                                                                                                                    |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handleNoVerdict` regeneration path           | P1       | No test verifies that `regenerationMode` is correctly set when judge calls `handleNoVerdict` with `REGENERATE` recommendation. This is the path where the I-1 bug manifests.                                   |
| `markForReview` on BullMQ retry               | P2       | No test covers duplicate-call scenario (job retried 2x, both hitting the catch block).                                                                                                                         |
| `mergeContinuationContent` overlap edge cases | P2       | Test only exercises the happy path. No coverage for: continuation is entirely a duplicate of the tail (all overlap), continuation is empty string, overlap is at exactly 40 chars (near the minimum boundary). |
| `normalizeLanguageCode` edge cases            | P3       | No test for: empty string input, `"en-US"` locale tag, `"RU"` uppercase. The implementation handles these but tests would prevent regression.                                                                  |
| `buildRegenerateTelemetryUpdate`              | P3       | `isCriticalTruncationOnly` branching is not unit-tested independently; coverage comes only via integration through `selfReviewerNode`.                                                                         |

---

## 6. Dead Code

No dead code found. The review specifically checked:

- Old `runCompletionCheck` call sites — all are active and wired.
- `CYRILLIC_WORD_REGEX` — used in `stemRussianText`.
- `KEYWORD_BLOCKING_LANGUAGES` — used in `getKeywordCoveragePolicy`.
- `resolveContinuationModelId` — called by `generateTruncationContinuation`, which is imported by `generator-node.ts`.
- `escapeRegex` in `generator-single-call.ts` (line 398) — used by `extractLessonDigest`.

---

## 7. Duplication

### D-1 — `extractJudgeModels` duplicated [Confirmed]

See R-3 above. The function is byte-for-byte identical across:

- `/nodes/judge-node-helpers.ts` lines 517-531
- `/nodes/judge-refinement-helpers.ts` lines 365-379

### D-2 — Inline `metrics` objects with identical shape repeated 3 times in `job-processor.ts`

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts`, lines 428-439, 496-513, 826-840

Three early-return `Stage6JobResult` objects all construct the same `metrics` shape with zeroed values and `tierResult.model` etc. Each has a slightly different subset of fields populated, introducing risk that one is forgotten when a new metric field is added (which just happened with `regenerateCount`, `truncationCount`, `rejectedTokens`).

**Suggested fix**: Extract a `buildZeroMetrics(tierResult)` helper:

```typescript
function buildZeroMetrics(
  tierResult: { model: string; fallback: string; tier: Stage6ModelTierName; reason: string },
  durationMs: number
): Stage6JobResult['metrics'] {
  return {
    tokensUsed: 0,
    durationMs,
    modelUsed: null,
    selectedModel: tierResult.model,
    fallbackModel: tierResult.fallback,
    selectedModelTier: tierResult.tier,
    selectedModelTierReason: tierResult.reason,
    qualityScore: 0,
    regenerateCount: 0,
    truncationCount: 0,
    rejectedTokens: 0,
  };
}
```

---

## Appendix: Files Reviewed

| File                                       | Lines Changed | Notes                                                                       |
| ------------------------------------------ | ------------- | --------------------------------------------------------------------------- |
| `judge/cascade/heuristic-helpers.ts`       | +151          | Core of Group 1; well-structured                                            |
| `judge/cascade/types.ts`                   | +6            | 3 new HeuristicResults fields, consumers verified                           |
| `types/snowball-stemmers.d.ts`             | +4            | Minimal hand-rolled declaration, correct                                    |
| `services/job-processor.ts`                | +214          | Good fail-open logic; minor duplication                                     |
| `services/database-service.ts`             | +185          | Good; upsert/insert inconsistency flagged                                   |
| `routing/conditional-edges.ts`             | +72           | Cap logic correct; `markReviewRequired` helper clean                        |
| `nodes/self-reviewer-node.ts`              | +149          | Telemetry correct; escalation logic clean                                   |
| `nodes/generator-node.ts`                  | +83           | Continuation path correct                                                   |
| `nodes/generator/generator-single-call.ts` | +129          | Inline prompt flagged; merge overlap logic good                             |
| `state.ts`                                 | +76           | 9 new fields, all properly annotated                                        |
| `types/index.ts`                           | +61           | New metrics fields, backward compatible                                     |
| `execution/execute-stage6.ts`              | +46           | New fields wired into initial state correctly                               |
| `nodes/judge-node-helpers.ts`              | +29           | Duplication of `extractJudgeModels` flagged                                 |
| `nodes/judge-refinement-helpers.ts`        | +29           | Same; `handleNoVerdict` missing `regenerationMode`                          |
| `shared-types/src/generation-result.ts`    | +16           | Stage 5 schema backward compat verified                                     |
| Stage 5 files (5 files)                    | +57           | `sections_breakdown` addition; `updateStateWithSections` stale-copy flagged |
| Test files (8 new)                         | +906          | Good coverage overall; gaps noted above                                     |

---

_Report generated by code-reviewer worker on 2026-02-19_
