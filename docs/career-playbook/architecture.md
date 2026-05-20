# Career Playbook Architecture

## Runtime Surfaces

- Web app: `packages/web/app/[locale]/career-playbook/**`
- Web state: `packages/web/stores/use-career-playbook-store.ts`
- Backend tRPC router: `packages/course-gen-platform/src/server/routers/career-playbook/**`
- Generation stage: `packages/course-gen-platform/src/stages/stage-career-playbook/**`
- Worker handler: `packages/course-gen-platform/src/orchestrator/handlers/career-playbook-handler.ts`
- DB migration: `packages/course-gen-platform/supabase/migrations/20260513090000_career_playbook.sql`

## E2E Harness

`packages/web/playwright.config.ts` derives one web URL from `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_PORT`, `PORT`, or the default `http://localhost:3000`. The same URL is used for Playwright `baseURL`, `webServer.url`, and `NEXT_PUBLIC_APP_URL`; the resolved port is passed into the Next dev server through `PORT`.

When `PLAYWRIGHT_BASE_URL` points at a non-local host, Playwright treats it as an already-running external target and does not start `pnpm run dev`. Use `PLAYWRIGHT_PORT` for managed local Next dev-server runs.

Use a non-default port when another app is already running on `3000`:

```bash
PLAYWRIGHT_PORT=3101 pnpm --filter @megacampus/web test:e2e:career-playbook
```

Authenticated browser tests still require a valid `TOKEN` storage-state input. Without `TOKEN`, only unauthenticated/public checks run.

## Backend Read-Only Smoke

The backend preflight command is read-only by design:

```bash
pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local
```

`blocked` is a deliberate non-zero result for incomplete readiness. Automation should parse the report status rather than treating every non-zero preflight result as a process crash.

It checks:

- required backend env presence without printing secrets
- `SUPABASE_SERVICE_KEY` vs web-only `SUPABASE_SERVICE_ROLE_KEY`
- read-only Supabase schema reachability with head-only selects
- Redis PING and resolved BullMQ queue name
- mutation smoke hard-stop status

It does not create users, write Supabase rows, enqueue jobs, start workers, clean queues, or call LLM-backed generation.

## Staging Smoke Plan

Daily staging smoke should run only after staging has the Career Playbook migration and disposable test fixtures:

1. Run the read-only preflight against staging.
2. Create or reuse a dedicated staging test user and organization.
3. Use a dedicated `BULLMQ_QUEUE_NAME`, not the shared production queue.
4. Generate one `sales-manager-b2b` Role Guide from `docs/job-descriptions/sales-manager-b2b.md`.
5. Compare structure: 26 blocks, 3 Mermaid diagrams, at least 4 anti-goals, at least 4 decision-matrix rows, at least 3 failure modes.
6. Verify viewer, PDF export, public share link, and course bridge against disposable data.
7. Clean up disposable playbooks/courses/files and record cost breakdown.

Staging/prod mutation smoke is blocked unless the current task explicitly approves mutations, cleanup, and expected API cost.

## Cost And Performance Checks

Career Playbook generation records per-node cost in `cost_breakdown` on `career_playbooks`. The admin-facing evidence should aggregate this field by playbook, node, model, tokens, and total USD cost. Existing course generation audit UI and logging are reusable patterns, but service-role reads are not RLS proof.

The 10-concurrent-generation load test should run against isolated staging resources:

- dedicated test users and organization
- dedicated queue name
- known LLM budget cap
- no shared production Redis queue
- pass criteria: all jobs reach terminal state, no worker readiness degradation, no queue cleanup outside the dedicated queue
