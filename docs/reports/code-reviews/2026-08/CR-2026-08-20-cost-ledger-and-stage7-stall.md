# Code Review: Edit-Cost Ledger and the Stage 7 Stalled Route

**Date**: 2026-08-20
**Scope**: Uncommitted working-tree changes on `develop` (mc2-b7olk.4 / .5 / .8)
**Files**: 18 source + 3 test | **Changes**: +344 / -48
**Depth**: low (targeted — cost path and Stage 7 retry path)

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 1    | 2      | 1   |
| Improvements | —        | 0    | 1      | 1   |

**Verdict**: NEEDS WORK — one half-applied fix in the presentation handler.

The two goals of the diff are met. Editing now has a stage (`stage_edit`), is written
to `generation_trace` like every other call, re-sums the course total, and is reported
apart from the numbered stages. Document evidence now writes to the course ledger
instead of only its own coverage ledger. Stage 7 recognises an abort as a timeout,
stops asking a stalled route six times, and lets `llm_model_config` decide the model.

The gap is that the Stage 7 half of the work was applied to quiz and only partly to
presentation, even though `config/index.ts` and `retry-strategy.ts` were changed for
both enrichment types.

## Issues

### High

#### 1. The presentation "final" call ignores `llm_model_config`

- **File**: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/presentation-handler.ts:439`
- **Problem**: `const model = (settings.model as string) || FALLBACK_MODEL;`
  Before this diff, `job-processor` always wrote `settings.model` (the removed
  `MODEL_CONFIG.presentation.primary`), so this line always got a model. Now
  `getModelForAttempt` returns `null` on attempt 1 and `job-processor.ts:509`
  deliberately omits the key, so `settings.model` is `undefined` and the call falls
  through to `FALLBACK_MODEL` (= `DEFAULT_MODEL_ID`). The database is never consulted.
- **Impact**: This is the same defect the diff set out to remove — a constant in this
  package outranking `llm_model_config` — left in place for half of presentation
  generation. It is also a new divergence: the draft call (line 253) resolves through
  `resolveModelWithFallback` and therefore uses the configured model, while the final
  call on the same enrichment uses `DEFAULT_MODEL_ID`. One presentation can now be
  drafted by one model and finished by another, and an administrator changing
  `stage_7_presentation` sees the change apply to only the draft.
- **Fix**: resolve the same way the draft does:

  ```ts
  const model = await resolveModelWithFallback({
    settingsModel: settings.model as string | undefined,
    phaseName: 'stage_7_presentation',
    courseId: enrichmentContext.course.id,
    fallbackModel: FALLBACK_MODEL,
    logContext: {
      enrichmentId: enrichmentContext.enrichment.id,
      lessonId: enrichmentContext.lesson.id,
    },
  });
  ```

### Medium

#### 2. The wall-clock bound is quiz-only; presentation can still hold a worker for half an hour

- **File**: `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts:60`
  (`QUIZ_TIMEOUT_MS`, `QUIZ_TRANSPORT_RETRIES`) vs
  `handlers/presentation-handler.ts:266` and `:441`
- **Problem**: The two constants that make a stalled route cheap are local to
  `quiz-handler`. Both presentation calls still take the shared default (238s) and the
  client's three transport retries.
- **Impact**: The incident in mc2-b7olk.8 — six paid calls against a route that never
  answered, a worker held 32 minutes, no output — is still reachable through
  presentation, which is the other LLM enrichment and was covered by every other part
  of this change (`maxPrimaryAttempts`, `ENRICHMENT_PHASE_NAMES`, `getModelForAttempt`).
- **Fix**: move the budget into `stage7-enrichments/config/index.ts` next to
  `MODEL_CONFIG` (e.g. `LLM_CALL_BUDGET = { timeoutMs: 120_000, transportRetries: 1 }`)
  and pass it from both handlers. That also removes the file-text assertion in
  `stalled-route-is-abandoned.test.ts:88` in favour of asserting the value.

#### 3. `getFallbackModel` and `getModelForAttempt` now disagree about the same constant

- **File**: `packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts:224`
- **Problem**: `getFallbackModel` gates on `ctx.attempt >= MODEL_CONFIG.maxPrimaryAttempts`
  while `getModelForAttempt` gates on `attempt <= MODEL_CONFIG.maxPrimaryAttempts →
null`. With `maxPrimaryAttempts` now `1`, `getFallbackModel` reports a fallback is
  available on attempt 1, at which point `getModelForAttempt` returns `null` by design.
  `getFallbackModel` also still returns the built-in constant and knows nothing about
  the `fallback_model_id` that `getModelForAttempt` was just taught to honour.
- **Impact**: Contained today — the only caller is the `context_overflow` branch of
  `shouldRetry` (line 166), where it is used as a boolean, so the effect is one extra
  retry on a context-overflow at attempt 1. The two functions reading one constant with
  opposite comparisons is the part that will bite the next person to change it.
- **Fix**: have `getFallbackModel` express the same condition
  (`ctx.attempt > MODEL_CONFIG.maxPrimaryAttempts`), or fold it into
  `getModelForAttempt` and keep one rule.

### Low

#### 4. `abort` as a substring is broader than the failure it was added for

- **File**: `packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts:80`
- **Problem**: `message.includes('abort')` will classify any error whose text contains
  "abort" as a retryable timeout, not only the `AbortSignal.timeout` wording.
- **Impact**: None found in the current code — the Stage 7 cancellation path
  (`job-processor.ts:465`) returns a failed result rather than throwing, so no
  deliberate cancellation reaches `categorizeError`. Worth knowing before another
  caller starts throwing on cancel. `error.name === 'AbortError'` and
  `'TimeoutError'` on the same condition already cover the real case precisely.
- **Fix**: optional; narrow to `'operation was aborted'` and keep the two `name` checks.

## Improvements

### Medium

#### 5. Every edit call re-sums the whole trace table

- **File**: `packages/course-gen-platform/src/shared/metrics/llm-cost.ts:353`
- **Current**: `refreshCourseTotalAfterEdit` runs on every `stage_edit` call and calls
  `updateCourseEstimatedCost` → `getCourseTokenSummary`, which selects every
  `generation_trace` row for the course and rewrites `courses.estimated_cost_usd`.
  One chat turn makes at least two LLM calls (intent classification plus the answer),
  so a conversation re-reads the full trace history once per call, and the cost of a
  refresh grows with the course's history.
- **Recommended**: the reasoning for doing it at all is right (an edit has no job to
  refresh the total). Either debounce it per course, or add the delta directly
  (`estimated_cost_usd = estimated_cost_usd + costUsd`) and leave the full re-sum to
  the job path.

### Low

#### 6. `getCourseTokenSummary` reads `generation_trace` without an explicit range

- **File**: `packages/course-gen-platform/src/services/token-tracking-service.ts:129`
- **Current**: `.select('stage, tokens_used, cost_usd').eq('course_id', courseId)` with
  no `.range()`. If PostgREST's `db-max-rows` cap is set on this project, a long-lived
  course silently truncates and the total under-reports.
- **Recommended**: this is pre-existing, but the diff promotes this function to the
  writer of the course total on every edit, so it is worth confirming the cap and
  paginating if one exists. Open question rather than a claim — not verified against
  the live project.

## Positive Patterns

- Both new test files are written against the actual incident, with the measured
  numbers in the file (31s answer, 238s default, 32 minutes lost). The contract they
  pin is legible without the ticket.
- `ENRICHMENT_PHASE_NAMES` is written out literally with the reason recorded — a
  runtime-built `stage_7_${type}` has hidden a live phase from grep in this repo twice.
- `no-anonymous-spend.test.ts` had its exceptions deleted rather than left as
  documentation, and the scan widened to `server/routers/generation/editing` at the
  same moment those calls became priceable.
- `...(courseId ? { costContext } : {})` keeps the option absent rather than
  `undefined`, which is what `exactOptionalPropertyTypes` wants.

## Escalation

- **New value in a shared column**: `stage_edit` is now written to
  `generation_trace.stage`. Only `token-tracking-service.ts:158` parses that column and
  it handles the value explicitly. No SQL for this table exists under
  `docs/migrations/`, so a `CHECK` constraint or enum on the live column could not be
  ruled out from the repository — confirm against the project before this reaches an
  environment that writes.
- **API contract change**: `CourseTokenSummary` gains a required `editing` field,
  returned by `pipelineAdmin.getCourseTokenSummary`. No consumer exists in
  `packages/web`, so nothing breaks today; note that `byStage` no longer sums to
  `totalCostUsd`, which any future breakdown UI must account for.

## Validation

- Type Check: **PASS** (`pnpm type-check`, all packages)
- Build: **PASS** (`pnpm build`, exit 0)
- Tests: **PASS** — `vitest run --config vitest.config.unit.ts tests/unit/shared/metrics
tests/unit/stages/stage7-enrichments tests/unit/services` → 15 files, 139 tests

---

# Resolution — 2026-08-20

All findings above are closed, plus two the review had not found. Verdict moves to
**PASS**.

## What the review missed, and what found it

**A CHECK constraint made the whole edit-cost feature a no-op (Critical, mc2-5y8ox).**
The live `generation_trace.stage` column carried
`CHECK (stage = ANY (ARRAY['stage_1' … 'stage_7']))`. Every `stage_edit` insert was
rejected; `logTrace` records the failure at error level and returns without throwing,
so nothing propagated and the edit cost stayed at zero — the exact defect the change
set out to fix, now silent instead of visible. No SQL for this table exists under
`docs/migrations/`, so the repository could not answer this. A read-only query against
the live schema could, and did, before any code was written.

**The `no-anonymous-spend` guard had a blind spot that kept it green (High, mc2-2e6ak).**
`src/shared/intent/classifier.ts:237` calls `openai.chat.completions.create` on a raw
`new OpenAI()` client and records nothing — `classifyIntent` had no course to charge.
The guard scans `shared`, so the file was in scope, but its detectors matched only
`createOpenRouterModel(` and `generate(Chat)?Completion(`. A raw SDK call matched
neither. Every chat turn missing the Redis intent cache spent money that left no row.
Found by an independent read-only review of the money path.

## Fixes applied

| #   | Finding   | Resolution                                                                                                                                                                                                   |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | mc2-5y8ox | Migration `20260820120000_generation_trace_allows_stage_edit.sql`, one transaction with `lock_timeout = '3s'`, plus a rollback that copies rows to `generation_trace_stage_edit_backup` before deleting them |
| 1   | mc2-vk1zl | `generateFinal` resolves through `resolveModelWithFallback` with `phaseName: 'stage_7_presentation'`, same as the draft                                                                                      |
| 2   | mc2-d4og2 | Budget hoisted to `LLM_CALL_BUDGET` in `stage7-enrichments/config`; quiz and both presentation calls take 120s and one transport retry                                                                       |
| 3   | mc2-qp7dl | `getFallbackModel` delegates to `getModelForAttempt` instead of reading `maxPrimaryAttempts` with the opposite comparison                                                                                    |
| 4   | low       | `'abort'` narrowed to `'operation was aborted'`; the two `error.name` checks carry the precise case                                                                                                          |
| 5   | mc2-m8fi5 | Refresh coalesced per course (1.5s, not awaited, one retry on a failed read); a failed read returns `null` and cannot reach the write                                                                        |
| 6   | mc2-m8fi5 | `getCourseTokenSummary` paginates by keyset on `id` — `generation_trace.id` defaults to `gen_random_uuid()`, so offset paging over a random sort key double-counted boundary rows under concurrent inserts   |
| —   | mc2-2e6ak | `classifyIntent(courseId, …)` prices itself; the guard gained a third detector for raw SDK `completions.create` calls                                                                                        |

Also re-pinned `REPOSITORY_MIGRATION_MANIFEST_SHA256` (236 files) — the tripwire that
requires any added migration to move the pin deliberately — and updated three
assertions in `tests/unit/stage7-retry.test.ts` that still encoded the removed
constant-primary contract. Those three had been failing before the review began; they
sit outside `tests/unit/stages/stage7-enrichments/`, which is why folder-scoped runs
never showed them.

## Migration

Applied to the shared dev/staging database on 2026-08-20; history row
`20260820081143 | generation_trace_allows_stage_edit`, whose slug matches the
repository filename, so `scripts/check-migration-drift.ts` resolves it.

Verified by round-trip rather than by reading the constraint text: a `stage_edit` row
was inserted inside a transaction and rolled back. The insert succeeded and left
nothing behind. `generation_trace` currently holds zero `stage_edit` rows.

## Acceptance

- Unit suite: **456 files, 7298 tests, 0 failures** (111 skipped)
- Type Check: **PASS**
- Build: **PASS**

An earlier build run reported exit 137; it was OOM-killed for sharing the machine with
the test suite, and passed on its own.
