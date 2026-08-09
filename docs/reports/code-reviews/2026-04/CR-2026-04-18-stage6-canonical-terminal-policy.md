# Code Review: Stage 6 canonical markdown + terminal rung policy

Date: 2026-04-18
Scope:

- `packages/course-gen-platform/src/stages/stage6-lesson-content/execution/execute-stage6.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/decision-engine.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer-node.ts`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`
- related new/updated unit tests

## Docs note

- Context7 was attempted twice for LangGraph JS/TS docs (`LangGraph`, `@langchain/langgraph`) and timed out both times in this session.
- Fallback used: official LangGraph.js API docs.
  - `Command` explicitly documents that it can combine state updates with routing “in lieu of conditional edges”, and that `update` is written to graph state as if the node had returned it directly.
  - `StateGraph` documents that nodes communicate by returning partial state and reducers aggregate those updates.
- Source links:
  - https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.Command.html
  - https://langchain-ai.github.io/langgraphjs/reference/classes/langgraph.StateGraph.html
  - https://langchain-ai.github.io/langgraphjs/reference/modules/langgraph.Annotation.html
  - https://langchain-ai.github.io/langgraphjs/concepts/low_level
  - https://langchain-ai.github.io/langgraphjs/how-tos/command

## Summary

The direction of the change-set is correct:

- canonical markdown before self-review/judge addresses the raw-vs-persisted mismatch,
- terminal rung pragmatic acceptance is the right policy lever for live remediation,
- phase/source persistence is useful and overdue.

However, the current implementation still has three blockers and one material debugging regression.

## Findings

### 1. [P1] Terminal pragmatic accept is wired to an iteration counter that is never incremented

- File: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts:299-307`
- Problem:
  - The new pragmatic-accept logic in `decision-engine.ts` is guarded by `isMaxIterationsExceeded(iterationCount)`.
  - The runtime call site feeds `state.refinementIterationCount`, but within the Stage 6 codebase that state key is only declared and logged; it is never incremented by any node or routing path.
- Why this is a bug:
  - In the real graph state flow, terminal rung lessons keep arriving with `iterationCount = 0`, so the new `auto_last_chance` acceptance branch never becomes reachable.
  - The only place it appears to work today is the unit test, which injects `iterationCount: 2` manually instead of exercising the real state transitions.
- Why tests miss it:
  - `decision-engine-terminal-rung.test.ts` is not end-to-end and hardcodes the counter to `2`.

### 2. [P1] Even if terminal accept becomes reachable, judge finalization still discards the accepted lesson

- File: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/judge-node-helpers.ts:427-461, 841-844`
- Problem:
  - `makeDecision()` can now return `DecisionAction.ACCEPT` on `stage_6_auto_last_chance` when score >= `0.75` and no blocking issues remain.
  - But `processJudgeDecision()` initializes `finalRecommendation` from `verdict.recommendation` and does not overwrite it in the `DecisionAction.ACCEPT` branch.
  - Later, `finalizeJudgeResult()` only persists `lessonContent` when `finalRecommendation` is `ACCEPT` or `ACCEPT_WITH_MINOR_REVISION`.
- Why this is a bug:
  - A terminal-rung lesson can be pragmatically accepted by the decision engine while still carrying a judge verdict recommendation like `REGENERATE` or `ITERATIVE_REFINEMENT`.
  - In that case the node builds `finalContent`, but `finalLessonContent` is nulled out at finalization because `finalRecommendation` was never normalized.
  - The net effect is that the new pragmatic-accept path can silently fail to produce a usable completed lesson, which defeats the main purpose of the change.
- Why tests miss it:
  - `decision-engine-terminal-rung.test.ts` only asserts the decision engine action.
  - There is no end-to-end judge-node regression covering `DecisionAction.ACCEPT` with a non-accepting original `verdict.recommendation`.

### 3. [P1] Persisted Stage 6 metadata shape still does not match current web consumers

- File: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts:261-281, 500-520`
- Problem:
  - Stage 6 rows are persisted with camelCase keys such as `qualityScore`, `tokensUsed`, `durationMs`, and `qaSignals`.
  - Current consumers in `packages/web` still read snake_case fields such as `quality_score`, `generation_duration_ms`, `total_tokens`, and `qa_signals`.
- Why this is a bug:
  - Newly written completed/review_required rows keep the metadata, but current dashboards and inspector helpers do not read the fields they actually receive.
  - This means the change-set can still leave live UI surfaces blank or partially blind even when the backend now persists the new phase/source/recovery data correctly.
- Why tests miss it:
  - The DB-side tests only assert the raw insert payload.
  - Existing web tests use fabricated snake_case fixtures rather than round-tripping real Stage 6 persistence output.

### 4. [P2] Canonical self-review path now overwrites rejected diagnostics with canonical markdown and loses raw generator output

- File: `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/self-reviewer-node.ts:74-119, 158-159, 423-445, 537-628`
- Problem:
  - `prepareSelfReviewContent()` correctly derives canonical markdown for review.
  - But all reject/debug persistence paths (`saveRejectedContent`) now receive `generatedContent`, which at that point is the canonicalized markdown, not the original generator output.
- Why this is a bug:
  - The implementation goal explicitly separated concerns:
    - canonical markdown should drive heuristics/judge,
    - raw markdown should remain available for diagnostics.
  - After this change, rejected rows no longer preserve the raw generator artifact on canonicalized paths, so debugging real generator damage vs parser/canonicalization effects becomes harder again.
  - This is especially relevant for the exact live class of incidents we are investigating: raw tail vs persisted canonical tail mismatches.
- Why tests miss it:
  - `self-reviewer-canonicalization.test.ts` only checks that canonical content is used for evaluation and propagated forward.
  - There is no regression asserting that rejected-content persistence still stores raw generator markdown for diagnostics.

## Rechecked old review comments

- The previously reported footer-strip issues around broad `FOOTER_LINE_REGEX`, first-HR matching, and weak-only Russian footers were rechecked against the current tree state.
- Those specific implementations are no longer present in the reviewed code and should not be reopened as-is for this change-set.

## Improvements worth doing after blockers

- Add a dedicated judge-node regression covering terminal pragmatic acceptance end-to-end through `processJudgeDecision()` and `finalizeJudgeResult()`, not only `makeDecision()`.
- Separate raw and canonical content explicitly in state or persistence context instead of overloading `generatedContent` for both execution and diagnostics.
- Persist a normalized terminal decision/disposition field for completed rows, so DB/debug consumers do not need to infer final outcome from a combination of `qualityRecoveryDisposition`, `reviewInfo`, and trace.
- `saveLessonContent()` still hardcodes `generation_attempt: 1`, so successful retries are stored as first-attempt completions.
- The new `saveLessonContent()` happy-path test should validate the real persistence contract after post-insert bookkeeping; right now it can pass even with an invalid `qualityRecovery.final_disposition` fixture and without asserting retry metadata.
