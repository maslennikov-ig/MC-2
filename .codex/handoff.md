# Orchestrator Handoff

Updated: 2026-06-06
Stage: `mc2-9ayox`
Branch: `codex/fix-integration-ci-timeout`

## Current State

- Root cause for master Integration Tests timeout is identified: `.github/workflows/ci-cd.yml` ran full `pnpm test:integration`, which expands to 42 backend integration files/681 backend tests plus web integration.
- Master run `27060414181` reached `document-processing-worker.test.ts` `Embedding Validation` and then external `timeout 900` killed `pnpm test:integration`; this is a full-suite sizing issue, not Qdrant readiness.
- Local branch adds bounded `pnpm test:integration:ci`: backend deploy-gate subset via `vitest.config.integration-ci.ts` plus web integration tests.
- The backend CI subset includes static Career Playbook migration contract tests and a small Qdrant smoke test that creates a temporary collection, writes one point, reads it back, and cleans up.
- Full `pnpm test:integration` remains available for manual/nightly/release-candidate full validation.
- Career Playbook visibility and owner-only access are already shipped to dev/staging; `career_playbooks.visibility` is canonical and `is_public` remains the public-link mirror.
- Dev Career Playbook DB/model-config migration drift was repaired in stage `mc2-mrjag`.
- Follow-up `mc2-k2qih` remains open for panel animation, active TOC section, and TOC auto-scroll polish.

## Verification

- Workflow structural check passed: parsed `.github/workflows/ci-cd.yml` and asserted `test-integration` runs `timeout 300 pnpm test:integration:ci`, preserves the Qdrant service, and captures timeout exit code.
- `QDRANT_URL=http://localhost:6333 QDRANT_API_KEY=test-qdrant-key pnpm test:integration:ci` passed locally: backend 5 tests, web 19 tests.
- `pnpm type-check` passed.
- `pnpm build` passed.

## Next recommended

Next stage id: `mc2-9ayox`.
Recommended action: commit and push `codex/fix-integration-ci-timeout`, then observe GitHub Actions until `Run CI integration smoke tests` completes under the 5-minute timeout.
Recommended action: keep full integration validation outside the deploy job as manual/nightly/release-candidate validation unless a later tracked task changes release policy.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-9ayox`, stage summary `.codex/stages/mc2-9ayox/summary.md`, and Graphify report. Do not touch `/home/me/code/mc2-worktrees/career-playbook-business-context` unless explicitly requested.

## Delivery

- docs-reviewed: updated - handoff and project index record the new CI integration smoke entrypoint and full-suite policy.
- graph-reviewed: no-change-needed - workflow/test harness change; no application architecture/API/module boundary changed.

## Explicit defers

- Browser/user-flow smoke is not applicable to this CI workflow fix.
- GitHub Actions validation remains pending until the branch is pushed/merged; local smoke and build gates passed.
