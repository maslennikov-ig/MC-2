---
description: Import tasks from tasks.md into Beads issue tracker, creating an epic with child tasks and proper dependencies.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Prerequisites

Verify Beads is installed:

```bash
bd version
```

If not installed, instruct user to run:

```bash
npm install -g @beads/bd
bd init
```

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute.

2. From the executed script, extract the path to **tasks.md**.

3. Read and parse tasks.md file. Expected format:
   - `## Phase N: Title` — Phase headers become parent tasks
   - `- [ ] TXXX Description` — Tasks become child issues
   - `[P]` marker — Task can run in parallel (no blocking deps)
   - `[USn]` marker — User story label

4. Create Epic in Beads:

   ```bash
   bd create "Feature: <feature-name>" -t epic -p 2 -d "<spec-path>"
   ```

   Save the returned epic ID.

5. For each Phase, create a parent task:

   ```bash
   bd create "Phase N: <title>" -t task -p 2 --parent <epic-id>
   ```

6. For each task within a phase:

   ```bash
   bd create "<task-description>" -t task -p 2 --parent <phase-id>
   ```

   If task has `[USn]` marker, add label:

   ```bash
   bd label add <task-id> usN
   ```

7. Set up dependencies:
   - Tasks without `[P]` marker depend on previous task in same phase
   - First task of Phase N+1 depends on last task of Phase N

   ```bash
   bd dep add <child-id> <parent-id>
   ```

8. Sync to git:
   ```bash
   bd sync
   ```

## Output

Report the import results:

```
## Import Complete

**Epic:** mc2-<id> - <feature-name>
**Phases:** N
**Tasks:** M total

### Created Issues
- mc2-abc123: Phase 1: Setup
  - mc2-def456: Task 1.1 description
  - mc2-ghi789: Task 1.2 description [P]
- mc2-jkl012: Phase 2: Implementation
  ...

### Dependencies
- mc2-def456 → mc2-ghi789 (sequential)
- mc2-ghi789 → mc2-jkl012 (phase transition)

### Next Steps
Run `bd ready` to see available tasks.
```

## Error Handling

- If tasks.md not found: Report error and suggest running `/speckit.tasks` first
- If Beads not initialized: Run `bd init` automatically
- If task creation fails: Report which task failed and continue with remaining

## Example

Input tasks.md:

```markdown
## Phase 1: Setup

- [ ] T001 Create database schema
- [ ] T002 [P] Setup API routes

## Phase 2: Implementation

- [ ] T003 [US1] Implement user service
- [ ] T004 [US1] Add validation
```

Creates:

```
mc2-epic-001: Feature: user-management
├── mc2-ph1-001: Phase 1: Setup
│   ├── mc2-t001: Create database schema
│   └── mc2-t002: Setup API routes [parallel]
└── mc2-ph2-001: Phase 2: Implementation
    ├── mc2-t003: Implement user service (label: us1)
    └── mc2-t004: Add validation (label: us1)

Dependencies:
- mc2-t001 blocks mc2-t002 (unless [P])
- mc2-t002 blocks mc2-ph2-001
```
