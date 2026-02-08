# Beads Workflow Context

> **Context Recovery**: Run `bd prime` after compaction, clear, or new session

# SESSION CLOSE PROTOCOL

**CRITICAL**: Before saying "done" or "complete", run this checklist:

```
[ ] 1. git status                    (check what changed)
[ ] 2. git add <files>               (stage code changes)
[ ] 3. git commit -m "..."           (commit code)
[ ] 4. git push                      (push to remote)
[ ] 5. IF domain changed → bd update REF: issue
```

**Domain changes requiring REF: update:**

- DB schema → `bd show mc2-yp5` (Entities)
- Pages → `bd show mc2-w50` (Web Pages)
- Pipeline → `bd show mc2-g06` (Stages)
- Tech stack → `bd show mc2-0e0` (Tech)
- i18n → `bd show mc2-mgb` (Languages)

## Core Rules

- Track strategic work in beads (multi-session, dependencies)
- Use `bd create` for issues, TodoWrite for single-session execution
- **NEVER trust subagent reports** — always verify by reading files
- Session: check `bd ready` for available work

## Multi-Terminal Work

When working in multiple terminals simultaneously:

- Each terminal acquires **exclusive lock** on issue via `bd update --status in_progress`
- Lock auto-releases after 30min inactivity
- Find unlocked issues: `bd list --unlocked`
- **Rule**: Each terminal works on DIFFERENT issues

## Essential Commands

### Finding Work

- `bd ready` - Ready issues (no blockers)
- `bd ready --label frontend` - Only frontend issues
- `bd list --unlocked` - Issues not locked by other sessions
- `bd show <id>` - Issue details

### Creating & Updating

- `bd create --title="..." --type=task|bug|feature --priority=2`
- `bd create "Fix X" --files packages/web/page.tsx` - Auto-labels: frontend, nextjs
- `bd update <id> --status=in_progress` - Claim work (acquires lock)
- `bd close <id> --reason="..."` - Complete (releases lock)

### Recurring Tasks (Patrols)

- `bd patrol run code-review --vars "scope=packages/web,topic=my-feature"`
- `bd patrol run health-check`

### Project Knowledge

- `bd search "REF:"` - All reference issues
- `bd show mc2-4ul` - Guides index

## Workflow

```
bd ready → bd update --status=in_progress → work → VERIFY → bd close → git push
```

## Protected Branches

- `develop` — working branch (no auto-deploy)
- `main` — production (auto-deploy)
- Work in develop, merge to main when ready to deploy
