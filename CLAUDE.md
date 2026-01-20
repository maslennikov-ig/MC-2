# Agent Orchestration Rules

> **IMPORTANT**: This file overrides default Claude Code behavior. Follow strictly.

## Main Pattern: You Are The Orchestrator

### Core Rules

**1. GATHER CONTEXT FIRST (MANDATORY)**

- Read existing code, search patterns, check recent commits
- NEVER delegate or implement blindly

**2. DELEGATE TO SUBAGENTS**

- Provide complete context (code, paths, patterns)
- **NEVER TRUST SUBAGENT REPORTS** — always verify yourself:
  - Read modified files (`Read` tool)
  - Run type-check (`pnpm type-check`)
  - Run build if needed (`pnpm build`)
  - Check for regressions
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

**9. /push COMMAND — NEVER DISCARD UNCOMMITTED CHANGES**

When executing `/push` or release commands:

- **NEVER** run `git reset`, `git checkout --`, or `git stash` to discard uncommitted changes
- **ALWAYS** include ALL uncommitted changes in the release commit
- If there are unrelated changes, ASK the user before proceeding
- The release script should handle uncommitted changes by committing them, NOT discarding

```
# FORBIDDEN during /push:
git reset HEAD -- <files>      # ❌ NEVER
git checkout -- <files>        # ❌ NEVER
git stash                      # ❌ NEVER (unless user explicitly requests)

# CORRECT approach:
git add .                      # ✅ Stage all changes
git commit -m "..."            # ✅ Commit everything
# Then run release script
```

---

## Task Management with Beads

> Constitution v1.2.0: All work MUST be tracked in Beads.

### Session Workflow

```bash
# SESSION START (auto via hooks)
# bd prime runs automatically → injects context

# FIND WORK
bd ready                          # Available tasks (no blockers)
bd ready --label frontend         # Only frontend tasks
bd list --unlocked                # Tasks not locked by other terminals
bd show <id>                      # Task details

# WORK
bd update <id> --status in_progress   # Acquires exclusive lock
# ... do the work ...
bd close <id> --reason "Done"         # Releases lock

# SESSION END
git add . && git commit -m "..." && git push
```

### Multi-Terminal Work

When working in multiple terminals simultaneously:

- Each terminal acquires **exclusive lock** via `bd update --status in_progress`
- Lock auto-releases after 30min inactivity
- **Rule**: Each terminal works on DIFFERENT issues
- Find unlocked: `bd list --unlocked`

### Branches & Environments

| Branch    | Environment | URL                          | Auto-deploy? |
| --------- | ----------- | ---------------------------- | ------------ |
| `develop` | Dev         | https://dev.ai.megacampus.ru | Yes (push)   |
| `master`  | Staging     | https://ai.megacampus.ru     | Yes (push)   |

### Daily Workflow

```bash
# 1. Работаем на develop
git checkout develop

# 2. Делаем изменения, коммитим
git add . && git commit -m "feat: new feature"

# 3. Пушим → АВТОМАТИЧЕСКИ деплоится на Dev
git push                          # → dev.ai.megacampus.ru

# 4. Готовы к Staging? Используем /deploy
/deploy                           # → merge develop → master → ai.megacampus.ru
```

### Commands Cheatsheet

| Что хочу                   | Команда       | Результат                                        |
| -------------------------- | ------------- | ------------------------------------------------ |
| Задеплоить на **Dev**      | `git push`    | develop → dev.ai.megacampus.ru                   |
| Задеплоить на **Staging**  | `/deploy`     | develop → master → ai.megacampus.ru (Blue/Green) |
| Создать **релиз** (версия) | `/push patch` | Bump version + changelog + tag                   |
| Форсировать деплой         | `/deploy -f`  | Skip type-check/build                            |

### Blue/Green (Staging only)

- Blue: web:3001, api:4001
- Green: web:3002, api:4002
- Zero-downtime, instant rollback

**Rollback:** `ssh megacampus-prod "bash /opt/megacampus/scripts/rollback_blue_green.sh"`

**Details**: `docs/ADR-005-deployment-strategy.md`

### How User Gives Me Tasks

1. **From Beads**: Just say "Работай над mc2-xxx" or "bd ready" output
2. **New task**: I create beads task FIRST, then work
3. **Discussion**: If clarifying/researching, no task needed yet

### Task Types

| Work Type            | Tool            | Command                                              |
| -------------------- | --------------- | ---------------------------------------------------- |
| Big feature (>1 day) | Bonded Pipeline | `bd mol bond bigfeature-pipeline`                    |
| Small feature        | Beads           | `bd create -t feature --files path/to/file.tsx`      |
| Bug fix              | Beads           | `bd create -t bug`                                   |
| Tech debt            | Beads           | `bd create -t chore`                                 |
| Exploration          | Beads wisp      | `bd mol wisp exploration`                            |
| Code review          | Patrol          | `bd patrol run code-review --vars "scope=X,topic=Y"` |
| Health check         | Patrol          | `bd patrol run health-check`                         |

### Automation

- **Daemon auto-sync**: Enabled (auto-commit, auto-push, auto-pull for beads)
- **Hooks**: SessionStart/PreCompact → `bd prime`, Stop → `bd sync`
- **Directory Labels**: Auto-assigned based on `--files` path (see config.yaml)
- **Exclusive Lock**: Prevents conflicts in multi-terminal work

**Emergent work**: `bd create "Issue" -t bug --deps discovered-from:<current-id>`

**Guide**: `.claude/docs/beads-quickstart.md`

---

## Project Conventions

**Documentation**: All project knowledge in Beads REF: issues.

- Find: `bd search "REF:"` → lists all reference issues
- Read: `bd show mc2-xxx` → full content of specific issue
- Covers: entities, pages, stages, tech, i18n, docker, logging, errors, auth, guides
- Update when domain changes: `bd update mc2-xxx --description="..."`

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

| Type                  | File                                        |
| --------------------- | ------------------------------------------- |
| Database types        | `shared-types/src/database.types.ts`        |
| Analysis schemas      | `shared-types/src/analysis-schemas.ts`      |
| File upload constants | `shared-types/src/file-upload-constants.ts` |
| Common enums          | `shared-types/src/common-enums.ts`          |
| Course styles         | `shared-types/src/style-prompts.ts`         |

**MCP Config**:

- BASE (`.mcp.base.json`): context7 + sequential-thinking (~600 tokens)
- FULL (`.mcp.full.json`): + supabase + playwright + shadcn (~5000 tokens)
- Switch: `./switch-mcp.sh`

---

## External Documentation (Context7)

**Before implementing** with external libraries, query Context7 for latest docs:

```
mcp__context7__resolve-library-id → mcp__context7__query-docs
```

**When to use**: Next.js, Supabase, BullMQ, Qdrant, LangChain, Zod APIs

---

## Subagent Selection

| Domain           | Subagent                      | Labels                | When                        |
| ---------------- | ----------------------------- | --------------------- | --------------------------- |
| DB/migrations    | `database-architect`          | database, migrations  | Schema changes, RLS         |
| UI components    | `nextjs-ui-designer`          | frontend, nextjs      | New pages, components       |
| Admin panel      | `nextjs-ui-designer`          | frontend, admin       | Admin pages                 |
| Pipeline stages  | `stage-pipeline-specialist`   | pipeline, stages      | Stages 1-7                  |
| Backend services | `fullstack-nextjs-specialist` | backend, orchestrator | APIs, workers               |
| Tests            | `test-writer`                 | —                     | Unit/integration tests      |
| Bugs from report | `bug-fixer`                   | —                     | Fix bug-hunting-report      |
| Code exploration | `Explore`                     | —                     | Find files, understand code |
| TypeScript types | `typescript-types-specialist` | types, shared         | Complex types, generics     |
| Security         | `vulnerability-fixer`         | —                     | Security fixes              |

**Label-based routing**: Use `bd ready --label X` to find tasks for specific subagent.

**Rule**: For complex tasks, ALWAYS consider delegation. Verify result yourself.

---

## Server Access

SSH details: `.claude/local.md` (gitignored)
