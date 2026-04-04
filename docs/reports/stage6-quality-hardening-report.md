# Stage 6 Quality Hardening Report

## Scope

This change implements a conservative Stage 6 quality hardening pass with these goals:

- keep generator prompt growth minimal and English-only
- move new enforcement to deterministic post-generation checks
- preserve production safety by using warn-only or review-required paths for course-level issues
- keep optional LLM-based presentation checking behind a feature flag

## What Was Implemented

### 1. Generator prompt hardening

Updated [packages/course-gen-platform/src/shared/prompts/stage6/single-call-generator.ts](/home/me/code/mc2/packages/course-gen-platform/src/shared/prompts/stage6/single-call-generator.ts):

- softened visual toolkit instruction from aggressive usage to selective usage
- changed visual requirement to “only when it clarifies the concept”
- added a compact English audience-fit rule
- kept prompt expansion intentionally small

### 2. Deterministic lesson-level quality contract

Added new Stage 6 quality modules:

- [packages/course-gen-platform/src/stages/stage6-lesson-content/quality/remediation.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/remediation.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/quality/markdown-autofix.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/markdown-autofix.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/quality/flags.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/flags.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/quality/presentation-critic.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/presentation-critic.ts)

Implemented a single remediation contract:

- `SAFE_AUTO_FIX`
- `PARTIAL_REGEN`
- `FULL_REGEN`
- `WARN_ONLY`
- `REVIEW_REQUIRED`

Current deterministic mappings include:

- `calloutCount 3..4` -> `WARN_ONLY`
- `calloutCount >= 5` -> `FULL_REGEN`
- non-technical `codeBlockCount 1..3` -> `WARN_ONLY`
- non-technical `codeBlockCount >= 4` -> `FULL_REGEN`
- English headers in non-English lessons -> `PARTIAL_REGEN`
- zero sections / broken markdown after deterministic fixes / exact duplicate headers -> `FULL_REGEN`
- deterministic autofix only -> `SAFE_AUTO_FIX`

### 3. Live-path heuristic integration

Important architectural fix:

The production cascade previously used simplified heuristic helpers and did not consume the richer markdown-aware heuristic filter path. The live path now runs both:

- legacy cheap body heuristics
- detailed markdown-aware deterministic heuristics

Changed in:

- [packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/orchestrator.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/orchestrator.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/types.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade/types.ts)

Behavior now:

- `FULL_REGEN` or `REVIEW_REQUIRED` can block before expensive judge work
- `PARTIAL_REGEN` is carried forward and can override an otherwise-ACCEPT decision into targeted fix
- `WARN_ONLY` stays non-blocking
- optional presentation critic only runs for warn-only lessons when feature flag is enabled

### 4. Deterministic auto-fix path

Extended deterministic markdown cleanup to normalize:

- quote-wrapped callout markers
- `[!PRO TIP]` / `[!PROTIP]` to `[!TIP]`
- markdownlint-safe cosmetic fixes

Applied in:

- [packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator-node.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/generator-node.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts)

Existing table-fix and conclusion-strip safety nets were preserved.

### 5. QA telemetry in shared lesson metadata

Extended shared lesson metadata with optional `qa_signals` in:

- [packages/shared-types/src/lesson-content.ts](/home/me/code/mc2/packages/shared-types/src/lesson-content.ts)

Telemetry includes:

- counters
- lesson flags
- course flags
- remediation action
- retry count
- optional presentation critic summary

Wired through:

- [packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/judge/judge-helpers.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/judge/judge-helpers.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-refinement-helpers.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-refinement-helpers.ts)
- [packages/course-gen-platform/src/stages/stage6-lesson-content/execution/execute-stage6.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/execution/execute-stage6.ts)

### 6. Course-level deterministic audit

Added post-batch course audit module:

- [packages/course-gen-platform/src/stages/stage6-lesson-content/quality/course-audit.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/quality/course-audit.ts)

Current deterministic checks:

- repeated analogy phrases across lessons
- repeated exercise prompts across lessons
- repeated section headings across lessons
- course-level code-block anomaly for non-technical audiences
- course-level callout anomaly
- technical lexicon drift for non-technical audiences

Integrated into Stage 6 completion logic:

- [packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts](/home/me/code/mc2/packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts)

Behavior:

- audit runs only when `FEATURE_STAGE6_COURSE_AUDIT=true`
- if findings exist, affected lessons are marked `review_required`
- course is kept at `stage_6_complete` instead of auto-finalizing
- alerts are sent only when `FEATURE_STAGE6_QUALITY_ALERTS=true`

### 7. Reused review and notification infrastructure

No parallel review system was introduced.

Reused existing paths:

- `markForReview(...)`
- `review_required` lesson rows
- existing `notifyCourseError(...)` notification flow

Added QA-specific metadata to review markers and partial saves so findings can be inspected later.

## Tests Added

Added/updated tests:

- [packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/prompt-hardening.test.ts](/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/prompt-hardening.test.ts)
- [packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/quality-remediation.test.ts](/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/quality-remediation.test.ts)
- [packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/course-audit.test.ts](/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/course-audit.test.ts)
- [packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/database-service.completion-check.test.ts](/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage6-lesson-content/services/database-service.completion-check.test.ts)

Covered cases:

- prompt hardening stays compact and English-only
- remediation bucket mapping
- course-level repeated analogy detection
- repeated exercise detection
- course-level code-block anomaly detection
- completion check downgrades auto-finalization when course audit flags issues
- alert path is gated by feature flags

## Verification Run

Executed with Node `v22.18.0`:

1. `cd packages/course-gen-platform && pnpm vitest run --config vitest.config.unit.ts tests/unit/stages/stage6-lesson-content/prompt-hardening.test.ts tests/unit/stages/stage6-lesson-content/quality-remediation.test.ts tests/unit/stages/stage6-lesson-content/course-audit.test.ts tests/unit/stages/stage6-lesson-content/services/database-service.completion-check.test.ts`
2. `cd packages/shared-types && pnpm type-check`
3. `cd packages/shared-types && pnpm build`
4. `cd packages/course-gen-platform && pnpm type-check`

All passed.

## Important Review Notes

1. The biggest behavioral change is that the live cascade now consumes markdown-aware deterministic heuristics instead of relying only on the older simplified helper path.
2. `FEATURE_STAGE6_PRESENTATION_CRITIC` remains opt-in. No token cost is added unless explicitly enabled.
3. `FEATURE_STAGE6_COURSE_AUDIT` is also opt-in. In v1 it is conservative and review-oriented, not auto-regeneration-oriented.
4. Course-audit findings currently use deterministic phrase and heading fingerprints only. There are no embeddings or semantic similarity calls in v1.
5. Existing unrelated workspace changes were left untouched:
   - deleted `lesson-2.2-full.png`
   - deleted `lesson-2.2-ru.png`
   - untracked `.agents/`, `.codex/`, `.claude/scheduled_tasks.lock`

## Follow-up Minor Fixes

Applied two post-review fixes after the main implementation:

1. Course-audit fallback code block counting now reuses the same stateful non-mermaid parser as the lesson-level structural checks, avoiding false positives from mermaid closing fences.
2. Course-audit now receives the real course `target_audience` from the loaded course row instead of `null`, so non-technical detection no longer falls back to `novice` when the actual audience is technical.

Additional regression coverage was added for both fixes.

## Recommended Rollout

1. Enable `FEATURE_STAGE6_COURSE_AUDIT=true` in shadow/staging first.
2. Keep `FEATURE_STAGE6_PRESENTATION_CRITIC=false` initially.
3. Enable `FEATURE_STAGE6_QUALITY_ALERTS=true` only after confirming alert volume is acceptable.
4. Watch:
   - `review_required` rate
   - retry rate
   - token delta
   - audit finding distribution
   - false-positive rate for repeated analogies and exercises
