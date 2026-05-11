# Orchestrator Handoff

Updated: 2026-04-06
Current baseline branch: `develop`
Current baseline commit: `8cb1b502f2809223cac73fe630951e2945be0ccd`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only.
- Tracked stage history now lives under `.codex/stages/`; `.codex/agent-reports/` remains the legacy local-only archive.
- The primary worktree still carries local Beads/runtime noise plus an unrelated local change in `.claude/scripts/push-dev.sh`, so prefer isolated worktrees for delegated or parallel execution.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.

## Latest relevant stage

- Latest relevant Stage 6 UI slice: `mc2-ux7aq` — surface `review_required` lessons explicitly in the generation graph.
- Stage summary: [`.codex/stages/mc2-ux7aq/summary.md`](./stages/mc2-ux7aq/summary.md)
- Latest tracked artifact: [`.codex/stages/mc2-ux7aq/artifacts/mc2-ux7aq.md`](./stages/mc2-ux7aq/artifacts/mc2-ux7aq.md)
- Follow-up `mc2-dqbw1` remains separate for latest-usable-content and blank Lesson Inspector loading behavior.

## Next recommended

- Next stage id: `mc2-dqbw1`
- Recommended action: use `mc2-dqbw1` for Lesson Inspector loading and latest-usable-content resolution, keep it separate from the completed review-state visibility slice, and treat Beads lock contention as a separate operational follow-up.

## Starter prompt for next orchestrator

```text
Use $stage-orchestrator to continue with stage `mc2-dqbw1` in this repository. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, and the linked stage summary/artifact first. Then confirm current develop-baseline truth, keep Beads lock contention out of the product stage, and prepare the next execution step for Lesson Inspector loading and latest-usable-content resolution.
```

## Explicit defers

- `mc2-dqbw1` remains the explicit product follow-up for Lesson Inspector loading and latest-usable-content resolution.
- Beads lock contention remains a separate operational follow-up; do not hide it inside unrelated product-stage completion claims.
