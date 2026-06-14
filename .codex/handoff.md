# Orchestrator Handoff

Updated: 2026-06-14
Stage: `mc2-5e4ek` review-and-fix complete, delivery pending commit/push
Branch: `codex/single-source-course-generation-flow`
Beads: `mc2-5e4ek`, `mc2-5e4ek.1`, `mc2-5e4ek.2`, `mc2-pmrmf.1`, `mc2-pmrmf.1.1`

## Current State

- Accepted correctness, improvement, QA, docs, and local prompt-regression findings.
- Fixed Stage 5 profile preservation for Career Playbook bridge job inputs.
- Added section-count structural blocker plus UI/i18n message.
- Recompute `generation_metadata.quality_scores.structure` after Stage 5 edit, regeneration, chat structural operation, and element add/delete.
- Updated docs and `.codex/stages/mc2-5e4ek/` artifacts.

## Verification

- Targeted backend tests passed: 6 files / 10 tests.
- Targeted web eslint for Stage 5 UI files passed.
- `pnpm type-check`, `pnpm build`, and `git diff --check` passed.
- Dev read-only Career Playbook preflight passed.
- Playwright Career Playbook E2E is not fully green: 4/5 passed; authenticated viewer-editor flow fails with `Role Guide is unavailable / Failed to fetch` (`mc2-5e4ek.1`).

## Explicit defers

- `mc2-pmrmf.1`: live DB model config was updated from deprecated Grok/Xiaomi IDs to `deepseek/deepseek-v4-flash`; dev E2E rerun remains pending.
- `mc2-pmrmf.1.1`: add read-only model config health check for deprecated provider model IDs.
- `mc2-5e4ek.1`: fix Career Playbook viewer-editor authenticated E2E fixture/API failure.
- `mc2-5e4ek.2`: centralize Stage 5 structural quality UI state contract and add behavioral UI tests.

## Next recommended

Next stage id: `mc2-5e4ek.1`
Recommended action: Fix the Career Playbook viewer-editor authenticated E2E failure before claiming full E2E green.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Fix `mc2-5e4ek.1`: Career Playbook viewer-editor authenticated Playwright fixture fails with `Role Guide is unavailable / Failed to fetch` even when local backend API is running on `localhost:3456`. Reproduce with `TMPDIR=/tmp PORT=3456 pnpm --filter @megacampus/course-gen-platform dev` plus `PLAYWRIGHT_PORT=3101 pnpm --filter @megacampus/web test:e2e:career-playbook`, inspect tRPC/browser/server errors, fix the fixture/API/auth/runtime cause, then rerun the suite.

## Closeout Markers

docs-reviewed: updated - course-generation structure quality spec, Career Playbook architecture, Stage 4/5 READMEs, and Supabase DB reference.
graph-reviewed: updated - `graphify update .` rebuilt code graph without LLM/API extraction.
