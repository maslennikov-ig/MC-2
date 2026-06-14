# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-ze255`
Branch: `codex/deploy-workflow-changes-trigger-dev`
Beads: `mc2-ze255`

## Current State

- Career Playbook course bridge preview defaults course size to `auto` (`Оптимальный (ИИ-анализ)`), and create persists `course_size = auto` unless the user overrides it.
- `TAVILY_API_KEY` is configured in ignored local backend env and GitHub Actions repo secrets; tracked files contain only placeholders.
- Deploy workflows write `TAVILY_API_KEY` into `.env.dev` and `.env.production`.
- Follow-up fix in progress: CI/CD workflow and `scripts/ci/*` changes are now classified as deploy-config changes so Dev deploy runs after env-template changes.

## Verification

- Passed RED: backend bridge unit test failed while preview/create still returned `standard`.
- Passed GREEN: `pnpm --filter @megacampus/course-gen-platform test -- career-playbook-course-bridge.service.test.ts`.
- Passed: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-muhsu`.
- Passed dev delivery for course-size change: `.claude/scripts/push-dev.sh --yes`; Dev Actions run `27492382994` succeeded with Deploy to Dev and Verify deployment.
- Passed Dev E2E: `PLAYWRIGHT_BASE_URL=https://dev.ai.megacampus.ru PLAYWRIGHT_DISABLE_VIDEO=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter @megacampus/web test:e2e:career-playbook` (`5 passed`).
- Passed deploy-secret checks: `gh secret list` shows `TAVILY_API_KEY`; tracked secret grep found no actual key value; `.github/workflows/ci-cd.yml` parses as YAML.
- Passed RED for detector fix: `bash scripts/ci/test_detect_deploy_changes.sh` failed because CI/workflow-only changes produced `should_deploy=false`.
- Passed GREEN for detector fix: `bash scripts/ci/test_detect_deploy_changes.sh`; `bash -n scripts/ci/detect_deploy_changes.sh scripts/ci/test_detect_deploy_changes.sh`; workflow YAML parse.

## Next recommended

Next stage id: `mc2-ze255`.
Recommended action: finish closeout, push-dev delivery, wait for Dev deploy, then rerun Dev E2E.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, and Beads. Current task `mc2-ze255` fixes CI deploy detection for workflow env changes; finish delivery and Dev E2E before closing.

## Delivery

- docs-reviewed: updated - handoff and stage summaries record the deploy env wiring and detector fix without secrets.
- graph-reviewed: no-change-needed - deploy change detection only; no source architecture or route/module ownership boundary changed.

## Explicit defers

- Live click on “Создать курс” with web research was not run because it can trigger real LLM/Tavily generation cost; covered by unit/service tests and Dev E2E around the Career Playbook flow.
