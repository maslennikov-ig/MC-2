# Stage mc2-db696.27 Summary

Status: ready for PR update on `codex/career-playbook-authoritative-roles-flow`
Updated: 2026-05-23
Branch: `codex/career-playbook-authoritative-roles-flow`
Base: `origin/develop`

## Scope

- Continued PR #47 after user feedback that the existing constructor still felt narrow, old, and unclear.
- Used LazyWeb references to move the Career Playbook / "Должностная инструкция" constructor toward a wide workbench pattern rather than a narrow wizard card.
- Fixed the user-visible `Career Playbook is not ready for generation` failure path.
- Created follow-up Beads task `mc2-db696.28` for replacing the temporary role-title overlay with a reproducible ESCO import subset.

## Routing

- Classification: medium/complex.
- Skills used: `orchestrator-stage`, `task-router`, `frontend-aesthetics`, `ux-researcher-designer`, `ui-design-system`, `webapp-testing`, `code-review`, `systematic-debugging`, `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:verification-before-completion`.
- Documentation: Context7 for Next.js App Router/client component and Tailwind responsive grid behavior; official ESCO/O\*NET/Lightcast source checks; 21st.dev onboarding/checklist inspiration.
- Catalog candidates: none promoted; installed skills were sufficient.
- Visible subagents:
  - `Carson` - read-only root cause for generation readiness.
  - `Lagrange` - read-only screen/test map for the constructor UI.
  - `Leibniz` - read-only code review and recheck.

## Parallel Decomposition Matrix

| Stream         | Goal                                     | Owner    | Write zone                                      | Dependencies          | Verification                                | Reasoning | Decision                      | Reason                           |
| -------------- | ---------------------------------------- | -------- | ----------------------------------------------- | --------------------- | ------------------------------------------- | --------- | ----------------------------- | -------------------------------- |
| UX/reference   | Synthesize LazyWeb/21st patterns         | local    | docs only                                       | none                  | plan doc                                    | high      | parallel                      | Independent research             |
| Readiness bug  | Find why generation can reject           | Carson   | read-only                                       | none                  | root-cause report                           | high      | parallel                      | Independent backend/client trace |
| Screen map     | Identify screen owners and safe UI slice | Lagrange | read-only                                       | none                  | implementation map                          | medium    | parallel                      | Independent codebase audit       |
| Implementation | Apply UI/state/backend/test changes      | local    | web wizard/store/page/tests + backend readiness | research + root cause | focused tests, type-check, lint, e2e, build | high      | sequential                    | Shared write zones               |
| Review         | Check diff for regressions               | Leibniz  | read-only                                       | implementation diff   | review + recheck                            | high      | parallel after implementation | Independent review               |

## Implementation Notes

- `packages/web/app/[locale]/career-playbook/new/page-client.tsx`
  - Compact header and `max-w-[1480px]` workspace.
  - Shared three-column layout for fixed questions, follow-up loading/unavailable, active follow-ups, completion review, generation status/error/action.
  - Passes skipped follow-up IDs into the rail so skipped questions look handled.
- `packages/web/components/career-playbook/wizard/Wizard.tsx`
  - Adds question rail and answered context panel.
  - Keeps navigation simple and removes the global free-answer action.
- `packages/web/components/career-playbook/wizard/FollowupPhase.tsx`
  - Adds follow-up rail, completeness panel, and handled state for skipped questions.
  - Keeps "Достаточно, сгенерируй" but completion marks unanswered generated questions skipped before approval.
- `packages/web/components/career-playbook/wizard/CompletionScreen.tsx`
  - Moves review and generation controls into a wider review workbench.
- `packages/web/components/career-playbook/wizard/ProgressIndicator.tsx`
  - Percent follows current step; answered count remains separate.
- `packages/web/stores/use-career-playbook-store.ts`
  - Stable optional `company_stage`.
  - Unanswered follow-ups are marked skipped/dirty before completion review.
- `packages/course-gen-platform/src/server/routers/career-playbook/service.ts`
  - Fixed-only generation fallback requires core fixed answers and no stored follow-up questions.
  - Does not require stored `content_language` inside fixed Q/A because the playbook row already stores language.

## Verification Evidence

- `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/career-playbook-store-followups.test.ts tests/unit/career-playbook-store-viewer.test.ts tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx` - passed, 75 tests.
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/server/routers/career-playbook.router.test.ts` - passed, 38 tests.
- `pnpm type-check` - passed.
- `pnpm --filter @megacampus/web lint` - passed with 7 existing warnings outside this scope.
- `PLAYWRIGHT_PORT=3187 pnpm --filter @megacampus/web test:e2e:career-playbook` - passed 3 tests; 2 authenticated tests skipped because `TOKEN` is not set.
- `pnpm build` - passed with existing Browserslist and `url.parse()` warnings.
- `git diff --check` - passed.

## Explicit Defers

- `mc2-db696.28`: ESCO import subset and normalized role-source pipeline.
- Authenticated screenshots/flow require `TOKEN` or storage state.
