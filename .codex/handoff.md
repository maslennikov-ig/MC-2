# Orchestrator Handoff

Updated: 2026-06-06
Stage: `mc2-yyxzc`
Branch: `codex/fix-qdrant-integration-service`

## Current State

- Qdrant CI root cause is identified: master `Integration Tests` waits on `localhost:6333/readyz`, but the job previously declared only `redis`.
- Local branch adds the missing `qdrant` service to `.github/workflows/ci-cd.yml` `test-integration`, with `QDRANT__SERVICE__API_KEY=test-qdrant-key` and `6333:6333` port mapping.
- Previous failing master runs `26950380871` and `27055076683` skipped integration tests because readiness failed before `pnpm test:integration`.
- Career Playbook visibility and owner-only access are already shipped to dev/staging; `career_playbooks.visibility` is canonical and `is_public` remains the public-link mirror.
- Dev Career Playbook DB/model-config migration drift was repaired in stage `mc2-mrjag`.
- Follow-up `mc2-k2qih` remains open for panel animation, active TOC section, and TOC auto-scroll polish.

## Verification

- Workflow structural check passed: parsed `.github/workflows/ci-cd.yml` and asserted `test-integration` has `qdrant`, `/readyz` wait step, and matching `QDRANT_URL/QDRANT_API_KEY`.
- `git diff --check` passed.
- `actionlint` is not installed locally.
- GitHub Actions evidence is still needed after push because local Docker/GitHub service-container execution is not available here.

## Next recommended

Next stage id: `mc2-yyxzc`.
Recommended action: commit and push `codex/fix-qdrant-integration-service`, then observe GitHub Actions until `Wait for Qdrant` passes and `Run integration tests` executes.
Recommended action: if the job then reaches test failures, continue `mc2-yyxzc` with the new logs instead of treating it as the same readiness issue.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-yyxzc`, stage summary `.codex/stages/mc2-yyxzc/summary.md`, and Graphify report. Do not touch `/home/me/code/mc2-worktrees/career-playbook-business-context` unless explicitly requested.

## Delivery

- docs-reviewed: updated - handoff records the Qdrant CI root cause, local workflow fix, verification, and required GitHub Actions evidence.
- graph-reviewed: no-change-needed - workflow/handoff-only change; no repo code structure, API, or module boundary changed.

## Explicit defers

- Browser/user-flow smoke is not applicable to this CI workflow fix.
- GitHub Actions validation remains pending until the branch is pushed.
