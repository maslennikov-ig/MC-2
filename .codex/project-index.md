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
- `graphify-out/GRAPH_REPORT.md` - local ignored Graphify orientation report for architecture, impact, and unfamiliar-code navigation.
- `.graphifyignore` - Graphify source filter for dependencies, runtime state, generated output, secrets, and noisy artifacts.
- `docs/plans/quiet-waddling-starfish.md` - Career Playbook product and architecture plan.
- `docs/plans/career-playbook/` - detailed Career Playbook implementation plans.
- `docs/career-playbook/` - Career Playbook runtime architecture and verification docs.
- `scripts/orchestration/run_process_verification.sh` - orchestration contract verification.
- `scripts/orchestration/run_stage_closeout.py` - canonical stage closeout entrypoint.

## Core Subsystems

- Frontend app routes: `packages/web/app/[locale]/`.
- Frontend mock/design routes: `packages/web/app/(mocks)/mocks/`; selected Career Playbook executive reader mock: `packages/web/app/(mocks)/mocks/career-playbook-reader-variants/page.tsx`.
- Shared document-reader panel control: `packages/web/components/common/panel-icon-button.tsx`.
- Frontend reusable UI: `packages/web/components/`.
- Shared catalog UI primitives: `packages/web/components/catalog/` (filters, grids, statistics, reusable card action controls).
- Frontend locale messages: `packages/web/messages/{ru,en}/`.
- Frontend i18n config/types: `packages/web/src/i18n/config.ts` and `packages/web/types/i18n.d.ts`.
- Frontend unit/e2e tests: `packages/web/tests/unit/` and `packages/web/tests/e2e/`.
- Product gateway route: `packages/web/app/[locale]/page.tsx` with content from `packages/web/components/common/hero-content.tsx`.
- Product header navigation: `packages/web/components/layouts/header.tsx`.
- Course landing route: `packages/web/app/[locale]/courses/page.tsx`.
- Course library route: `packages/web/app/[locale]/courses/library/page.tsx`.
- Course reader route: `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/page.tsx` with shell in `packages/web/components/course/course-viewer-enhanced.tsx`, toolbar controls in `packages/web/components/course/viewer/components/Toolbar.tsx`, and document lesson surface in `packages/web/components/common/lesson-content.tsx`.
- Course creation route: `packages/web/app/[locale]/create/`.
- Career Playbook wizard route: `packages/web/app/[locale]/career-playbook/new/`.
- Career Playbook business-context upload route: `packages/web/app/api/career-playbook/upload/route.ts`.
- Career Playbook landing route: `packages/web/app/[locale]/career-playbook/`.
- Career Playbook library route: `packages/web/app/[locale]/career-playbook/library/`.
- Career Playbook public share route: `packages/web/app/[locale]/share/career-playbook/[slug]/`.
- Career Playbook production reader route: `packages/web/app/[locale]/career-playbook/[id]/page-client.tsx` with executive document shell in `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`.
- Career Playbook wizard UI: `packages/web/components/career-playbook/wizard/`.
- Career Playbook library UI: `packages/web/components/career-playbook/library/`.
- Career Playbook public viewer UI: `packages/web/components/career-playbook/viewer/`.
- Backend tRPC routers and services: `packages/course-gen-platform/src/server/routers/`.
- Backend Career Playbook stage: `packages/course-gen-platform/src/stages/stage-career-playbook/`.
- Backend Career Playbook department classifier: `packages/course-gen-platform/src/stages/stage-career-playbook/nodes/department-classifier.ts`.
- Backend Career Playbook business-context helpers: `packages/course-gen-platform/src/stages/stage-career-playbook/nodes/business-context.ts`.
- Backend Career Playbook business-context source processing: `packages/course-gen-platform/src/stages/stage-career-playbook/source-processing.ts`.
- Backend Career Playbook business-context sources: `packages/course-gen-platform/src/server/routers/career-playbook/sources.router.ts` and `sources.service.ts`.
- Backend Career Playbook library/access service: `packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts` owns library listing, viewer snapshots, canonical visibility updates, public-link compatibility, and owner/read-only permissions.
- Backend Career Playbook course bridge: `packages/course-gen-platform/src/server/routers/career-playbook/course-bridge.service.ts` with storage/quota helpers in `course-bridge-storage.ts`.
- Backend Career Playbook PDF service: `packages/course-gen-platform/src/services/career-playbook-pdf.ts`.
- Backend Career Playbook smoke preflight: `packages/course-gen-platform/src/smoke/career-playbook-preflight.ts` and `packages/course-gen-platform/scripts/career-playbook-smoke-preflight.ts`.
- Backend Supabase migrations: `packages/course-gen-platform/supabase/migrations/`.
- Shared Career Playbook contracts: `packages/shared-types/src/career-playbook.ts`.

## Integrations And Sources Of Truth

- Beads (`bd`) is the task source of truth.
- Graphify is the local knowledge-graph source for repo orientation; use `graphify query`, `graphify path`, or `graphify explain` with `graphify-out/graph.json`.
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
- CI integration smoke: `QDRANT_URL=http://localhost:6333 QDRANT_API_KEY=test-qdrant-key pnpm test:integration:ci`; full integration remains `pnpm test:integration`.
- Web targeted unit tests: `pnpm --filter @megacampus/web exec vitest run <test-files>`.
- Web targeted e2e: `pnpm --filter @megacampus/web exec playwright test <spec> --project=chromium`.
- Career Playbook web e2e harness: `pnpm --filter @megacampus/web test:e2e:career-playbook`.
- Career Playbook backend read-only preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local`.
- Career Playbook ESCO role suggestion subset import: `scripts/career-playbook/import_esco_role_suggestions.py`.
- Career Playbook Wikidata RU role suggestion subset import: `scripts/career-playbook/import_wikidata_role_suggestions.py`.
- Artifact validation: `python3 scripts/orchestration/validate_artifact.py <artifact.md>`.
- Graphify local graph refresh: `graphify update .` then `graphify cluster-only . --no-viz`.

## Conventions And Boundaries

- Do not push directly to `develop` or `master`.
- Do not use `--no-verify` or `--no-gpg-sign`.
- Keep `.codex/handoff.md` under the configured current-state line limit.
- Keep this file navigation-only; do not add stage logs, blockers, or task queues.
- Update this file when stable entrypoints, routes, directories, integrations, verification commands, or ownership boundaries change.
- Use Context7 for version-sensitive library/framework docs before implementation.
- Use visible spawned Codex subagents when justified and explicitly allowed; inline-only delegation is not acceptable for this repo workflow.
