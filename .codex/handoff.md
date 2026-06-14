# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-ze255` (closed)
Branch: `develop`
Beads: none active

## Current State

- Career Playbook course bridge preview defaults course size to `auto` (`Оптимальный (ИИ-анализ)`), and create persists `course_size = auto` unless the user overrides it.
- `TAVILY_API_KEY` is configured in ignored local backend env and GitHub Actions repo secrets; tracked files contain only placeholders.
- Deploy workflows write `TAVILY_API_KEY` into `.env.dev` and `.env.production`.
- CI/CD workflow and `scripts/ci/*` changes are deploy-config changes, so Dev deploy runs after env-template changes.

## Verification

- Passed backend bridge unit test: `pnpm --filter @megacampus/course-gen-platform test -- career-playbook-course-bridge.service.test.ts`.
- Passed frontend dialog/viewer tests: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed Dev delivery for course-size change: GitHub Actions run `27492382994` succeeded with Deploy to Dev and Verify deployment.
- Passed deploy-secret checks: `gh secret list` shows `TAVILY_API_KEY`; tracked secret grep found no actual key value.
- Passed detector tests: RED before fix, then `bash scripts/ci/test_detect_deploy_changes.sh`, `bash -n scripts/ci/detect_deploy_changes.sh scripts/ci/test_detect_deploy_changes.sh`, and workflow YAML parse.
- Passed Dev delivery for detector fix: GitHub Actions run `27493226003` succeeded with Contract Tests and Deploy to Dev.
- Passed Dev E2E after deploy: `PLAYWRIGHT_BASE_URL=https://dev.ai.megacampus.ru PLAYWRIGHT_DISABLE_VIDEO=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter @megacampus/web test:e2e:career-playbook` (`5 passed`).

## Delivery

- docs-reviewed: updated - env example, handoff, and stage summaries record the deploy env wiring and detector fix without secrets.
- graph-reviewed: no-change-needed - course bridge and deploy change detection did not require graph/schema refresh.

## Next recommended

Next stage id: none.
Recommended action: no active orchestrator-stage work remains; start a new Beads task if the user requests live Tavily/course generation testing.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, and Beads. No active stage remains; previous work delivered auto course size defaults, Tavily deploy env propagation, and CI deploy detection.

## Explicit defers

- Live click on “Создать курс” with web research was not run because it can trigger real LLM/Tavily generation cost; covered by unit/service tests and Dev E2E around the Career Playbook flow.
