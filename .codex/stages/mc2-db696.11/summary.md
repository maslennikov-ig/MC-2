# Stage mc2-db696.11 Summary

Status: partial delivery verified locally
Updated: 2026-05-19
Branch: `codex/career-playbook-e2e-smoke`
Base: `origin/codex/career-playbook-jd-bridge` @ `af0aa6599bd83a371b7d3e69e9e3c1f83c96b340`

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
- Added runtime docs:
  - `docs/career-playbook/README.md`
  - `docs/career-playbook/architecture.md`
  - linked from `docs/plans/career-playbook/README.md`
  - CHANGELOG entry

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

The orchestrator did not accept reports blindly. It found and fixed two backend preflight issues before review, then accepted/fixed all review must-fix findings.

## Beads

Closed in this delivery:

- `mc2-rzsor` - E2E harness and authenticated Playwright flow foundation
- `mc2-29dzc` - live worker/Supabase smoke preflight foundation
- `mc2-0g1kg` - staging smoke report, cron plan, performance checklist docs
- `mc2-db696.11.1` - sanitize smoke probe messages
- `mc2-db696.11.2` - separate external Playwright baseURL from local dev server
- `mc2-db696.11.3` - env-scoped smoke probes

Still open under `mc2-db696.11`:

- `mc2-db696.11.4` - Career Playbook cost dashboard evidence
- `mc2-db696.11.5` - live staging Career Playbook mutation smoke
- `mc2-db696.11.6` - 10-concurrent load test

Parent `mc2-db696.11` remains `in_progress` because full live staging verification is blocked by schema/credential/approval readiness.

## Verification Evidence

- `git diff --check` - passed.
- Backend smoke unit: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts` - 12 passed.
- Web config unit: `pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts` - 6 passed.
- Backend type-check: `pnpm --filter @megacampus/course-gen-platform type-check` - passed.
- Web type-check: `pnpm --filter @megacampus/web type-check` - passed.
- Full repo type-check: `pnpm type-check` - passed.
- Full repo lint: `pnpm lint` - passed with existing warnings only.
- Full repo build: `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm build` - passed.
- Browser smoke: `PLAYWRIGHT_PORT=3101 pnpm --dir packages/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --grep "requires authentication" --reporter=list` - 1 passed.
- No-env preflight package script: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local` prints `status: blocked` as expected. pnpm lifecycle exits `1` around the script's internal exit `2`; automation should parse report status for readiness outcomes.
- Artifact validation: passed for all stage artifacts.
- Process verification: `scripts/orchestration/run_process_verification.sh` - passed.

## Explicit Defers

- Remote Supabase read probe showed `public.career_playbooks` is absent in project `diqooqbuchsliypgwksu`. The migration was not applied from this stage.
- Full live mutation smoke requires explicit approval, staging schema, disposable user/org/playbooks, dedicated `BULLMQ_QUEUE_NAME`, cleanup authorization, valid auth token, and accepted API cost budget.
- Cost dashboard evidence and 10-concurrent load testing remain tracked as open Beads children.
