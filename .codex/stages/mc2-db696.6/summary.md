# Stage mc2-db696.6 Summary

Status: ready for delivery
Branch: feature/career-playbook-viewer-editor
Base: feature/career-playbook-frontend-phase-b

## Scope

Career Playbook Phase 6 frontend viewer/editor: authenticated `/career-playbook/[id]` route, 27-block viewer with sticky TOC, markdown/Mermaid handoff, block edit/regenerate sheet, actions bar, streaming view, and tests.

## Current Design Decision

- Keep this phase frontend-first because Career Playbook `library.*` and `generation.*` backend procedures are still skeleton-only.
- Use explicit local fallback for viewer preview/edit/regenerate when backend returns `METHOD_NOT_SUPPORTED`; show backend-pending messages rather than pretending remote actions succeeded.
- Keep PDF/share/course/delete as unavailable states; later Beads tasks own those backend integrations.
- Lazyweb references informed the document editor pattern, but the implementation uses existing MC2 shadcn/lucide/slate/teal styling.

## Parallel Streams

- `contract-ui-read`: visible subagent `Socrates` inspected backend/shared/frontend contracts; read-only.
- `viewer-ui-read`: visible subagent `Lorentz` inspected existing UI/test patterns and Lazyweb-informed implementation boundaries; read-only.
- Local orchestrator owned TDD implementation, tests, verification, Beads defer creation, and delivery prep.
- `code-review`: visible subagent `Bohr` reviewed the final diff read-only.

## Review Follow-up

- Fixed stale viewer leakage when navigating between playbook IDs by clearing viewer state on mismatched `playbookId` loads.
- Fixed broad fallback masking by marking `backendPending` only for skeleton backend errors and creating local preview only for those errors.
- Added localized viewer/action/editor/streaming copy through `next-intl` messages for `en` and `ru`.

## Explicit Defers

- Real viewer/editor/generation-status backend transport is tracked as `mc2-ekaup`.
- PDF export remains tracked by `mc2-db696.8`.
- JD/course bridge remains tracked by `mc2-db696.9`.
- Library/share/RLS/public viewer remains tracked by `mc2-db696.10`.

## Verification Snapshot

- `pnpm --filter @megacampus/shared-types build`: passed.
- `pnpm --filter @megacampus/web test tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook`: passed, 52 tests.
- `pnpm type-check`: passed.
- `pnpm lint`: passed with existing unrelated warnings.
- `pnpm --filter @megacampus/web test:e2e tests/e2e/career-playbook/viewer-editor.spec.ts --project=chromium`: passed, 1 unauth test passed and 1 authenticated test skipped because `TOKEN` is unavailable.
- `pnpm build`: passed.
