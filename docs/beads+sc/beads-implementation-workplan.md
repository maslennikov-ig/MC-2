# Beads Integration — Implementation Work Plan

> **Created:** 2025-01-08
> **Updated:** 2026-01-08
> **Status:** ✅ Complete
> **Approach:** Beads-Primary with Spec-kit Planning Layer
> **Related:** [beads-integration-plan.md](./beads-integration-plan.md) — Conceptual plan

---

## Completed Prerequisites

- [x] **Spec-kit upgraded** to v0.0.22 (CLI) + v0.0.90 (templates)
- [x] **Constitution updated** to v1.2.0 with Beads principles (VII, VIII, IX)
- [x] **Commands migrated** from `.cursor/commands/` to `.claude/commands/`

---

## Quick Context for New Session

**What is Beads?**
- Git-backed graph issue tracker for AI agents by Steve Yegge
- Repository: https://github.com/steveyegge/beads
- CLI tool `bd` with SQLite cache + JSONL git-tracked storage
- Key commands: `bd ready`, `bd create`, `bd update`, `bd close`, `bd sync`

**What is mc2?**
- MegaCampusAI — AI-powered course generation platform
- Monorepo with packages: course-gen-platform, web, shared-types
- Uses Spec-kit v0.0.22 for feature planning
- Constitution v1.2.0 with 9 principles including Beads integration

**Integration Goal:**
- Beads = Primary system for ALL task tracking (90%)
- Spec-kit = Planning layer for big features only (10%)
- TodoWrite for in-session UI tracking, Beads for persistent tracking

---

## Official Beads Documentation

**Key docs from repo:**
- CLI Reference: https://github.com/steveyegge/beads/blob/main/docs/CLI_REFERENCE.md
- Architecture: https://github.com/steveyegge/beads/blob/main/docs/ARCHITECTURE.md
- Claude Integration: https://github.com/steveyegge/beads/blob/main/docs/CLAUDE_INTEGRATION.md
- Agent Instructions: https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md

**Key concepts:**
- **Wisps** — ephemeral tasks (burn if dead end, squash if useful)
- **Molecules** — persistent workflow templates
- **discovered-from** — dependency type for tracking task origin
- **bd prime** — injects ~1-2k tokens of context for agents

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Issue prefix** | `mc2` | Matches project name, clear identification |
| **Git tracking** | Tracked (default) | Team sync, PR visibility, history |
| **Installation method** | Homebrew or npm `@beads/bd` | Official methods from repo |
| **Skill location** | `.claude/skills/beads/` | Consistent with existing skills |
| **TodoWrite** | Keep for UI, Beads for persistent | Best of both worlds |
| **Molecules** | Maximum set, refine later | Take all, remove unused |
| **Hooks** | Git + Claude, integrate with /push | Maximum automation |
| **Starting point** | Clean slate | Tech debt as separate phase |

---

## Phase 1: Installation & Configuration

### 1.1 Install Beads CLI
```bash
# Option A: Homebrew (recommended)
brew tap steveyegge/beads
brew install bd

# Option B: npm
npm install -g @beads/bd

# Option C: Quick install script
curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash
```

### 1.2 Initialize in Project
```bash
cd /home/me/code/mc2
bd init
```

### 1.3 Configure Issue Prefix
```bash
bd config set issue_prefix mc2
```

### 1.4 Setup Claude Integration
```bash
bd setup claude --project
```

### 1.5 Install Git Hooks
```bash
bd hooks install
```

### 1.6 Verify Installation
```bash
bd version
bd info --json
bd doctor
```

**Validation:**
- [ ] `bd info` shows correct setup
- [ ] `.beads/` directory created
- [ ] `.beads/issues.jsonl` git-tracked
- [ ] `.beads/beads.db` in .gitignore
- [ ] Git hooks installed

---

## Phase 2: Push Command Integration

### 2.1 Current /push Command
**File:** `.claude/commands/push.md` → calls `.claude/scripts/release.sh`

Current release.sh handles:
- Auto-syncs package.json versions with latest git tag
- Analyzes commits since last release
- Auto-detects version bump type from conventional commits
- Generates dual changelogs (CHANGELOG.md + RELEASE_NOTES.md)
- Updates all package.json files
- Creates git tag and pushes to GitHub
- Full rollback support on errors

**Usage:** `/push [patch|minor|major] [-m "message"]`

### 2.2 Integration Strategy
Add `bd sync` to release.sh before git operations:
```bash
# In release.sh, before git operations:
bd sync 2>/dev/null || true
```

**Rationale:**
- Beads syncs automatically on commit via hooks
- Release script ensures sync before version bump
- No breaking changes to existing workflow

---

## Phase 3: Create Beads Skill

### 3.1 Skill Structure
```
.claude/skills/beads/
├── SKILL.md                    # Entry point
├── README.md                   # Human documentation
└── resources/
    ├── DECISION_MATRIX.md      # When to use what
    ├── WORKFLOWS.md            # Common workflows
    ├── COMMANDS_QUICKREF.md    # Quick reference card
    └── SPECKIT_BRIDGE.md       # Spec-kit integration
```

### 3.2 SKILL.md Content
- Overview of Beads methodology
- Decision matrix (bd vs spec-kit)
- Link to `bd prime` for commands
- mc2-specific conventions

### 3.3 Quick Reference Card
User-friendly cheat sheet for daily use:
- Task lifecycle commands
- Dependency management
- Molecules/Wisps
- Sync commands

---

## Phase 4: Create speckit.tobeads Command

### 4.1 Spec-kit Commands (Updated Location)
**Location:** `.claude/commands/speckit.*.md`

| Command | Purpose |
|---------|---------|
| speckit.constitution | Define project principles |
| speckit.specify | Create requirements (spec.md) |
| speckit.clarify | Q&A for requirements |
| speckit.plan | Create tech design (plan.md) |
| speckit.tasks | Generate task breakdown (tasks.md) |
| speckit.implement | Execute tasks |
| speckit.analyze | Check consistency |
| speckit.checklist | Quality gates |
| speckit.taskstoissues | Convert to GitHub Issues |

**Reference for format:** `.claude/commands/speckit.taskstoissues.md`

### 4.2 Command Location
`.claude/commands/speckit.tobeads.md`

### 4.3 Functionality
1. Parse `tasks.md` from current spec
2. Create Epic in bd for the spec
3. Create tasks with proper hierarchy:
   - Phases → parent issues
   - Tasks → child issues
   - [P] markers → no blocking deps
   - [USn] markers → user story labels
4. Set up dependencies based on task order

### 4.4 Output
- Epic ID (e.g., `mc2-abc123`)
- Task count imported
- Dependency graph created

---

## Phase 5: Molecule Templates

### 5.1 Templates to Create

| Proto | Description | Use Case |
|-------|-------------|----------|
| `mol-bigfeature` | Spec-kit → Beads pipeline | Features >1 day |
| `mol-release` | Release workflow | Version releases |
| `mol-healthcheck` | Bug-hunter → fix cycle | Health checks |
| `mol-hotfix` | Emergency production fix | Critical bugs |
| `mol-bugfix` | Standard bug fix | Regular bugs |
| `mol-techdebt` | Technical debt item | Cleanup work |
| `mol-exploration` | Research/spike | Uncertain work |

### 5.2 Location
`.beads/protos/` (created by bd)

---

## Phase 6: Update CLAUDE.md

### 6.1 New Section: Task Management with Beads

```markdown
## Task Management

### Primary System: Beads (bd)

ALL persistent task tracking happens in Beads:
- `bd ready --json` — find available tasks
- `bd create "Title" -t type -p priority` — new task
- `bd update <id> --status in_progress` — claim task
- `bd close <id> --reason "Done"` — complete task
- `bd sync` — sync at session end (MANDATORY)

### TodoWrite for Session UI

Use TodoWrite for in-session progress display to user.
Use Beads for persistent cross-session tracking.

### Decision Matrix

| Work Type | Tool | Command |
|-----------|------|---------|
| Big feature (>1 day) | Spec-kit → Beads | /speckit.specify → /speckit.tobeads |
| Small feature (<1 day) | Beads | bd create -t feature |
| Bug fix | Beads | bd create -t bug --deps discovered-from:X |
| Tech debt | Beads | bd create -t chore |
| Exploration | Beads wisps | bd mol wisp |

### Emergent Work

When you discover new tasks during work:
```bash
bd create "Found issue X" -t bug --deps discovered-from:mc2-current-task
```

### Session End (MANDATORY)
```bash
bd sync
```
```

### 6.2 Update TodoWrite References
- Keep TodoWrite for in-session UI tracking
- Add Beads for persistent tracking
- Reference Constitution v1.2.0 principle VII

---

## Phase 7: Create User Guide

### 7.1 Location
`.claude/docs/beads-quickstart.md`

### 7.2 Content
- Installation verification
- Daily workflow examples
- Common commands cheat sheet
- Spec-kit integration workflow
- Troubleshooting

---

## Phase 8: Technical Debt Validation

### 8.1 Known Tech Debt Sources

| Source | Full Path | Items |
|--------|-----------|-------|
| TECHNICAL-DEBT-INVENTORY.md | `docs/reports/TECHNICAL-DEBT-INVENTORY.md` | 3 items |
| technical-debt-tasks.md | `.tmp/current/technical-debt-tasks.md` | 4 categories |
| todo-tracking.md | `docs/reports/technical-debt/2025-11/todo-tracking.md` | 16 TODOs |

**Note:** Many TODOs reference deleted files — validate before import.

### 8.2 Validation Strategy
Launch parallel subagents to validate each category before import.

### 8.3 Output
Consolidated list of VALID tech debt items for import into Beads.

---

## Phase 9: Import Tech Debt to Beads

After validation, create issues:
```bash
bd create "DEBT-001: Token-Aware Embedding Batching" -t chore -p 1 \
  -d "See docs/reports/TECHNICAL-DEBT-INVENTORY.md"

bd create "DEBT-002: Graceful Shutdown Cleanup" -t chore -p 2 \
  -d "Server shutdown resource cleanup"

# ... etc for each validated item
```

---

## Execution Order

| Phase | Description | Status | Dependencies |
|-------|-------------|--------|--------------|
| 0 | Spec-kit upgrade (v0.0.22) | ✅ Done | None |
| 0 | Constitution update (v1.2.0) | ✅ Done | None |
| 1 | Installation & Config (bd v0.46.0) | ✅ Done | None |
| 2 | Push Integration (bd sync) | ✅ Done | Phase 1 |
| 3 | Beads Skill | ✅ Done | Phase 1 |
| 4 | speckit.tobeads command | ✅ Done | Phase 1 |
| 5 | Molecule Templates | ✅ Done | Phase 1 |
| 6 | Update CLAUDE.md | ✅ Done | Phases 3-5 |
| 7 | User Guide | ✅ Done | Phase 6 |
| 8 | Tech Debt Validation | ✅ Done | Phase 1 |
| 9 | Import Tech Debt | ✅ Done | Phase 8 |

---

## Success Criteria

- [x] `bd info` works correctly
- [x] `bd ready` shows 7 tech debt issues (imported)
- [x] `/push patch` includes bd sync
- [x] Beads skill accessible to agents
- [x] speckit.tobeads command works
- [x] CLAUDE.md updated with bd workflow
- [x] User quickstart guide created
- [x] Tech debt validated and imported
- [x] Git hooks auto-sync on commit
- [x] Constitution v1.2.0 principles enforced

---

## Imported Tech Debt Issues

| Issue ID | Priority | Type | Description |
|----------|----------|------|-------------|
| mc2-p3v | P2 | chore | DEBT-001: Implement token-aware embedding batching |
| mc2-6s3 | P2 | bug | TODO-001: Add SuperAdmin role check for cross-org analytics |
| mc2-14x | P3 | chore | DEBT-002: Implement graceful shutdown cleanup |
| mc2-yhe | P4 | chore | DEBT-003: Implement DoclingDocument retrieval |
| mc2-mkl | P4 | chore | Refactor lesson-rag-retriever.ts (1130 lines) |
| mc2-og1 | P4 | chore | TODO-012: Implement proper cost calculation |
| mc2-pjm | P4 | chore | TODO-014: Add language detection from contextual content |

**Total**: 7 issues imported from validated tech debt sources.

---

## Molecule Templates Created

| Formula | Description | Use Case |
|---------|-------------|----------|
| `bigfeature` | Spec-kit → Beads pipeline | Features >1 day |
| `release` | Release workflow | Version releases |
| `healthcheck` | Bug-hunter → fix cycle | Health checks |
| `hotfix` | Emergency production fix | Critical bugs |
| `bugfix` | Standard bug fix | Regular bugs |
| `techdebt` | Technical debt item | Cleanup work |
| `exploration` | Research/spike | Uncertain work |

Location: `.beads/formulas/`

---

## Files to Create/Modify

### New Files
- `.beads/` directory (created by bd init)
- `.claude/skills/beads/SKILL.md`
- `.claude/skills/beads/README.md`
- `.claude/skills/beads/resources/*.md`
- `.claude/commands/speckit.tobeads.md`
- `.claude/docs/beads-quickstart.md`

### Modified Files
- `CLAUDE.md` — Task Management section
- `.claude/scripts/release.sh` — Add bd sync
- `.gitignore` — Ensure .beads/beads.db ignored

---

## Rollback Plan

If issues arise:
```bash
# Remove beads
rm -rf .beads/
bd setup claude --remove

# Revert CLAUDE.md changes
git checkout CLAUDE.md

# Remove skill
rm -rf .claude/skills/beads/
```

---

## Key Project Files Reference

### Updated Files
- `.specify/memory/constitution.md` — v1.2.0 with Beads principles
- `.claude/commands/speckit.*.md` — Spec-kit v0.0.22 commands

### For Phase 2 (Push Integration)
- `.claude/commands/push.md` — Push command definition
- `.claude/scripts/release.sh` — Release script to modify

### For Phase 4 (speckit.tobeads)
- `.claude/commands/speckit.taskstoissues.md` — Template reference
- `.specify/templates/tasks-template.md` — Task format template

### Existing Skills (for Phase 3 reference)
- `.claude/skills/run-quality-gate/SKILL.md` — Example skill format
- `.claude/skills/git-commit-helper/SKILL.md` — Another example
