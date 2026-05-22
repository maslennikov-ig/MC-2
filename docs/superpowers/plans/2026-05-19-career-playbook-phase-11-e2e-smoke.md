# Career Playbook Phase 11 E2E Smoke Plan

## Scope

Beads stage: `mc2-db696.11`.

Base branch: `origin/codex/career-playbook-jd-bridge`.

Working branch: `codex/career-playbook-e2e-smoke`.

The phase adds verification infrastructure for Career Playbook without silently mutating live Supabase, Redis, or LLM-backed pipelines. Full mutation smoke remains gated by explicit approval, disposable fixtures, and a dedicated queue.

## Routing

- Documentation: Context7 checked Playwright webServer/baseURL behavior, Supabase admin service-role boundaries, and Next.js custom port behavior.
- Skills: `orchestration-setup`, `orchestrator-stage`, `task-router`, `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:using-git-worktrees`, `superpowers:subagent-driven-development`, `superpowers:test-driven-development`, `superpowers:requesting-code-review`, `superpowers:verification-before-completion`.
- Subagents: Raman mapped web E2E/auth gaps; Lagrange mapped backend/Supabase/Redis smoke boundaries.
- Catalog candidates: none; installed skills and built-in visible Codex subagents are sufficient.

## Parallel Decomposition Matrix

| Stream | Goal | Agent | Write zone | Dependencies | Verification | Decision | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 Web E2E harness | Make Career Playbook Playwright configurable by port/baseURL and add a dedicated E2E command/test helper coverage | worker | `packages/web/playwright.config.ts`, `packages/web/tests/**`, `packages/web/package.json` | No dependency on W2; must avoid backend mutation | Web unit test for config helper, targeted Playwright unauth smoke when possible | parallel | Disjoint write zone and independent verification |
| W2 Backend smoke preflight | Add read-only Career Playbook smoke preflight for env/backend/Supabase readiness with mutation stop rules | worker | `packages/course-gen-platform/src/**`, `packages/course-gen-platform/scripts/**`, `packages/course-gen-platform/tests/**`, `packages/course-gen-platform/package.json` | No dependency on W1; live mutations forbidden | Backend unit tests for preflight plan, optional read-only CLI run | parallel | Disjoint write zone and independent verification |
| L1 Stage report/docs | Record staging smoke plan, blockers, cron/performance checklist, and handoff | local orchestrator | `.codex/stages/mc2-db696.11/**`, `.codex/handoff.md`, docs updates if needed | Depends on reviewed W1/W2 outputs | Process verification and stage-ready checks | sequential/local | Simple orchestration docs depend on final accepted implementation |

## TDD Contract

For code changes:

1. RED: add focused tests first and run them to see expected failure.
2. GREEN: implement the minimum behavior.
3. REFACTOR: clean up while keeping targeted tests green.

## Mutation Stop Rules

- No direct push to `develop` or `master`.
- No `--no-verify` or `--no-gpg-sign`.
- No billing/payment scope.
- No staging/prod insert/update/delete, queue add, worker start, cleanup, or LLM-backed generation without explicit approval and disposable fixtures.
- If Supabase `career_playbooks` schema is missing remotely, record the blocker instead of applying migration silently.
