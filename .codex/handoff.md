# Orchestrator Handoff

Updated: 2026-06-28
Stage: `mc2-db696.93` Career Playbook numeric review navigation implemented, review-fixed, and follow-ups applied locally
Branch: `codex/career-playbook-numeric-review`
Worktree: `/home/me/code/mc2/.worktrees/career-playbook-numeric-review`
Beads: `mc2-db696.93` in progress pending delivery decision; follow-ups `mc2-db696.95`, `mc2-db696.96`, and `mc2-db696.97` closed locally

## Current State

- Implemented the approved numeric-review plan in an isolated worktree because `/home/me/code/mc2` had unrelated dirty Career Playbook changes.
- Review pass used visible Codex subagents: `correctness_reviewer` and `improvement_reviewer`. Artifacts are under `.codex/stages/mc2-db696.93/artifacts/`.
- Accepted and fixed review findings:
  - boundary-aware evidence matching prevents count `1` from becoming `verified/source_document` just because evidence contains `18%`;
  - markdown table row-number cells are skipped specifically, while actionable single-value table timelines like `2 недели` are retained as `needs_review`;
  - `viewer-page-client.test.tsx` EN/RU test fixtures include the new numeric-review copy keys, removing `MISSING_MESSAGE` warnings.
- Backend `numeric-facts.ts` filters low-signal checklist/table/ordinal digits and requires contextual evidence before marking a value `verified/source_document`.
- Frontend shows only actionable numeric facts (`needs_review`, `suggested`, `conflict`, plus quiet `benchmark`) and hides legacy noisy `verified/count` facts from inline highlights and the right rail.
- Right rail copy is now `Проверка чисел` with explanatory text, counters, clickable rows, and action/aria hints.
- Clicking a row expands the block if collapsed, updates `#blockId`, scrolls/focuses the exact inline trigger by stable DOM id, and does not open the numeric editor sheet.
- Follow-ups implemented:
  - `mc2-db696.95`: the numeric review list has a bounded scroll container for long actionable lists, with click navigation preserved.
  - `mc2-db696.96`: stable numeric fact DOM ids now come from a shared Career Playbook helper used by both viewer and markdown renderer.
  - `mc2-db696.97`: compact numeric status labels are explicit RU/EN copy keys instead of derived from count labels.

## Verification

- RED observed: backend unit failed on new regressions for row number `1` next to `18%` and table timeline `2 недели` before the fix.
- RED observed: helper unit failed before the shared numeric DOM id helper existed.
- RED observed: numeric rail unit failed before compact status labels and bounded long-list markup existed.
- `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/numeric-facts.test.ts`: passed, 7 tests.
- `pnpm --filter @megacampus/web test -- tests/unit/lib/career-playbook/numeric-facts.test.ts`: passed, 1 test.
- `pnpm --filter @megacampus/web test -- tests/unit/components/markdown/markdown-renderer-full-numeric.test.tsx`: passed, 3 tests.
- `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx -t numeric`: passed, 4 selected tests.
- `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer-page-client.test.tsx`: passed, 9 tests.
- `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/viewer.test.tsx`: still fails on two quality-warning tests from this isolated branch baseline; numeric tests in the same file pass, and the full file is 14/16 green. Closed task `mc2-db696.90` contains the related quality-warning viewer fixes but is not in this worktree base.
- `pnpm type-check`: passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key pnpm build`: passed with existing Next root inference, Browserslist, and Node `url.parse` warnings.
- `git diff --check`: passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role-key NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.93`: passed after the follow-up pass. An earlier closeout attempt without env failed on required Supabase env vars only.

## Explicit defers

- No in-scope implementation defer.
- Full viewer unit file remains red in this branch until `mc2-db696.90` quality-warning viewer fixes are integrated/rebased into this worktree.
- Commit, push, PR, merge, and deploy were not performed; remote/delivery actions need explicit authorization.

## Closed follow-ups

- `mc2-db696.95`: Validate Career Playbook numeric review rail with long actionable lists.
- `mc2-db696.96`: Share Career Playbook numeric fact DOM id helper.
- `mc2-db696.97`: Add explicit compact labels for Career Playbook numeric review statuses.

## Next recommended

Next stage id: `mc2-db696.93`
Recommended action: review the local diff, then either commit this branch directly or rebase/merge it onto the branch that already contains `mc2-db696.90` before running the full viewer test file again.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue `mc2-db696.93` from worktree `/home/me/code/mc2/.worktrees/career-playbook-numeric-review` on branch `codex/career-playbook-numeric-review`. Numeric review implementation and targeted gates are green; full `viewer.test.tsx` has baseline quality-warning failures because closed `mc2-db696.90` is not in this isolated branch base. Do not push, create PR, merge, deploy, or clean the worktree without explicit authorization.

## Closeout Markers

docs-reviewed: no-change-needed - behavior is covered by code/tests and existing project index already points to the Career Playbook viewer/extractor/message entrypoints; no durable operator/API doc changed.
graph-reviewed: updated - `graphify update . && graphify cluster-only . --no-viz` completed during follow-up closeout.
