# Repository Guidelines

## Project Structure & Module Organization

The monorepo is managed via pnpm workspaces. Primary runtime code lives in `packages/course-gen-platform/src`, split into `server/` (tRPC endpoints), `orchestrator/` (BullMQ flows), and `services/` (generation + RAG pipelines). Shared contracts and Zod schemas are in `packages/shared-types/src`, while the future client SDK sits under `packages/trpc-client-sdk`. Specs for each stage are tracked in `specs/`, developer docs in `docs/`, automation helpers under `scripts/`, and infra/config assets inside `mcp/` and root Docker compose files. Keep assets, migrations, and tests near the feature they exercise.

## Build, Test, and Development Commands

Run `pnpm install` once, then use workspace scripts: `pnpm dev` boots the course platform locally (port 3000) with hot reload. `pnpm build` compiles every package, while `pnpm -r build` targets packages recursively when working inside subfolders. Testing entry points are `pnpm test` (Vitest suites) and `pnpm test:rls` (pgTAP RLS verification); `pnpm test:all` combines them. Use `pnpm lint`, `pnpm type-check`, and `pnpm format:check` before opening a PR. Database changes should be applied with `pnpm supabase db push` from `packages/course-gen-platform`.

## Coding Style & Naming Conventions

TypeScript runs in strict mode with ESLint (typescript-eslint) and Prettier (2-space indentation, trailing commas). Favor `camelCase` for functions/variables, `PascalCase` for exported types, and `kebab-case` for files and directories, matching existing modules. Service folders should end in `-service`, and BullMQ jobs should use descriptive verbs (`generation-orchestrator`). Zod schemas belong in `packages/shared-types` to keep validation centralized.

## Testing Guidelines

Vitest covers units, orchestrators, and integration harnesses under `packages/course-gen-platform/tests`. Database security is enforced via pgTAP located in `supabase/tests`. Aim to keep coverage near the current 90%+ baseline by adding assertions for both success and failure branches. Prefer descriptive test names like `shouldRejectSmallContextUploads`, and guard asynchronous tests with explicit timeouts. Always run `pnpm test:all` before pushing.

## Commit & Pull Request Guidelines

Follow the existing conventional commit style (`type(scope): summary`, e.g., `fix(web): prevent null titles`). Each PR should summarize intent, link related specs/issues, list test commands executed, and include screenshots/logs when UI or orchestration output changes. Call out Supabase migrations or env var changes explicitly and request reviewers from platform + orchestrator owners.

## Security & Configuration Tips

Never commit `.env` files; instead copy `packages/course-gen-platform/.env.example`. Credentials for Supabase, Qdrant, Redis, and Jina must be sourced from 1Password vaults. When testing MCP integrations or Docling proxies, bind to localhost only and confirm logs in `logs/` exclude customer content before uploading artifacts.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Codex Skills (Token-Efficient)

- Superpowers are installed globally; do not vendor them into this repository.
- Preferred skills path for Codex: `~/.codex/skills/superpowers` (symlink is acceptable).
- If a dedicated `Skill` tool is unavailable in the current runtime, load the needed `SKILL.md` directly and follow it.
- Keep instructions short and action-focused; avoid re-reading large docs unless required.
- Do not modify Claude Code-specific setup while configuring Codex skills.
