# CLAUDE.md

Primary repo contract lives in `AGENTS.md`.

For orchestration and current state, use:

1. `AGENTS.md`
2. `.codex/orchestrator.toml`
3. `.codex/handoff.md`

Repo-specific reminders:

- `/push-dev` is the dev delivery path into `develop`.
- `/push` is the release/version flow.
- `/deploy` handles staging delivery into `master`.
- Prefer isolated worktrees when the primary worktree has unrelated local state.
