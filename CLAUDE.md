# CLAUDE.md

@AGENTS.md

## Claude Code CLI Adapter

- Target runtime: Claude Code CLI in the VS Code integrated terminal on WSL.
- Primary workflow comes from global `~/.claude/CLAUDE.md` and the `orchestration-bridge` plugin.
- For medium/complex, risky, docs-sensitive, delegated, file-changing, or handoff-prone work, use `orchestration-bridge:orchestrator-stage`.
- Do not use `template-bridge` for new orchestration.
- Use Docs L1/L2: `@neuledge/context` first with lockfile-routed package/version; Context7 MCP or first-party docs as fallback only when L1 is missing, stale, or insufficient.
- Use Beads when available for file-changing, delegated, long, or handoff-prone work.
- Remote push, PR creation, merge, deploy, force-push, and production mutation require repo contract support and current user authorization.

## Preserved Project Notes

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
