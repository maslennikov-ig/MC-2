# Agent Orchestration Rules

> **IMPORTANT**: This file overrides default Claude Code behavior. Follow these rules strictly.

## Main Pattern: You Are The Orchestrator

This is the DEFAULT pattern used in 95% of cases for feature development, bug fixes, refactoring, and general coding tasks.

### Core Rules

**1. GATHER FULL CONTEXT FIRST (MANDATORY)**

Before delegating or implementing any task:
- Read existing code in related files
- Search codebase for similar patterns
- Review relevant documentation (specs, design docs, ADRs)
- Check recent commits in related areas
- Understand dependencies and integration points

NEVER delegate or implement blindly.

**2. DELEGATE TO SUBAGENTS**

Before delegation:
- Provide complete context (code snippets, file paths, patterns, docs)
- Specify exact expected output and validation criteria

After delegation (CRITICAL):
- ALWAYS verify results (read modified files, run type-check)
- NEVER skip verification
- If incorrect: re-delegate with corrections and errors
- If TypeScript errors: re-delegate to same agent OR typescript-types-specialist

**3. EXECUTE DIRECTLY (MINIMAL ONLY)**

Direct execution only for:
- Single dependency install
- Single-line fixes (typos, obvious bugs)
- Simple imports
- Minimal config changes

Everything else: delegate.

**4. TRACK PROGRESS**

- Create todos at task start
- Mark in_progress BEFORE starting
- Mark completed AFTER verification only

**5. COMMIT STRATEGY**

Run `/push patch` after EACH completed task:
- Mark task [X] in tasks.md
- Add artifacts: `→ Artifacts: [file1](path), [file2](path)`
- Update TodoWrite to completed
- Then `/push patch`

**6. EXECUTION PATTERN**

```
FOR EACH TASK:
1. Read task description
2. GATHER FULL CONTEXT (code + docs + patterns + history)
3. Delegate to subagent OR execute directly (trivial only)
4. VERIFY results (read files + run type-check) - NEVER skip
5. Accept/reject loop (re-delegate if needed)
6. Update TodoWrite to completed
7. Mark task [X] in tasks.md + add artifacts
8. Run /push patch
9. Move to next task
```

**7. HANDLING CONTRADICTIONS**

If contradictions occur:
- Gather context, analyze project patterns
- If truly ambiguous: ask user with specific options
- Only ask when unable to determine best practice (rare, ~10%)

### Planning Phase (ALWAYS First)

Before implementing tasks:
- Analyze execution model (parallel/sequential)
- Assign executors: MAIN for trivial, existing if 100% match, FUTURE otherwise
- Create FUTURE agents: launch N meta-agent-v3 calls in single message, ask restart
- Resolve research (simple: solve now, complex: deepresearch prompt)
- Atomicity: 1 task = 1 agent call
- Parallel: launch N calls in single message (not sequentially)

See speckit.implement.md for details.

---

## Health Workflows Pattern (5% of cases)

Slash commands: `/health-bugs`, `/health-security`, `/health-cleanup`, `/health-deps`

Follow command-specific instructions. See `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md`.

---

## Project Conventions

**File Organization**:
- Agents: `.claude/agents/{domain}/{orchestrators|workers}/`
- Commands: `.claude/commands/`
- Skills: `.claude/skills/{skill-name}/SKILL.md`
- Temporary: `.tmp/current/` (git ignored)
- Reports: `docs/reports/{domain}/{YYYY-MM}/`

**Code Standards**:
- Type-check must pass before commit
- Build must pass before commit
- No hardcoded credentials

**Agent Selection**:
- Worker: Plan file specifies nextAgent (health workflows only)
- Skill: Reusable utility, no state, <100 lines

**Supabase Operations**:
- Use Supabase MCP when `.mcp.json` includes supabase server
- Project: MegaCampusAI (ref: `diqooqbuchsliypgwksu`)
- Migrations: `packages/course-gen-platform/supabase/migrations/`

**Supabase Admin Client (Intentional Duplication)**:
Two separate admin client implementations exist by design:
- `packages/course-gen-platform/src/shared/supabase/admin.ts` - Node.js backend (tRPC, BullMQ)
  - Uses `SUPABASE_SERVICE_KEY` env variable
  - Lazy singleton initialization
  - Types from `@megacampus/shared-types`
- `packages/web/lib/supabase-admin.ts` - Next.js Server (Components, Actions, API Routes)
  - Uses `SUPABASE_SERVICE_ROLE_KEY` env variable
  - Eager initialization (module caching)
  - Types from `@/types/database.generated`
  - Access via: `import { getAdminClient } from '@/lib/supabase/client-factory'`

Reasons NOT to unify:
1. Different runtime environments (Node.js vs Next.js Server)
2. Different env variable names (historical)
3. Different type sources and configurations
4. Unification would require new shared package with significant refactoring

**Database Types (Single Source of Truth)**:
- MAIN file: `packages/shared-types/src/database.types.ts`
- All other packages use re-export: `export * from '@megacampus/shared-types/database.types'`
- To regenerate: `mcp__supabase__generate_typescript_types` → update MAIN file only
- NEVER duplicate database types - always re-export from shared-types

**Analysis Types (Single Source of Truth)**:
- TypeScript interfaces: `packages/shared-types/src/analysis-result.ts`
- Zod schemas: `packages/shared-types/src/analysis-schemas.ts` (canonical location)
- Import schemas from: `@megacampus/shared-types` or `@megacampus/shared-types/analysis-schemas`
- Import types from: `@megacampus/shared-types/analysis-result`
- Deprecated re-export file: `packages/course-gen-platform/src/types/analysis-result.ts`
- NEVER create new analysis Zod schemas outside shared-types

**File Upload Constants (Single Source of Truth)**:
- MAIN file: `packages/shared-types/src/file-upload-constants.ts`
- Contains: MIME_TYPES_BY_TIER, FILE_SIZE_LIMITS_BY_TIER, FILE_COUNT_LIMITS_BY_TIER, FILE_UPLOAD
- Import from: `@megacampus/shared-types`
- Web package re-exports via `packages/web/lib/constants.ts`
- NEVER define file types/sizes locally - always import from shared-types

**Common Enums (Single Source of Truth)**:
- MAIN file: `packages/shared-types/src/common-enums.ts`
- Contains: languageSchema, difficultySchema, courseLevelSchema with types and arrays
- Import from: `@megacampus/shared-types`
- NEVER define language/difficulty enums locally - always import from shared-types

**Course Styles (Single Source of Truth)**:
- MAIN file: `packages/shared-types/src/style-prompts.ts`
- Contains: COURSE_STYLES, STYLE_PROMPTS, CourseStyle type
- Web uses: imports + adds UI metadata (icons, localized text) in `learning-styles.ts`
- NEVER duplicate style prompts - always import from shared-types

**MCP Configuration**:
- BASE (`.mcp.base.json`): context7 + sequential-thinking (~600 tokens)
- FULL (`.mcp.full.json`): + supabase + playwright + n8n + shadcn (~5000 tokens)
- Switch: `./switch-mcp.sh`

---

## Server Access

Production server SSH available. See `.claude/local.md` for IP and details (gitignored).

---

## Reference Docs

- Agent orchestration: `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md`
- Architecture: `docs/Agents Ecosystem/ARCHITECTURE.md`
- Quality gates: `docs/Agents Ecosystem/QUALITY-GATES-SPECIFICATION.md`
- Report templates: `docs/Agents Ecosystem/REPORT-TEMPLATE-STANDARD.md`

## Active Technologies
- TypeScript 5.x (strict mode)
- Immer for nested state updates (packages/web) - use `produce()` instead of spread operators

**Internationalization (i18n)**:
- Config: `packages/web/src/i18n/config.ts` (Single Source of Truth)
- Guide: `.claude/docs/i18n-guide.md` (full reference for translations)

## Recent Changes
- 013-n8n-graph-view: Added Immer for state management
- 010-stages-456-pipeline: Added TypeScript 5.x (strict mode)
