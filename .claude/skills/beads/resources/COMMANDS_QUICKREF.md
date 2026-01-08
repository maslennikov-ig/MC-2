# Beads Commands Quick Reference

## Task Lifecycle

```bash
# Create task
bd create "Title" -t <type> -p <priority>
bd create "Fix login bug" -t bug -p 1
bd create "Add dark mode" -t feature -p 2 -d "Description here"

# Find available tasks
bd ready
bd ready --json

# Update status
bd update <id> --status in_progress
bd update <id> --status open

# Close task
bd close <id> --reason "Done"
bd close <id> --reason "Completed: implemented X, tested Y"

# View task details
bd show <id>
bd show <id> --json
```

## Dependencies

```bash
# Add dependency (child blocked by parent)
bd dep add <child-id> <parent-id>

# View dependency tree
bd dep tree <id>

# Check for cycles
bd dep cycles

# Discovered-from (emergent work)
bd create "Found issue" -t bug --deps discovered-from:<current-id>
```

## Labels

```bash
# Add label
bd label add <id> <label>
bd label add mc2-a1b2 backend

# Remove label
bd label remove <id> <label>
```

## Molecules & Wisps

```bash
# Create wisp (ephemeral exploration)
bd mol wisp

# Make wisp permanent
bd mol squash <id>

# Discard wisp
bd mol burn <id>

# Pour from template
bd mol pour <proto-name>
```

## Filtering & Search

```bash
# List with filters
bd list --status open
bd list --status in_progress
bd list --priority 1
bd list --label backend
bd list --assignee me

# Stale issues
bd stale --days 7

# Blocked issues
bd blocked
```

## Sync & Maintenance

```bash
# Sync (MANDATORY at session end)
bd sync

# Check health
bd doctor
bd doctor --fix

# View info
bd info
bd info --json

# Statistics
bd stats
```

## Configuration

```bash
# Set config
bd config set <key> <value>
bd config set issue_prefix mc2

# Get config
bd config get <key>
bd config list
```

## Common Workflows

### Start of Session
```bash
bd ready              # See what's available
bd update <id> --status in_progress  # Claim task
```

### During Work
```bash
# Found new issue
bd create "Bug: X not working" -t bug --deps discovered-from:<current-id>
```

### End of Session
```bash
bd close <id> --reason "Implemented feature X"
bd sync               # MANDATORY!
```
