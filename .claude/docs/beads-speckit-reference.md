# Beads + Spec-kit Integration — Full Reference

> **Purpose**: Complete reference for Claude to quickly understand the mc2 task management system.
> **Last Updated**: 2026-01-08
> **Version**: Beads v0.46.0, Spec-kit v0.0.22

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Beads System](#beads-system)
3. [Spec-kit System](#spec-kit-system)
4. [Integration Flow](#integration-flow)
5. [Formulas (Molecule Templates)](#formulas-molecule-templates)
6. [File Structure](#file-structure)
7. [Current Tech Debt](#current-tech-debt)
8. [Upgrade Instructions](#upgrade-instructions)
9. [Sources & References](#sources--references)

---

## Critical: Session Close Protocol

**"Land the Plane" Rule**: NEVER say "done" without completing ALL steps:

```bash
[ ] 1. git status              # Check what changed
[ ] 2. git add <files>         # Stage code changes
[ ] 3. bd sync                 # Commit beads changes
[ ] 4. git commit -m "... (mc2-xxx)"  # Commit with issue ID
[ ] 5. bd sync                 # Commit any new beads changes
[ ] 6. git push                # Push to remote
```

**Work is NOT done until pushed.** Unpushed work breaks multi-agent coordination.

**Commit message format**: Include issue ID in parentheses: `"Fix auth bug (mc2-abc)"`

---

## Architecture Overview

### Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                    TASK MANAGEMENT                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Big Features (>1 day)        All Other Work               │
│   ┌─────────────────┐          ┌─────────────────┐          │
│   │    Spec-kit     │          │     Beads       │          │
│   │  (Planning)     │────────▶ │  (Execution)    │          │
│   └─────────────────┘          └─────────────────┘          │
│         10%                          90%                     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│   TodoWrite = In-session UI display (ephemeral)             │
│   Beads = Persistent cross-session tracking (git-backed)    │
└─────────────────────────────────────────────────────────────┘
```

### Decision Matrix

| Scenario                          | Tool             | Rationale                           |
| --------------------------------- | ---------------- | ----------------------------------- |
| Feature requiring design/planning | Spec-kit → Beads | Need structured planning artifacts  |
| Feature with clear requirements   | Beads only       | Direct execution                    |
| Bug fix                           | Beads            | Track origin with `discovered-from` |
| Tech debt                         | Beads            | Type `chore`                        |
| Research/spike                    | Beads wisp       | Can be burned or squashed           |
| Hotfix (emergency)                | Beads wisp       | Fast track, document later          |
| Release                           | Beads wisp       | `/push` handles most of it          |

### Constitution Reference

**Constitution v1.2.0** defines these Beads-related principles:

- **Principle VII**: All work items MUST be tracked in Beads
- **Principle VIII**: Emergent work uses `discovered-from` dependency
- **Principle IX**: Session end requires `bd sync`

Location: `.specify/memory/constitution.md`

---

## Beads System

### What is Beads?

Beads is a git-backed graph issue tracker designed for AI agents, created by Steve Yegge.

**Key characteristics**:

- Issues stored in `.beads/issues.jsonl` (git-tracked)
- SQLite cache in `.beads/beads.db` (gitignored)
- Daemon process for performance
- Graph-based dependencies
- Molecule system for workflows

### Installation

```bash
# Check version
bd version  # Expected: v0.46.0+

# Check status
bd info
bd doctor
```

### Context & Priming

```bash
bd prime                    # Output workflow context (~1-2k tokens)
bd prime --full             # Force full CLI output
bd prime --mcp              # Minimal output for MCP mode
bd prime --export           # Export default content for customization
```

**Auto-invoked** by SessionStart and PreCompact hooks in Claude Code.

### Core Commands

#### Task Lifecycle

```bash
# View
bd ready                              # Tasks with no blockers
bd blocked                            # Tasks blocked by dependencies
bd list                               # All open tasks
bd list --all                         # Include closed
bd list -t bug -p 2                   # Filter by type/priority
bd show <id>                          # Task details
bd show <id> --tree                   # With hierarchy

# Create
bd create "Title" -t type -p priority -d "description"
bd create "Title" -t bug --deps discovered-from:<id>
bd create "Title" -t feature --deps parent:<epic-id>

# Update
bd update <id> --status in_progress
bd update <id> --status blocked
bd update <id> --priority 1
bd update <id> --add-label security
bd update <id> --add-dep blocks:<other-id>

# Close (single or batch)
bd close <id> --reason "Description of completion"
bd close <id1> <id2> <id3> --reason "Batch complete"  # Multiple at once
bd close <id> --reason "Not needed" --wontfix
```

#### Types (`-t`)

| Type      | Use Case                        |
| --------- | ------------------------------- |
| `feature` | New functionality               |
| `bug`     | Bug fixes                       |
| `chore`   | Tech debt, refactoring, configs |
| `docs`    | Documentation                   |
| `test`    | Test improvements               |
| `epic`    | Group of related tasks          |

#### Priorities (`-p`)

| Priority | Meaning                      |
| -------- | ---------------------------- |
| P0       | Critical - blocks everything |
| P1       | Critical - blocks release    |
| P2       | High - fix soon              |
| P3       | Medium - normal (default)    |
| P4       | Low - backlog                |

#### Dependencies

```bash
# At creation
bd create "Task" --deps blocked-by:<id>

# Add to existing
bd dep add <issue> <depends-on>    # issue depends on depends-on

# View blocked
bd blocked                          # All blocked issues
```

| Type                   | Meaning                             |
| ---------------------- | ----------------------------------- |
| `blocks:<id>`          | This task blocks another            |
| `blocked-by:<id>`      | This task is blocked by another     |
| `discovered-from:<id>` | Found while working on another task |
| `parent:<id>`          | Child of an epic                    |
| `related:<id>`         | Informational relationship          |

### Molecules (Workflows)

#### Concepts

- **Formula**: Template definition (TOML file in `.beads/formulas/`)
- **Proto**: Compiled template (internal)
- **Wisp**: Ephemeral instance (vapor phase) - can be burned or squashed
- **Mol**: Persistent instance (liquid phase)

#### Commands

```bash
# List templates
bd formula list
bd formula show <name>

# Start workflow
bd mol wisp <formula> --vars "key=value"    # Ephemeral
bd mol pour <formula> --vars "key=value"    # Persistent

# Navigate
bd mol current                               # Current position
bd mol progress <id>                         # Progress summary

# Complete wisp
bd mol squash <id>                           # Compress to summary (keep)
bd mol burn <id>                             # Discard completely
```

### Synchronization

```bash
bd sync                    # Bidirectional sync: DB ↔ JSONL ↔ Git
bd sync --force            # Force reload from JSONL
```

**Auto-sync triggers**:

- `/push` command runs `bd sync` automatically
- Git hooks sync on commit

### Daemon Management

```bash
bd daemon status
bd daemon start
bd daemon restart
bd daemon stop

# Logs
cat .beads/daemon.log

# Fix stuck daemon
rm .beads/daemon.lock
bd daemon start
```

### mc2 Conventions

- **Issue prefix**: `mc2` (e.g., `mc2-a3f2dd`)
- **Nested IDs**: Subtasks use dot notation: `mc2-a3f8.1`, `mc2-a3f8.1.1`
- **Formulas location**: `.beads/formulas/`
- **Skill location**: `.claude/skills/beads/SKILL.md`

### Special Modes

```bash
bd init --stealth           # Private tracking (no shared repo modifications)
bd prime --stealth          # No git operations in session close
bd config set no-git-ops true  # Disable git ops globally
```

---

## Spec-kit System

### What is Spec-kit?

Spec-kit is a specification-driven development toolkit that generates structured planning artifacts.

**Key characteristics**:

- Constitution-based principles
- Template-driven artifact generation
- Phases: specify → clarify → plan → tasks → implement
- Integration with issue trackers (GitHub, Beads)

### Installation

```bash
# Check version (in package.json devDependencies)
# spec-kit: v0.0.22 (CLI)
# @anthropic-ai/templates: v0.0.90
```

### Commands

| Command                  | Purpose                   | Output                            |
| ------------------------ | ------------------------- | --------------------------------- |
| `/speckit.constitution`  | Define project principles | `.specify/memory/constitution.md` |
| `/speckit.specify`       | Create requirements       | `spec.md`                         |
| `/speckit.clarify`       | Q&A for requirements      | Updates `spec.md`                 |
| `/speckit.plan`          | Create technical design   | `plan.md`                         |
| `/speckit.tasks`         | Generate task breakdown   | `tasks.md`                        |
| `/speckit.implement`     | Execute tasks             | Code changes                      |
| `/speckit.analyze`       | Check consistency         | Report                            |
| `/speckit.checklist`     | Quality gates             | Checklist                         |
| `/speckit.tobeads`       | Convert to Beads issues   | Beads issues                      |
| `/speckit.taskstoissues` | Convert to GitHub issues  | GitHub issues                     |

### Artifact Locations

```
.specify/
├── memory/
│   └── constitution.md          # Project principles (v1.2.0)
├── templates/                   # Spec-kit templates
└── features/
    └── <feature-name>/
        ├── spec.md              # Requirements
        ├── plan.md              # Technical design
        └── tasks.md             # Task breakdown
```

### Big Feature Workflow

```bash
# 1. Create feature directory
mkdir -p .specify/features/<feature-name>

# 2. Generate artifacts
/speckit.specify    # Creates spec.md
/speckit.clarify    # Q&A, updates spec.md
/speckit.plan       # Creates plan.md
/speckit.tasks      # Creates tasks.md

# 3. Import to Beads
/speckit.tobeads    # Creates epic + child issues

# 4. Execute via Beads
bd ready
bd update <id> --status in_progress
# ... implement ...
bd close <id> --reason "Done"
```

---

## Integration Flow

### Spec-kit → Beads Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  spec.md    │───▶│  plan.md    │───▶│  tasks.md   │
│ (require.)  │    │ (design)    │    │ (breakdown) │
└─────────────┘    └─────────────┘    └─────────────┘
                                            │
                                            ▼
                                   /speckit.tobeads
                                            │
                                            ▼
                         ┌─────────────────────────────┐
                         │         Beads               │
                         │  ┌─────────────────────┐    │
                         │  │ Epic: Feature Name  │    │
                         │  └─────────────────────┘    │
                         │           │                 │
                         │     ┌─────┴─────┐           │
                         │     ▼           ▼           │
                         │  [Task 1]   [Task 2] ...    │
                         └─────────────────────────────┘
```

### /speckit.tobeads Behavior

1. Reads `tasks.md` from current spec directory
2. Creates Epic issue for the feature
3. Creates child issues for each task
4. Sets up dependencies:
   - Sequential tasks: `blocked-by` previous
   - Parallel tasks (marked `[P]`): no blocking deps
5. Returns Epic ID and task count

### Emergent Work Pattern

When discovering new tasks during implementation:

```bash
# DON'T add to tasks.md after import
# DO create directly in Beads with origin tracking

bd create "Found: Missing validation" -t bug --deps discovered-from:mc2-current-task
```

---

## Formulas (Molecule Templates)

### Available Formulas

Location: `.beads/formulas/`

| Formula       | File                       | Purpose                    | Phase  |
| ------------- | -------------------------- | -------------------------- | ------ |
| `bigfeature`  | `bigfeature.formula.toml`  | Spec-kit → Beads pipeline  | liquid |
| `bugfix`      | `bugfix.formula.toml`      | Standard bug fix process   | liquid |
| `hotfix`      | `hotfix.formula.toml`      | Emergency production fix   | vapor  |
| `techdebt`    | `techdebt.formula.toml`    | Technical debt remediation | liquid |
| `healthcheck` | `healthcheck.formula.toml` | Bug-hunter → fix cycle     | vapor  |
| `release`     | `release.formula.toml`     | Version release process    | vapor  |
| `exploration` | `exploration.formula.toml` | Research/spike             | vapor  |

### Formula Structure (TOML)

```toml
formula = "name"
description = "..."
type = "workflow"
phase = "vapor"  # or "liquid"
version = 1

[vars.variable_name]
description = "..."
required = true/false

[[steps]]
id = "step-id"
title = "Step Title"
needs = ["previous-step-id"]
description = """
Step instructions...
"""
```

### Phase Meanings

| Phase    | Meaning          | Use Case                              |
| -------- | ---------------- | ------------------------------------- |
| `vapor`  | Ephemeral (wisp) | Exploration, hotfix, can be discarded |
| `liquid` | Persistent (mol) | Features, bugs, must complete         |

### Using Formulas

```bash
# View formula details
bd formula show bigfeature

# Start ephemeral workflow
bd mol wisp exploration --vars "question=How to implement caching?"

# Start persistent workflow
bd mol pour bigfeature --vars "feature_name=user-auth"

# Check progress
bd mol progress <wisp-or-mol-id>

# Complete
bd mol squash <id>   # Keep summary
bd mol burn <id>     # Discard
```

---

## File Structure

### Beads Files

```
.beads/
├── config.yaml              # Beads configuration
├── issues.jsonl             # Issue storage (git-tracked)
├── beads.db                 # SQLite cache (gitignored)
├── beads.db-shm             # SQLite shared memory
├── beads.db-wal             # SQLite write-ahead log
├── daemon.log               # Daemon logs
├── daemon.pid               # Daemon process ID
├── daemon.lock              # Daemon lock file
├── .gitignore               # Ignores db files
├── README.md                # Beads readme
├── formulas/                # Molecule templates
│   ├── bigfeature.formula.toml
│   ├── bugfix.formula.toml
│   ├── hotfix.formula.toml
│   ├── techdebt.formula.toml
│   ├── healthcheck.formula.toml
│   ├── release.formula.toml
│   └── exploration.formula.toml
└── metadata.json            # Beads metadata
```

### Claude Code Files

```
.claude/
├── docs/
│   ├── beads-quickstart.md          # User quick reference (Russian)
│   ├── beads-speckit-reference.md   # Full reference (this file)
│   ├── i18n-guide.md                # Internationalization guide
│   └── enrichment-guide.md          # Stage 7 enrichments guide
├── skills/
│   └── beads/
│       └── SKILL.md                 # Beads skill for agents
├── commands/
│   ├── speckit.specify.md
│   ├── speckit.clarify.md
│   ├── speckit.plan.md
│   ├── speckit.tasks.md
│   ├── speckit.implement.md
│   ├── speckit.analyze.md
│   ├── speckit.checklist.md
│   ├── speckit.tobeads.md           # Spec-kit → Beads bridge
│   ├── speckit.taskstoissues.md
│   └── speckit.constitution.md
├── scripts/
│   └── release.sh                   # Includes bd sync
└── local.md                         # Server access (gitignored)
```

### Spec-kit Files

```
.specify/
├── memory/
│   └── constitution.md              # Project constitution v1.2.0
├── templates/                       # Spec-kit templates
└── features/
    └── <feature-name>/
        ├── spec.md
        ├── plan.md
        └── tasks.md
```

---

## Current Tech Debt

### Imported Issues

| ID      | Priority | Type  | Description                                   | File                                                   |
| ------- | -------- | ----- | --------------------------------------------- | ------------------------------------------------------ |
| mc2-p3v | P2       | chore | DEBT-001: Token-aware embedding batching      | `shared/embeddings/generate.ts:369`                    |
| mc2-6s3 | P2       | bug   | TODO-001: SuperAdmin role check (security)    | `server/routers/summarization.ts:190`                  |
| mc2-14x | P3       | chore | DEBT-002: Graceful shutdown cleanup           | `server/index.ts:435`                                  |
| mc2-yhe | P4       | chore | DEBT-003: DoclingDocument retrieval           | `stages/stage2.../docling/client.ts:312`               |
| mc2-mkl | P4       | chore | Refactor lesson-rag-retriever.ts (1130 lines) | `stages/stage6.../utils/lesson-rag-retriever.ts`       |
| mc2-og1 | P4       | chore | TODO-012: Cost calculation                    | `stages/stage5.../section-regeneration-service.ts:411` |
| mc2-pjm | P4       | chore | TODO-014: Language detection                  | `stages/stage5.../metadata-generator.ts:364`           |

### Tech Debt Sources

| Source                   | Path                                                   | Status          |
| ------------------------ | ------------------------------------------------------ | --------------- |
| Technical Debt Inventory | `docs/reports/TECHNICAL-DEBT-INVENTORY.md`             | Active          |
| Technical Debt Tasks     | `.tmp/current/technical-debt-tasks.md`                 | Partially valid |
| TODO Tracking            | `docs/reports/technical-debt/2025-11/todo-tracking.md` | Many obsolete   |

---

## Upgrade Instructions

### Upgrading Beads

**Repository**: https://github.com/steveyegge/beads

```bash
# Check current version
bd version

# Option A: Homebrew
brew update
brew upgrade bd

# Option B: npm
npm update -g @beads/bd

# Option C: From source
cd ~/beads  # or wherever cloned
git pull origin main
go build -o bd ./cmd/bd
sudo mv bd /usr/local/bin/

# Verify
bd version
bd doctor

# Re-run setup if needed
bd setup claude --project
bd hooks install
```

**Post-upgrade checklist**:

1. Check `bd doctor` for issues
2. Verify `bd ready` works
3. Check formulas still load: `bd formula list`
4. Test sync: `bd sync`

### Upgrading Spec-kit

**Repository**: https://github.com/anthropics/spec-kit

```bash
# Check package.json for current version
cat package.json | grep spec-kit

# Update via npm/pnpm
pnpm update spec-kit @anthropic-ai/spec-kit-templates

# Or specific version
pnpm add spec-kit@latest @anthropic-ai/spec-kit-templates@latest -D

# Verify
# Check that commands still work
/speckit.specify --help  # (or run command)
```

**Post-upgrade checklist**:

1. Check if constitution needs updates (new principles)
2. Verify templates are compatible
3. Test `/speckit.specify` on test feature
4. Check if `/speckit.tobeads` still works

### Version Compatibility Matrix

| Beads   | Spec-kit | Status     |
| ------- | -------- | ---------- |
| v0.46.0 | v0.0.22  | ✅ Current |

---

## Sources & References

### Official Documentation

**Beads**:

- Repository: https://github.com/steveyegge/beads
- CLI Reference: https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md
- Architecture: https://github.com/steveyegge/beads/blob/main/docs/ARCHITECTURE.md
- Molecules: https://github.com/steveyegge/beads/blob/main/docs/MOLECULES.md
- Claude Integration: https://github.com/steveyegge/beads/blob/main/docs/CLAUDE_INTEGRATION.md
- Agent Instructions: https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md

**Spec-kit**:

- Repository: https://github.com/anthropics/spec-kit
- (Check repo for latest docs)

### mc2 Project Files

| File                                             | Purpose                        |
| ------------------------------------------------ | ------------------------------ |
| `CLAUDE.md`                                      | Agent orchestration rules      |
| `.specify/memory/constitution.md`                | Project constitution v1.2.0    |
| `.claude/docs/beads-quickstart.md`               | User quick reference (Russian) |
| `.claude/docs/beads-speckit-reference.md`        | Full reference (this file)     |
| `.claude/skills/beads/SKILL.md`                  | Beads skill for agents         |
| `docs/beads+sc/beads-implementation-workplan.md` | Implementation history         |
| `docs/beads+sc/beads-integration-plan.md`        | Conceptual plan                |

### Quick Commands Reference

```bash
# Beads essentials
bd ready                    # What to work on
bd create "X" -t type -p N  # New task
bd update <id> --status in_progress
bd close <id> --reason "X"
bd sync                     # MANDATORY at session end

# Formulas
bd formula list
bd mol wisp <name> --vars "k=v"
bd mol squash/burn <id>

# Spec-kit
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.tobeads

# Diagnostics
bd info
bd doctor
bd daemon restart
```

---

## Troubleshooting

### Common Issues

| Problem                           | Solution                                   |
| --------------------------------- | ------------------------------------------ |
| `bd ready` empty but issues exist | `bd sync` or `bd daemon restart`           |
| Daemon won't start                | `rm .beads/daemon.lock && bd daemon start` |
| Sync conflicts                    | `git status .beads/` → resolve → `bd sync` |
| Issue not found                   | `bd sync --force`                          |
| Formula not loading               | Check TOML syntax in `.beads/formulas/`    |
| Spec-kit command fails            | Check `.specify/` directory exists         |

### Diagnostic Commands

```bash
# Beads health
bd doctor
bd info --json
cat .beads/daemon.log

# Git status of beads
git status .beads/
git diff .beads/issues.jsonl

# Check formulas
bd formula list
bd formula show <name>
```

---

_This document serves as the authoritative reference for the mc2 Beads + Spec-kit integration._
