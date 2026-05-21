# Orchestrator Handoff

Updated: 2026-05-21
Current working branch: `codex/career-playbook-live-smoke`
Base branch: `origin/develop`; Current PR: [#41](https://github.com/maslennikov-ig/MC-2/pull/41)

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 through #40 have landed in `develop`.
- PR #37 delivered the `mc2-db696.11` smoke/preflight foundation: configurable Career Playbook Playwright harness, read-only backend smoke preflight, runtime docs, and review fixes for env-scoped probes, sanitization, and external `PLAYWRIGHT_BASE_URL`.
- `mc2-db696.11.4` is delivered and merged through PR #39: admin cost evidence endpoint `admin.getCareerPlaybookCostEvidence`, page `/admin/generation/career-playbooks/costs`, generation-history link, org-admin scoping, page-total semantics, invalid cost payload marking, tests, and docs.
- `mc2-db696.11.5` staging schema/read-only readiness advanced through PR #40 on 2026-05-21: the Career Playbook Supabase migration is applied, RLS/seed/policies are verified, migration history includes both MCP generated and file-version rows, and read-only staging preflight passes with `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260521-pr-ready`.
- Career Playbook minimal model routing is configured in Supabase and encoded in migration `20260521101000_allow_career_playbook_model_phases`: `minimax/minimax-m2.7` for `stage_career_playbook_spec` and `stage_career_playbook_judge`; `deepseek/deepseek-v4-flash` for follow-up, groups 1-6, and regenerator.
- PR #41 is open and mergeable for `mc2-db696.11.5` live-smoke runner work on `codex/career-playbook-live-smoke`: `smoke:career-playbook:live` has non-mutating `plan` mode, gated `mutation-smoke` mode, deterministic evidence validation, and a dry-run cleanup manifest.
- Live mutation smoke has not run. Do not trigger LLM-backed generation until disposable fixtures, token/storage state, cleanup scope, queue alignment between enqueuer and worker, and numeric API cost budget are explicit.
- Primary worktree `/home/me/code/mc2` remains dirty on stale `feature/career-playbook-library-share`; its local `mc2-db696.13` worker/status transport patch was compared against `origin/develop` and left untouched because `origin/develop` already contains the landed implementation.
- No billing or payment scope is part of the Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.11` - tests/smoke/staging verification foundation.
- Stage summary: [`.codex/stages/mc2-db696.11/summary.md`](./stages/mc2-db696.11/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.11/artifacts`](./stages/mc2-db696.11/artifacts)

## Next recommended

Next stage id: `mc2-db696.11`
Recommended action: let PR #41 CI/review complete, merge it into `develop` when authorized and green, then continue `mc2-db696.11.5` only when live mutation gates are explicit. Schema, read-only preflight, model routing, and the gated runner are ready; paid generation remains gated on auth/TOKEN or storage-state, disposable fixtures, queue alignment, exact cleanup scope, and accepted numeric LLM/API cost budget.

If those gates are not satisfied, collect/prepare the missing staging readiness evidence before running any live mutation. Keep `mc2-db696.16` as the tracked P2 defer for future upload quota/dedupe reuse in the JD bridge.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/project-index.md, .codex/stages/mc2-db696.11/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#40 have landed in develop; PR #41 is open from codex/career-playbook-live-smoke to develop for the gated live-smoke runner. Important: the primary worktree is dirty on stale feature/career-playbook-library-share; do not discard it. Continue live mutation smoke only after auth/TOKEN, disposable fixtures, enqueuer/worker queue alignment, cleanup scope, and numeric cost budget gates are explicit. Keep billing/payment out of MVP scope.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11.5` until live-smoke gates are satisfied; the new runner does not perform cleanup, it only emits an exact dry-run cleanup manifest.
- 10-concurrent load test remains open under `mc2-db696.11.6`.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
