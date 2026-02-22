# MegaCampus Course Generator - Project Context

> **IMPORTANT**: This file overrides default behavior. Follow strictly.

## Multi-Agent Orchestration with Gastown

This project uses **Gastown** (`gt`) for multi-agent orchestration and **Beads** (`bd`) for issue tracking. Both are global tools installed once, shared across all projects.

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

| Agent    | Runtime          | Use for                        |
| -------- | ---------------- | ------------------------------ |
| `claude` | Claude Code      | Architecture, complex logic    |
| `codex`  | OpenAI Codex 5.3 | A/B test on complex tasks      |
| `gemini` | Google Gemini    | Token-heavy tasks, large files |

### Core Rules

**1. GATHER CONTEXT FIRST** — Read code, search patterns, check commits. NEVER implement blindly.

**2. VERIFY** — Never trust agent output without verification:

- Run `pnpm type-check && pnpm build`
- Check for regressions

**3. NEVER DISCARD CHANGES**

- **FORBIDDEN**: `git reset`, `git checkout --`, `git stash`
- **ALWAYS** commit all uncommitted changes or ASK user first

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.x strict mode
- **Backend**: tRPC + BullMQ workers
- **Database**: Supabase (PostgreSQL + Realtime)
- **Monorepo**: pnpm workspaces
- **Packages**: `packages/web`, `packages/course-gen-platform`, `packages/shared-types`

## Task Management with Beads + Gastown

> All work tracked in Beads, orchestrated by Gastown.

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
gt sling mc2-xxx mc2 --agent claude
gt sling mc2-yyy mc2 --agent codex
gt sling mc2-zzz mc2 --agent gemini
gt convoy list                    # Monitor progress

# SESSION END
git add . && git commit -m "..." && git push
```

## Code Standards

- **Type-check + build** must pass before commit
- Use `pnpm type-check` and `pnpm build`
- No hardcoded credentials
- Use Zod for schema validation
- Prefer async/await over callbacks

## Project Structure

```
packages/
├── web/                    # Next.js frontend
├── course-gen-platform/    # Backend: tRPC, BullMQ workers, LLM services
└── shared-types/           # Shared TypeScript types and Zod schemas
```

## Single Source of Truth

NEVER duplicate types — always import from `@megacampus/shared-types`:

| Type             | File                                   |
| ---------------- | -------------------------------------- |
| Database types   | `shared-types/src/database.types.ts`   |
| Analysis schemas | `shared-types/src/analysis-schemas.ts` |
| Common enums     | `shared-types/src/common-enums.ts`     |

## Branches & Deployment

| Branch    | Environment | URL                          |
| --------- | ----------- | ---------------------------- |
| `develop` | Dev         | https://dev.ai.megacampus.ru |
| `master`  | Staging     | https://ai.megacampus.ru     |

- Work on `develop`
- `git push` → auto-deploy to Dev
- Merge to `master` → auto-deploy to Staging

## Session Close Protocol

Before ending work:

```bash
git status                    # Check changes
git add <files>               # Stage files
git commit -m "..."           # Commit
git push                      # Push
bd close <id> --reason="..."  # Close task in Beads
```

## Common Commands

```bash
pnpm type-check               # TypeScript check
pnpm build                    # Build all packages
pnpm test                     # Run tests
pnpm dev                      # Dev server
```
