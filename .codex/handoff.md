# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/career-playbook-phase11`
Base branch: `develop`
Current PR: none

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 through #37 and the PR #38 handoff/CI follow-up have landed in `develop`.
- PR #37 delivered the `mc2-db696.11` smoke/preflight foundation: configurable Career Playbook Playwright harness, read-only backend smoke preflight, runtime docs, and review fixes for env-scoped probes, sanitization, and external `PLAYWRIGHT_BASE_URL`.
- `mc2-db696.11.4` is delivered locally on `codex/career-playbook-phase11`: admin cost evidence endpoint `admin.getCareerPlaybookCostEvidence`, page `/admin/generation/career-playbooks/costs`, generation-history link, org-admin scoping, page-total semantics, invalid cost payload marking, tests, and docs.
- Primary worktree `/home/me/code/mc2` remains dirty on stale `feature/career-playbook-library-share`; its local `mc2-db696.13` worker/status transport patch was compared against `origin/develop` and left untouched because `origin/develop` already contains the landed implementation.
- No billing or payment scope is part of the Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.11` - tests/smoke/staging verification foundation.
- Stage summary: [`.codex/stages/mc2-db696.11/summary.md`](./stages/mc2-db696.11/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.11/artifacts`](./stages/mc2-db696.11/artifacts)
- PR #36 JD bridge landed in `develop` before PR #37; PR #35 generation worker completion and polling transport already landed.

## Next recommended

Next stage id: `mc2-db696.11`
Recommended action: continue live-staging work under Phase 11. The first ready P1 is `mc2-db696.11.5`, but live mutation smoke remains gated on staging schema, auth/TOKEN, disposable fixtures, dedicated `BULLMQ_QUEUE_NAME`, exact cleanup scope, and accepted LLM/API cost budget.

If those gates are not satisfied, collect/prepare the missing staging readiness evidence before running any live mutation. Keep `mc2-db696.16` as the tracked P2 defer for future upload quota/dedupe reuse in the JD bridge.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.11/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#37 and PR #38 have landed in develop; mc2-db696.11.4 cost evidence is delivered on codex/career-playbook-phase11. Continue Phase 11 live-smoke work under mc2-db696.11.5 only after staging schema/auth/TOKEN, disposable fixtures, dedicated queue, cleanup scope, and cost budget gates are explicit. Keep billing/payment out of MVP scope.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11.5` until live-smoke gates are satisfied.
- 10-concurrent load test remains open under `mc2-db696.11.6`.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
- Pre-course user upload in the JD bridge modal remains deferred; current upload flow requires an existing course ID.
- Reusing the full Stage 1 upload service for trusted generated markdown remains deferred; the direct `file_catalog` pending-source path is documented and covered by tests for MVP.
