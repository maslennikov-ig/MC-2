# Stage mc2-db696.11 Summary

Status: Phase 11 schema/read-only smoke ready; live mutation smoke still gated
Updated: 2026-05-21
Branch: `codex/career-playbook-staging-smoke`
Base: `origin/develop` @ `d92c8c28be3e0a3504a0fb9622d7f3da6229ed6e`

## Scope Delivered

- Added a configurable Career Playbook Playwright harness:
  - `PLAYWRIGHT_PORT` / `PORT` manage local Next dev-server port.
  - Local `PLAYWRIGHT_BASE_URL` stays managed.
  - Non-local `PLAYWRIGHT_BASE_URL` targets an already-running external server and does not start local `pnpm run dev`.
  - Added `test:e2e:career-playbook`.
- Added a backend read-only Career Playbook smoke preflight:
  - env presence checks with masking
  - backend `SUPABASE_SERVICE_KEY` vs web-only `SUPABASE_SERVICE_ROLE_KEY`
  - env-scoped Supabase schema probe without the cached global admin singleton
  - short-lived Redis PING probe with no worker retry strategy
  - independent partial diagnostics
  - sanitized probe failure messages
  - mutation smoke hard-stop
  - staging/prod queue readiness blocks when `BULLMQ_QUEUE_NAME` is missing or resolves to the shared `course-generation` queue
- Added runtime docs:
  - `docs/career-playbook/README.md`
  - `docs/career-playbook/architecture.md`
  - linked from `docs/plans/career-playbook/README.md`
  - CHANGELOG entry
- Added Career Playbook admin cost evidence:
  - backend `admin.getCareerPlaybookCostEvidence`
  - admin page `/admin/generation/career-playbooks/costs`
  - link from admin generation history
  - organization-admin scoping despite service-role reads
  - page totals plus filtered count semantics
  - invalid `cost_breakdown` payload marking
- Advanced `mc2-db696.11.5` staging readiness:
  - applied the already-merged Career Playbook Supabase migration through MCP after CLI password authentication failed
  - verified target tables, RLS, fixed-question seed counts, policies, and migration history
  - inserted the file-version migration history row for `20260513090000` after MCP `apply_migration` recorded a generated version row
  - reran read-only staging preflight successfully with a dedicated non-default queue name
  - configured minimal Career Playbook model routing: MiniMax M2.7 for spec/judge and DeepSeek V4 Flash for follow-up, groups, and regenerator
  - encoded the minimal model routing in migration `20260521101000_allow_career_playbook_model_phases` so future database rebuilds do not depend on manual Supabase rows

## Routing And Delegation

- Context7 checked Playwright, Supabase, and Next.js behavior.
- Visible read-only explorers:
  - Raman: web E2E/auth mapping
  - Lagrange: backend/Supabase/Redis smoke mapping
- Visible workers:
  - Hooke: web E2E harness
  - Tesla: backend read-only smoke preflight
- Visible reviewers:
  - Poincare: correctness/security review
  - Descartes: improvement review
  - Pauli: final review
  - Euler: PR #37 backend/preflight safety review after develop retarget
  - Schrodinger: PR #37 web/Playwright harness review after develop retarget
  - Lovelace: Phase 11 cost-surface map for `mc2-db696.11.4`
  - Helmholtz: Phase 11 live-smoke blocker map for `mc2-db696.11.5`
  - Schrodinger: Phase 11 admin cost evidence endpoint/UI review

The orchestrator did not accept reports blindly. It found and fixed two backend preflight issues before review, then accepted/fixed all review must-fix findings.

## Beads

Closed in this delivery:

- `mc2-rzsor` - E2E harness and authenticated Playwright flow foundation
- `mc2-29dzc` - live worker/Supabase smoke preflight foundation
- `mc2-0g1kg` - staging smoke report, cron plan, performance checklist docs
- `mc2-db696.11.1` - sanitize smoke probe messages
- `mc2-db696.11.2` - separate external Playwright baseURL from local dev server
- `mc2-db696.11.3` - env-scoped smoke probes
- `mc2-db696.11.4` - Career Playbook cost dashboard evidence
- `mc2-db696.11.9.1` - require dedicated non-default queue for staging/prod preflight readiness

Still open under `mc2-db696.11`:

- `mc2-db696.11.5` - live staging Career Playbook mutation smoke; schema/read-only readiness is done, live generation remains gated on auth fixtures, deployed/local worker queue alignment, cleanup scope, and numeric LLM/API budget
- `mc2-db696.11.6` - 10-concurrent load test

Parent `mc2-db696.11` remains `in_progress` because full live staging verification is still blocked by credential, fixture, cleanup, queue-alignment, and cost-budget readiness.

## Verification Evidence

- `git diff --check` - passed.
- Backend smoke unit: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts` - 13 passed.
- Backend cost evidence unit: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/admin-career-playbook-costs.test.ts` - 5 passed.
- Web config unit: `pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts` - 6 passed.
- Web cost evidence unit: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/admin-cost-evidence.test.tsx` - 3 passed.
- Backend type-check: `pnpm --filter @megacampus/course-gen-platform type-check` - passed.
- Web type-check: `pnpm --filter @megacampus/web type-check` - passed.
- Full repo type-check: `pnpm type-check` - passed.
- Full repo lint: `pnpm lint` - passed with existing warnings only.
- Full repo build: `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm build` - passed.
- Browser smoke: `PLAYWRIGHT_PORT=3101 pnpm --dir packages/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --grep "requires authentication" --reporter=list` - 1 passed.
- No-env preflight package script: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target staging --json` prints `status: blocked` as expected. pnpm lifecycle exits `1` around the script's internal exit `2`; automation should parse report status for readiness outcomes.
- Artifact validation: passed for all stage artifacts.
- Process verification: `scripts/orchestration/run_process_verification.sh` - passed.
- Supabase MCP migration/readiness, 2026-05-20:
  - `public.career_playbooks` and `public.career_playbook_fixed_questions` exist.
  - RLS is enabled on both tables.
  - Fixed-question seed count is `en: 7`, `ru: 7`.
  - Policies are present for public fixed-question reads and authenticated org-owned playbook CRUD.
  - Migration history contains MCP generated row `20260520141021 / 20260513090000_career_playbook` plus file-version row `20260513090000 / career_playbook`.
- Supabase MCP model routing, 2026-05-21:
  - constraint migration `20260521101000_allow_career_playbook_model_phases` applied and file-version row `20260521101000 / allow_career_playbook_model_phases` inserted.
  - the git migration now includes idempotent insert/update rows for all 10 active `stage_career_playbook%` configs.
  - active global `llm_model_config` rows exist for all `stage_career_playbook%` phases.
  - runtime resolution returns `minimax/minimax-m2.7` for `stage_career_playbook_spec` and `stage_career_playbook_judge`; all other Career Playbook phases return `deepseek/deepseek-v4-flash`.
- Read-only staging preflight after migration, 2026-05-20: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target staging --json` with `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260520` - passed. No users, rows, jobs, workers, cleanup tasks, or LLM generation were created.
- Read-only staging preflight after model routing, 2026-05-21: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target staging --json` with `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260521-model-routing` - passed. No users, rows, jobs, workers, cleanup tasks, or LLM generation were created.
- PR-readiness preflight after migration reproducibility update, 2026-05-21: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target staging --json` with `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260521-pr-ready` - passed. No users, rows, jobs, workers, cleanup tasks, or LLM generation were created.
- Supabase security/performance advisors ran after DDL. Reported warnings are broad existing project advisories; no new Career Playbook table blocker was identified in this readiness pass.

## Explicit Defers

- Full live mutation smoke requires disposable user/org/playbooks, dedicated queue alignment between enqueuer and worker, cleanup authorization/scope, valid auth token or storage state, and an accepted numeric API cost budget.
- Runtime cost evidence currently records estimated `costUsd: 0`; use admin evidence for payload structure, and capture real provider spend separately unless runtime cost accounting is improved.
- 10-concurrent load testing remains tracked as an open Beads child and depends on successful live single-smoke readiness.

## PR Readiness Passes

- `mc2-db696.11.7` mapped the original stacked PR delivery path after #37 was opened.
- PR #24 through #36 and PR #38 have since landed in `develop`; PR #37 is the remaining Phase 11 smoke/preflight delivery PR.
- `mc2-db696.11.9` retargets PR #37 to `develop`, resolves the handoff conflict, and re-runs review/verification on the post-merge diff.
- Accepted PR #37 finding: staging/prod read-only preflight must not report queue readiness as pass when the queue name is missing or the shared default `course-generation` queue is selected. Fixed under `mc2-db696.11.9.1`.
