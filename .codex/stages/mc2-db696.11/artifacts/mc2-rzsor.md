---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-rzsor
stage_id: mc2-db696.11
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: bounded but cross-cutting web E2E harness/config changes; TDD and no-secret handling required
repo: mc2
branch: codex/career-playbook-e2e-smoke
base_branch: origin/codex/career-playbook-jd-bridge
base_commit: af0aa6599bd83a371b7d3e69e9e3c1f83c96b340
worktree: /home/me/code/mc2/.worktrees/career-playbook-e2e-smoke
write_zone:
  - packages/web/playwright.config.ts
  - packages/web/tests/unit/**
  - packages/web/tests/**
  - packages/web/package.json
  - .codex/stages/mc2-db696.11/artifacts/mc2-rzsor.md
success_criteria:
  - TDD RED/GREEN/REFACTOR followed and reported
  - Playwright derives one coherent web server URL from PLAYWRIGHT_BASE_URL or PLAYWRIGHT_PORT/PORT
  - Default localhost:3000 behavior remains compatible
  - Dedicated Career Playbook E2E script targets tests/e2e/career-playbook on chromium
  - No secrets printed or committed; TOKEN auth setup remains compatible
selected_docs:
  - Context7 Playwright summary supplied in worker prompt
  - Context7 Next.js summary supplied in worker prompt
selected_skills:
  - superpowers:test-driven-development
  - webapp-testing
  - superpowers:verification-before-completion
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: W1
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: removed ignored packages/web .next, test-results, and playwright-report artifacts from local smoke/list runs
risk_level: medium
verification:
  - pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts: failed_expected_red_then_passed_green
  - pnpm --dir packages/web exec playwright test tests/e2e/career-playbook --project=chromium --list: passed
  - PLAYWRIGHT_PORT=3101 pnpm --dir packages/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --grep "requires authentication" --reporter=list: passed
  - pnpm --filter @megacampus/web type-check: passed
changed_files:
  - packages/web/playwright.config.ts
  - packages/web/package.json
  - packages/web/tests/unit/playwright-config.test.ts
  - .codex/stages/mc2-db696.11/artifacts/mc2-rzsor.md
explicit_defers:
  - TOKEN-backed authenticated browser flow remains gated on a valid test Supabase session token and live backend readiness.
---

# Summary

Implemented the web-side Career Playbook E2E harness changes. `packages/web/playwright.config.ts` now resolves a single Playwright web server URL from `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_PORT`, `PORT`, or the default `http://localhost:3000`, then uses that same URL for `use.baseURL`, `webServer.url`, and `NEXT_PUBLIC_APP_URL`. The matching `PORT` is passed to `webServer.env`. Existing Supabase env fallback and TOKEN-based global setup behavior were not changed.

Added `test:e2e:career-playbook` in `packages/web/package.json` as `playwright test tests/e2e/career-playbook --project=chromium`.

# Scope / Routing

Stayed inside the W1 web write zone. Backend smoke/preflight files were not modified by this worker. The worktree contains sibling backend changes from another stream; they were left untouched.

# Verification

RED:

- `pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts`
- Result: failed before implementation because `resolvePlaywrightWebServer` was not implemented. The focused test also initially exposed the missing coherent URL/PORT behavior.

GREEN:

- `pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts`
- Result: passed, 1 test file, 4 tests.

Script target check:

- `pnpm --dir packages/web exec playwright test tests/e2e/career-playbook --project=chromium --list`
- Result: passed, listed 2 chromium tests in `tests/e2e/career-playbook/wizard-phase-a.spec.ts`.

Browser smoke:

- `PLAYWRIGHT_PORT=3101 pnpm --dir packages/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --grep "requires authentication"`
- Initial worker result: blocked by Next/Turbopack root inference in the nested worktree.
- Orchestrator rerun after cleanup: passed, 1 chromium test. Next still prints a root inference warning, but it did not block `/ru/career-playbook/new` unauthenticated smoke on `PLAYWRIGHT_PORT=3101`.

Additional orchestrator verification:

- `pnpm --filter @megacampus/web type-check`
- Result: passed after replacing the helper env type with a `NodeJS.ProcessEnv | Record<string, string | undefined>` shape.

# Delivery / Cleanup

Accepted by orchestrator after reviewing the diff and rerunning targeted checks. No commit or push performed yet. Ignored local runtime artifacts from Playwright/Next runs were removed from `packages/web`.

# Risks / Follow-ups / Explicit Defers

Authenticated browser E2E remains gated on a valid `TOKEN`; without it the spec correctly exercises only unauthenticated/public behavior.
