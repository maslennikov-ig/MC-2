---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: correctness-review
stage_id: mc2-db696.92
agent_type: correctness_reviewer
subagent_model: inherit_orchestrator
reasoning_effort: role_default
model_reasoning_rationale: High-risk review of uncommitted cross-boundary Career Playbook changes.
repo: mc2
branch: develop
base_branch: develop
base_commit: 1721a9b482b948f214865ea1bd38cc64d0833929
worktree: /home/me/code/mc2
write_zone:
  - .codex/stages/mc2-db696.92/artifacts/correctness-review.md
success_criteria:
  - Findings are evidence-based with file:line references and concrete fixes.
  - Must-fix issues are separated from non-blocking notes.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/project-index.md
  - .codex/stages/mc2-db696.88/summary.md
  - .codex/stages/mc2-db696.89/summary.md
  - .codex/stages/mc2-db696.90/summary.md
selected_skills:
  - /home/me/code/mc2/.agents/skills/code-review/SKILL.md
selected_agents:
  - correctness_reviewer
catalog_candidates:
  - none
parallel_group: review-lenses
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only review artifact accepted; no child worktree or branch cleanup was needed.
risk_level: high
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Findings required code/test changes, not durable public/operator documentation changes.
verification:
  - git diff --check: passed
changed_files:
  - .codex/stages/mc2-db696.92/artifacts/correctness-review.md
explicit_defers:
  - mc2-db696.91 tracks intermittent Next standalone build trace-copy instability.
---

# Correctness Review: Career Playbook Uncommitted Changes

Date: 2026-06-28
Scope: current uncommitted Career Playbook changes for stages `mc2-db696.88`, `mc2-db696.89`, `mc2-db696.90`, plus delivery impact of `mc2-db696.91`.
Reviewer constraints: read-only except this artifact; no code, Beads, docs, or generated-file edits.

## Summary Verdict

Verdict: NEEDS WORK for delivery readiness.

Finding count: 2 total.

| Classification         | Count |
| ---------------------- | ----: |
| Must-fix               |     1 |
| High-value improvement |     1 |
| Optional/nit           |     0 |

`git diff --check` passed. I did not run `pnpm type-check`, `pnpm build`, or targeted test suites because the review prompt asked to avoid full/cache-mutating commands unless essential. Existing handoff/stage summaries report targeted tests and type-check passing, with build instability tracked separately as `mc2-db696.91`.

## Findings

### 1. High: stale lower-progress responses can regress a completed UI back to `generating`

- Classification: must-fix
- Severity: High
- Evidence:
  - `packages/web/stores/use-career-playbook-store.ts:906` defines `applyCareerPlaybookGenerationStatus`.
  - `packages/web/stores/use-career-playbook-store.ts:910` mutates `state.status = response.status` before stale/lower-progress filtering.
  - `packages/web/stores/use-career-playbook-store.ts:919` then returns early when `shouldKeepCurrentGenerationProgress` sees a lower `generating` response.
  - The new test at `packages/web/tests/unit/career-playbook-store.test.ts:808` covers `generating 98% -> stale generating 72%`, but it asserts status remains `generating` and does not cover `completed 100% -> stale generating 72%`.
- Impact: If `approveCareerPlaybookGeneration` or `refreshCareerPlaybookGenerationStatus` responses race, a completed state can be overwritten by an older `generating` response while retaining 100% progress/final markdown. That can restart polling, show the wrong generation state, and hide completed affordances until a later refresh repairs it.
- Suggested fix: decide whether a `generating` response is stale before mutating `status`/`phase`. Use `progressDetails.updated_at` when present so truly newer retry/restart responses can still be accepted, but older lower-progress responses are ignored as a whole. Add a regression test where state is already `completed` with 100% progress and a stale `generating` response arrives; assert status, progress details, and final markdown stay completed.
- Expected value: Prevents user-visible status regression after successful generation and makes the monotonic-progress guard protect the whole generation snapshot, not just the percent fields.
- Tradeoff: Needs a small helper contract around timestamp comparison or an explicit operation/retry identity. Timestamp-only handling must preserve legitimate retry-after-failure flows.
- Confidence: High.

### 2. Medium: direct tests for the block regenerator LLM path were removed

- Classification: high-value improvement
- Severity: Medium
- Evidence:
  - `packages/course-gen-platform/tests/unit/stages/stage-career-playbook/block-regenerator.test.ts:1` now only imports and tests `selectPendingCareerPlaybookRegeneration`.
  - The implementation still has important behavior in `packages/course-gen-platform/src/stages/stage-career-playbook/nodes/block-regenerator.ts:94` (`validateRegeneratedCareerPlaybookBlockMarkdown`), `:117` (`buildOtherBlocksBrief`), and `:173` (`regenerateCareerPlaybookBlock`).
  - The current diff removed prior tests for prompt variables, other-block brief ordering, attempt incrementing, node cost, and rejection of empty/wrong/multi-block markdown. I did not find replacement coverage for those behaviors via `rg`.
- Impact: This stage changes regeneration selection and budgets, but the same critical regeneration module lost coverage for the code that calls the LLM and validates returned markdown. A future regression could accept malformed block output or break prompt construction without failing the targeted test suite.
- Suggested fix: restore the removed `regenerateCareerPlaybookBlock`, `buildOtherBlocksBrief`, and invalid-markdown tests, then keep the new fair-selection test alongside them.
- Expected value: Restores confidence around a high-risk LLM boundary while preserving the new fairness coverage.
- Tradeoff: Adds several unit tests back to the targeted backend suite; runtime cost should remain small because the runtime is mocked.
- Confidence: High.

## Stage Assessment

- `mc2-db696.88`: Scope is coherent and targeted tests exist for null optional spec fields, graph early-stop, backend/frontend monotonic progress, and stale job-status error clearing. The must-fix finding above is related to the frontend monotonic-progress guard added in this stage: it protects percent fields but not status/phase under a completed-vs-stale-generating race.
- `mc2-db696.89`: Private share publish/copy flow has focused tests for cancel, success, manual copy, and missing `shareSlug`. I did not find a material correctness issue in this stage.
- `mc2-db696.90`: Backend/frontend dedupe and internal-warning filtering are covered by targeted tests. I did not find a material correctness bug in the dedupe/filtering logic. The removed regenerator-path coverage is a verification gap in this stage's changed test surface.
- `mc2-db696.91`: This does affect delivery readiness. It is described as unrelated to the Career Playbook logic, but repo canonical verification includes `pnpm build`; an open/intermittent Next standalone build failure means delivery should not be claimed fully ready without either fixing `mc2-db696.91`, rerunning a clean passing build, or explicitly waiving the build gate.

## Verification Recommendation

Before delivery:

- Add and run a store regression test for completed state resisting stale lower-progress `generating` responses.
- Restore and run the direct `block-regenerator.test.ts` coverage for `regenerateCareerPlaybookBlock`, markdown validation, and `buildOtherBlocksBrief`.
- Run the reported targeted suites:
  - `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/stages/stage-career-playbook/block-regenerator.test.ts tests/unit/career-playbook-library-service.test.ts`
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- Re-run `pnpm type-check`.
- Resolve or explicitly waive `mc2-db696.91`, then run `pnpm build` in a clean enough workspace to support delivery confidence.

## Explicit Defers

- No code fixes were made by this reviewer per prompt constraints.
- No Beads tasks were created or edited per prompt constraints.
- Full build/type-check were not rerun to avoid cache-mutating commands during this read-only review.

## Docs Impact

docs-reviewed: no-change-needed for the reviewed Career Playbook behavior. The findings require code/test changes, not durable README/operator/API/schema documentation changes.

graph-reviewed: used. I read `graphify-out/GRAPH_REPORT.md`; no additional Graphify query was needed beyond the supplied focused Career Playbook context and direct file inspection.

# Risks / Follow-ups / Explicit Defers

- Orchestrator accepted the stale completed->generating finding and fixed it in the store.
- Orchestrator accepted the removed regenerator coverage finding and restored the direct regenerator tests.
- Delivery readiness still depends on resolving or explicitly waiving `mc2-db696.91`.
