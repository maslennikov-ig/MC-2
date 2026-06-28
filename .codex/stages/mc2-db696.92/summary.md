# Stage Summary: mc2-db696.92

Date: 2026-06-28
Branch: develop
Beads: `mc2-db696.92` closed locally

## Scope

Review-and-fix pass for local uncommitted Career Playbook stages:

- `mc2-db696.88` generation stability
- `mc2-db696.89` private share confirmation/public-link UX
- `mc2-db696.90` quality diagnostics dedupe/filtering/fair retry

Two visible Codex reviewer subagents were launched in parallel:

| Stream      | Agent                  | Write Zone                                                        | Decision |
| ----------- | ---------------------- | ----------------------------------------------------------------- | -------- |
| correctness | `correctness_reviewer` | `.codex/stages/mc2-db696.92/artifacts/correctness-review.md` only | accepted |
| improvement | `improvement_reviewer` | `.codex/stages/mc2-db696.92/artifacts/improvement-review.md` only | accepted |

Both prompts passed `orch-prompts prompt-check --runtime codex --profile gpt-5.5 --kind review`.

## Accepted Findings And Fixes

- Accepted: stale lower-progress `generating` response could regress an already `completed` frontend state and keep polling alive.
  - Fix: `applyCareerPlaybookGenerationStatus` now rejects stale/lower active updates before mutating `status`/`phase`, and refresh returns the actual current generating state.
  - Test: `career-playbook-store.test.ts` covers completed/100% resisting stale generating/72%.
- Accepted: backend active retry progress could be skipped after a terminal failed/100% state, preserving stale `generation_error`.
  - Fix: persisted progress monotonic skip now applies only when previous progress is non-terminal; new active progress after terminal failure clears stored `generation_error`.
  - Test: handler test covers previous failed/100 plus new preparing_context/70.
- Accepted: distinct cross-block judge issues targeting the same block could share duplicate IDs.
  - Fix: judge quality issue IDs now include carrier block id and target block id while `blockId` remains the action target.
  - Test: handler tests cover dedupe of copied verdicts and unique IDs for distinct same-target findings.
- Accepted: block regenerator LLM-path coverage was accidentally narrowed.
  - Fix: restored direct tests for prompt rendering, other-block brief ordering, attempt incrementing, node cost, and invalid markdown rejection, while keeping the new fair-selection test.

## Rejected Or Deferred Findings

- Deferred/tracked: move backend/frontend quality diagnostic helper policy into shared-types. Useful, but broader than this review-fix pass because it changes shared contract surface. Tracked as `mc2-db696.94`.
- Deferred/untracked P3: extract duplicate visibility update response normalizer between viewer and library pages. Low-value cleanup; include in Top 3 next improvements but not a blocker.
- Tracked pre-existing: intermittent Next standalone trace-copy instability remains `mc2-db696.91`; latest `pnpm build` passed, but root cause was not investigated here.

## Verification

Passed:

- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/block-regenerator.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/stages/stage-career-playbook/block-regenerator.test.ts tests/unit/career-playbook-library-service.test.ts`
- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.92/artifacts/correctness-review.md`
- `python3 scripts/orchestration/validate_artifact.py .codex/stages/mc2-db696.92/artifacts/improvement-review.md`
- `git diff --check`
- `pnpm type-check`
- `pnpm build`
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.92`

Notes:

- Web viewer tests still emit existing React attribute warnings for mocked Next Image `fill`/`unoptimized`.
- Build passed with existing Browserslist and Node `url.parse()` deprecation warnings.

## Top 3 Next Improvements

1. Fix or characterize `mc2-db696.91` if the Next standalone trace-copy ENOENT recurs; latest build passed but the prior intermittent failure is not root-caused.
2. Extract shared Career Playbook diagnostic helpers to `@megacampus/shared-types` or add parity tests/comments if shared-types should stay schema-only (`mc2-db696.94`).
3. Extract the duplicated visibility update response parser between viewer and library page clients when touching that code next.

## Closeout Markers

docs-reviewed: no-change-needed - fixes harden existing Career Playbook behavior/tests without public API, schema, route, migration, deployment, or operator workflow changes.

project-index: reviewed-no-change - touched existing Career Playbook backend/store/viewer/test paths already listed in `.codex/project-index.md`; no new stable entrypoint, package, route, integration, or ownership boundary.

graph-reviewed: blocked - Graphify was used for orientation; post-change `graphify update .` refused non-force overwrite because the new graph had 52,419 nodes vs existing 52,442. No `--force` was run in the mixed dirty worktree.
