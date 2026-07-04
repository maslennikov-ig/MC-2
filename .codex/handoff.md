# Orchestrator Handoff

Updated: 2026-07-04
Stage: Career Playbook — judge/regen fix package (epic `mc2-db696.104`) CODE-COMPLETE; epic close gated on a paid dev A/B live-smoke run (owner token + go-ahead required)
Branch: `develop`
Beads: `mc2-93rrp` CLOSED (prompt serving source resolved); `mc2-1slzl`, `mc2-db696.104.1..6` in_progress (code landed, live acceptance pending); `mc2-m17al` open (owner decision — judge→flash DB promotion); `mc2-db696.61`, `mc2-1nots` open (unrelated)

## Current State

- **All 7 fix-package tasks implemented, unit-verified, committed to develop** (one commit per bead):
  - `59ef88d5` mc2-93rrp: prompt serving source = hardcoded registry (prompt_templates has zero career stage-key rows; only `career_playbook_card`). Documented in `docs/career-playbook/architecture.md`; prompt edits in `career-playbook-prompts.ts` are effective. Bead CLOSED.
  - `c588a9d4` .104.2: judge calls with estimated prompt tokens > `CAREER_PLAYBOOK_JUDGE_FALLBACK_TOKEN_THRESHOLD` (default 28000) start on the fallback model (pro) — kills the 2x300s final-judge flash timeouts. Retry net untouched. Fix-plan item 2 (per-block digests for final-judge input) deferred — comment on the bead.
  - `9da92802` .104.6: zero-regen pass (all flagged blocks at caps) routes forward instead of re-judging identical content (`state.lastRegenerationBatchSize`). Root-cause finding (routeAfterJudge vs blockRegenerator blockIds divergence) recorded on the bead.
  - `fa88561b` .104.5: live-smoke runner persists `<timestamp>-<playbookId>.md` + `.json` (cost_breakdown from DB row — no tRPC surface exposes it) to gitignored `packages/course-gen-platform/artifacts/career-playbook-smoke/`; `--no-artifact`/`--artifact-dir`; secrets whitelist-pinned by test. Runbook updated (artifacts, manifest-only cleanup semantics, browser-console token as primary path).
  - `4db7cd97` mc2-1slzl: canonical 26-block topic map (`src/shared/prompts/career-playbook-block-topics.ts`) drives the spec-builder prompt + deterministic post-spec normalization (retry-once on substantive deviation, then normalize; invalid spec impossible by construction). Block 25 canon = footer + MegaCampus CTA; forecasting-class role emphasis routed to block_6/block_4 (no dedicated Forecasting block — that would be option B, needs owner decision).
  - `de74537a` .104.1: judge severity by category — 5 critical classes (contradiction, format_minimum, wrong_language, unresolved_placeholder, invented_number); style/tone never regenerates. Category required in LLM structured schema, optional in stored schema; defensive downgrade gate in `mergeJudgeVerdicts`; deterministic verdicts untouched.
  - `8967b2db` .104.4: prompt fixes — no named stub diagrams (judge wording + regenerator "improve existing diagram"), placeholder rule rewritten (realistic examples vs genuine fill-in fields), Mermaid label syntax (double-quoted labels), deterministic minimums stated in owning group prompts, do_not_repeat surfaced to generators (they never referenced block_boundaries before — finding on the bead).
  - `d856aff7` .104.3: delta re-judge — in-window re-judge reviews only regenerated blocks (detected via `judge_verdict` cleared by the regenerator); caps/routing stay full-window; final judge always full; escape hatch `CAREER_PLAYBOOK_DELTA_REJUDGE=off`.
- **Verification (fresh, this session)**: stage+smoke+prompt-contract vitest 245/245; repo-root `pnpm type-check` exit 0; repo-root `pnpm build` exit 0. Pre-commit eslint OOM'd once (fa88561b) — gate run manually with `--max-old-space-size=8192`, exit 0, noted in the commit message.
- Orchestration: 7 parallel worker subagents (waves 1–3, disjoint write zones in the shared worktree); every diff verified by the orchestrator before commit.

## Next

1. **Paid dev A/B live-smoke run** (STOP: needs owner bearer token + explicit go-ahead; budget <= $5, queue `course-generation-dev`):
   - Preflight (non-mutating): `pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev`
   - Full runbook incl. token via browser console: `docs/career-playbook/live-smoke-dev-run.md`
   - Compare vs baseline b866d2f5 (39 regen calls, 21 judge calls, 2x300s timeouts, 44.4 min, $0.2404): expect regen calls well below 39, zero `timed out after 300000ms` judge lines in `megacampus-worker-dev` logs, wall-clock <= 44 min, criterion #1 pass, forecasting content in block_6, block-25 footer with MegaCampus CTA, no stub diagrams / `field to fill` artifacts / duplicate deal-stage models. Artifacts now auto-persist for the comparison.
2. Close `mc2-1slzl` + `mc2-db696.104.1..6` + epic `mc2-db696.104` after the run passes; else file findings per bead.
3. `mc2-m17al` (owner decision — staging impact): judge→flash DB promotion; .104.2 provides the size-gated routing it was waiting for.

## Explicit defers

- `mc2-m17al`: judge→flash `llm_model_config` migration + regenerator→flash evaluation — owner decision (shared DB, staging impact).
- .104.2 fix-plan item 2 (shrink final-judge input via per-block digests) — deferred complement, recorded on the bead; consider only if the size-gated routing proves insufficient.
- routeAfterJudge vs blockRegenerator block-id selection divergence — recorded on `mc2-db696.104.6`; candidate follow-up bead after the A/B run.
- mc2-1slzl option B (spec-driven dynamic topics) — needs owner decision; option A landed.

## Runbook — real dev generation

Non-mutating preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev`
Full runbook with token acquisition (browser-console cookie method is primary) and env: `docs/career-playbook/live-smoke-dev-run.md`. Queue MUST be `course-generation-dev`; poll `--poll-timeout-ms 7200000`.
Post-run verification (shared Supabase `diqooqbuchsliypgwksu`, `career_playbooks`): `cost_breakdown->>'total_cost_usd' > 0`, `regeneration_attempts` present, no wrong-language/`{{…}}` in `final_markdown`, duration < 120 min. Run artifacts land in `packages/course-gen-platform/artifacts/career-playbook-smoke/` (gitignored).

## Closeout Markers

docs-reviewed: updated — architecture.md (prompt serving source), live-smoke-dev-run.md (artifacts, cleanup semantics, token method), handoff rewritten.
graph-reviewed: updated — `graphify update .` after code changes (52503 nodes, exit 0).
