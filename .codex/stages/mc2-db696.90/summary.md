# Stage Summary: mc2-db696.90

Date: 2026-06-28
Branch: develop
Beads: `mc2-db696.90` closed locally

## Scope

Career Playbook quality diagnostics stability:

- dedupe semantically identical user-visible quality issues during persistence and read-time mapping
- keep internal retry warnings in stored diagnostics while hiding them from viewer/library user warnings
- make cross-block judge issue IDs use the flagged block id instead of the verdict carrier block
- make block regeneration selection fair across flagged blocks and expand the judge-window budget to a bounded total of 8 attempts
- add a viewer-side safety net that dedupes visible issues and filters internal retry warnings before grouping/counting

No public tRPC schema, DB schema, shared type, or route changes were made. No live DB cleanup was performed.

## Implementation Notes

- Added `quality-diagnostics.ts` for Career Playbook backend semantic issue keys, dedupe, warning normalization, and internal-warning filtering.
- Updated generation persistence and library detail mapping to return deduped `qualityIssues` and user-facing `qualityWarnings`.
- Internal warnings like `crossBlockJudge advanced after max regeneration attempts...` remain in `q_a_data.generation_warnings` for diagnostics but no longer become per-block user actions.
- `selectPendingCareerPlaybookRegeneration` now chooses the flagged block with the fewest attempts, preserving judge order for ties.
- Cross-block judge capping now advances when either the total window budget is exhausted or all scoped flagged blocks hit their per-block limit.

## Verification

Passed:

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/stages/stage-career-playbook/block-regenerator.test.ts tests/unit/career-playbook-library-service.test.ts`
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx`
- `git diff --check`
- `pnpm type-check`

Blocked/failing:

- `pnpm build` failed twice in `@megacampus/web` during Next standalone trace collection after successful compilation/static generation:
  - first failure: ENOENT copying generated `page_client-reference-manifest.js` / `routes-manifest.json`
  - second failure: ENOENT opening `.next/server/app/_not-found/page.js.nft.json`
- This build instability is tracked separately as `mc2-db696.91`.

## Closeout Markers

docs-reviewed: no-change-needed - behavior hardens existing Career Playbook generation/viewer diagnostics without public API, schema, route, migration, or operator workflow changes.

project-index: reviewed-no-change - touched existing Career Playbook backend/viewer/test areas plus one colocated backend diagnostics helper; no new package, route family, service boundary, or durable ownership entry needs indexing.

graph-reviewed: blocked - Graphify routing was used earlier; after code changes, `graphify update .` refused to overwrite because the new graph had 52,380 nodes vs existing 52,442 and warned about possibly missing chunk files. No `--force` was run because the worktree already contains mixed dirty state from prior stages.
