# Orchestrator Handoff

Updated: 2026-06-15
Stage: model matrix replacement complete locally and in Dev DB, delivery pending commit/push
Branch: `codex/single-source-course-generation-flow`
Beads: `mc2-5e4ek`, `mc2-5e4ek.1`, `mc2-5e4ek.2`, `mc2-pmrmf.1`, `mc2-pmrmf.1.1`

## Current State

- Replaced active runtime model IDs per user request:
  - `qwen/qwen3.5-plus-02-15` -> `qwen/qwen3.7-plus`
  - `deepseek/deepseek-v3.2` -> `deepseek/deepseek-v4-flash`
  - `openai/gpt-5.4` -> `google/gemini-3.5-flash`
  - `minimax/minimax-m2.5` -> `minimax/minimax-m3`
  - `openai/gpt-oss-120b` -> `deepseek/deepseek-v4-flash`
- Added runtime normalization for these retired IDs and collision protection: if primary/fallback both normalize to `deepseek/deepseek-v4-flash`, fallback becomes `qwen/qwen3-235b-a22b-2507`.
- Added Supabase data migration `20260615120000_replace_retired_llm_model_ids.sql`.
- Live Dev `public.llm_model_config` updated and display names normalized.

## Verification

- Targeted Vitest passed: `load-default-phase-configs`, `stage6-fallback-topology`, Stage 5 `cost-calculator`, shared `LLMClient`, legacy `llm-client` (5 files / 110 tests).
- `pnpm type-check` passed.
- `pnpm build` passed.
- `git diff --check` passed.
- Dev DB verification passed: retired primary count 0, retired fallback count 0, same primary/fallback count 0, display mismatch count 0.

## Explicit defers

- `mc2-pmrmf.1`: model config replacements are implemented and verified locally plus in Dev DB; dev E2E rerun remains pending.
- `mc2-pmrmf.1.1`: add read-only model config health check for deprecated provider model IDs.
- `mc2-5e4ek.1`: fix Career Playbook viewer-editor authenticated E2E fixture/API failure.
- `mc2-5e4ek.2`: centralize Stage 5 structural quality UI state contract and add behavioral UI tests.

## Next recommended

Next stage id: `mc2-pmrmf`
Recommended action: rerun dev Career Playbook -> course E2E against the updated model matrix.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue `mc2-pmrmf`: rerun the dev Career Playbook -> course E2E against the updated Dev DB model matrix. Verify Stage 4 no longer calls retired models, the pipeline reaches Stage 5, and role_playbook_bridge structural assertions pass. Start from `bd show mc2-pmrmf.1`, inspect any new runtime errors, and do not deploy unless explicitly authorized.

## Closeout Markers

docs-reviewed: updated - handoff and Supabase data migration record the model matrix replacement; no durable product docs required beyond config/migration.
graph-reviewed: no-change-needed - model ID/config replacement only; no architecture or call graph discovery required.
