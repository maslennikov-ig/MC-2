# Stage Summary: mc2-db696.94

Date: 2026-06-28
Branch: develop
Beads: `mc2-db696.94`, `mc2-db696.98`, and `mc2-db696.91` closed locally

## Scope

Continuation of the Career Playbook local hardening work after `mc2-db696.92`.

| Stream                | Goal                                                                                     | Decision                          | Notes                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| shared diagnostics    | Move Career Playbook diagnostic dedupe/filter policy into `@megacampus/shared-types`     | done                              | Reused by backend persistence/read mapping and web viewer                                                                                      |
| visibility normalizer | Share `updateCareerPlaybookVisibility` response parsing between reader and library pages | done                              | Tracked as `mc2-db696.98`                                                                                                                      |
| build instability     | Re-check intermittent Next trace ENOENT                                                  | locally resolved / not reproduced | `node_modules` was stale (`next@15.5.12` while lockfile requires `15.5.19`); after `pnpm install --frozen-lockfile`, build passed on `15.5.19` |

No subagents were launched: the repo contract requires a clean git status and dedicated worktree for write-heavy delegation, while the primary worktree already contains mixed uncommitted Career Playbook stage changes.

Prompt-check not run: no subagent prompt was emitted.

## Changes

- Added shared Career Playbook diagnostic helpers in `packages/shared-types/src/career-playbook.ts`:
  - `dedupeCareerPlaybookQualityIssues`
  - `careerPlaybookQualityIssueKey`
  - `isInternalCareerPlaybookGenerationWarning`
  - `getUserVisibleCareerPlaybookWarnings`
- Updated backend handler and library detail mapping to import the shared helpers.
- Updated `PlaybookViewer` to use the same shared helper policy as backend read/persist mapping.
- Added `normalizeVisibilityUpdateResponse` in `packages/web/components/career-playbook/library/normalizers.ts`.
- Updated Career Playbook reader and library clients to reuse the shared visibility response parser.
- Added shared-types and web normalizer regression tests.

## Verification

RED checks observed before implementation:

- `pnpm --filter @megacampus/shared-types test -- tests/career-playbook.test.ts`: failed on missing diagnostic helper exports.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/library-normalizers.test.ts`: failed on missing `normalizeVisibilityUpdateResponse`.

Passed after implementation and after `pnpm install --frozen-lockfile` synchronized local install to the lockfile:

- `pnpm --filter @megacampus/shared-types test -- tests/career-playbook.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/stages/stage-career-playbook/block-regenerator.test.ts tests/unit/career-playbook-library-service.test.ts`
- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/library-normalizers.test.ts`
- `git diff --check`
- `pnpm type-check`
- `pnpm build` on `next@15.5.19`

Notes:

- Web tests still emit existing mocked Next Image warnings for boolean `fill`/`unoptimized`.
- Build still emits existing Browserslist staleness, Supabase Edge Runtime, webpack cache, and Node `url.parse()` warnings.

## Docs And Graph

Docs-reviewed: no-change-needed - no public API, tRPC schema, DB schema, route, deployment, or operator workflow changed.

Project-index: reviewed-no-change - touched existing Career Playbook backend/shared-types/web viewer/library/test paths already covered by `.codex/project-index.md`; no new stable route, package, integration, verification command, or ownership boundary was added.

Graph-reviewed: blocked - Graphify was used for routing; post-change `graphify update .` refused non-force overwrite because the new graph had 52,429 nodes vs existing 52,442. No `--force` was run in the mixed dirty worktree.

## Remaining Work

- No tracked code defers for this stage.
- Delivery remains deferred until the mixed local Career Playbook work is intentionally staged/committed/pushed.
