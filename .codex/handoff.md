# Orchestrator Handoff

Updated: 2026-06-13
Stage: `mc2-spb1n`
Branch: `codex/career-playbook-course-preview-bridge`
Beads: `mc2-spb1n`

## Current State

- Career Playbook Role Guide -> course bridge preview/create flow is implemented and delivered to Dev.
- Private owners can preview prefilled course data, edit title/description/audience/outcomes/language/course size/style, create a course, and start generation.
- Role Guide markdown is always primary; web research and uploaded business-context excerpts stay default-off and opt-in only.
- Backend persists the synthetic source, starts generation, and rolls back the draft if source persistence or generation start fails.
- Dev hotfix `787b228f` changed bridge source `file_catalog.processing_method` to DB-valid `full_text`; origin metadata remains `summary_metadata.source = career_playbook_bridge`.

## Verification

- Passed local: backend course-bridge unit test (19 tests), backend type-check, backend lint (0 errors, 95 warnings within budget), web viewer tests (19 tests), web type-check.
- Passed CI/CD: run `27471885516` (`927a2ea1`) deployed web to Dev; run `27472451330` (`913420bc`) passed CI, API Docker build, contract tests, and Dev deploy.
- Passed Dev health: `https://dev.ai.megacampus.ru/health` returned `HTTP/2 200`, `x-environment: development`, queue `course-generation-dev`.
- Passed live Dev E2E: playbook `45b0932e-1dc9-450c-b85e-97239703ca03` created course `ee09aae4-b39b-4857-84fe-a87bf755cf31`; preview/create tRPC returned 200; generating page loaded.
- Passed post-worker DB/log check: course reached `stage_2_awaiting_approval`; source file `71949ba7-6e8e-4aa2-8267-3a01a4fd5249` is `indexed`, `chunk_count = 2`, `processing_method = full_text`; document_processing job completed at 100%.
- E2E artifacts: `output/playwright/course-bridge-dev/result.json`, screenshots `01-viewer-before-create.png` through `05-generating-page.png`, and logs under `output/playwright/course-bridge-dev/logs/`.

## Next recommended

Next stage id: `mc2-dkkau`.
Recommended action: fix the stale Beads sync fallback in `.claude/scripts/push-dev.sh`; product delivery for the Career Playbook course bridge is complete on Dev.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads `mc2-dkkau`, and `.claude/scripts/push-dev.sh`. Replace the unsupported `bd sync` no-op with a supported installed-`bd` sync path while preserving safe Dev delivery behavior.

## Delivery

- Delivered to feature branch `codex/career-playbook-course-preview-bridge` and to `develop` via merge commits `927a2ea1` and `913420bc`.
- Dev deploy succeeded through GitHub Actions runs `27471885516` and `27472451330`; staging `/deploy` was not run because the requested post-delivery E2E target was Dev.
- docs-reviewed: updated - handoff and stage summary record delivered behavior, Dev run IDs, E2E evidence, and the bounded `bd sync` follow-up.
- graph-reviewed: no-change-needed - final changes did not introduce a new route/module boundary; earlier bridge graph refresh remains sufficient.

## Explicit defers

- `mc2-dkkau` - `.claude/scripts/push-dev.sh` calls unsupported `bd sync 2>/dev/null || true`; current installed `bd` has no `sync` subcommand. Delivery is unaffected, but the script should not silently no-op.
