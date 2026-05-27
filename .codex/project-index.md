# Project Index - MegaCampusAI

Stable navigation map for this repository. Keep stage history and current task status in `.codex/handoff.md`, `.codex/stages/`, and Beads, not here.

## Runtime Shape

- Single pnpm monorepo.
- `develop` is the dev delivery branch; `master` is staging.
- `packages/web` is the Next.js App Router frontend.
- `packages/course-gen-platform` owns backend/platform code, Supabase migrations, tRPC server wiring, and generation orchestration.
- `packages/shared-types` owns cross-package runtime schemas and TypeScript contracts.
- Repo-local orchestration state lives under `.codex/`; Beads is the source of truth for tasks.

## Primary Entrypoints

- `AGENTS.md` - portable repo contract and Beads workflow.
- `.codex/orchestrator.toml` - machine-readable orchestration contract and verification groups.
- `.codex/handoff.md` - current-state handoff only.
- `.codex/project-index.md` - this stable navigation map.
- `docs/plans/quiet-waddling-starfish.md` - Career Playbook product and architecture plan.
- `docs/plans/career-playbook/` - detailed Career Playbook implementation plans.
- `docs/career-playbook/` - Career Playbook runtime architecture and verification docs.
- `scripts/orchestration/run_process_verification.sh` - orchestration contract verification.
- `scripts/orchestration/run_stage_closeout.py` - canonical stage closeout entrypoint.

## Core Subsystems

- Frontend app routes: `packages/web/app/[locale]/`.
- Frontend reusable UI: `packages/web/components/`.
- Frontend locale messages: `packages/web/messages/{ru,en}/`.
- Frontend i18n config/types: `packages/web/src/i18n/config.ts` and `packages/web/types/i18n.d.ts`.
- Frontend unit/e2e tests: `packages/web/tests/unit/` and `packages/web/tests/e2e/`.
- Product gateway route: `packages/web/app/[locale]/page.tsx` with content from `packages/web/components/common/hero-content.tsx`.
- Product header navigation: `packages/web/components/layouts/header.tsx`.
- Course landing route: `packages/web/app/[locale]/courses/page.tsx`.
- Course library route: `packages/web/app/[locale]/courses/library/page.tsx`.
- Course creation route: `packages/web/app/[locale]/create/`.
- Career Playbook wizard route: `packages/web/app/[locale]/career-playbook/new/`.
- Career Playbook landing route: `packages/web/app/[locale]/career-playbook/`.
- Career Playbook library route: `packages/web/app/[locale]/career-playbook/library/`.
- Career Playbook public share route: `packages/web/app/[locale]/share/career-playbook/[slug]/`.
- Career Playbook wizard UI: `packages/web/components/career-playbook/wizard/`.
- Career Playbook library UI: `packages/web/components/career-playbook/library/`.
- Career Playbook public viewer UI: `packages/web/components/career-playbook/viewer/`.
- Backend tRPC routers and services: `packages/course-gen-platform/src/server/routers/`.
- Backend Career Playbook stage: `packages/course-gen-platform/src/stages/stage-career-playbook/`.
- Backend Career Playbook PDF service: `packages/course-gen-platform/src/services/career-playbook-pdf.ts`.
- Backend Career Playbook smoke preflight: `packages/course-gen-platform/src/smoke/career-playbook-preflight.ts` and `packages/course-gen-platform/scripts/career-playbook-smoke-preflight.ts`.
- Backend Supabase migrations: `packages/course-gen-platform/supabase/migrations/`.
- Shared Career Playbook contracts: `packages/shared-types/src/career-playbook.ts`.

## Integrations And Sources Of Truth

- Beads (`bd`) is the task source of truth.
- Shared contracts must be imported from `@megacampus/shared-types`.
- Career Playbook product scope comes from `docs/plans/quiet-waddling-starfish.md` and `docs/plans/career-playbook/*`.
- Supabase schema changes belong in backend migrations under `packages/course-gen-platform/supabase/migrations/`.
- Frontend locale copy belongs in `packages/web/messages/{ru,en}/` and must be registered in web i18n config/types.
- No billing or payment work belongs in the Career Playbook MVP unless a later tracked task explicitly changes scope.

## Verification

- Process verification: `scripts/orchestration/run_process_verification.sh`.
- Stage closeout: `python3 scripts/orchestration/run_stage_closeout.py --stage <stage_id>`.
- Common code gates: `pnpm type-check` and `pnpm build`.
- Backend targeted unit tests: `pnpm --filter @megacampus/course-gen-platform test -- <test-files>`.
- Web targeted unit tests: `pnpm --filter @megacampus/web exec vitest run <test-files>`.
- Web targeted e2e: `pnpm --filter @megacampus/web exec playwright test <spec> --project=chromium`.
- Career Playbook web e2e harness: `pnpm --filter @megacampus/web test:e2e:career-playbook`.
- Career Playbook backend read-only preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local`.
- Career Playbook ESCO role suggestion subset import: `scripts/career-playbook/import_esco_role_suggestions.py`.
- Artifact validation: `python3 scripts/orchestration/validate_artifact.py <artifact.md>`.

## Conventions And Boundaries

- Do not push directly to `develop` or `master`.
- Do not use `--no-verify` or `--no-gpg-sign`.
- Keep `.codex/handoff.md` under the configured current-state line limit.
- Keep this file navigation-only; do not add stage logs, blockers, or task queues.
- Update this file when stable entrypoints, routes, directories, integrations, verification commands, or ownership boundaries change.
- Use Context7 for version-sensitive library/framework docs before implementation.
- Use visible spawned Codex subagents when justified and explicitly allowed; inline-only delegation is not acceptable for this repo workflow.
