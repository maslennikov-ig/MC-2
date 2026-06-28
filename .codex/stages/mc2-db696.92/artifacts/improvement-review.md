---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: improvement-review
stage_id: mc2-db696.92
agent_type: custom-or-n/a
subagent_model: codex/gpt-5.5
reasoning_effort: high
model_reasoning_rationale: Review task with cross-module backend/frontend behavior and retry-state risk.
repo: mc2
branch: develop
base_branch: develop
base_commit: 1721a9b482b948f214865ea1bd38cc64d0833929
worktree: /home/me/code/mc2
write_zone:
  - .codex/stages/mc2-db696.92/artifacts/improvement-review.md
success_criteria:
  - Mandatory reuse/build-vs-buy assessment included.
  - Findings include file:line evidence, recommendation, and priority.
  - Top 3 next improvements separate quick fixes from follow-up ideas.
selected_docs:
  - AGENTS.md
  - .codex/orchestrator.toml
  - .codex/handoff.md
  - .codex/project-index.md
  - .codex/stages/mc2-db696.88/summary.md
  - .codex/stages/mc2-db696.89/summary.md
  - .codex/stages/mc2-db696.90/summary.md
  - graphify-out/GRAPH_REPORT.md
selected_skills:
  - /home/me/code/mc2/.agents/skills/code-review/SKILL.md
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: Read-only review artifact accepted; no child worktree or branch cleanup was needed.
risk_level: medium
docs_impact: none
docs_reviewed: no-change-needed
docs_review_notes: Findings affect implementation correctness/helper ownership, not public docs or operator workflows.
verification:
  - git diff --check: passed
  - python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.92/artifacts/improvement-review.md: passed
changed_files:
  - .codex/stages/mc2-db696.92/artifacts/improvement-review.md
explicit_defers:
  - Full pnpm type-check/build not run because this was a read-only review artifact task.
  - No Beads tasks created because this subagent was constrained to read-only review except this artifact.
---

# Improvement Review: Career Playbook Uncommitted Changes

Date: 2026-06-28
Reviewer: codex/gpt-5.5 improvement_reviewer visible subagent
Scope: Current uncommitted Career Playbook changes for `mc2-db696.88`, `mc2-db696.89`, and `mc2-db696.90` against base `1721a9b482b948f214865ea1bd38cc64d0833929`.

## Summary Verdict

Verdict: **NEEDS WORK before delivery** because one retry/progress edge case can preserve stale generation error state across a new active attempt. The rest of the implementation is broadly aligned with existing patterns: no new dependency is warranted, the share flow correctly reuses the existing visibility mutation, and the diagnostics work is mostly a pure helper extraction plus focused tests.

Findings: 4 total

- Must-fix: 1
- High-value improvement: 2
- Optional/nit: 1

## Improvement Findings

### 1. Retry progress guard can keep stale `generation_error` after a failed high-percent run

- Severity: High
- Classification: **must-fix**
- Priority: P1
- Current approach: `persistGenerationProgressBestEffort` skips lower non-terminal progress before it strips `generation_error` from stored QA data (`packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:522`). Failed attempts persist `generation_error` and failed progress at 100% (`packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:495`). The tests cover lower active progress over 98% (`packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts:747`) and a clean retry (`packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts:795`), but not the combined case: previous terminal `failed` at 100% plus a new active progress update at 70%.
- Suggested alternative: Only apply the monotonic skip when the previous progress is also non-terminal, for example `previousProgress.success && !isTerminalGenerationStage(previousProgress.data.stage) && !isTerminalGenerationStage(progress.stage) && previousProgress.data.percent > progress.percent`. For terminal previous progress, allow the new active update to persist and clear `generation_error`; also consider resetting `started_at` in `buildGenerationProgress` when previous progress was terminal (`packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:574`).
- Expected value: Prevents users/operators from seeing an old failed generation error while a retry is active, and makes the stage summary claim about clearing stale retry errors true for both `job_status` and playbook QA data.
- Tradeoff/cost: Small backend change plus one regression test; low blast radius.
- Affected files: `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts`, `packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts`
- Confidence: High

### 2. Cross-block judge issue IDs can collide for distinct issues on the same target block

- Severity: Medium
- Classification: **high-value improvement**
- Priority: P2
- Current approach: `collectJudgeQualityIssues` now builds IDs from the target `issue.block_id` and the issue's local index inside each carrier block verdict (`packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:146`). That fixes copied verdicts pointing actions at the flagged block, but two different carrier verdicts can both emit their first issue for `block_4`, producing duplicate `cross_block_judge:block_4:0` IDs. Semantic dedupe keeps distinct messages (`packages/course-gen-platform/src/stages/stage-career-playbook/quality-diagnostics.ts:26`), and the viewer uses `issue.id` as the React key (`packages/web/components/career-playbook/viewer/PlaybookViewer.tsx:1092`).
- Suggested alternative: Keep `blockId: issue.block_id` for user actions, but make `id` unique by including the carrier block id or a stable semantic suffix, e.g. `cross_block_judge:<carrierBlockId>:<targetBlockId>:<index>`. The semantic dedupe helper can still collapse copied identical verdicts before persistence.
- Expected value: Avoids React duplicate-key warnings and preserves stable rendering when the system legitimately has multiple different quality findings for one block.
- Tradeoff/cost: Small change and test expectation updates; IDs become less compact.
- Affected files: `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts`, `packages/course-gen-platform/tests/unit/orchestrator/handlers/career-playbook-handler.test.ts`, potentially viewer tests if snapshots/assertions depend on exact IDs.
- Confidence: Medium-high

### 3. Quality diagnostics policy is duplicated between backend and frontend

- Severity: Medium
- Classification: **high-value improvement**
- Priority: P2
- Current approach: Backend helper `quality-diagnostics.ts` defines text normalization, internal-warning filtering, semantic keys, and dedupe (`packages/course-gen-platform/src/stages/stage-career-playbook/quality-diagnostics.ts:3`). The viewer reimplements the same logic locally (`packages/web/components/career-playbook/viewer/PlaybookViewer.tsx:1219`). `@megacampus/shared-types` already owns and exports the Career Playbook quality issue contract (`packages/shared-types/src/career-playbook.ts:394`, `packages/shared-types/src/index.ts:105`).
- Suggested alternative: Move the pure diagnostic helpers next to `CareerPlaybookQualityIssueSchema` in `packages/shared-types/src/career-playbook.ts` or a `career-playbook-diagnostics.ts` submodule, then import them from both backend and web. No external package is needed.
- Expected value: One source of truth for which warnings are internal and how semantic duplicates are identified, reducing future backend/frontend drift.
- Tradeoff/cost: Slightly broadens `shared-types` from schemas/contracts into a tiny pure policy helper. If the team wants `shared-types` to stay schema-only, keep duplication but add a comment/test asserting parity.
- Affected files: `packages/shared-types/src/career-playbook.ts` or new shared-types submodule, `packages/course-gen-platform/src/stages/stage-career-playbook/quality-diagnostics.ts`, `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`, related tests.
- Confidence: High

### 4. Visibility update response parsing is duplicated across viewer and library pages

- Severity: Low
- Classification: **optional/nit**
- Priority: P3
- Current approach: The viewer page has `readVisibilityUpdateResult` (`packages/web/app/[locale]/career-playbook/[id]/page-client.tsx:146`) and the library page has nearly identical `readVisibilityResult` (`packages/web/app/[locale]/career-playbook/library/page-client.tsx:163`). There is already a `library/normalizers.ts` module for frontend Career Playbook response adaptation (`packages/web/components/career-playbook/library/normalizers.ts:1`).
- Suggested alternative: Extract a shared `normalizeVisibilityUpdateResult` and shared permission reader into the library adapter/normalizer layer, then reuse from both pages.
- Expected value: Keeps `shareSlug`, `organizationSlug`, and `viewerPermissions` parsing consistent if the tRPC response shape evolves.
- Tradeoff/cost: Small frontend refactor; not worth blocking delivery if finding 1 is fixed and tests pass.
- Affected files: `packages/web/components/career-playbook/library/normalizers.ts`, `packages/web/app/[locale]/career-playbook/[id]/page-client.tsx`, `packages/web/app/[locale]/career-playbook/library/page-client.tsx`
- Confidence: High

## Reuse / Build-vs-Buy Assessment

- No new external dependency is warranted. The new behavior is small TypeScript normalization, dedupe, and UI state handling; existing `zod`, React state, shadcn/ui, lucide icons, and `copyToClipboard` cover the needs.
- Good existing reuse: the private share flow uses `updateCareerPlaybookVisibility` rather than adding another publish endpoint (`packages/web/app/[locale]/career-playbook/[id]/page-client.tsx:515`), and the backend reuses `dedupeCareerPlaybookQualityIssues` in both completion persistence and detail mapping (`packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts:212`, `packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts:729`).
- Best reuse opportunity before/after delivery: make Career Playbook diagnostic filtering/dedupe a shared pure helper in `@megacampus/shared-types`, because the backend and frontend now need identical policy and already share the underlying quality issue type.
- Keep local, not dependency: the fair regeneration selection sort in `selectPendingCareerPlaybookRegeneration` is simple and readable (`packages/course-gen-platform/src/stages/stage-career-playbook/nodes/block-regenerator.ts:249`); pulling in a utility library would be worse than the current code.

## Top 3 Next Improvements

1. **In-scope quick fix before delivery:** Fix the terminal-previous-progress retry path so active retry progress clears stale `generation_error`; add a regression test for previous `failed`/100% plus new 70% progress.
2. **In-scope quick fix if time permits:** Make cross-block judge quality issue IDs unique across carrier verdicts while keeping user actions targeted at `issue.block_id`.
3. **Follow-up worth tracking in Beads:** Move quality diagnostic helpers to shared-types or otherwise enforce backend/frontend parity for internal warning filtering and semantic dedupe.

## Docs Impact

docs-reviewed: no-change-needed for product/operator docs. These findings affect implementation correctness and helper ownership, not public API, schema, route, deployment, or durable operator workflow documentation. If finding 3 is accepted and shared-types exports change, `.codex/project-index.md` still does not need an update because it already lists shared Career Playbook contracts.

graph-reviewed: used-read-only. `graphify-out/GRAPH_REPORT.md` was read; graph is based on `1721a9b4`, so diff/current files were treated as source of truth.

## Explicit Defers

- Full `pnpm type-check` and `pnpm build` were not run by this reviewer to respect the read-only review constraint and avoid cache/build mutations. Stage summaries report targeted tests/type-check; `mc2-db696.91` tracks unrelated Next standalone build instability.
- No Beads tasks were created because this subagent was constrained to read-only review except this artifact.

# Verification

- `git diff --check`: passed.
- `python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.92/artifacts/improvement-review.md`: passed after artifact metadata normalization.
- Full `pnpm type-check` / `pnpm build`: not run for this read-only review scope.

# Risks / Follow-ups / Explicit Defers

- Blocker: fix finding 1 before delivery unless the orchestrator explicitly accepts stale retry QA error risk.
- Quick fix: address finding 2 if the same delivery pass is already touching handler tests.
- Follow-up: track shared diagnostic helper extraction in Beads if not handled now.
- Explicit defers match the section above: no full build/type-check and no Beads writes from this reviewer.
