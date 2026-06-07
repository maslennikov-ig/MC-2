# Orchestrator Handoff

Updated: 2026-06-07
Stage: `mc2-db696.53`
Branch: `codex/career-playbook-resume-text-header`

## Current State

- Career Playbook wizard progress is persisted in `career_playbooks.q_a_data.ui_progress` through `careerPlaybook.session.saveProgress`.
- Resume/hydration restores the last active wizard step by fixed `question_key` or follow-up `question_id`, with indices as fallback.
- Terminal statuses (`ready_to_generate`, `generating`, `completed`, `failed`) remain in the completion phase even if old progress points to an earlier step.
- Business Context now includes an autosaved pasted text/notes textarea next to file upload.
- Empty `freeform_text` clears stored notes; changing notes or structured business context invalidates persisted follow-up questions, answers, completeness, generation count, and non-user-edited generated digest data.
- Career Playbook source upload continues to reuse Stage 1 storage plus Stage 2 Docling, processed-document storage, and summarization through `PROCESS_SOURCE`; no separate Docling pipeline was added.
- Sticky headers now use fixed positioning with a spacer when `sticky=true`; header product/profile dropdowns open below their triggers with viewport collision padding.
- Playwright config supports local fallback env vars: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and `PLAYWRIGHT_DISABLE_VIDEO=1`.
- Other worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` remains untouched.

## Verification

- Passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/career-playbook-store-progress.test.ts`.
- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/server/routers/career-playbook-progress.router.test.ts`.
- Passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx`.
- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/stages/stage-career-playbook/source-processing.test.ts`.
- Passed: `DEBUG=pw:webserver PLAYWRIGHT_PORT=3017 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome PLAYWRIGHT_DISABLE_VIDEO=1 pnpm --filter @megacampus/web exec playwright test tests/e2e/header-dropdown-position.spec.ts --project=chromium --workers=1`; profile-menu case skipped because `TOKEN` is not set.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Next recommended

Next stage id: `mc2-db696.53`.
Recommended action: finish closeout, refresh Graphify, commit and push the feature branch after final gates pass.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-db696.53`, stage summary `.codex/stages/mc2-db696.53/summary.md`, and Graphify report. Continue from branch `codex/career-playbook-resume-text-header`. Do not touch `/home/me/code/mc2-worktrees/career-playbook-business-context` unless explicitly requested.

## Delivery

- docs-reviewed: updated - handoff, Career Playbook architecture docs, and stage summary record progress persistence, freeform clearing/invalidation, Docling reuse, sticky header dropdowns, and Playwright local env opt-ins.
- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`; report shows 57378 nodes, 79570 edges, and 3681 communities after clustering.

## Explicit defers

- Freeform text size limiting is deferred pending a product limit decision; tracked in Beads `mc2-db696.54`. Authenticated profile-menu e2e is present but skipped locally because `TOKEN` is not set.
