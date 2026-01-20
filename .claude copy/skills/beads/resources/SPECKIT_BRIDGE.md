# Spec-kit to Beads Bridge

## Overview

Spec-kit is used for **planning** big features (>1 day).
Beads is used for **execution** tracking.

```
Spec-kit (Planning)          Beads (Execution)
─────────────────           ─────────────────
/speckit.specify     →
/speckit.clarify     →
/speckit.plan        →
/speckit.tasks       →      /speckit.tobeads → bd ready
                                              bd update
                                              bd close
                                              bd sync
```

## When to Use Spec-kit

Use spec-kit when:

- Feature estimated >1 day of work
- Complex architecture decisions needed
- Multiple components/packages affected
- Requirements need documentation
- Design review required

Skip spec-kit when:

- Simple bug fix
- Small feature (<1 day)
- Tech debt cleanup
- Routine maintenance

## Import Workflow

### 1. Plan with Spec-kit

```bash
/speckit.specify "Feature description"
/speckit.plan
/speckit.tasks
```

### 2. Import to Beads

```bash
/speckit.tobeads
```

This creates:

- Epic issue for the feature
- Child tasks from tasks.md phases
- Dependencies based on task order
- Labels from [USn] markers

### 3. Execute with Beads

```bash
bd ready                    # See imported tasks
bd update <id> --status in_progress
# ... implement ...
bd close <id> --reason "Done"
bd sync
```

## Task Format Mapping

| tasks.md                 | Beads            |
| ------------------------ | ---------------- |
| `## Phase N`             | Parent task      |
| `- [ ] T001 Description` | Child task       |
| `[P]` marker             | No blocking deps |
| `[US1]` marker           | Label: `us1`     |
| Task order               | Dependencies     |

## Emergent Work

After import, new tasks go directly to Beads:

```bash
# Don't edit tasks.md after import
# Create in Beads instead:
bd create "Found issue during implementation" -t bug \
  --deps discovered-from:<current-task-id>
```

## Documentation Location

After import:

- `specs/NNN-feature/spec.md` — Requirements (permanent)
- `specs/NNN-feature/plan.md` — Architecture (permanent)
- `specs/NNN-feature/tasks.md` — Initial breakdown (archived)
- Beads — Execution tracking (source of truth)

## Example

```bash
# 1. Create spec
/speckit.specify "Add user notifications"
# Creates: specs/042-user-notifications/spec.md

# 2. Plan architecture
/speckit.plan
# Creates: specs/042-user-notifications/plan.md

# 3. Generate tasks
/speckit.tasks
# Creates: specs/042-user-notifications/tasks.md

# 4. Import to Beads
/speckit.tobeads
# Output: Created epic mc2-notif-001 with 12 tasks

# 5. Work in Beads
bd ready
# Shows: mc2-notif-002 "Setup notification service" (unblocked)
bd update mc2-notif-002 --status in_progress
# ... implement ...
bd close mc2-notif-002 --reason "Service setup complete"
bd sync
```
