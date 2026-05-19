# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `chore/orchestration-baseline-career-playbook`
Current PR: #24 `chore/orchestration-baseline-career-playbook` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Tracked stage history lives under `.codex/stages/`; `.codex/agent-reports/` remains the legacy local-only archive.
- This PR refreshes the orchestration baseline and Career Playbook planning docs to `balanced-v2.12`.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook implementation remains stacked above this baseline; do not retarget dependent PRs to `develop` until #24 lands.

## Latest relevant stage

- Latest relevant delivery stage: PR #24 orchestration baseline for Career Playbook.
- Key docs in this PR: `docs/plans/quiet-waddling-starfish.md` and `docs/plans/career-playbook/*`.
- Key verification: `scripts/orchestration/run_process_verification.sh`.

## Next recommended

- Next stage id: `mc2-db696.11.7.5`
- Recommended action: finish PR #24 review/merge readiness. After #24 lands, revalidate PR #25 checks before advancing the Career Playbook stack.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Verify PR #24 status, then recheck PR #25 only after #24 is resolved.
```

## Explicit defers

- PR #25 remote CI/check evidence remains deferred until PR #24 lands or is explicitly accepted.
- Career Playbook implementation PRs #26-#37 remain stacked; do not merge or retarget them until their base path is ready.
