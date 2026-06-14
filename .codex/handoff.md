# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-muhsu`
Branch: `codex/career-playbook-auto-course-size`
Beads: `mc2-muhsu`

## Current State

- Career Playbook course bridge preview now defaults course size to `auto`, shown in RU as `Оптимальный (ИИ-анализ)`.
- Creating a course from a role guide persists `course_size = auto` unless the user explicitly selects another size.
- `TAVILY_API_KEY` is configured in ignored local backend env only; tracked files contain no secret.
- `packages/course-gen-platform/.env.example` documents the Tavily variable as a placeholder.

## Verification

- Passed RED: backend bridge unit test failed while preview/create still returned `standard`.
- Passed GREEN: `pnpm --filter @megacampus/course-gen-platform test -- career-playbook-course-bridge.service.test.ts`.
- Passed: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`.
- Passed: `cd packages/course-gen-platform && node -r dotenv/config -e "console.log(process.env.TAVILY_API_KEY ? 'TAVILY_API_KEY=set' : 'TAVILY_API_KEY=missing')"`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-muhsu`.
- Passed: Beads `mc2-muhsu` closed and `bd dolt push` completed.
- Pending: commit and `/push-dev`.

## Next recommended

Next stage id: `mc2-muhsu`.
Recommended action: commit, push, and promote to `develop` via `/push-dev`.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads `mc2-muhsu`, and `.codex/stages/mc2-muhsu/summary.md`. Finish verification and dev delivery for the Career Playbook auto course-size default.

## Delivery

- docs-reviewed: updated - handoff, stage summary, and backend env example describe the new default and Tavily configuration without secrets.
- graph-reviewed: no-change-needed - behavior/default change only; no architecture or route/module ownership boundary changed.

## Explicit defers

- None.
