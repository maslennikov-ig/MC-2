# Beads Workflows

## Daily Development Workflow

### Session Start
```bash
# 1. Check available tasks
bd ready

# 2. Claim a task
bd update mc2-xyz --status in_progress

# 3. Review task details
bd show mc2-xyz
```

### During Development
```bash
# Found a bug while working
bd create "Bug: edge case in validation" -t bug -p 2 \
  --deps discovered-from:mc2-xyz

# Need to do prerequisite work first
bd create "Refactor auth module" -t task -p 1
bd dep add mc2-xyz mc2-newid  # xyz blocked by newid
```

### Session End
```bash
# 1. Close completed task
bd close mc2-xyz --reason "Implemented: added feature X with tests"

# 2. Sync to git (MANDATORY)
bd sync
```

## Big Feature Workflow (>1 day)

### Planning Phase (Spec-kit)
```bash
# 1. Create specification
/speckit.specify "Payment integration with Stripe"

# 2. Clarify requirements (optional)
/speckit.clarify

# 3. Create technical plan
/speckit.plan

# 4. Generate tasks
/speckit.tasks
```

### Execution Phase (Beads)
```bash
# 5. Import to Beads
/speckit.tobeads

# 6. Work on tasks
bd ready
bd update mc2-pay-001 --status in_progress
# ... implement ...
bd close mc2-pay-001 --reason "Done"

# 7. Emergent work goes directly to Beads
bd create "Edge case: refund flow" -t task \
  --deps discovered-from:mc2-pay-001

# 8. Sync at end
bd sync
```

## Bug Fix Workflow

```bash
# 1. Create bug issue
bd create "Login fails on Safari" -t bug -p 1 \
  -d "Users report 500 error on Safari 17"

# 2. Claim and investigate
bd update mc2-bug-123 --status in_progress

# 3. Found root cause - create related task if needed
bd create "Update session handling" -t task \
  --deps discovered-from:mc2-bug-123

# 4. Fix and close
bd close mc2-bug-123 --reason "Fixed: updated cookie settings for Safari"

# 5. Sync
bd sync
```

## Exploration Workflow (Wisps)

```bash
# 1. Create wisp for uncertain work
bd mol wisp

# 2. Explore the approach
# ... try things out ...

# 3a. If successful - make permanent
bd mol squash mc2-wisp-xyz --summary "Approach works: use X pattern"

# 3b. If dead end - discard
bd mol burn mc2-wisp-xyz
```

## Tech Debt Workflow

```bash
# 1. Create tech debt issue
bd create "DEBT: Migrate to new auth library" -t chore -p 3 \
  -d "Current auth lib is deprecated, migrate to new version"

# 2. Work when capacity allows
bd ready --priority 3  # See low-priority items
bd update mc2-debt-abc --status in_progress

# 3. Complete and document
bd close mc2-debt-abc --reason "Migrated auth lib v2→v3, updated all handlers"

# 4. Sync
bd sync
```

## Release Workflow

The `/push` command automatically runs `bd sync` before release.

```bash
# All beads changes are synced automatically
/push patch
```
