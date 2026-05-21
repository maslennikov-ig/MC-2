# Career Playbook

Career Playbook is the Role Guide generation track for MC2. The MVP flow is:

1. Authenticated user answers fixed and adaptive wizard questions.
2. Backend generates the 26-block Role Guide through the Career Playbook LangGraph stage.
3. User reviews, edits/regenerates blocks, exports PDF, shares a public viewer link, or starts course generation from a completed playbook.

## Verification Entrypoints

Local read-only checks:

```bash
pnpm --filter @megacampus/web test:e2e:career-playbook -- --list
pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local
```

`blocked` is an expected non-zero preflight outcome when required env or schema is missing; pnpm reports it as a lifecycle failure while preserving the human-readable smoke report.

Targeted unit checks:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/playwright-config.test.ts
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/admin-cost-evidence.test.tsx
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/admin-career-playbook-costs.test.ts
```

Mutation smoke is intentionally not part of the default command. It requires explicit approval, disposable staging fixtures, a dedicated queue, cleanup authorization, and cost-aware LLM credentials.

## Admin Cost Evidence

Career Playbook per-node cost evidence is available to admins at `/admin/generation/career-playbooks/costs`. The page reads `admin.getCareerPlaybookCostEvidence` and shows the filtered playbook count plus page totals and stage/node/model/token/USD rows from `career_playbooks.cost_breakdown`. Invalid cost payloads are marked instead of being treated as verified evidence.

## Current Live Readiness

As of 2026-05-20, the Career Playbook migration has been applied to the Supabase project and read-only staging preflight passes when a dedicated non-default queue name is provided. Full mutation smoke is still intentionally gated on disposable staging fixtures, auth token/storage state, queue alignment between enqueuer and worker, cleanup scope, and an accepted numeric LLM/API cost budget.

As of 2026-05-21, minimal model routing for the first live smoke is configured in Supabase: MiniMax M2.7 for spec/judge and DeepSeek V4 Flash for the remaining Career Playbook phases.

See [architecture.md](./architecture.md) for the system map and staging smoke plan.
