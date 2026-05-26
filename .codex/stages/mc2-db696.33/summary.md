---
stage_id: mc2-db696.33
task_id: mc2-db696.33
branch: codex/career-playbook-document-milk
base_branch: develop
base_commit: cd19d6650afa68e31328c30439377499d821d80b
status: deployed_to_dev
---

# Career Playbook Document-First Milk Redesign

## Scope

- Implement the selected hybrid direction: milk document surface from variant 2, review/checkpoint behavior from variant 4, and calmer typography from variant 5.
- Keep the global light primary CTA purple while moving base light tokens toward a warmer document palette.
- Redesign Career Playbook constructor, follow-up phase, completion review, library, private viewer, public share fallback/viewer, loading/error/auth-required states, and softly align the landing through shared tokens.
- Keep backend schemas, tRPC contracts, generation, ESCO import, and role-source data unchanged.

## Routing

- Selected skills: `orchestrator-stage`, `task-router`, `frontend-aesthetics`, `ui-design-system`, `webapp-testing`, `code-review`, Superpowers `brainstorming`, `writing-plans`, `test-driven-development`, `verification-before-completion`.
- Selected agents: visible `frontend_specialist` audit subagent `Viewport`; visible `correctness_reviewer` subagent `Signal`.
- Documentation: Context7 Tailwind CSS v4 docs checked for CSS variables and responsive utilities.
- Catalog candidates: none; installed skills and agents were sufficient.

## Changes

- Added milk/document light tokens and Career Playbook shell utilities in `packages/web/app/globals.css`.
- Added shared document workspace/shell/preview components under `packages/web/components/career-playbook/layout/`.
- Rebuilt constructor as a three-region document workflow: left navigation, central draft document, right current question/action panel.
- Rebuilt follow-up and completion screens around document review, with document/work icons instead of visible AI-cliche markers.
- Applied the document palette and shared app header treatment to library, viewer, streaming, editor, public share, loading/error, and auth-required states.
- Localized viewer block/group/status labels and aria labels for RU/EN so Russian UI does not fall back to English catalog names.
- Added/updated unit coverage for wizard, page client, library, viewer, viewer page client, and public viewer.
- Added plan documentation at `docs/plans/career-playbook/2026-05-25-document-first-zone-redesign.md` and updated `docs/career-playbook/README.md`.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/public-playbook-viewer.test.tsx` passed: 53 tests.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm --filter @megacampus/web type-check` passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm --filter @megacampus/web build` passed with existing Browserslist and `url.parse()` warnings.
- Production-mode Playwright smoke passed for `/ru/career-playbook/new`, `/ru/career-playbook/library`, `/ru/career-playbook/[id]`, `/ru/share/career-playbook/[slug]`, `/ru/career-playbook`, `/ru/create`, `/ru/courses`, and `/ru/profile` at 390, 1440, and 1920 px: 24 checks, no 500s, no horizontal overflow.
- `pnpm type-check` passed.
- `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm build` passed with existing Browserslist and `url.parse()` warnings.

## Delivery

- PR #51 merged into `develop` as `9121b2a5672e09770405ea2f6ddc9f8105280eea`.
- Dev deploy completed through GitHub Actions run `26385179954`; `Deploy to Dev` passed.
- Dev health passed on 2026-05-25: `https://dev.ai.megacampus.ru/api/health` returned `{"status":"ok"}`.
- Dev light and dark smoke passed for `/ru/career-playbook`, `/ru/career-playbook/new`, `/ru/career-playbook/library`, and `/en/career-playbook` at 390, 1440, and 1920 px: 200 status and no horizontal overflow. Dark smoke forced `localStorage.theme = "dark"`, `prefers-color-scheme: dark`, and verified that the `dark` class applied.

## Explicit Defers

- `mc2-db696.28`: ESCO import subset / normalized role-source pipeline remains outside this redesign.
- Local authenticated browser screenshots require a valid `TOKEN`; unauthenticated/private fallback states and public fallback were visually checked locally, and authenticated behavior is covered by unit tests plus Dev route smoke.
