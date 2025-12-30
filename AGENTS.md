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
