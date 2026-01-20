# Beads Task Tracking Skill

Git-backed task tracking system for AI agents. Primary task management for mc2 project.

## Quick Reference

```bash
# Find available tasks
bd ready

# Create task
bd create "Title" -t <type> -p <priority>

# Update status
bd update <id> --status in_progress
bd close <id> --reason "Done"

# Sync (MANDATORY at session end)
bd sync
```

## Task Types

| Type      | Use Case              |
| --------- | --------------------- |
| `task`    | General work item     |
| `feature` | New functionality     |
| `bug`     | Bug fix               |
| `chore`   | Maintenance, cleanup  |
| `epic`    | Parent for large work |

## Priority

- `0` = Critical (highest)
- `1` = High
- `2` = Medium (default)
- `3` = Low

## Decision Matrix

| Work Type              | Tool             | Command                                 |
| ---------------------- | ---------------- | --------------------------------------- |
| Big feature (>1 day)   | Spec-kit + Beads | `/speckit.specify` → `/speckit.tobeads` |
| Small feature (<1 day) | Beads            | `bd create -t feature`                  |
| Bug fix                | Beads            | `bd create -t bug`                      |
| Tech debt              | Beads            | `bd create -t chore`                    |
| Exploration            | Beads wisps      | `bd mol wisp`                           |

## Emergent Work

When discovering new tasks during work:

```bash
bd create "Found issue X" -t bug --deps discovered-from:<current-task-id>
```

## Wisps (Ephemeral Tasks)

For exploration/uncertain work:

```bash
# Create wisp
bd mol wisp

# If successful → make permanent
bd mol squash <id>

# If dead end → discard
bd mol burn <id>
```

## Session Protocol

1. Start: `bd ready` to see available tasks
2. Work: `bd update <id> --status in_progress`
3. Complete: `bd close <id> --reason "description"`
4. End: `bd sync` (MANDATORY)

## mc2 Conventions

- Issue prefix: `mc2`
- Examples: `mc2-a3f2dd`, `mc2-b7c4e1`
- Constitution: v1.2.0 (Principle VII: Task Tracking with Beads)

## Resources

- [Decision Matrix](resources/DECISION_MATRIX.md)
- [Workflows](resources/WORKFLOWS.md)
- [Commands Quick Reference](resources/COMMANDS_QUICKREF.md)
- [Spec-kit Bridge](resources/SPECKIT_BRIDGE.md)
