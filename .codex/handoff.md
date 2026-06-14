# Orchestrator Handoff

Updated: 2026-06-14
Stage: none active
Branch: `codex/single-source-course-generation-flow`
Beads: none active

## Current State

- Closed Beads task `mc2-f3q7c`: single-source Career Playbook course generation no longer asks for manual review/prioritization gates.
- Career Playbook course bridge now creates courses with `generation_mode = automatic`, initializes progress with `has_documents = true`, and keeps Stage 2 as technical indexing/vectorization rather than a user-facing Markdown review gate.
- Stage 3 assigns the only source document as `CORE` and auto-continues to Stage 4 without manual prioritization, even for legacy/semi-automatic single-document courses.
- Generating UI now treats `courses.has_files = true` as document presence when `generation_progress.has_documents` is stale or false.
- AutoCard preview status badges now use non-interactive soft outline styling so `Готово` no longer looks like a clickable primary button.

## Verification

- Passed targeted backend tests: `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/shared/auto-approval/force-auto-approval.test.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts`.
- Passed AutoCard UI checks: `pnpm --filter @megacampus/web exec eslint components/generation-graph/panels/shared/AutoCardPreview.tsx`; `pnpm --filter @megacampus/web type-check`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Delivery

- docs-reviewed: updated - `docs/career-playbook/architecture.md` now documents automatic bridge generation and single-document prioritization.
- graph-reviewed: updated - ran `graphify update .`; local graph rebuilt successfully, no tracked graph diff remained.

## Next recommended

Next stage id: none.
Recommended action: push `codex/single-source-course-generation-flow`; merge/deploy only with explicit current-task authorization.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, and Beads. Current branch contains the single-source Career Playbook course generation flow fix.

## Explicit defers

- Live click-through course generation was not run in this branch because it can trigger real LLM/Tavily generation cost; covered by service/unit tests plus type-check/build.
