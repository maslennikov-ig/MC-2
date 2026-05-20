# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/career-playbook-staging-smoke`
Base branch: `origin/develop`
Current PR: none

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 through #39 have landed in `develop`.
- PR #37 delivered the `mc2-db696.11` smoke/preflight foundation: configurable Career Playbook Playwright harness, read-only backend smoke preflight, runtime docs, and review fixes for env-scoped probes, sanitization, and external `PLAYWRIGHT_BASE_URL`.
- `mc2-db696.11.4` is delivered and merged through PR #39: admin cost evidence endpoint `admin.getCareerPlaybookCostEvidence`, page `/admin/generation/career-playbooks/costs`, generation-history link, org-admin scoping, page-total semantics, invalid cost payload marking, tests, and docs.
- `mc2-db696.11.5` staging schema/read-only readiness advanced on 2026-05-20: the Career Playbook Supabase migration is applied, RLS/seed/policies are verified, migration history includes both MCP generated and file-version rows, and read-only staging preflight passes with `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260520`.
- Live mutation smoke has not run. Do not trigger LLM-backed generation until disposable fixtures, token/storage state, exact cleanup scope, queue alignment, and a numeric API cost budget are explicit.
- Primary worktree `/home/me/code/mc2` remains dirty on stale `feature/career-playbook-library-share`; its local `mc2-db696.13` worker/status transport patch was compared against `origin/develop` and left untouched because `origin/develop` already contains the landed implementation.
- No billing or payment scope is part of the Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.11` - tests/smoke/staging verification foundation.
- Stage summary: [`.codex/stages/mc2-db696.11/summary.md`](./stages/mc2-db696.11/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.11/artifacts`](./stages/mc2-db696.11/artifacts)

## Next recommended

Next stage id: `mc2-db696.11`
Recommended action: continue live-staging work under Phase 11. The first ready P1 is `mc2-db696.11.5`; schema/read-only readiness is done, but live mutation smoke remains gated on auth/TOKEN, disposable fixtures, queue alignment between enqueuer and worker, exact cleanup scope, and accepted numeric LLM/API cost budget.

If those gates are not satisfied, collect/prepare the missing staging readiness evidence before running any live mutation. Keep `mc2-db696.16` as the tracked P2 defer for future upload quota/dedupe reuse in the JD bridge.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/project-index.md, .codex/stages/mc2-db696.11/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#39 have landed in develop. Important: the primary worktree is dirty on stale feature/career-playbook-library-share; do not discard it. mc2-db696.11.5 schema/read-only readiness is advanced: Supabase Career Playbook tables/RLS/seeds/policies are present and read-only staging preflight passes with a dedicated queue name. Continue live mutation smoke only after auth/TOKEN, disposable fixtures, enqueuer/worker queue alignment, cleanup scope, and numeric cost budget gates are explicit. Keep billing/payment out of MVP scope.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11.5` until live-smoke gates are satisfied.
- Runtime cost evidence currently records estimated `costUsd: 0`; use admin evidence for payload/access-control proof and capture real provider spend separately unless runtime cost accounting is improved.
- 10-concurrent load test remains open under `mc2-db696.11.6`.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
