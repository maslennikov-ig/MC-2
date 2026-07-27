# Stage Summary: mc2-db696.93

Date: 2026-06-28
Branch: `codex/career-playbook-numeric-review`
Worktree: `/home/me/code/mc2/.worktrees/career-playbook-numeric-review`
Status: review-and-fix plus follow-ups implemented locally; delivery pending explicit commit/push/PR authorization

## Goal

Reduce noisy Career Playbook numeric provenance and reframe the feature as a practical numeric review workflow: only risky/actionable values are shown, the right rail explains why, and clicking a listed number scrolls/focuses the exact inline annotation.

## Routing And Stage Setup

- Classification: medium/complex, file-changing Career Playbook backend + frontend behavior.
- Beads selected: `mc2-db696.93` under parent `mc2-db696`.
- Repo truth read: `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads, git status, and stage artifacts.
- Graphify used before implementation/review: `graphify-out/GRAPH_REPORT.md` plus focused `graphify query` for Career Playbook numeric extractor/viewer/renderer paths.
- Docs L1/L2: no lookup needed; no dependency/API/platform behavior changed.
- Reuse/build-vs-buy: reused existing `numeric_facts` schema, `library.updateNumericFact` contract, `MarkdownRendererFull`, and `PlaybookViewer` rail patterns. No new library or DB migration.

## Parallel Decomposition

| Stream | Goal | Agent | Write Zone | Dependencies | Verification | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Backend numeric extraction | Suppress low-signal digits and require contextual source verification | Local orchestrator | `numeric-facts.ts`, backend unit test | Existing shared schema | RED/GREEN backend unit | Local/sequential |
| Frontend numeric review UX | Filter legacy noise, rename rail, add clickable review list and scroll/focus | Local orchestrator | viewer, renderer, messages, web unit tests | Backend statuses; existing viewer state | RED/GREEN web unit | Local/sequential |
| Correctness review | Find material bugs/regressions in the diff | `correctness_reviewer` subagent | `.codex/stages/mc2-db696.93/artifacts/correctness-review.md` | Implementation diff | Artifact + targeted gates | Parallel read-only |
| Improvement review | Find high-value improvements and reuse/build-vs-buy issues | `improvement_reviewer` subagent | `.codex/stages/mc2-db696.93/artifacts/improvement-review.md` | Implementation diff | Artifact + targeted gates | Parallel read-only |
| Follow-ups | Bound long review rail, share numeric DOM id helper, add compact status labels | Local orchestrator | viewer, renderer helper, messages, tests | Same files overlap, so parallel write streams would conflict | RED/GREEN targeted web unit | Local/sequential |
| Verification/closeout | Run gates, docs/graph review, stage closeout | Local orchestrator | stage summary, handoff, Beads | Implementation/review complete | targeted tests, `pnpm type-check`, `pnpm build`, closeout | Local |

Visible Codex subagents were used for the review-and-fix pass because the repo contract preauthorizes them for medium/complex independent review streams.

## Accepted Findings And Fixes

- Accepted: count evidence matching could verify row/list digit `1` from unrelated `18%`. Fixed by making evidence value matching boundary-aware, with stricter boundaries for `count`.
- Accepted: markdown table filtering was too coarse and hid useful single-value timelines such as `2 недели`. Fixed by skipping row-number table cells specifically while preserving actionable table `duration`/`date` matches.
- Accepted: `viewer-page-client.test.tsx` lacked new numeric-review copy keys, causing `MISSING_MESSAGE` warnings despite a passing test. Fixed the EN/RU test fixture messages.

## Rejected Or Completed Follow-ups

- Rejected now: adding a numeric/entity parsing dependency or schema migration; current value is better served by local Career Playbook heuristics.
- Completed: `mc2-db696.95` bounded the numeric review rail for long actionable lists while preserving click navigation.
- Completed: `mc2-db696.96` moved stable numeric fact DOM id generation into a shared Career Playbook helper used by viewer and markdown renderer.
- Completed: `mc2-db696.97` added explicit compact numeric status labels in viewer copy and RU/EN messages.

## Implementation Outcome

- Backend extractor skips low-signal table/checklist/ordinal digits such as row numbers, `1-я`, and checklist ranges.
- `verified/source_document` now requires contextual evidence around the same value, not a bare raw-number match anywhere in evidence JSON.
- Source-backed business values such as `12 млн ₽`, `2.5%`, and `80 MQL/месяц` remain verifiable.
- `MarkdownRendererFull` no longer annotates heading numbers, still skips code/links, and gives inline numeric triggers stable DOM ids/data attributes.
- `PlaybookViewer` filters display to `needs_review`, `suggested`, `conflict`, and quiet `benchmark`; legacy `verified/count` facts are hidden from inline text and the rail.
- Right rail copy is now `Проверка чисел` with an explanation, counters, clickable review rows, and aria/action hints.
- Rail click expands a collapsed block, updates hash/active block, scrolls to the exact inline trigger, focuses it, and does not open the editor sheet.
- Long actionable review lists are bounded inside the rail with their own scroll container.
- Numeric inline trigger DOM ids now come from one shared helper, avoiding viewer/renderer drift.
- Compact status labels are explicit copy keys instead of derived by stripping text from count labels.

## Verification

- RED: backend unit failed on new regressions for row number `1` next to `18%` and table timeline `2 недели` before the fix.
- RED: web unit for the shared numeric DOM id helper failed before the helper existed.
- RED: numeric review rail tests failed before compact `Проверить` labels and bounded long-list markup existed.
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts`: passed, 7 tests.
- `pnpm --filter @megacampus/web test -- tests/unit/lib/career-playbook/numeric-facts.test.ts`: passed, 1 test.
- `pnpm --filter @megacampus/web test -- tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx`: passed, 3 tests.
- `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx -t numeric`: passed, 4 selected tests.
- `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx`: passed, 9 tests.
- `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx`: failed on two known quality-warning baseline tests from missing closed `mc2-db696.90`; numeric tests in the same file passed, with 14/16 tests green overall.
- `pnpm type-check`: passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm build`: passed with existing Next root inference, Browserslist, and Node `url.parse` warnings.
- `git diff --check`: passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.93`: passed after the follow-up pass. An earlier closeout attempt without env failed on required Supabase env vars only.

## Explicit Defers

- Full `viewer.test.tsx` remains red in this isolated branch until `mc2-db696.90` quality-warning viewer fixes are integrated/rebased into this worktree.
- Commit/push/PR/merge/deploy not performed; remote delivery requires explicit authorization.

## Closeout Markers

- docs-reviewed: no-change-needed - behavior is covered by code/tests and existing project index already points to the Career Playbook viewer/extractor/message entrypoints; no durable operator/API doc changed.
- graph-reviewed: updated - `graphify update . && graphify cluster-only . --no-viz` completed during follow-up closeout.
- project-index: reviewed-no-change - no new stable entrypoint, route, directory, integration, or ownership boundary was added.
