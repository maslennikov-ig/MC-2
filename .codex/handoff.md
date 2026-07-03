# Orchestrator Handoff

Updated: 2026-07-03
Stage: Career Playbook — speed tranche (mc2-b7zm3) delivered; A/B run pending
Branch: `develop`
Beads: `mc2-b7zm3` in_progress (code+docs delivered; awaiting A/B run to close); follow-ups `mc2-m17al` (judge→flash DB promotion post-A/B, depends on b7zm3), `mc2-93rrp` (hardcoded prompt fallback observation); `mc2-db696.61` open (large-corpus run); `mc2-1nots` open (P3, runner getStatus auth quirk)

## Current State

- `mc2-b7zm3` code tranche implemented, reviewed (correctness review APPROVE, no blockers), verified, delivered to `develop`:
  1. **Telemetry**: `invokeLLM` now returns required `durationMs`/`attemptCount` and logs success (`Career Playbook LLM call succeeded`) + per-failed-attempt warn (previously silent catch); `duration_ms`/`attempts` flow into all 5 nodeCost sites; `regeneration_attempts` (per-block map, ground truth incl. failed regens) lands in `cost_breakdown`; handler logs a regeneration summary after `graph.invoke`.
  2. **Batch+parallel regeneration**: `selectPendingCareerPlaybookRegenerations` (plural) picks ALL in-cap flagged blocks; one `blockRegenerator` visit fixes them via `Promise.allSettled` before ONE re-judge. Caps (2/block, 8/window) and budget-exhaustion warns-never-fails semantics unchanged; single-block verdicts behave byte-identically to the old path.
  3. **Env-gated judge A/B**: `CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES` (JSON phase→{modelId,fallbackModelId?}) applied in `resolvePhaseConfig` on both DB and emergency paths; default-off; malformed JSON warn-once+ignore. `docker-compose.dev.yml` worker-dev sets judge→`deepseek-v4-flash` (fallback pro). **Dev-only: shared `llm_model_config` DB rows untouched** (they also serve staging).
  4. **Fix**: `appendCareerPlaybookNodeCost` now spreads the parsed prior breakdown, so `regeneration_attempts` etc. survive manual block regeneration (was rebuilt as `{nodeCosts,total}` only).
- Docs: `docs/career-playbook/retry-strategy.md` — audited retry/reliability baseline (10 layers, failure modes, worst-case math, test-pinned invariants, A/B protocol), all file:line refs verified against delivered code. `docs/plans/mc2-b7zm3-melodic-lemon.md` — approved plan. `docs/career-playbook/live-smoke-dev-run.md` — runbook (was untracked, now committed).
- Verified: shared-types + platform `type-check` green; targeted vitest 121 passed (15 files) + runtime re-run 16/16; root `pnpm type-check && pnpm build` exit 0. Full platform suite: 4393 passed, 3 failed — all 3 are `career-playbook-pdf.test.ts` browser-launch failures (local Playwright wants `chromium_headless_shell-1200`, installed are 1217/1228): pre-existing local-env issue, unrelated to the diff.
- Review nits (non-blocking, deliberately not fixed): mixed missing+success batch keeps fail-closed error semantics (matches old path); override JSON.parse per call not memoized (negligible vs LLM latency); warn-once module state documented in runtime.test.ts comment.

## Next: A/B run (criterion for closing mc2-b7zm3)

1. Push of this tranche triggers CI → Deploy to Dev; `deploy_dev.sh` force-recreates `worker-dev` (API image changed), which applies the compose env override. Verify CI green + dev health 200 first.
2. Run mutation-smoke per `docs/career-playbook/live-smoke-dev-run.md` (owner supplies disposable token; budget ≤ $5; queue `course-generation-dev`; poll 120 min).
3. Compare vs baseline (2026-07-03, playbook `6b55ca50`: 73.4 min, $0.4963, 65 nodeCosts, criterion-#1 pass): wall-clock, success, criterion-#1 (validate via Supabase directly — mc2-1nots), new `duration_ms`/`regeneration_attempts`, cap-exhaustion warning count, judge/regen call counts.
4. Success → close `mc2-b7zm3`; decide `mc2-m17al` (DB promotion, ask owner — staging impact). Regression → revert compose env line (batch regen + telemetry can stay; they don't change model routing).

## Runbook — real dev generation

Non-mutating preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev`
Full runbook with token acquisition and env: `docs/career-playbook/live-smoke-dev-run.md`. Queue MUST be `course-generation-dev`; poll `--poll-timeout-ms 7200000`.
Post-run verification (shared Supabase `diqooqbuchsliypgwksu`, `career_playbooks`): `cost_breakdown->>'total_cost_usd' > 0`, `regeneration_attempts` present, no wrong-language/`{{…}}` in `final_markdown`, duration < 120 min.

## Explicit defers

- `mc2-m17al`: judge→flash DB migration + regenerator→flash evaluation — gated on A/B result and owner approval (staging impact).
- `mc2-93rrp`: hardcoded-prompt-fallback investigation — out of b7zm3 scope by design.

## Closeout Markers

docs-reviewed: updated — retry-strategy.md added; handoff rewritten; plan committed.
project-index: reviewed-no-change — no stable routes/entrypoints changed; verification commands unchanged.
graph-reviewed: pending refresh at session close (`graphify update . --force` after commit).
