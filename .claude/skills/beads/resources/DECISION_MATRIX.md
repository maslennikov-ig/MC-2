# Beads Decision Matrix

## When to Use What

### Beads Only (90% of work)

| Scenario               | Command                                                      |
| ---------------------- | ------------------------------------------------------------ |
| Small feature (<1 day) | `bd create "Feature X" -t feature -p 2`                      |
| Bug fix                | `bd create "Fix Y" -t bug -p 1`                              |
| Tech debt              | `bd create "Cleanup Z" -t chore -p 3`                        |
| Discovered during work | `bd create "Found issue" -t bug --deps discovered-from:<id>` |
| Quick exploration      | `bd mol wisp`                                                |

### Spec-kit + Beads (10% of work)

| Scenario             | Workflow                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| Big feature (>1 day) | `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.tobeads` |
| Complex architecture | Use spec-kit for design docs, import tasks to Beads                          |
| Multi-phase project  | Create epic in Beads, use spec-kit for planning                              |

### TodoWrite (Session UI)

| Scenario                    | Usage                            |
| --------------------------- | -------------------------------- |
| Show progress to user       | TodoWrite for visual feedback    |
| Track within single session | TodoWrite for ephemeral tracking |
| Persistent cross-session    | Use Beads                        |

## Decision Flowchart

```
Is it a new task?
├─ Yes → Is it >1 day of work?
│        ├─ Yes → Use Spec-kit for planning, then import to Beads
│        └─ No → Create directly in Beads
└─ No → Is it discovered during work?
         ├─ Yes → bd create --deps discovered-from:<current>
         └─ No → Check bd ready for existing tasks
```

## Priority Guidelines

| Priority     | Use For                                     |
| ------------ | ------------------------------------------- |
| 0 (Critical) | Production issues, security vulnerabilities |
| 1 (High)     | Blocking bugs, urgent features              |
| 2 (Medium)   | Normal features, improvements               |
| 3 (Low)      | Nice-to-have, tech debt                     |

## Type Selection

| Type      | When                                |
| --------- | ----------------------------------- |
| `feature` | New user-facing functionality       |
| `bug`     | Something broken that worked before |
| `task`    | Internal work, refactoring          |
| `chore`   | Maintenance, dependencies, cleanup  |
| `epic`    | Parent container for related work   |
