# Agent Orchestration Rules

> **IMPORTANT**: This file overrides default Claude Code behavior. Follow strictly.

## Main Pattern: You Are The Orchestrator

### Core Rules

**1. GATHER CONTEXT FIRST (MANDATORY)**
- Read existing code, search patterns, check recent commits
- NEVER delegate or implement blindly

**2. DELEGATE TO SUBAGENTS**
- Provide complete context (code, paths, patterns)
- ALWAYS verify results (read files, type-check, lint)
- Re-delegate if incorrect

**3. EXECUTE DIRECTLY** — Only for: single-line fixes, simple imports, minimal configs

**4. TRACK PROGRESS** — TodoWrite: in_progress BEFORE, completed AFTER verification

**5. COMMIT** — `/push patch` after each task

**6. EXECUTION PATTERN**
```
1. Read task → 2. Gather context → 3. Delegate/execute
4. VERIFY (never skip) → 5. Re-delegate if needed
6. TodoWrite completed → 7. /push patch → 8. Next task
```

**7. CONTRADICTIONS** — Gather context, analyze patterns. Ask user only if truly ambiguous (~10%).

**8. TYPESCRIPT ERRORS** — Re-delegate to same agent OR `typescript-types-specialist`

---

## Task Management with Beads

> Constitution v1.2.0: All work MUST be tracked in Beads.

### Session Workflow
```bash
# SESSION START (auto via hooks)
# bd prime runs automatically → injects context

# FIND WORK
bd ready                          # Available tasks (no blockers)
bd show <id>                      # Task details

# WORK
bd update <id> --status in_progress
# ... do the work ...
bd close <id> --reason "Done"

# SESSION END (daemon auto-syncs, but always commit code!)
git add . && git commit -m "..." && git push
```

### How User Gives Me Tasks
1. **From Beads**: Just say "Работай над mc2-xxx" or "bd ready" output
2. **New task**: I create beads task FIRST, then work
3. **Discussion**: If clarifying/researching, no task needed yet

### Task Types

| Work Type | Tool | Command |
|-----------|------|---------|
| Big feature (>1 day) | Spec-kit → Beads | `/speckit.specify` → `/speckit.tobeads` |
| Small feature | Beads | `bd create -t feature` |
| Bug fix | Beads | `bd create -t bug` |
| Tech debt | Beads | `bd create -t chore` |
| Exploration | Beads wisp | `bd mol wisp exploration` |

### Automation
- **Daemon auto-sync**: Enabled (auto-commit, auto-push, auto-pull for beads)
- **Hooks**: SessionStart/PreCompact → `bd prime`, Stop → `bd sync`
- **No manual bd sync needed** — daemon handles it

**Emergent work**: `bd create "Issue" -t bug --deps discovered-from:<current-id>`

**Guide**: `.claude/docs/beads-quickstart.md`

---

## Project Conventions

**File Organization**:
- Agents: `.claude/agents/{domain}/{orchestrators|workers}/`
- Commands: `.claude/commands/`
- Skills: `.claude/skills/{name}/SKILL.md`
- Temp: `.tmp/current/` (gitignored)
- Reports: `docs/reports/{domain}/{YYYY-MM}/`

**Code Standards**: Type-check + build + lint must pass before commit. No hardcoded credentials.

**Agent Selection**:
- Worker: Plan file specifies `nextAgent` (health workflows only)
- Skill: Reusable utility, no state, <100 lines

**Supabase**:
- MCP server: project `diqooqbuchsliypgwksu`
- Migrations: `packages/course-gen-platform/supabase/migrations/`
- Two admin clients by design (different runtimes): `course-gen-platform/src/shared/supabase/admin.ts` (Node.js) and `web/lib/supabase-admin.ts` (Next.js)

**Single Source of Truth** (NEVER duplicate, always import from `@megacampus/shared-types`):

| Type | File |
|------|------|
| Database types | `shared-types/src/database.types.ts` |
| Analysis schemas | `shared-types/src/analysis-schemas.ts` |
| File upload constants | `shared-types/src/file-upload-constants.ts` |
| Common enums | `shared-types/src/common-enums.ts` |
| Course styles | `shared-types/src/style-prompts.ts` |

**MCP Config**:
- BASE (`.mcp.base.json`): context7 + sequential-thinking (~600 tokens)
- FULL (`.mcp.full.json`): + supabase + playwright + shadcn (~5000 tokens)
- Switch: `./switch-mcp.sh`

---

## Technologies

- TypeScript 5.x (strict), Immer for state (`produce()`)
- i18n: `packages/web/src/i18n/config.ts`, guide: `.claude/docs/i18n-guide.md`
- Enrichments: guide `.claude/docs/enrichment-guide.md` (video, audio, presentation, quiz, document, cover)

---

## Server Access

SSH details: `.claude/local.md` (gitignored)
