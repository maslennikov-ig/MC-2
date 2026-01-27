# Import Tasks from Central Inbox

Import tasks from central task-inbox repository into local Beads for the current project.

## Usage

Invoke via: `/tasks` or "покажи задачи" or "import tasks"

## Prerequisites

- Central task-inbox at `~/task-inbox/` with Beads initialized
- Local project has Beads initialized (`.beads/` directory)

## Workflow

### Step 1: Detect Current Project

```bash
# Method 1: From directory name
PROJECT=$(basename "$(pwd)")

# Method 2: From Beads config prefix
PROJECT_PREFIX=$(grep 'issue-prefix' .beads/config.yaml 2>/dev/null | awk '{print $2}' | tr -d '"')

# Use prefix if available, otherwise directory name
PROJECT_NAME="${PROJECT_PREFIX:-$PROJECT}"
```

### Step 2: Fetch Tasks from Central Inbox

```bash
TASK_INBOX=~/task-inbox

# Check if task-inbox exists
if [[ ! -d "$TASK_INBOX/.beads" ]]; then
    echo "Task inbox not found at $TASK_INBOX"
    echo "Set up with: mkdir -p ~/task-inbox && cd ~/task-inbox && bd init --prefix TASK"
    exit 1
fi

# Get tasks for this project + unassigned (_inbox)
# Labels format: ["project:jarvis", "tag1", "tag2"]
cd "$TASK_INBOX"
TASKS=$(bd list --status open --json 2>/dev/null | jq --arg p "$PROJECT_NAME" '
    def get_project:
        (.labels // []) | map(select(startswith("project:"))) | first // "project:_inbox" | sub("project:"; "");

    [.[] | select((get_project) == $p or (get_project) == "_inbox")]
')

echo "$TASKS"
```

### Step 3: Display for Selection

Present tasks to user in a clear format:

```markdown
## Tasks for [project] (N total)

### Project Tasks

| ID       | Title           | Priority | Created    |
| -------- | --------------- | -------- | ---------- |
| TASK-abc | Add voice notes | P2       | 2026-01-26 |
| TASK-def | Fix auth bug    | P1       | 2026-01-25 |

### Inbox (unassigned) - can be assigned to this project

| ID       | Title         | Priority | Created    |
| -------- | ------------- | -------- | ---------- |
| TASK-xyz | Research MQTT | P3       | 2026-01-24 |

**Options:**

1. Import all project tasks (N tasks)
2. Import selected tasks (enter IDs: abc, def)
3. Assign inbox task to this project first
4. Skip for now
```

### Step 4: Import Selected Tasks

For each selected task, create in local Beads:

```bash
# Get task details
TASK_DATA=$(cd ~/task-inbox && bd show TASK-xxx --json)
TITLE=$(echo "$TASK_DATA" | jq -r '.title')
TYPE=$(echo "$TASK_DATA" | jq -r '.type // "task"')
PRIORITY=$(echo "$TASK_DATA" | jq -r '.priority // 3')
DESCRIPTION=$(echo "$TASK_DATA" | jq -r '.description // ""')

# Create local task with reference to original
bd create \
    --title "$TITLE" \
    --type "$TYPE" \
    --priority "$PRIORITY" \
    --description "Imported from TASK-xxx

$DESCRIPTION"

# Get the new local task ID
LOCAL_ID=$(bd list --status open --json | jq -r '.[-1].id')

# Mark original as imported in central inbox
cd ~/task-inbox
bd update TASK-xxx --metadata '{"imported_to": "'$PROJECT_NAME'", "imported_at": "'$(date -Iseconds)'", "local_id": "'$LOCAL_ID'"}'
```

### Step 5: Summary

```markdown
## Import Complete

Imported 3 tasks:
| Central | Local | Title |
|---------|-------|-------|
| TASK-abc | CLAW-new1 | Add voice notes |
| TASK-def | CLAW-new2 | Fix auth bug |
| TASK-xyz | CLAW-new3 | Research MQTT |

Run `bd ready` to see available work.
```

## Bidirectional Sync

When closing a local task that was imported, update the central inbox:

```bash
# After bd close LOCAL-xxx
# Check if task was imported
IMPORT_REF=$(bd show LOCAL-xxx --json | jq -r '.description' | grep -oP 'TASK-[a-z0-9]+')

if [[ -n "$IMPORT_REF" ]]; then
    # Update central task
    cd ~/task-inbox
    bd close "$IMPORT_REF" --reason "Completed in project $PROJECT_NAME"

    # Sync
    bd sync --flush-only
fi
```

## Quick Commands

```bash
# View all tasks in central inbox
cd ~/task-inbox && bd list --status open

# View tasks for specific project
cd ~/task-inbox && bd list --json | jq '.[] | select(.metadata.project == "jarvis")'

# Manually import a specific task
TASK_TITLE=$(cd ~/task-inbox && bd show TASK-xxx --json | jq -r '.title')
bd create --title "$TASK_TITLE" --description "Imported from TASK-xxx"

# Check imported status
cd ~/task-inbox && bd show TASK-xxx --json | jq '.metadata.imported_to'
```

## Example Session

```
User: /tasks

Claude: Detecting project from current directory: jarvis

Fetching tasks from central inbox...

## Tasks for jarvis (2 tasks)

| ID | Title | Priority | Type |
|----|-------|----------|------|
| TASK-a3f | Add voice notes support | P2 | feature |
| TASK-b7c | Fix Telegram reconnect | P1 | bug |

## Inbox (1 task)

| ID | Title | Priority |
|----|-------|----------|
| TASK-c8d | Research embedding models | P3 |

**What would you like to do?**
1. Import all jarvis tasks (2)
2. Import specific tasks
3. Assign inbox task to jarvis first
4. Skip

User: 1

Claude: Importing 2 tasks...

✅ TASK-a3f → CLAW-xyz1 (Add voice notes support)
✅ TASK-b7c → CLAW-xyz2 (Fix Telegram reconnect)

Import complete! Run `bd ready` to see available work.
```

## Notes

- Tasks are not deleted from central inbox, only marked as imported
- The import reference in local task description enables bidirectional sync
- Multiple imports of same task are prevented by checking `imported_to` metadata
- Use `bd sync --flush-only` in central inbox to export changes to JSONL for git
