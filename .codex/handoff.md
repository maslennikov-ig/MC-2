# Orchestrator Handoff

Updated: 2026-07-04 (evening)
Stage: Career Playbook — judge/regen fix package (epic `mc2-db696.104`) CLOSED: A/B run e12a46ad on new worker code passed all epic gates
Branch: `develop`
Beads: epic `mc2-db696.104` + all 7 children CLOSED with live evidence; `mc2-93rrp` CLOSED; `mc2-m17al` open (owner decision — judge→flash DB promotion, now with strong data); `mc2-db696.61` open

## Current State

- **A/B run #2 (playbook `e12a46ad`, 2026-07-04 14:13–14:33 UTC, NEW worker code) vs baseline b866d2f5**:
  - Wall-clock **19.7 min** vs 44.4 (**-56%**); cost **$0.1278** vs $0.2404 (**-47%**).
  - Regen attempts **14** (11 blocks, 3 at 2-cap) vs 39 calls (13/26 at cap); no window near the 8-cap.
  - Judge: **12 calls, all v4-flash, all attempt=1, zero 300s timeouts** (baseline: 2×300s + pro escalations). Max judge input 21.2k tok (delta re-judge bounded it below the 28k fallback gate — gate armed but unneeded).
  - Structural proof of new code: spec `deviations=[]` + normalization log (canonical topics), all 26 doc headings canonical, CTA in block 25, field-to-fill only as genuine template fields, no duplicate deal-stage models, criterion #1 pass (evidence pass, PDF, share).
  - **Run #1 caveat** (playbook `35602db1`, 11:13 UTC): executed OLD worker code (CI lint 96/95 blocked Deploy to Dev) — invalid for attribution but a same-code variance data point (12 regens/24 min/$0.084): single-run deltas < ~2x are noise; structural markers are the real evidence.
- **Late root cause found via run #2**: byte-identical stub diagrams in blocks 10/11/16 come from `final-assembler.ts` `appendMermaidSection` (exact-heading check → hardcoded stub appended next to rich diagrams), NOT from judge/regenerator prompts. Fixed in `15c47795` (any fenced mermaid satisfies the section; fallback kept for zero-diagram blocks), unit-pinned; lands on dev with the CI deploy of that commit — confirm visually on the next routine run.
- Commits this session (develop, all pushed): `59ef88d5` 93rrp docs, `c588a9d4` .104.2, `9da92802` .104.6, `fa88561b` .104.5, `4db7cd97` 1slzl, `de74537a` .104.1, `8967b2db` .104.4 prompts, `d856aff7` .104.3, `14efe1e0` handoff, `19e6d8c3` lint refactor (module extraction), `15c47795` assembler stub fix.
- CI: lint budget is `eslint src --max-warnings=95` (course-gen-platform) — one new max-lines warning fails Lint and silently skips Deploy to Dev. Always verify `megacampus-worker-dev` image date before attributing live-run behavior to new code.
- Run artifacts (gitignored): `packages/course-gen-platform/artifacts/career-playbook-smoke/` — b866d2f5-era baseline row still in DB + two run artifacts (35602db1, e12a46ad) for future A/B.

## Next

1. `mc2-db696.61`: source-evidence budgets evaluation (unchanged).

## Verification run #3 (dea26647, 2026-07-04 15:18–15:33 UTC) — both open observations CLOSED

- DB-served judge=flash confirmed live (container env has no override; 11/11 judge calls flash attempt=1, zero timeouts, max input 22.8k).
- Stub diagrams GONE (fix `15c47795`): blocks 10/11/16 each carry exactly their own rich diagram; zero canonical stub headings.
- Metrics trend across the three runs: 44.4 min / $0.240 / 39 regens (baseline, old code) → 19.7 / $0.128 / 14 (fix package) → **15.6 / $0.078 / 5 regens, zero caps** (fix package + stub fix + DB routing). Evidence pass, headings canonical, CTA present.

## mc2-m17al CLOSED (owner-approved, 2026-07-04)

- Judge promoted to v4-flash/pro-fallback in `llm_model_config` — migration `20260704150000_promote_career_playbook_judge_flash.sql` APPLIED to the shared DB (deliberate staging impact) and verified; routing test pins it. Note: CI does NOT auto-apply migrations — this one was applied manually via Supabase MCP; the committed file keeps history consistent.
- `CAREER_PLAYBOOK_PHASE_MODEL_OVERRIDES` removed from `docker-compose.dev.yml` (routing now DB-served, identical effective config; lands on dev with the CI deploy).
- Regenerator stays on pro (decision recorded on the bead: convergence-critical, flash risks cap-exhaustion criterion-#1 leaks for ~$0.05/run).

## Explicit defers

- `mc2-m17al`: owner decision (shared DB diqooqbuchsliypgwksu, staging impact).
- .104.2 complement (per-block digests for final-judge input) — unnecessary at current input sizes; recorded on the closed bead.
- routeAfterJudge vs blockRegenerator block-id selection divergence — recorded on closed `mc2-db696.104.6`; low priority now that zero-regen skip covers the symptom.
- mc2-1slzl option B (spec-driven dynamic topics) — owner decision if ever wanted; option A shipped and validated.

## Runbook — real dev generation

Non-mutating preflight: `pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev`
Full runbook (browser-console token method is primary): `docs/career-playbook/live-smoke-dev-run.md`. Queue MUST be `course-generation-dev`; poll `--poll-timeout-ms 7200000`; cap `--max-cost-usd 1` is 4x the observed cost. Use an ABSOLUTE `--dir` path (relative resolves against the shell cwd).
Before any run meant to validate new pipeline code: `ssh megacampus-prod "docker inspect megacampus-worker-dev --format '{{.Created}}'"` — CI Deploy to Dev only runs on fully green CI.
Artifacts auto-persist to `packages/course-gen-platform/artifacts/career-playbook-smoke/`; cleanup is manifest-only (row deletion is a manual step by exact id).

## Closeout Markers

docs-reviewed: updated — handoff rewritten with A/B results and CI/deploy gotchas; runbook already updated this session (artifacts, cleanup semantics, token method).
graph-reviewed: updated — `graphify update --force` after the final refactor/assembler fix (node count legitimately dropped 52503→52495 from module extraction).
