# CLAUDE.md

@AGENTS.md

## Claude Code CLI Adapter

- Target runtime: Claude Code CLI in the VS Code integrated terminal on WSL.
- Primary workflow comes from global `~/.claude/CLAUDE.md` and the `orchestration-bridge` plugin.
- For medium/complex, risky, docs-sensitive, delegated, file-changing, or handoff-prone work, use `orchestration-bridge:orchestrator-stage`.
- Do not use `template-bridge` for new orchestration.
- Use Docs L1/L2: `@neuledge/context` first with lockfile-routed package/version; Context7 MCP or first-party docs only when L1 is missing, stale, or insufficient.
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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, follow the repo delivery contract and current user authorization. Remote pushes are not automatic.

**CRITICAL RULES:**

- Use `bd` for task truth when available.
- Run quality gates before completion claims.
- Do not push unless the repo contract and current user authorization allow it.
<!-- END BEADS INTEGRATION -->
