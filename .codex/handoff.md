# Orchestrator Handoff

Updated: 2026-05-23
Current working branch: `codex/career-playbook-v4-pro-routing`
Base branch: `origin/develop`
Base head: `c79053a9` (PR #43 merged; PR #44 promoted develop to master)

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`; do not push directly to `develop` or `master`.
- Career Playbook PR #24 through #43 have landed in `develop`; PR #44 promoted `develop` to `master`.
- Primary worktree `/home/me/code/mc2` is on `codex/career-playbook-v4-pro-routing` for `mc2-db696.19`; PR #45 is open against `develop`.
- Career Playbook Russian UI naming/nav follow-up `mc2-db696.17` is implemented: Russian user-facing surfaces use `Должностная инструкция`, and the header action is `Создать описание роли`.
- The stale dirty primary branch `feature/career-playbook-library-share` was triaged on 2026-05-22. Its local `mc2-db696.13` worker/status transport patch was an early, unaccepted version of work now present in `origin/develop` through the accepted/review-fixed PR #35 implementation and later PR #41 state.
- Before cleanup, the stale primary diff was preserved at `/tmp/mc2-primary-dirty-20260522-tracked.patch`, `/tmp/mc2-primary-dirty-20260522-untracked.tar.gz`, and `/tmp/mc2-primary-dirty-20260522-status.z`.
- The remaining local superpowers worktree `career-playbook-live-smoke` and merged local Career Playbook branches were removed after verifying they were clean and ancestors of `origin/develop`; remote branches were not deleted.
- `mc2-1mmop` remains open for the repeatable/scripted cleanup documentation path. Manual cleanup is done.
- `mc2-db696.11.5` staging schema/read-only/model readiness is advanced through PR #40, and the gated live-smoke runner is merged through PR #41. Live mutation smoke has not run.
- Career Playbook target model routing is being updated by `mc2-db696.19`: migration `20260523073000_update_career_playbook_v4_pro_routing` routes `stage_career_playbook_spec`, `stage_career_playbook_group_5`, `stage_career_playbook_judge`, and `stage_career_playbook_regenerator` to `deepseek/deepseek-v4-pro`; follow-up and groups 1-4/6 stay on `deepseek/deepseek-v4-flash`; MiniMax is removed from the Career Playbook fallback chain.
- Do not trigger LLM-backed generation until disposable fixtures, token/storage state, cleanup scope, queue alignment between enqueuer and worker, and a numeric API cost budget are explicit.
- No billing or payment scope is part of the Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.11` - tests/smoke/staging verification foundation; summary and artifacts are under [`.codex/stages/mc2-db696.11`](./stages/mc2-db696.11/summary.md).

## Next recommended

Next stage id: `mc2-db696.11`
Recommended action: continue `mc2-db696.11.5` only when live mutation gates are explicit. Schema, read-only preflight, model routing, and the gated runner are ready; paid generation remains gated on auth/TOKEN or storage-state, disposable fixtures, queue alignment, exact cleanup scope, and accepted numeric LLM/API cost budget.

If those gates are not satisfied, collect or prepare the missing staging readiness evidence before running any live mutation. Keep `mc2-db696.16` as the tracked P2 defer for future upload quota/dedupe reuse in the JD bridge.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/project-index.md, .codex/stages/mc2-db696.11/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#43 have landed in develop and PR #44 promoted develop to master. Current feature branch `codex/career-playbook-v4-pro-routing` / PR #45 tracks `mc2-db696.19`, updating Career Playbook target model routing to DeepSeek V4 Pro for spec/group_5/judge/regenerator and V4 Flash for follow-up/groups 1-4/6. Continue live mutation smoke only after auth/TOKEN or storage-state, disposable fixtures, enqueuer/worker queue alignment, cleanup scope, and numeric cost budget gates are explicit. Keep billing/payment out of MVP scope.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11.5` until live-smoke gates are satisfied; the runner does not perform cleanup, it only emits an exact dry-run cleanup manifest.
- 10-concurrent load test remains open under `mc2-db696.11.6`.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
- Repeatable cleanup automation/documentation remains tracked as `mc2-1mmop`.
