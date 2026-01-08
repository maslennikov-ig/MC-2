# Beads + Spec-kit Integration Plan

> **Status:** Ready for Implementation
> **Created:** 2025-01-08
> **Approach:** Beads-Primary with Spec-kit Planning Layer
> **Implementation:** See [beads-implementation-workplan.md](./beads-implementation-workplan.md)

## Quick Links

- **Beads Repository:** https://github.com/steveyegge/beads
- **Implementation Workplan:** [beads-implementation-workplan.md](./beads-implementation-workplan.md)
- **Spec-kit Commands:** `.cursor/commands/speckit.*.md`

## Overview

Гибридный подход, где Beads является основной системой для всей работы, а Spec-kit используется только для планирования больших фич.

```
┌─────────────────────────────────────────────────────────────────┐
│  BEADS = Primary System (90% работы)                            │
│  ───────────────────────────────────                            │
│  Все задачи, bugs, tech debt, daily work                        │
│  Emergent discovery, wisps, chemistry                           │
│  Source of truth для execution                                  │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │ (import once for big features)
┌─────────────────────────────────────────────────────────────────┐
│  SPEC-KIT = Planning Layer (10% работы)                         │
│  ─────────────────────────────────────                          │
│  Только для больших фич (>1 day)                                │
│  specify → clarify → plan                                       │
│  Документация, не execution tracking                            │
└─────────────────────────────────────────────────────────────────┘
```

## What We Take from Each System

### From Beads (Primary)

| Feature | Status | Notes |
|---------|--------|-------|
| `bd ready` — task discovery | ✅ Full | Auto-pick available tasks |
| `bd create` — task creation | ✅ Full | Direct creation for all work |
| Emergent discovery | ✅ Full | `--deps discovered-from:X` |
| Wisps (ephemeral tasks) | ✅ Full | Exploration without trace |
| Chemistry metaphor | ✅ Full | Molecules, bonding, pour |
| Graph-first dependencies | ✅ Full | Native dep management |
| Git-backed history | ✅ Full | `.beads/issues.jsonl` |
| Multi-repo coordination | ✅ Full | Cross-repo work |
| Agent coordination | ✅ Full | Assignee, status tracking |
| Minimal context (`bd prime`) | ✅ Full | ~1-2k tokens |

### From Spec-kit (Planning Only)

| Component | Status | Notes |
|-----------|--------|-------|
| `constitution.md` | ✅ Keep | Project principles |
| `/speckit.specify` → `spec.md` | ✅ Keep | Requirements docs |
| `/speckit.clarify` | ✅ Keep | Requirement clarification |
| `/speckit.plan` → `plan.md` | ✅ Keep | Architecture docs |
| `/speckit.tasks` → `tasks.md` | ⚠️ One-time | Input for bd import only |
| `/speckit.implement` | ❌ Replace | Use `bd ready → work → close` |
| `/speckit.checklists` | ✅ Keep | Quality gates |
| `/speckit.analyze` | ✅ Keep | Consistency checks |

## Decision Matrix

| Work Type | Size | Tool | Workflow |
|-----------|------|------|----------|
| New big feature | >1 day | Spec-kit → Beads | specify → plan → tasks → bd import |
| New small feature | <1 day | **Beads only** | `bd create -t feature` |
| Bug fix | any | **Beads only** | `bd create -t bug --deps discovered-from:X` |
| Tech debt | any | **Beads only** | `bd create -t chore` |
| Refactoring | any | **Beads only** | `bd create -t task` |
| Exploration/Debug | any | **Beads wisps** | `bd mol wisp` |
| Cross-repo work | any | **Beads** | multi-repo native |
| Operational work | any | **Beads only** | `bd create` |

## File Structure

```
mc2/
├── .beads/                      # PRIMARY: Execution tracking
│   ├── issues.jsonl             # Git-tracked source of truth
│   ├── beads.db                 # SQLite cache (gitignored)
│   ├── config.yaml              # Project config
│   └── protos/                  # Molecule templates
│       ├── mol-bigfeature.yaml  # Spec-kit → Beads pipeline
│       ├── mol-release.yaml     # Release workflow
│       └── mol-healthcheck.yaml # Health check workflow
│
├── .specify/                    # PLANNING: Principles & templates
│   ├── memory/
│   │   └── constitution.md      # Project principles
│   └── templates/               # Spec templates
│
├── specs/                       # DOCS: Big feature documentation
│   └── NNN-feature-name/
│       ├── spec.md              # Requirements (permanent)
│       ├── plan.md              # Architecture (permanent)
│       ├── tasks.md             # Initial breakdown (archived after import)
│       └── checklists/          # Quality gates
│
├── .claude/
│   ├── skills/
│   │   └── beads/               # Beads skill for agents
│   │       ├── SKILL.md
│   │       └── resources/
│   │           ├── DECISION_MATRIX.md
│   │           ├── WORKFLOWS.md
│   │           └── SPECKIT_BRIDGE.md
│   └── commands/
│       └── speckit.tobeads.md   # Import command
```

## Workflows

### Big Feature (>1 day)

```bash
# 1. Spec-kit Planning (documentation)
/speckit.specify "Payment integration"
/speckit.clarify
/speckit.plan

# 2. Initial task breakdown
/speckit.tasks

# 3. Import to Beads (one-time bridge)
/speckit.tobeads
# Creates: Epic mc2-pay-001 with all tasks from tasks.md

# 4. Work in Beads (from now on)
bd ready                                    # What's available?
bd update mc2-pay-002 --status in_progress  # Claim task
# ... implement ...
bd close mc2-pay-002 --reason "Done"

# 5. Emergent discovery (directly in Beads)
bd create "Edge case: refund flow" -t task \
  --deps discovered-from:mc2-pay-002 \
  --parent mc2-pay-001

# 6. End of session
bd sync
```

### Small Feature (<1 day)

```bash
# Skip Spec-kit entirely
bd create "Add dark mode toggle" -t feature -p 2 \
  -d "Toggle in settings, persist to localStorage"
bd update mc2-xyz --status in_progress
# ... implement ...
bd close mc2-xyz --reason "Implemented"
bd sync
```

### Bug Discovery

```bash
# While working on mc2-feature-123, found a bug
bd create "Memory leak in event handlers" -t bug -p 0 \
  --deps discovered-from:mc2-feature-123 \
  -d "Handlers not cleaned up on unmount"

# Later, fix it
bd ready  # Bug appears as available
bd update mc2-bug-456 --status in_progress
# ... fix ...
bd close mc2-bug-456 --reason "Fixed, added cleanup"
bd sync
```

### Exploration with Wisps

```bash
# Investigating performance issue
bd mol wisp proto-debug --var issue="slow dashboard load"

# Dead end? Burn it (no trace)
bd mol burn mc2-wisp-789

# Found something? Squash to permanent record
bd mol squash mc2-wisp-789 --summary "Root cause: N+1 queries in course list"
```

## Key Principles

1. **Beads = Source of Truth for execution**
   - All tasks live in bd
   - Progress tracking only in bd
   - tasks.md after import = archive

2. **Spec-kit = Documentation layer**
   - spec.md, plan.md = permanent docs
   - Don't duplicate content in bd, use links

3. **Emergent work goes directly to Beads**
   - Found bug → `bd create -t bug`
   - New idea → `bd create -t task`
   - Don't edit tasks.md

4. **Wisps for uncertainty**
   - Not sure it will work → wisp
   - Worked → squash to permanent
   - Dead end → burn

5. **bd sync at end of every session**
   - This is mandatory
   - Git-backed = history preserved

## Pros and Cons

### Pros

1. **Full Beads philosophy preserved**
   - Emergent discovery
   - Wisps for exploration
   - Chemistry metaphor
   - Graph-first dependencies
   - discovered-from tracking

2. **Spec-kit provides what Beads lacks**
   - Structured requirements gathering
   - Architecture documentation
   - Quality checklists
   - Consistency analysis

3. **Clear separation of concerns**
   - Spec-kit: WHAT and WHY (planning, docs)
   - Beads: WHO, WHEN, HOW (execution, tracking)

4. **Minimal overhead**
   - Spec-kit only for >1 day features (~10%)
   - 90% of work is pure Beads

5. **Single source of truth**
   - Execution: Beads only
   - Documentation: specs/ (for big features)
   - No duplication

### Cons

| Con | Mitigation |
|-----|------------|
| Two tools = cognitive load | Clear decision matrix + skill |
| tasks.md may "age" | Archive after import, don't use |
| spec.md/plan.md may desync | Links from bd epic, not duplication |
| Onboarding complexity | Good beads skill with examples |
| When is "big" feature? | Rule: >1 day estimated work |

## Implementation Plan

| Component | Description | Priority |
|-----------|-------------|----------|
| `bd init` + config | Initialize in project | P0 |
| `speckit.tobeads` command | Import tasks.md → bd | P0 |
| `beads` skill | Full instructions for agents | P0 |
| Updated CLAUDE.md | Decision matrix, workflows | P0 |
| `mol-bigfeature` proto | Template for spec-kit → beads | P1 |
| Git hooks | Auto-sync | P1 |
| Session hooks | bd prime injection | P2 |

## CLAUDE.md Updates (Draft)

```markdown
## Task Management

### Primary System: Beads (bd)

ALL execution tracking happens in Beads:
- `bd ready --json` — find available tasks
- `bd create "Title" -t type -p priority` — new task
- `bd update <id> --status in_progress` — claim task
- `bd close <id> --reason "Done"` — complete task
- `bd sync` — sync at session end (MANDATORY)

### When to use Spec-kit

ONLY for big features (>1 day estimated work):
1. `/speckit.specify` → spec.md (requirements)
2. `/speckit.clarify` (if needed)
3. `/speckit.plan` → plan.md (architecture)
4. `/speckit.tasks` → tasks.md (initial breakdown)
5. `/speckit.tobeads` → import to bd (ONE-TIME)
6. Work in Beads from now on

### Emergent Work

When you discover new tasks during work:
```bash
bd create "Found issue X" -t bug --deps discovered-from:mc2-current-task
```

Do NOT add to tasks.md — create directly in bd.
```

## Open Questions

See implementation discussion for remaining questions before starting.
