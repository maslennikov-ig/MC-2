# Orchestrator Handoff

Updated: 2026-06-07
Stage: `mc2-db696.58`
Branch: `codex/career-playbook-e2e-audit`

## Current State

- Career Playbook authenticated E2E fixture work is ready for closeout.
- Playwright global setup signs in server test user `test-instructor1@megacampus.com`; `TOKEN` remains only a legacy fallback.
- Stable viewer fixture: `00000000-0000-4000-8000-000000002001`.
- Freeform-only business context persists as `business_context.status=skipped` before follow-up requests on frontend and backend.
- Follow-up loading is visible immediately; failures return to Business Context with an alert and retry path.
- Role suggestion dropdown no longer overlays the wizard CTA during E2E role entry.
- Fully local API E2E is blocked by `mc2-zt4ju`; browser E2E used local Next with `COURSEGEN_BACKEND_URL=https://dev.ai.megacampus.ru/api` and `NEXT_PUBLIC_COURSEGEN_BACKEND_URL=/api`.
- Other worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` remains untouched.

## Verification

- Passed: backend business-context guard, progress router, and source-processing regression tests.
- Passed: web store unit — 38 tests; web store progress — 10 tests; page-client — 20 tests.
- Passed: no-`TOKEN` authenticated Chromium E2E — Career Playbook 5 tests, header dropdown 2 tests.
- Passed: no-`TOKEN` authenticated mobile Chrome header dropdown E2E — 2 tests.
- Passed: `pnpm type-check` and `pnpm build`.

## Next recommended

Next stage id: `mc2-db696.58`
Recommended action: commit, push, and close `mc2-db696.58`.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read stage `mc2-db696.58`, Beads `mc2-db696.58`, follow-up `mc2-zt4ju`, and Graphify report. Continue branch `codex/career-playbook-e2e-audit`; do not touch `/home/me/code/mc2-worktrees/career-playbook-business-context`.

## Delivery

- docs-reviewed: updated - handoff and stage summary record fixture work, E2E coverage, and local API blocker.
- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`.

## Explicit defers

- `mc2-zt4ju` tracks restoring runnable local `course-gen-platform` API for fully local Playwright E2E.
- No staging/production deploy has been performed.
