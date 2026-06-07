# Stage Summary: mc2-db696.53

## Scope

- Added `CareerPlaybookWizardProgressSchema` and persisted wizard resume state in `career_playbooks.q_a_data.ui_progress`.
- Added `careerPlaybook.session.saveProgress` for current-step autosave without a database migration.
- Updated frontend hydration/resume to restore the active fixed question by `question_key` or active follow-up by `question_id`, falling back to clamped indices.
- Added short progress autosave debounce and serialized autosave flushing so progress saves do not race answer/freeform/business-context writes.
- Added Business Context pasted text/notes textarea with autosave via the existing freeform answer path.
- Changed freeform clearing semantics so `freeform_text: ""` clears stored notes instead of being ignored.
- Invalidated stale follow-up questions, follow-up answers, completeness, generation count, and non-user-edited generated digest data when pasted notes or structured business context change.
- Confirmed Career Playbook source upload still uses Stage 1 storage and Stage 2 Docling/markdown processing through `PROCESS_SOURCE`; no separate Docling pipeline was added.
- Stabilized sticky header dropdowns by using fixed positioning plus a spacer for `sticky=true` headers and explicit dropdown side/collision settings.
- Added Playwright local opt-ins for system Chrome and disabled video fallback: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `PLAYWRIGHT_DISABLE_VIDEO=1`.

## Verification

- Passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/career-playbook-store-progress.test.ts`.
- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/server/routers/career-playbook-progress.router.test.ts`.
- Passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx`.
- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/source-processing.test.ts`.
- Passed: `DEBUG=pw:webserver PLAYWRIGHT_PORT=3017 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome PLAYWRIGHT_DISABLE_VIDEO=1 pnpm --filter @megacampus/web exec playwright test tests/e2e/header-dropdown-position.spec.ts --project=chromium --workers=1`; unauthenticated product-menu case passed, authenticated profile-menu case skipped because `TOKEN` is not set.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Documentation

- docs-reviewed: updated - `.codex/handoff.md`, `docs/career-playbook/architecture.md`, and this stage summary record `ui_progress`, `saveProgress`, freeform clearing/invalidation, Docling reuse, sticky header dropdowns, and Playwright local env opt-ins.
- project-index: reviewed-no-change - no new stable route, directory, ownership boundary, verification entrypoint, or integration category was added.

## Knowledge Graph

- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`; report shows 57378 nodes, 79570 edges, and 3681 communities after clustering.

## Delivery Notes

- Beads task: `mc2-db696.53`.
- Branch: `codex/career-playbook-resume-text-header`.
- Other active worktree left untouched: `/home/me/code/mc2-worktrees/career-playbook-business-context`.

## Explicit Defers

- Freeform text size limiting is deferred pending a product limit decision; tracked in Beads `mc2-db696.54`.
- Authenticated profile-menu e2e is present but skipped locally because `TOKEN` is not set.
