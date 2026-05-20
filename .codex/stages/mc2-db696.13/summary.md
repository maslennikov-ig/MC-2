# Stage mc2-db696.13 - Career Playbook generation completion transport

Started: 2026-05-19
Updated: 2026-05-19
Branch: `codex/career-playbook-generation-status`
Base: `feature/career-playbook-pdf` at `de8efa066ad4d72bde2b5e0ee7e32bba31e45a59`

## Goal

Close the explicit follow-up from `mc2-db696.12`: make Career Playbook generation complete through the worker path, persist generated output, and let the frontend observe completion over the currently available transport.

## Routing

- Documentation: Context7 tRPC v11 and TanStack Query v5. tRPC subscriptions require `httpSubscriptionLink` plus `splitLink`; current app uses `httpBatchLink`, so polling over existing `generation.getStatus` is the conservative MVP transport.
- Selected skills: `orchestration-setup`, `orchestrator-stage`, `task-router`, `superpowers:test-driven-development`, `superpowers:using-git-worktrees`, `superpowers:subagent-driven-development`, `superpowers:requesting-code-review`, `superpowers:receiving-code-review`, `superpowers:verification-before-completion`.
- Selected agents/personas: visible Codex workers for backend/frontend, visible explorer reviewer, visible correctness reviewer, visible improvement reviewer.
- Catalog candidates: none; installed skills and local code patterns were sufficient.

## Parallel Decomposition Matrix

| Stream                     | Goal                                                            | Agent                                             | Write zone                                                                     | Dependencies                               | Verification                                      | Decision                                                       | Reason                                                                                         |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Backend queue persistence  | Enqueue Career Playbook jobs and persist completion/failure     | worker Boyle, then local orchestrator integration | shared job types, backend router/service, processor/worker, backend unit tests | Existing graph and Supabase admin patterns | backend router/handler/processor/queue unit tests | parallel, accepted after local correction                      | Disjoint from frontend; worker patch required orchestrator correction to avoid fake `courseId` |
| Frontend polling transport | Observe `getStatus` until completed/failed and update wizard UI | worker Gibbs, then local orchestrator integration | web store, wizard page/UI, web unit tests/messages                             | Existing status shape                      | web store/page unit tests                         | parallel, accepted after local TDD pass                        | Consumes backend status contract without backend file writes                                   |
| Initial read-only review   | Find missing routing/security/status gaps                       | explorer Wegener                                  | read-only                                                                      | Reviews both streams                       | Markdown report                                   | parallel, accepted                                             | Independent review found mandatory worker routing and privacy issues                           |
| Final code review          | Correctness/security and improvement review                     | Goodall, Bacon                                    | read-only                                                                      | Reviews implemented diff                   | Markdown reports and orchestrator adjudication    | sequential after implementation, accepted/rejected per finding | Needed after GREEN to catch retry and consistency risks                                        |
| Review fixes               | Fix accepted findings                                           | local orchestrator                                | backend queue/service/handler/shared types, web store/page/UI/tests            | Review reports                             | focused tests, type-check, lint, build            | sequential                                                     | Dependent on accepted review findings                                                          |

## Accepted Findings And Fixes

- Worker routing: `JobType.CAREER_PLAYBOOK` is registered in the sandbox processor.
- Queue payload: Career Playbook jobs use `playbookId`, not fake `courseId`.
- Worker completion: `GENERATE_PLAYBOOK` persists `completed`, generated blocks, final markdown, cost data, and `completed_at`.
- Worker failures: retryable failures throw for BullMQ retries; `failed` is persisted only on the final attempt.
- Status transport: frontend polls `generation.getStatus` while status is `generating` and stops at terminal states.
- Idempotency and retry: repeated approve calls do not enqueue while `generating`/`completed`; retry removes stale terminal jobs for the stable playbook job id.
- Enqueue compensation: if queue enqueue fails after DB status update, the playbook is marked `failed` with `generation_error`.
- Stale errors: successful completion clears old `q_a_data.generation_error`; status responses only expose errors for `failed`.
- Privacy/access: status/block reads are owner-only or superadmin.
- Snapshot consistency: backend rejects answer edits while generating; frontend disables/no-ops edit navigation while generating.
- Queue cleanup: course cleanup does not treat non-course Career Playbook jobs as orphaned.
- Local storage: final markdown is not persisted in the browser store.

## Rejected Or Deferred Findings

- Hide percent progress while generating: deferred. The current API already exposes coarse progress and tests assert that UI displays it.
- Add post-completion CTA: deferred to library/public viewer UX scope.

## Verification Evidence

- RED backend: focused backend tests failed before implementation on missing routing/status/retry behavior.
- RED frontend: focused web tests failed before implementation on active-generation edit lock.
- GREEN backend: `NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/orchestrator/processor.test.ts tests/unit/orchestrator/queue-cleanup.test.ts` -> 42 tests passed.
- GREEN frontend: `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/page-client.test.tsx` -> 35 tests passed.
- Shared contracts: `pnpm --filter @megacampus/shared-types test:unit` -> 168 tests passed.
- Type check: `pnpm type-check` -> exit 0.
- Lint: `pnpm lint` -> exit 0 with existing warnings.
- Build: `pnpm build` with root and web env loaded -> exit 0.

## Scope Boundaries

- No billing/payment scope.
- No direct push to `develop` or `master`.
- No live LLM/WebSearch generation.
- SSE/subscription transport remains out of scope until the tRPC client/proxy is changed deliberately.
