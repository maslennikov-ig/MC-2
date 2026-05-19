# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `codex/career-playbook-e2e-smoke`
Base branch: `codex/career-playbook-jd-bridge` stacked on PR #36
Current PR: pending for `codex/career-playbook-e2e-smoke` after local closeout

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open and stacked; avoid retargeting dependent work to `develop` until upstream PRs land.
- `mc2-db696.9` JD bridge is included with its review fixes.
- `mc2-db696.11` partial delivery is implemented on this branch: configurable Career Playbook Playwright harness, read-only backend smoke preflight, runtime docs, and review fixes for env-scoped probes, sanitization, and external `PLAYWRIGHT_BASE_URL`.
- `mc2-db696.11` remains open/in_progress because live staging mutation smoke, cost dashboard evidence, and 10-concurrent load test are blocked/tracked separately.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.11` - tests/smoke/staging verification foundation.
- Stage summary: [`.codex/stages/mc2-db696.11/summary.md`](./stages/mc2-db696.11/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.11/artifacts`](./stages/mc2-db696.11/artifacts)
- Key verification: backend smoke unit 12 passed, web config unit 6 passed, Playwright unauth smoke on isolated port 3101 passed, no-env preflight blocked as expected, `pnpm type-check`, `pnpm lint`, `pnpm build`, artifact validation, and process verification passed.

## Next recommended

Next delivery action: finish local closeout, push `codex/career-playbook-e2e-smoke`, and open a stacked PR to `codex/career-playbook-jd-bridge`.

Next stage id: `mc2-db696.11`
Recommended action: continue open follow-up children only when staging schema/auth/credentials/queue/cost approval are ready.

- If upstream stacked PRs land first, rebase/retarget before more dependent work.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.11/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify the stacked PR status, and avoid dependent work on develop unless upstream PRs have merged.
```

## Explicit defers

- Pre-course user upload in the JD bridge modal remains deferred; current upload flow requires an existing course ID.
- Full live Supabase/Redis/staging mutation E2E remains open under `mc2-db696.11.5`; remote Supabase currently lacks `public.career_playbooks`, and live mutation requires explicit approval, disposable fixtures, dedicated queue, cleanup, auth token, and API cost budget.
- Cost dashboard evidence and 10-concurrent load test remain open under `mc2-db696.11.4` and `mc2-db696.11.6`.
- Reusing the full Stage 1 upload service for trusted generated markdown remains deferred; the direct `file_catalog` pending-source path is documented and covered by tests for MVP.
