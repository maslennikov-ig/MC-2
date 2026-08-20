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

---

# Second pass — 2026-08-20

The first pass left seven observations recorded but not ticketed, on the grounds that
none had been asked for. This pass filed them and fixed them. Verifying them against
the running database rather than the source turned two of them into something larger,
and turned up one defect that had nothing to do with cost.

## What the observations turned out to be

### mc2-hjhy5 — the trace page walked the primary key (P2)

Recorded in the first pass as "`ORDER BY id` with a `course_id` filter may push the
planner onto `generation_trace_pkey`; noise at 37k rows, not forever." Measured, it was
already worse than that. There is no `(course_id, id)` index, so with a literal course id
the planner does not use `idx_generation_trace_course_id` at all:

|        | plan                               | rows filtered | buffers | warm time |
| ------ | ---------------------------------- | ------------- | ------- | --------- |
| before | Index Scan `generation_trace_pkey` | 11,352        | 12,973  | 85 ms     |
| after  | Index Scan `(course_id, id)`       | 0             | 1,009   | 1.5 ms    |

Measured against course `c8ffafbd`, 3,067 rows of 37,224, one 1000-row page.

The work scales with the size of the **whole table**, not the course: a course holding
1% of the rows reads roughly a hundred rows per row returned. `updateCourseEstimatedCost`
runs on every stage-6 lesson completion and after every edit.

The single-column index was dropped in the same transaction — a b-tree answers a prefix
of its columns, so `(course_id, id)` serves everything `(course_id)` served and the index
count stays flat.

### mc2-y452l — a measured zero was recorded as "not measured" (P2)

`trace-logger.ts` built its insert with `||`, and 0 is falsy. Four numeric columns have a
meaningful zero: a call that genuinely cost $0, a call that produced no tokens, a
deterministic call at temperature 0, a judge verdict of 0. All four were written as NULL.

This corrupted the metric used to find pricing holes: the 12,491 rows counted as "tokens
but no price" could not distinguish a free call from an unpriced one. Commit `c554da79c`
— "record a call that was paid for and produced nothing" — made zero-output calls a live
case rather than a hypothetical one.

`retry_attempt` and `was_cached` keep `||`: their falsy value is their default.

### mc2-fyn4f — a restart kept the cost of the run it discarded (P3)

`restart_from_stage` deleted traces for `stage_2%`..`stage_6%`. Stage 7 survived, so a
restart from stage 2 — which re-runs the pipeline through enrichments — counted the
previous run's stage-7 spend alongside the new one. `courses.estimated_cost_usd` is the
cached SUM of exactly the rows the DELETE removed and was never resynced.

`stage_edit` rows deliberately survive: that money was really spent on chat and inline
edits and is not being redone. The first pass flagged that nobody had explicitly decided
it. It is now decided, and written in the migration where the next reader will find it.

### mc2-6kmfx, mc2-3vxbe, mc2-bo2f4 — the three small ones (P3/P4)

`recordImageCallCost` did not schedule the course-total refresh that `recordLlmCallCost`
does. Latent — stage 7's job refreshes at completion — but the first edit path to
generate an image would have reproduced the silent-zero shape the feature exists to
remove. One line.

The lost update between two concurrent re-sums is documented rather than fixed, with the
reason the obvious guard is wrong: "only write if greater" would permanently block the
legitimate **decrease** that `restart_from_stage` now produces.

`getCourseTokenSummary`'s docstring still described the pre-editing shape. `byStage` no
longer sums to `totalCostUsd`; the invariant is now stated where someone building a
breakdown UI will read it.

## What was not an observation — mc2-wxvyr (P1)

Reading the live definition of `restart_from_stage` before editing it showed **two**
functions:

```
restart_from_stage(p_course_id uuid, p_stage_number integer, p_user_id uuid)  -- SET search_path=public
restart_from_stage(p_course_id uuid, p_user_id uuid, p_stage_number integer)  -- no search_path
```

Same name, same parameter _names_, different order. Both callers pass named arguments, and
a named call matches both candidates exactly:

```
ERROR 42725: function public.restart_from_stage(p_course_id => uuid,
             p_stage_number => integer, p_user_id => uuid) is not unique
HINT: Could not choose a best candidate function.
```

Supabase's own documentation is blunt: "make the name of the function unique as overloaded
functions are not supported." So `restartStage` in the lifecycle router and FULL_REGENERATE
from chat have both been failing since `20260321090724_add_admin_bypass_to_restart_from_stage`
created the second one — five months.

The secondary finding is that the legacy overload is `SECURITY DEFINER`, owned by
`postgres`, with a **mutable** `search_path` (Supabase linter `0011_function_search_path_mutable`),
and silently carries a _different authorization rule_ — it lets an admin restart a course
they do not own.

`20260413120000_drop_legacy_restart_from_stage_overload.sql` was written to fix this on
2026-04-13 and never reached the database.

**The repair that shipped is not that migration.** Dropping the overload alone would also
have dropped the admin bypass someone deliberately added, five months after anyone
remembered adding it. The bypass is folded into the canonical signature instead, so the
capability survives and the ambiguity does not. Confirmed with the owner before applying.

## Why nobody knew — mc2-y23na (P2, filed not fixed)

`check-migration-drift.ts` takes a **watermark** — the newest repo migration recorded as
applied — and reports only migrations after it. Anything unapplied _before_ the watermark
is invisible, permanently; the next applied migration moves the watermark past it and it
can never be reported again.

That is how a committed repair sat unapplied for four months under a green gate, including
on both runs shipped earlier today.

Measured: **86 of 279** repo migrations have no history row by slug.

The tail-only design is deliberate and its stated reason is real — a naive full check
produced dozens of false positives from reassigned versions and renames. So the fix is to
widen the check _and_ grandfather what exists, in the shape of
`.codex/stranded-commit-allowlist.txt`: keep the watermark rule for the tail, add a second
pass for pre-watermark gaps, and fail only on a gap that is not allowlisted with a reason.

Building that allowlist means deciding, for each of the 86, whether it was applied under
another name or genuinely skipped. That is an audit, not a patch — so it is filed and
explicitly **not** fixed here.

## Migrations

Both applied to the shared dev/staging database, owner-authorized:

| history                                                 | slug matches repo file |
| ------------------------------------------------------- | ---------------------- |
| `20260820101647 \| generation_trace_course_id_id_index` | yes                    |
| `20260820101717 \| restart_from_stage_single_signature` | yes                    |

Verified against the database, not the files:

- exactly one `restart_from_stage` signature remains, `(uuid,integer,uuid)`, with
  `search_path=public` pinned — asserted inside the migration itself, because the
  ambiguity survived five months precisely because nothing checked;
- the named-argument call that produced `42725` now resolves and returns `NOT_FOUND`
  for a nonexistent course;
- `generation_trace` carries `idx_generation_trace_course_id_id` and no longer carries
  `idx_generation_trace_course_id`;
- the page plan is an ordered index scan with zero rows filtered.

## Acceptance

- Unit suite: **459 files, 7315 tests, 0 failures** (111 skipped)
- Type Check: **PASS**
- Build: **PASS**

The zero-is-not-NULL guard was checked against the defect it exists to catch: reverting
`??` to `||` fails 4 of its 6 assertions.

**Verdict**: PASS. One P2 (`mc2-y23na`) filed and deliberately deferred, with the reason
above.

---

# Third pass — 2026-08-20: the deferred audit

The second pass filed `mc2-y23na` and deliberately did not fix it, because fixing it
meant deciding, for each of 86 migrations, whether it was applied under another name or
genuinely skipped. That audit is done. It found one more live defect.

## How the 86 were decided

Not by name. The history is bad at names — that is the whole reason the gate was scoped
the way it was. Each migration was judged by whether its **effect** is present in the
database: tables, indexes, functions, types, triggers, views, columns, publication
membership, column nullability.

| verdict              | count | meaning                                                                         |
| -------------------- | ----- | ------------------------------------------------------------------------------- |
| every object present | 35    | applied before the history table was seeded, or recorded under a different slug |
| partially present    | 8     | applied; the absent pieces were later dropped or renamed on purpose             |
| nothing present      | 6     | 4 superseded (benchmark tables were dropped wholesale), 2 needed a decision     |
| no checkable DDL     | 37    | config seeds, RLS rewrites, GRANTs, drops, rollback scripts                     |

Two failed the audit outright, and they are the reason it was worth doing.

### mc2-mg8un — the storage quota has never worked (P2)

`20251015_add_storage_quota_functions.sql` creates `update_organization_storage`. It was
never applied, and the function does not exist.

`shared/qdrant/lifecycle.ts:141` calls it on every upload and every delete. When the RPC
failed — which was every time — the fallback updated **only** `organizations.updated_at`.
Its own comment promised otherwise:

```ts
// Manually update storage_used_bytes via SQL (no direct .raw() support in client)
// In production, ensure the RPC function exists
```

...and then did not. It logged `Storage quota update may be inaccurate without RPC
function` at warn level and returned successfully.

So `storage_used_bytes` has never been maintained, and the quota check immediately below
reads that column — meaning **no upload could ever exceed a quota**, because the number it
compares against does not move.

Measured on dev: 75 organizations, **74 at exactly 0**, one at 369 MB against a real
`file_catalog` total of 243 MB across 261 files. The single nonzero value is stale too.

Fixed in two parts: the migration is applied, and the fallback now throws. There is no
correct silent fallback for an atomic counter — PostgREST cannot express
`column = column + delta`, which is what the RPC is for. A no-op reporting success is how
ten months passed; an error would have surfaced it the same week.

Verified by round-trip: `update_organization_storage` moved a counter 0 → 1,048,576 inside
a transaction, and clamped at 0 on a large negative delta, then rolled back.

**Not** included: backfilling `storage_used_bytes`. The one nonzero row is larger than the
entire catalog, so the intended semantics may count something beyond `file_catalog.file_size`
— deleted files, or Qdrant vectors, given where this code lives. Recomputing from file sizes
would replace one wrong number with another confidently wrong one. It needs an owner
decision on what the counter is supposed to mean.

### The other one

`drop_legacy_restart_from_stage_overload` is the migration the second pass superseded. It
stays in the repository, allowlisted with that reason.

## The gate

`computeDrift` no longer uses the watermark to decide what to check. Every repo migration
must be applied or allowlisted; the watermark now only splits the report, because a gap in
the tail is usually something someone just wrote and reads differently from a gap in 2024.

`scripts/migration-drift-allowlist.txt` carries all 85 remaining entries, grouped and each
with its own reason. An entry with no reason is a parse error, not a silent skip — "why is
the database correct without this?" is the entire value of the file. Entries that go stale
(now applied, or naming a migration nobody kept) are reported as warnings, because an
unmaintained allowlist is how the previous gate stopped guarding.

One existing test had to be rewritten rather than extended:

```
it('ignores unrecorded migrations below the watermark', ...)
```

That assertion **was** the bug. It pinned the blindness as a requirement, which is why the
gate stayed that way through two previous rounds of fixing it.

## Acceptance

- Unit suite: **460 files, 7326 tests, 0 failures** (111 skipped)
- Type Check: **PASS** · Build: **PASS** · Lint: **PASS**

Both new guards were checked against the defects they exist to catch: restoring the silent
fallback fails 2 of the 4 storage-quota tests, and the historical-gap assertion cannot pass
against the old tail-only `computeDrift`.

The end-to-end check runs in CI: the `Migration Drift Check` job executes this script
against the live database with the shipped allowlist.

**Verdict**: PASS. Nothing deferred.
