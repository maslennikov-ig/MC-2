# Agent Orchestration Rules

> **IMPORTANT**: This file overrides default Claude Code behavior. Follow strictly.

## Multi-Agent Orchestration with Gastown

This project uses **Gastown** (`gt`) for multi-agent orchestration and **Beads** (`bd`) for issue tracking. Both are global tools — installed once, shared across all projects.

### Architecture

```
~/gt/                        Global Town workspace
├── mayor/                   AI coordinator (all projects)
├── deacon/                  Background supervisor daemon
└── mc2/                     This project (rig)
    ├── polecats/            AI worker agents (Claude/Codex/Gemini)
    ├── crew/me/             Human workspace
    └── refinery/            Auto merge queue
```

### Multi-Runtime Agents

Three subscription-based runtimes, no API billing:

| Agent           | Runtime          | Use for                        |
| --------------- | ---------------- | ------------------------------ |
| `claude-opus`   | Claude Code      | Architecture, complex logic    |
| `claude-sonnet` | Claude Code      | Routine fixes, tests           |
| `codex-53`      | OpenAI Codex 5.3 | A/B test on complex tasks      |
| `gemini-pro`    | Google Gemini    | Token-heavy tasks, large files |

### Core Rules

**1. GATHER CONTEXT FIRST** — Read code, search patterns, check commits. NEVER implement blindly.

**2. VERIFY** — Never trust agent output without verification:

- Read modified files (`Read` tool)
- Run `pnpm type-check && pnpm build`
- Check for regressions

**3. /push — NEVER DISCARD CHANGES**

- **FORBIDDEN**: `git reset`, `git checkout --`, `git stash` during `/push`
- **ALWAYS** commit all uncommitted changes or ASK user first

---

## Task Management with Beads + Gastown

> Constitution v2.0: All work tracked in Beads, orchestrated by Gastown.

### Session Workflow

```bash
# FIND WORK
bd ready                          # Available tasks (no blockers)
gt convoy list                    # Active convoys across rigs
bd show <id>                      # Task details

# WORK (single agent)
bd update <id> --status in_progress
# ... do the work ...
bd close <id> --reason "Done"

# WORK (parallel agents via Gastown)
gt convoy create "Sprint" mc2-xxx mc2-yyy mc2-zzz --notify --human
gt sling mc2-xxx mc2 --agent claude-opus
gt sling mc2-yyy mc2 --agent codex-53
gt sling mc2-zzz mc2 --agent gemini-pro
gt convoy list                    # Monitor progress

# SESSION END
git add . && git commit -m "..." && git push
```

### Multi-Agent Work

Gastown manages parallel agents automatically:

- Mayor coordinates, Polecats execute, Refinery merges
- Each polecat works in isolated git worktree — no conflicts
- Witness monitors health, respawns crashed agents
- `gt agents` — list active agents
- `gt convoy status` — track batch progress
- `gt dashboard` — web monitoring panel

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

**Nginx**: `deploy/nginx/` (single source of truth, never edit on server)

**Rollback:** `ssh megacampus-prod "bash /opt/megacampus/scripts/rollback_blue_green.sh"`

**Full guide**: `.claude/docs/deployment-guide.md`

**LLM models**: `.claude/docs/llm-model-config.md` (all model configs per stage/phase)

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

**Course lookup by short code**: User sends codes like `BRA-1467` — this is `courses.generation_code`. Query: `SELECT id, title FROM courses WHERE generation_code = 'BRA-1467'`. Use `generation_trace` table (join via `lesson_id`) to see which LLM model generated each lesson (`model_used`, `stage`, `phase`, `step_name`).

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
