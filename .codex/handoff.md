# Orchestrator Handoff

Updated: 2026-07-04
Stage: Career Playbook — speed tranche (mc2-b7zm3) CLOSED: A/B run passed (-40% wall-clock, -52% cost)
Branch: `develop`
Beads: `mc2-b7zm3` closed (A/B evidence in comments); `mc2-m17al` unblocked (judge→flash DB promotion — convergence data attached, needs owner decision on staging impact); `mc2-93rrp` open (hardcoded prompt fallback observation); `mc2-db696.61` open (large-corpus run); `mc2-1nots` open (P3, runner getStatus auth quirk — did NOT reproduce this run)

## Current State

- **A/B run completed 2026-07-04** (playbook `b866d2f5-c2ee-4968-9917-ce3775ff600c`, "Sales Manager B2B", dev mutation-smoke, runner exit 0, all evidence checks pass):
  - Wall-clock **44.4 min** vs baseline 73.4 min (**-40%**); cost **$0.2404** vs $0.4963 (**-52%**).
  - Criterion #1 PASS: 27/27 blocks, deterministic checks (Mermaid/anti-goal/decision-matrix/failure-mode), PDF export 546KB, public share rendered. Success rate not degraded.
  - New telemetry live in `cost_breakdown`: per-call `duration_ms` + `regeneration_attempts` map (26 blocks tracked, block_8 needed no regen, 13/26 hit the 2-attempt cap).
  - Judge on v4-flash: 19/21 judge calls (785s, $0.036). **2 final cross-block judge calls (largest contexts ~31.5k input tokens) failed on flash and escalated to v4-pro via phase retry net** (attempts=2 each, 649s = 24% of wall-clock; one returned only 29 output tokens — check response validity before m17al promotion). Escalation worked as designed; run still passed.
  - Regenerator (v4-pro) is now the dominant node: 39 calls, 1434s serial, $0.157 of $0.2404 total.
  - mc2-1nots (getStatus auth quirk) did not reproduce — runner polled to completion despite token expiring mid-run window.
- Smoke playbook `b866d2f5` left in dev DB as A/B evidence (cleanup manifest emitted by runner but not executed; delete by exact id when evidence no longer needed — user/org in the manifest are NOT disposable, do not touch).
- Prior tranche state (code, docs, reviews, verification) — see git history and closed `mc2-b7zm3`; retry baseline in `docs/career-playbook/retry-strategy.md`, runbook in `docs/career-playbook/live-smoke-dev-run.md`.

## Next

1. `mc2-m17al` (owner decision required — staging impact): promote judge→v4-flash from compose env override to `llm_model_config` DB rows; before that, investigate the 2 large-context flash judge failures + the 29-output-token pro response (truncation/validity). If large-context judge stayed on flash, run would be ~34 min.
2. `mc2-93rrp`: hardcoded-prompt-fallback investigation (29x per run).
3. `mc2-db696.61`: large-corpus run.

## Runbook — real dev generation

Non-mutating preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev`
Full runbook with token acquisition and env: `docs/career-playbook/live-smoke-dev-run.md`. Queue MUST be `course-generation-dev`; poll `--poll-timeout-ms 7200000`.
Token без пароля: браузерная консоль на dev (cookie `sb-…-auth-token`, base64url после префикса `base64-`) или Network → `Authorization: Bearer …`.
Post-run verification (shared Supabase `diqooqbuchsliypgwksu`, `career_playbooks`): `cost_breakdown->>'total_cost_usd' > 0`, `regeneration_attempts` present, no wrong-language/`{{…}}` in `final_markdown`, duration < 120 min.

## Explicit defers

- `mc2-m17al`: judge→flash DB migration + regenerator→flash evaluation — A/B passed; still gated on owner approval (staging impact) and the large-context flash-failure investigation above.
- `mc2-93rrp`: hardcoded-prompt-fallback investigation — out of b7zm3 scope by design.

## Closeout Markers

docs-reviewed: updated — handoff rewritten with A/B results; runbook unchanged (token-via-browser hint added here).
project-index: reviewed-no-change — no code changed this session (run + analysis only).
graph-reviewed: no-change-needed — no code/architecture changes; docs-only handoff update.
