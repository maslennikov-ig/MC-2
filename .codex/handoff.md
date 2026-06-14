# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-sbv5y`
Branch: `codex/propagate-tavily-deploy-secret`
Beads: `mc2-sbv5y`

## Current State

- Career Playbook course bridge preview now defaults course size to `auto` (`Оптимальный (ИИ-анализ)`), and create persists `course_size = auto` unless the user overrides it.
- `TAVILY_API_KEY` is configured in ignored local backend env and GitHub Actions repo secrets; deploy workflows write it into `.env.dev` and `.env.production`; tracked files contain only placeholders.
- Career Playbook E2E passed against Dev (`https://dev.ai.megacampus.ru`) after the course-size bridge change.

## Verification

- Passed RED: backend bridge unit test failed while preview/create still returned `standard`.
- Passed GREEN: `pnpm --filter @megacampus/course-gen-platform test -- career-playbook-course-bridge.service.test.ts`.
- Passed: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`.
- Passed: `cd packages/course-gen-platform && node -r dotenv/config -e "console.log(process.env.TAVILY_API_KEY ? 'TAVILY_API_KEY=set' : 'TAVILY_API_KEY=missing')"`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-muhsu`; Beads `mc2-muhsu` closed and `bd dolt push` completed.
- Passed dev delivery: `.claude/scripts/push-dev.sh --yes` promoted the feature branch to `develop` and printed `Beads Dolt remote pushed`.
- Passed Dev GitHub Actions workflow for the code-bearing merge: CI, Docker API build, contract tests, Deploy to Dev, and Verify deployment.
- Passed Dev E2E: `PLAYWRIGHT_BASE_URL=https://dev.ai.megacampus.ru PLAYWRIGHT_DISABLE_VIDEO=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome pnpm --filter @megacampus/web test:e2e:career-playbook` (`5 passed`).
- Passed deploy-secret checks: `gh secret list` shows `TAVILY_API_KEY`; tracked secret grep found no actual key value; `.github/workflows/ci-cd.yml` parses as YAML.

## Next recommended

Next stage id: `mc2-sbv5y`.
Recommended action: none for this task.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`; read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, and Beads. Current task `mc2-sbv5y` is delivered; select the next ready Beads task before changing files.

## Delivery

- docs-reviewed: updated - handoff, stage summaries, backend env example, and workflow env wiring describe the new default and Tavily configuration without secrets.
- Delivered to `develop` via `.claude/scripts/push-dev.sh --yes`.
- graph-reviewed: no-change-needed - behavior/default and deploy env wiring only; no architecture or route/module ownership boundary changed.

## Explicit defers

- None.
