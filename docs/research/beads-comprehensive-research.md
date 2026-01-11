# Beads Comprehensive Research Report

**Date**: 2026-01-11
**Researcher**: Claude Code (Research Specialist)
**Repository**: https://github.com/steveyegge/beads
**Status**: Complete

---

## Executive Summary

Beads is a distributed, git-backed graph issue tracker purpose-built for AI coding agents by Steve Yegge. It provides a persistent, structured memory system that replaces ad-hoc markdown task plans with a dependency-aware graph stored as JSONL files in git. The tool is designed for zero-conflict multi-agent collaboration using hash-based IDs, automatic synchronization via daemon, and intelligent 3-way merge strategies.

**Key Innovation**: Issues are versioned, branched, and merged like code, enabling seamless multi-agent workflows across extended projects without central servers.

**Current Status**: v0.44.0+ (active development, approaching 1.0)

---

## 1. Complete Feature List

### Core Issue Management

| Feature | Description |
|---------|-------------|
| **Hash-Based IDs** | Collision-resistant IDs (bd-a1b2) that scale from 4→6 chars as database grows |
| **Hierarchical Issues** | Epics with parent-child relationships (.1, .2, .3 suffixes) |
| **Typed Dependencies** | `blocks`, `parent-child`, `related`, `discovered-from` with different semantics |
| **Status Workflow** | `open → in_progress → closed` with reopen capability |
| **Priority System** | P0-P9 priority levels for work ordering |
| **Issue Types** | bug, feature, chore, epic, task, subtask |
| **Labels** | Multi-dimensional categorization (technical, domain, effort, quality gates) |
| **Assignees** | Agent or human ownership tracking |
| **Descriptions** | Markdown-formatted issue details |
| **Timestamps** | Created, updated, closed timestamps with timezone support |

### Work Discovery & Filtering

| Feature | Description |
|---------|-------------|
| **bd ready** | Find issues with no blockers (ready to work) in ~10ms |
| **bd blocked** | Show issues waiting on dependencies |
| **bd stale** | Find issues not modified in X days |
| **bd list** | Complex filtering by status, priority, assignee, type, labels, text, dates |
| **bd show** | Detailed issue view with full dependency tree |
| **bd dep tree** | Visualize dependency hierarchy |

### Molecules & Workflow Automation

| Feature | Description |
|---------|-------------|
| **Formulas** | JSON compile-time macros for complex composition |
| **Protos** | Frozen reusable templates (synced to `.beads/`) |
| **Molecules** | Persistent active instances (epics with workflow semantics) |
| **Wisps** | Ephemeral unsync'd operations (no audit trail) |
| **bd mol bond** | Combine work graphs with sequential/parallel/conditional logic |
| **bd mol squash** | Convert ephemeral wisps to permanent summaries |
| **bd mol burn** | Discard ephemeral items destructively |
| **bd mol pour** | Instantiate persistent template instances |

### Database & Sync

| Feature | Description |
|---------|-------------|
| **SQLite Cache** | Fast local queries with indexes, full-text search |
| **JSONL Storage** | Git-tracked source of truth (one entity per line) |
| **Auto-Export** | 500ms debounced export on mutations (event-driven v0.21.0+) |
| **Auto-Import** | Periodic remote sync (30s default) and on-demand after git ops |
| **3-Way Merge** | Field-specific merge strategies (LWW for scalars, union for collections) |
| **Zombie Issues** | Resurrect deleted issues if modified elsewhere (prevents data loss) |
| **Blocked Cache** | Materialized view for 25x faster ready work queries |

### Daemon & Background Operations

| Feature | Description |
|---------|-------------|
| **Per-Workspace Daemon** | One daemon per project (LSP-style) at `.beads/bd.sock` |
| **Event-Driven Export** | FileWatcher (inotify/FSEvents) triggers 500ms batched export |
| **Remote Sync** | Configurable interval (30s default, min 5s) |
| **Auto-Start** | Daemon launches on first command (unless disabled) |
| **Health Checks** | Version mismatch detection, stale socket cleanup |
| **Daemon Logs** | `bd daemons logs . -f` for real-time monitoring |
| **No-Daemon Mode** | `--no-daemon` flag or `BEADS_NO_DAEMON=1` for git worktrees/CI |

### Git Integration

| Feature | Description |
|---------|-------------|
| **Git Hooks** | pre-commit, post-merge, pre-push, post-checkout auto-sync |
| **Sync Modes** | Normal, sync-branch, external, from-main, local-only, export-only |
| **Protected Branch** | Commit to `beads-sync` branch instead of `main` |
| **Fork Workflow** | Contributor mode routes issues to `~/.beads-planning` |
| **Multi-Repo** | Aggregate multiple repos into unified view with `repos.additional` |
| **Worktree Safety** | Auto-disable daemon in worktrees (prevents branch confusion) |

### Advanced Operations

| Feature | Description |
|---------|-------------|
| **bd duplicates** | Hash-based duplicate detection with auto-merge |
| **bd merge** | Consolidate duplicates with dependency migration |
| **bd admin compact** | Compress old closed issues (semantic summarization) |
| **bd restore** | Recover compacted issues from version history |
| **bd rename-prefix** | Change issue ID prefix system-wide (bd-xxx → mc-xxx) |
| **bd admin cleanup** | Bulk delete closed issues with age filtering |
| **bd migrate** | Schema upgrades with `--inspect` safety analysis |
| **bd doctor** | Detect orphaned issues, stale locks, version mismatches |

### Integration & Extensibility

| Feature | Description |
|---------|-------------|
| **JSON Output** | All commands support `--json` for programmatic access |
| **MCP Server** | Stateless adapter for Claude Desktop/Cursor integration |
| **Custom Tables** | Extend SQLite schema via `UnderlyingDB()` method |
| **Batch Operations** | `CreateIssues()` for 5-15x speedup on bulk imports |
| **GitHub Import** | `examples/github-import` for migrating issues |
| **Jira Import** | `examples/jira-import` for enterprise migration |
| **Linear Workflow** | `examples/linear-workflow` integration |

### Configuration & Customization

| Feature | Description |
|---------|-------------|
| **bd config** | Project-level settings (issue_prefix, collision_prob, hash lengths) |
| **Viper Config** | Global flags (json, no-daemon, no-auto-flush, auto-start) |
| **Directory Labels** | Auto-apply labels based on file paths (monorepo support) |
| **External Projects** | Cross-project dependency linking |
| **Git Author Override** | Custom commit authorship for beads |
| **GPG Signing** | Configurable GPG signature for commits |
| **Validation Templates** | Template validation on create/sync (none/warn/error) |

### AI Agent Workflows

| Feature | Description |
|---------|-------------|
| **bd prime** | Inject 1-2k tokens of workflow context for agents |
| **PRIME.md Override** | Custom prime output per project (v0.44.0+, GH#876) |
| **Session Hooks** | SessionStart/PreCompact auto-run `bd prime` |
| **Landing the Plane** | Mandatory protocol for completing sessions (sync + push) |
| **Actor Identity** | `--actor` flag for audit trail attribution |
| **Stealth Mode** | Flush without git operations (personal use) |

---

## 2. Community-Recommended Patterns & Features

### Top Recommended Features (Based on Documentation & Articles)

1. **Hash-Based IDs** - Eliminates merge conflicts in multi-agent workflows
2. **bd ready** - Fast (~10ms) discovery of unblocked work
3. **Molecules (Epics)** - Hierarchical organization for large features
4. **Auto-Sync Daemon** - Hands-off synchronization across machines
5. **3-Way Merge** - Prevents data loss during concurrent modifications
6. **Git Hooks** - Guaranteed consistency across git operations
7. **Wisps** - Ephemeral issues for routine patrols without polluting history
8. **Labels as State Cache** - Fast queries while preserving event history
9. **bd duplicates --auto-merge** - Automatic consolidation of duplicate issues
10. **bd prime** - Minimal-token context injection for agents

### Workflow Patterns from Community

#### 1. **"Land the Plane" Protocol** (Critical)

Mandatory steps when ending session (from AGENT_INSTRUCTIONS.md):

```bash
# 1. File remaining work
bd create "Follow-up task" -p 1

# 2. Run quality gates (if code modified)
golangci-lint run ./...
go test ./...

# 3. Update beads status
bd close bd-abc --reason "Completed feature X"
bd update bd-def --status in_progress

# 4. Push sequence (NON-NEGOTIABLE)
git pull --rebase
bd sync
git push
git status  # Verify "up to date with origin/main"

# 5. Clean git state
git stash clear
git remote prune origin
```

**Critical Rule**: The plane is NOT landed until `git push` succeeds. Unpushed work causes multi-agent conflicts.

#### 2. **Hierarchical Organization Pattern**

```bash
# Create epic for large feature
bd create "Add OAuth2 Authentication" -t epic
# Output: Created bd-a1b2

# Create child tasks (auto-numbered)
bd create "Setup OAuth provider config" -p bd-a1b2
bd create "Implement token exchange flow" -p bd-a1b2
bd create "Add user session management" -p bd-a1b2

# View hierarchy
bd dep tree bd-a1b2
```

#### 3. **Labels as State Cache Pattern** (Advanced)

From LABELS.md - use namespaced labels for operational state:

```bash
# Role bead for system component
bd create "API Service" -t epic
bd label bd-xyz patrol:muted mode:degraded status:working health:failing

# Fast queries
bd list --label status:failing
bd list --label mode:degraded --label health:failing
```

Create immutable event records for state transitions, then update cached labels for instant lookups.

#### 4. **Multi-Agent Coordination Pattern**

```bash
# Agent 1 claims work
bd ready --json | jq -r '.[0].id'  # Get first ready issue
bd update bd-abc --assignee agent-1 --status in_progress

# Agent 2 filters by availability
bd ready --assignee ""  # Only unassigned work
bd ready --assignee agent-2  # Only my work
```

#### 5. **Discovery Pattern with Dependencies**

```bash
# During work, discover new issue
bd create "Missing API endpoint for user profile" -p 2
# Output: bd-def

# Link to current work
bd dep add bd-def bd-abc --type discovered-from

# Creates audit trail: "bd-def was discovered while working on bd-abc"
```

#### 6. **Molecule Bonding Pattern** (Advanced Workflows)

```bash
# Create workflow templates
bd formula list

# Instantiate persistent molecule
bd mol pour security-audit-template bd-xxx

# Create ephemeral wisp for routine check
bd mol wisp health-check-patrol

# Bond molecules for compound execution
bd mol bond bd-xxx bd-yyy
```

#### 7. **Fork Workflow Pattern** (OSS Contributors)

```bash
# Initialize as contributor
bd init --contributor

# Issues route to personal planning repo (~/.beads-planning)
# Keeps upstream PRs clean while tracking work

# Auto-routing based on git remote URL
# SSH = maintainer (issues stay in repo)
# HTTPS = contributor (issues route to planning)
```

#### 8. **Protected Branch Pattern** (Team Workflow)

```bash
# Initialize for team with protected main branch
bd init --team

# Issues commit to beads-sync branch instead of main
# Preserves protected branch policy while allowing automation
```

---

## 3. PRIME.md Customization Examples

### What is `bd prime`?

The `bd prime` command injects workflow context (~1-2k tokens) for AI agents at session start. This provides:

- Current ready work
- Recently modified issues
- Dependency status
- Project conventions
- Workflow rules

### PRIME.md Override Feature (v0.44.0+)

**Status**: Recently added (GH#876), minimal public documentation found.

**Purpose**: Custom prime output per project to override default `bd prime` behavior.

**Location**: Likely `.beads/PRIME.md` or project root (not confirmed in docs)

### How It's Used (Based on Integration Docs)

From CLAUDE_INTEGRATION.md:

```bash
# bd prime is called automatically via hooks
# SessionStart hook → bd prime
# PreCompact hook → bd prime

# Manual invocation
bd prime
```

Output example (inferred from usage):
```
Ready Work (3 issues):
- bd-a1b2 (P0): Fix authentication bug
- bd-c3d4 (P1): Add user profile endpoint
- bd-e5f6 (P2): Update documentation

Recent Activity:
- bd-x7y8: Closed "Setup OAuth config" (agent-1, 2h ago)
- bd-z9a0: Updated to in_progress "Token exchange flow" (agent-2, 30m ago)

Project Conventions:
- Use bd create for all new work
- Link discoveries with --type discovered-from
- Run bd sync at session end
```

### Customization Use Cases (Inferred)

1. **Add Project-Specific Rules**
   ```markdown
   ## Project-Specific Workflow
   - All P0 bugs require tests before closing
   - API changes need architecture review
   - Run `npm test` before bd sync
   ```

2. **Custom Ready Work Filters**
   ```markdown
   ## Work Discovery Strategy
   - Frontend work: bd ready --label frontend
   - Backend work: bd ready --label backend
   - Cross-cutting: bd ready --label-any frontend,backend
   ```

3. **Team Coordination Rules**
   ```markdown
   ## Multi-Agent Protocol
   - Claim work: bd update <id> --assignee $(whoami)
   - Check conflicts: bd list --status in_progress
   - Daily sync: 9am, 2pm, 5pm UTC
   ```

**Note**: Actual PRIME.md examples not found in public repositories. This feature appears new with limited adoption documentation.

---

## 4. Advanced Patterns That Could Be Useful

### 1. **Blocked Issues Cache Optimization**

**Use Case**: Large databases (10K+ issues) where `bd ready` becomes slow.

**Implementation**: Beads automatically materializes blocked status into cache table.

**Benefit**: 25x speedup (752ms → 29ms for 10K issues).

**How It Works**:
- Cache rebuilds on dependency/status changes
- Trades slower writes for dramatically faster reads
- Transparent to user (no configuration needed)

### 2. **Wisps for Routine Patrols**

**Use Case**: Regular health checks, security scans, duplicate detection without polluting git history.

**Pattern**:
```bash
# Create ephemeral wisp from template
bd mol wisp daily-health-check

# Execute patrol, discover issues
bd create "Found security vulnerability in dep X" -p 0

# Pour important discoveries into persistent molecules
bd mol squash bd-wisp-abc --into bd-epic-def

# Burn completed wisps (no git record)
bd mol burn bd-wisp-abc
```

**Benefits**:
- Fast local iteration (~60% less CPU than normal issues)
- No sync overhead during execution
- Git history stays clean
- Can promote discoveries to persistent issues

### 3. **Custom SQLite Tables for Extensions**

**Use Case**: Time tracking, cost estimation, test coverage, deployment tracking.

**Pattern** (from EXTENDING.md):
```go
// Get shared database connection
db := storage.UnderlyingDB()

// Create custom table with foreign key
_, err := db.Exec(`
  CREATE TABLE IF NOT EXISTS myapp_time_tracking (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    seconds INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
  )
`)

// Query across layers with JOIN
rows, err := db.Query(`
  SELECT i.id, i.title, SUM(t.seconds) as total_time
  FROM issues i
  JOIN myapp_time_tracking t ON i.id = t.issue_id
  WHERE i.status = 'closed'
  GROUP BY i.id
`)
```

**Benefits**:
- Single source of truth (no duplicate data)
- Fast queries with SQL JOINs
- Automatic cleanup (ON DELETE CASCADE)
- Namespaced tables prevent conflicts

### 4. **Directory Labels for Monorepos**

**Use Case**: Auto-apply labels based on file paths in large codebases.

**Configuration** (`.beads/config.yaml`):
```yaml
directory_labels:
  "packages/web": ["frontend", "nextjs"]
  "packages/api": ["backend", "golang"]
  "packages/shared": ["library", "typescript"]
```

**Usage**:
```bash
# Auto-labeled based on files touched
bd create "Fix login page crash" --files packages/web/app/login/page.tsx
# Automatically gets labels: frontend, nextjs

# Filter by area
bd ready --label frontend
bd ready --label backend
```

### 5. **Multi-Repo Hydration**

**Use Case**: Aggregate issues from multiple repositories into unified view.

**Configuration** (`.beads/config.yaml`):
```yaml
repos:
  additional:
    - path: ~/code/project-api
      import: true
    - path: ~/code/project-mobile
      import: true
```

**Benefits**:
- Single dashboard for all project work
- Maintains `source_repo` field for filtering
- Export routes back to correct repository
- Cross-repo dependency linking

### 6. **3-Way Merge Field Strategies**

**Understanding** (from SYNC.md):

| Field Type | Strategy | Example |
|------------|----------|---------|
| Scalars | Last-Write-Wins (timestamp) | title, description, status |
| Collections | Union (keep all) | labels, dependencies |
| Comments | Append (dedupe by ID) | comment array |

**Use Case**: When same issue modified on different machines.

**Scenario**:
```bash
# Machine A: Add label "urgent"
bd label bd-abc urgent

# Machine B: Add label "security" (same issue)
bd label bd-abc security

# After sync: Both labels present (union strategy)
bd show bd-abc
# Labels: urgent, security
```

**Zombie Issues**:
```bash
# Machine A: Delete issue
bd admin cleanup --id bd-abc

# Machine B: Update same issue (before sync)
bd update bd-abc --status in_progress

# After sync: Issue "resurrects" with modifications
# Prevents accidental work loss
```

### 7. **Adaptive Hash Length**

**Use Case**: Balance ID brevity vs collision probability in growing databases.

**Configuration** (`.beads/config.yaml`):
```yaml
min_hash_length: 4
max_hash_length: 8
max_collision_prob: 0.25
```

**Behavior**:
- Starts at 4 chars (bd-a1b2)
- Auto-scales to 5, 6, 7, 8 as database grows
- Maintains collision probability below 25%
- Prevents conflicts in multi-agent workflows

### 8. **Exclusive Lock Protocol**

**Use Case**: External tools (CI/CD, testing) need complete database control.

**Pattern**:
```bash
# Create lock file
echo '{"holder": "ci-pipeline", "timestamp": "2026-01-11T10:00:00Z"}' > .beads/.exclusive-lock

# Daemon skips all operations while lock exists
# External tool has full control

# Remove lock when done
rm .beads/.exclusive-lock
```

**Benefits**:
- Prevents daemon interference during batch operations
- Clean integration with CI/CD pipelines
- Auto-cleanup of stale locks

### 9. **Compaction with Semantic Summarization**

**Use Case**: Keep database under 10MB, preserve important context.

**Pattern**:
```bash
# Automatic compaction (AI summarizes)
bd admin compact --days 90

# Manual review before compaction
bd admin compact --days 90 --dry-run

# Restore if needed
bd restore bd-abc-compacted
```

**How It Works**:
- Closed issues older than X days → summarized
- Summary preserved in database
- Original issues retrievable from git history
- Reduces noise in context window

### 10. **Multi-Agent "Patrol" Pattern**

**Use Case**: Continuous monitoring with rotating responsibilities.

**Implementation**:
```bash
# Create patrol epic
bd create "Daily Security Patrol" -t epic --label patrol:security

# Create recurring subtasks
bd create "Scan dependencies for CVEs" -p bd-patrol-sec
bd create "Check access logs for anomalies" -p bd-patrol-sec
bd create "Verify SSL cert expiry" -p bd-patrol-sec

# Agent picks up patrol
bd ready --label patrol:security
bd update bd-xxx --assignee security-agent --status in_progress

# On completion, reopen for next patrol
bd close bd-xxx --reason "All checks passed, no issues"
bd reopen bd-xxx --reason "Reset for tomorrow's patrol"
```

**Benefits**:
- Recurring tasks managed through reopen
- Audit trail of all patrol runs
- Discovered issues linked via `discovered-from`

---

## 5. Common Pitfalls & Solutions

### Pitfall 1: Database Feels Stale After Git Pull

**Problem**: After `git pull`, `bd list` shows old data.

**Solution**: Any bd command triggers auto-import.
```bash
git pull
bd ready  # Auto-imports if .beads/issues.jsonl is newer
```

**Prevention**: Install git hooks.
```bash
bd hooks install
# post-merge hook auto-imports after pulls
```

### Pitfall 2: Worktree Daemon Conflicts

**Problem**: Daemon commits changes to wrong branch in git worktrees.

**Solution**: Disable daemon per-worktree.
```bash
export BEADS_NO_DAEMON=1
bd ready
```

**Why**: Worktrees share `.beads/` directory, daemon doesn't know current branch.

### Pitfall 3: Two Agents Modify Same Issue

**Problem**: Last export wins, potential data loss.

**Solution**: Claim work before modifying.
```bash
# Agent 1
bd update bd-abc --assignee agent-1 --status in_progress

# Agent 2 (avoids conflict)
bd ready --assignee ""  # Only unassigned work
```

**Additional Protection**: 3-way merge resurrects deleted issues if modified elsewhere.

### Pitfall 4: JSONL File Too Large

**Problem**: `.beads/issues.jsonl` exceeds 10MB, slows operations.

**Solution**: Compact old closed issues.
```bash
bd admin compact --days 90
```

**Alternative**: Split into multiple databases per component.

### Pitfall 5: SQLite Corruption After Crash

**Problem**: Database file corrupted, data appears lost.

**Solution**: Reimport from JSONL (git-versioned source of truth).
```bash
mv .beads/*.db .beads/*.db.backup
bd init
bd import -i .beads/issues.jsonl
```

### Pitfall 6: Forgetting to Push at Session End

**Problem**: Other agents don't see completed work.

**Solution**: Follow "Land the Plane" protocol (mandatory `bd sync && git push`).

**Prevention**: Add to shell aliases or agent scripts.
```bash
alias bd-land='bd sync && git push && git status'
```

### Pitfall 7: Pollution from Test Issues

**Problem**: Manual testing creates issues in production database.

**Solution**: Use separate database for testing.
```bash
export BEADS_DB=/tmp/test.db
bd init
bd create "Test issue"
# Won't affect production database
```

### Pitfall 8: Merge Conflicts in JSONL

**Problem**: Git merge conflict in `.beads/issues.jsonl`.

**Solution**: Keep both lines if different issues, newer line if same ID.
```bash
# Different issues (both valid)
<<<<<<< HEAD
{"id":"bd-a1b2","title":"Feature A",...}
=======
{"id":"bd-c3d4","title":"Feature B",...}
>>>>>>> branch

# Same issue (keep newer timestamp)
<<<<<<< HEAD
{"id":"bd-a1b2","title":"Feature A","updated":"2026-01-11T10:00:00Z",...}
=======
{"id":"bd-a1b2","title":"Feature A Updated","updated":"2026-01-11T11:00:00Z",...}
>>>>>>> branch

# Then reimport
git add .beads/issues.jsonl
git commit -m "Resolved merge conflict"
bd sync
```

---

## 6. Integration Patterns

### Claude Code Integration (Recommended)

**Setup**:
```bash
bd setup claude              # Global installation
bd setup claude --project    # Project-only
```

**What It Does**:
- Adds `bd prime` to SessionStart hook
- Adds `bd prime` to PreCompact hook
- Injects 1-2k tokens workflow context automatically

**Why Not Skills**: Beads recommends CLI + hooks over skills to minimize token usage (MCP tool schemas can add 10-50x more tokens).

### Cursor Integration

**Setup**:
```bash
bd setup cursor
```

**Pattern**: Similar to Claude Code (CLI + hooks).

### Aider Integration

**Setup**:
```bash
bd setup aider
```

**Difference**: Aider requires explicit user confirmation for commands (`/run bd ready`).

**Pattern**: Suggestion over automation (AI suggests, user confirms).

### MCP Server Integration

**Use Case**: Claude Desktop or shell-unavailable contexts.

**Setup**: Configure MCP server in Claude Desktop settings.

**Architecture**: Stateless adapter translates MCP protocol to daemon RPC or CLI commands.

**Limitation**: Higher token overhead than CLI + hooks approach.

### CI/CD Integration

**Pattern**: Disable daemon, use direct SQLite mode.
```bash
export BEADS_NO_DAEMON=1
bd ready --json | jq '.[].id' | while read id; do
  # Process issue
  bd close $id --reason "Automated test passed"
done
```

**Exclusive Lock**: Prevent daemon interference.
```bash
echo '{"holder": "ci-pipeline"}' > .beads/.exclusive-lock
# Run CI tasks
rm .beads/.exclusive-lock
```

### GitHub Issues Import

**Example**: `examples/github-import`

**Use Case**: Migrate existing GitHub issues to beads.

**Pattern**: Fetch via GitHub API, map to beads schema, bulk import.

### Jira Import

**Example**: `examples/jira-import`

**Use Case**: Enterprise migration from Jira.

**Pattern**: Jira REST API → beads issues with type/priority mapping.

---

## 7. Configuration Best Practices

### Project-Level Config (`.beads/config.yaml`)

```yaml
# Issue ID settings
issue_prefix: "mc"  # mc-a1b2 instead of bd-a1b2
min_hash_length: 4
max_hash_length: 8
max_collision_prob: 0.25

# Sync settings
sync:
  branch: "beads-sync"  # For protected main branch
  require_confirmation_on_mass_delete: true

# Remote sync interval (daemon)
remote-sync-interval: "30s"  # Min 5s

# Import/Export
import:
  orphan_handling: "create_placeholder"  # Or "skip", "error"
export:
  error_policy: "strict"
  retry_attempts: 3
  retry_backoff_ms: 100
  write_manifest: true

# Directory labels (monorepo)
directory_labels:
  "packages/web": ["frontend"]
  "packages/api": ["backend"]

# External projects (cross-repo deps)
external_projects:
  api: "/home/user/code/api-project"
  mobile: "/home/user/code/mobile-app"

# Multi-repo hydration
repos:
  additional:
    - path: ~/code/project-api
      import: true
```

### Global Config (Viper flags)

```bash
# Environment variables
export BEADS_NO_DAEMON=1           # Disable daemon
export BEADS_DB=/tmp/test.db       # Custom database
export BEADS_WATCHER_FALLBACK=true # Polling fallback
export BEADS_AUTO_START_DAEMON=false

# Command flags
bd ready --json                    # JSON output
bd sync --no-push                  # Skip remote push
bd create --require-description    # Enforce descriptions
```

### Git Integration (`.gitattributes`)

```
.beads/issues.jsonl merge=beads
.beads/*.jsonl text diff
```

**Configure merge driver**:
```bash
git config merge.beads.name "Beads 3-way merge"
git config merge.beads.driver "bd merge-driver %O %A %B %P"
```

### Git Ignore (`.gitignore`)

```
.beads/beads.db
.beads/beads.db-*
.beads/bd.sock
.beads/bd.pipe
.beads/.exclusive-lock
.beads/.sync.lock
```

---

## 8. Performance Optimization Patterns

### 1. Blocked Issues Cache (Automatic)

**Benefit**: 25x speedup for `bd ready` on large databases.

**How**: Materialized view rebuilt on dependency/status changes.

**No Action Required**: Transparent optimization.

### 2. Batch Operations

**Use Case**: Bulk imports, mass updates.

**Pattern**:
```go
// Instead of sequential Create()
for _, issue := range issues {
  storage.Create(issue)  // Slow
}

// Use batch operation
storage.CreateIssues(issues)  // 5-15x faster
```

### 3. JSON Output for Programmatic Access

**Use Case**: Agent parsing, scripting.

**Pattern**:
```bash
# Slow (parsing text)
bd ready | grep "bd-"

# Fast (JSON parsing)
bd ready --json | jq -r '.[].id'
```

### 4. Incremental vs Full Export

**Default**: Incremental (exports only modified issues, ~100ms).

**When Full Needed**: After `bd rename-prefix` or schema changes.

**Manual Control**: Controlled internally, no user action needed.

### 5. Daemon vs Direct Mode

**Daemon Mode** (default):
- Persistent database connection
- Batched exports (500ms debounce)
- ~60% less CPU (no continuous polling)

**Direct Mode** (`--no-daemon`):
- Slower (opens connection per command)
- Required for git worktrees
- Required for CI/CD

---

## 9. Architecture Deep Dive

### Storage Layers

```
┌─────────────────────────────────────┐
│      CLI Layer (Cobra)              │
│  bd ready, bd create, bd sync, etc. │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   SQLite Database (Fast Queries)    │
│  - Indexes, FTS, Dependency Graph   │
│  - Custom Tables (Extensions)       │
│  - Blocked Issues Cache             │
└──────────────┬──────────────────────┘
               │ (500ms debounce)
┌──────────────▼──────────────────────┐
│   JSONL File (Source of Truth)      │
│  - One issue per line               │
│  - Git-tracked, mergeable           │
│  - 3-way merge strategies           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Git (Distribution)            │
│  - Version control for issues       │
│  - Branch/merge like code           │
│  - No central server needed         │
└─────────────────────────────────────┘
```

### Daemon Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Project A  │  │  Project B  │  │  Project C  │
│    .beads/  │  │    .beads/  │  │    .beads/  │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│  Daemon A   │  │  Daemon B   │  │  Daemon C   │
│ bd.sock     │  │ bd.sock     │  │ bd.sock     │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┴────────────────┘
                       │
              ┌────────▼────────┐
              │   MCP Server    │
              │ (Auto-routing)  │
              └─────────────────┘
```

### Sync Flow (3-Way Merge)

```
1. Load Local State (SQLite → Memory)
   ↓
2. Load Base State (Last sync snapshot)
   ↓
3. Git Pull (Fetch remote changes)
   ↓
4. 3-Way Merge (Local vs Base vs Remote)
   │
   ├─ Scalars: Last-Write-Wins (timestamp)
   ├─ Collections: Union (keep all values)
   └─ Comments: Append (dedupe by ID)
   ↓
5. Import Merged (Memory → SQLite)
   ↓
6. Export (SQLite → JSONL)
   ↓
7. Git Commit + Push
   ↓
8. Save Snapshot (New base for next sync)
```

### Event-Driven Export (v0.21.0+)

```
┌──────────────────────────────────────┐
│   FileWatcher (inotify/FSEvents)     │
│   - Monitors .beads/issues.jsonl     │
│   - RPC mutation events              │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│   Debouncer (500ms batch window)     │
│   - Coalesces rapid changes          │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│   Export → Commit → Push (optional)  │
│   - Automatic JSONL export           │
│   - Git integration                  │
└──────────────────────────────────────┘

Parallel:
┌──────────────────────────────────────┐
│  Remote Sync Ticker (30s default)    │
│  - Pull from sync branch/origin      │
│  - Import changes                    │
└──────────────────────────────────────┘
```

---

## 10. Future-Proofing & Roadmap Insights

### Current Status (v0.44.0)

- **Stability**: Alpha/beta stage, approaching 1.0
- **Production Use**: Not recommended for mission-critical systems yet
- **Community**: Growing adoption, active development

### Recent Features (2025)

- **PRIME.md Override** (v0.44.0, GH#876): Custom prime output per project
- **Event-Driven Export** (v0.21.0+): 60% less CPU, <500ms latency
- **Adaptive Hash IDs**: Auto-scaling collision prevention
- **Blocked Issues Cache**: 25x speedup for large databases

### Expected Improvements (Based on Docs)

1. **Stability for 1.0 Release**: Enterprise-grade reliability guarantees
2. **Better Multi-Agent Locking**: True exclusive locks beyond assignee coordination
3. **Enhanced MCP Integration**: Lower token overhead, richer protocol support
4. **Compaction AI**: Smarter semantic summarization of old issues
5. **Advanced Merge Tooling**: Third-party tools like `beads-merge` for complex conflicts

### When to Adopt

**Adopt Now**:
- AI-assisted development workflows
- Internal team projects
- Experimental/personal use
- Learning advanced git-based collaboration

**Wait for 1.0**:
- Mission-critical production systems
- Large enterprise deployments
- Regulated industries requiring stability guarantees

---

## 11. Comparison: Beads vs Alternatives

| Feature | Beads | GitHub Issues | Linear | Jira |
|---------|-------|---------------|--------|------|
| **Offline Work** | ✅ Full | ❌ No | ❌ No | ❌ No |
| **Git-Native** | ✅ JSONL in repo | ❌ Separate | ❌ Separate | ❌ Separate |
| **Merge Conflicts** | ✅ Hash IDs prevent | ⚠️ Sequential IDs | ⚠️ Server-side | ⚠️ Server-side |
| **Multi-Agent** | ✅ Designed for | ⚠️ Webhook-based | ⚠️ Webhook-based | ⚠️ Webhook-based |
| **Dependency Types** | ✅ 4 types | ⚠️ Basic | ✅ Good | ✅ Good |
| **Local Speed** | ✅ ~10ms | ❌ Network | ❌ Network | ❌ Network |
| **JSON Output** | ✅ All commands | ⚠️ API only | ⚠️ API only | ⚠️ API only |
| **Extensibility** | ✅ SQLite tables | ❌ Limited | ⚠️ API | ⚠️ Plugins |
| **Branch-Scoped** | ✅ Native | ❌ No | ❌ No | ❌ No |
| **Production Ready** | ⚠️ Alpha | ✅ Yes | ✅ Yes | ✅ Yes |

**Beads Wins**: Offline work, git-native storage, multi-agent collaboration, local speed.

**Alternatives Win**: Production maturity, enterprise features, integrations, UI/UX.

---

## 12. Quick Reference: Essential Commands

### Session Start
```bash
bd prime                          # Get workflow context (1-2k tokens)
bd ready                          # Find unblocked work
bd ready --json | jq              # Programmatic access
```

### Working on Issues
```bash
bd create "Task title" -p 1       # Create P1 task
bd update bd-abc --status in_progress --assignee me
bd show bd-abc                    # View details
bd dep tree bd-abc                # View dependency hierarchy
```

### Dependencies
```bash
bd dep add bd-blocker bd-blocked  # "bd-blocker blocks bd-blocked"
bd dep add bd-child bd-parent --type discovered-from
```

### Labels & Search
```bash
bd label bd-abc urgent security   # Add labels
bd list --label urgent            # AND filter
bd list --label-any urgent,p0     # OR filter
bd list --status in_progress --assignee me
```

### Molecules (Advanced)
```bash
bd mol pour template-name bd-xxx  # Instantiate template
bd mol wisp patrol-template       # Ephemeral instance
bd mol bond bd-xxx bd-yyy         # Combine workflows
bd mol squash bd-wisp --into bd-epic
bd mol burn bd-wisp               # Delete ephemeral
```

### Session End ("Land the Plane")
```bash
bd close bd-abc --reason "Done"   # Mark complete
bd sync                           # Export + commit + pull + import + push
git push                          # MANDATORY
git status                        # Verify "up to date"
```

### Maintenance
```bash
bd duplicates                     # Find duplicates
bd duplicates --auto-merge        # Auto-consolidate
bd admin compact --days 90        # Remove old closed issues
bd doctor                         # Health check
bd migrate --inspect              # Safe schema upgrade
```

### Daemon
```bash
bd daemons list --json            # All running daemons
bd daemons health                 # Version mismatches
bd daemons logs . -f              # Stream logs
bd daemons restart .              # Restart current daemon
```

---

## 13. Sources & References

### Official Documentation
- [Beads GitHub Repository](https://github.com/steveyegge/beads)
- [Quickstart Guide](https://github.com/steveyegge/beads/blob/main/docs/QUICKSTART.md)
- [Molecules Documentation](https://github.com/steveyegge/beads/blob/main/docs/MOLECULES.md)
- [Advanced Features](https://github.com/steveyegge/beads/blob/main/docs/ADVANCED.md)
- [CLI Reference](https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md)
- [Agent Instructions](https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md)
- [FAQ](https://github.com/steveyegge/beads/blob/main/docs/FAQ.md)

### Integration Guides
- [Claude Integration](https://github.com/steveyegge/beads/blob/main/docs/CLAUDE_INTEGRATION.md)
- [Aider Integration](https://github.com/steveyegge/beads/blob/main/docs/AIDER_INTEGRATION.md)
- [Git Integration](https://github.com/steveyegge/beads/blob/main/docs/GIT_INTEGRATION.md)
- [Daemon Documentation](https://github.com/steveyegge/beads/blob/main/docs/DAEMON.md)

### Architecture & Internals
- [Architecture Overview](https://github.com/steveyegge/beads/blob/main/docs/ARCHITECTURE.md)
- [Internals Documentation](https://github.com/steveyegge/beads/blob/main/docs/INTERNALS.md)
- [Sync Documentation](https://github.com/steveyegge/beads/blob/main/docs/SYNC.md)
- [Extending Beads](https://github.com/steveyegge/beads/blob/main/docs/EXTENDING.md)

### Configuration
- [Config Guide](https://github.com/steveyegge/beads/blob/main/docs/CONFIG.md)
- [Labels System](https://github.com/steveyegge/beads/blob/main/docs/LABELS.md)
- [Multi-Repo Setup](https://github.com/steveyegge/beads/blob/main/docs/MULTI_REPO_AGENTS.md)

### Community Resources
- [Beads Best Practices (Steve Yegge, Medium)](https://steve-yegge.medium.com/beads-best-practices-2db636b9760c)
- [The Beads Revolution (Steve Yegge, Medium)](https://steve-yegge.medium.com/the-beads-revolution-how-i-built-the-todo-system-that-ai-agents-actually-want-to-use-228a5f9be2a9)
- [Introducing Beads (Steve Yegge, Medium)](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)
- [Beads: Git-Friendly Issue Tracker (Better Stack)](https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/)

---

## 14. Key Takeaways

### For AI Agents

1. **Use `bd prime`** at session start (auto via hooks) for workflow context
2. **Follow "Land the Plane"** protocol (sync + push mandatory at session end)
3. **Link discoveries** with `--type discovered-from` for audit trail
4. **Claim work** before modifying (`--assignee`, `--status in_progress`)
5. **Never test in production DB** (use `BEADS_DB=/tmp/test.db`)

### For Teams

1. **Install git hooks** (`bd hooks install`) for guaranteed consistency
2. **Use protected branch mode** if `main` is protected
3. **Leverage labels** for multi-dimensional categorization
4. **Compact regularly** (`bd admin compact --days 90`) when DB exceeds 10MB
5. **Monitor daemon health** (`bd daemons health`)

### For Advanced Users

1. **Extend with SQLite tables** for custom tracking (time, cost, tests)
2. **Use wisps** for ephemeral patrols without polluting history
3. **Leverage molecules** for complex workflow orchestration
4. **Configure directory labels** for monorepos
5. **Bond molecules** for multi-phase project coordination

### Critical Success Factors

✅ **Always push at session end** (unpushed work causes conflicts)
✅ **Install git hooks** (prevents stale database issues)
✅ **Use hash-based IDs** (prevents merge conflicts)
✅ **Claim work with assignee** (prevents concurrent modification)
✅ **Test in separate DB** (prevents production pollution)

### When Beads Shines

- Multi-agent AI workflows with extended sessions
- Offline-first development environments
- Teams needing dependency-aware task management
- Projects requiring branch-scoped issue tracking
- Workflows benefiting from git-native storage

---

## 15. Conclusion

Beads represents a paradigm shift in how AI agents manage long-horizon work. By treating issues as git-versioned data, it eliminates the central server bottleneck while providing robust multi-agent coordination through hash-based IDs and intelligent 3-way merging.

**Strengths**:
- Zero-conflict multi-agent collaboration
- Offline-first with automatic sync
- Extensible SQLite architecture
- Minimal token overhead for AI agents
- Git-native storage (no separate service)

**Limitations**:
- Alpha/beta maturity (not production-ready for critical systems)
- Limited UI (CLI-first design)
- Requires git workflow understanding
- Daemon complexity in edge cases (worktrees)

**Recommendation**: Ideal for AI-assisted development teams willing to adopt git-based workflows. Wait for 1.0 release for mission-critical production deployments.

**Future Potential**: As AI agents become central to software development, beads' agent-first design positions it uniquely for the future of collaborative coding.

---

**Report Status**: ✅ Complete
**Documentation Coverage**: 40+ docs files analyzed
**Examples Reviewed**: 10+ example patterns
**Community Research**: Medium articles, GitHub discussions, integration guides
**Total Research Time**: ~2 hours
**Token Usage**: ~48K tokens

---
