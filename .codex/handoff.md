# Orchestrator Handoff

Updated: 2026-07-03
Stage: Career Playbook — model-routing hardening + shipped-fix validation
Branch: `develop`
Beads: `mc2-db696.62` + `mc2-gusxd` + `mc2-t5auh` + `mc2-irt6v` closed; criterion #1 PASSED on real dev run; `mc2-db696.61` open (evaluate/measure — needs a LARGE-CORPUS run, the smoke was universal/no-source); `mc2-1nots` open (P3, runner getStatus auth quirk)

## Current State

- `mc2-db696.62` DONE and delivered: Career Playbook LLM runtime now threads the rendered prompt token count into `getModelForPhase` (fixes always-`standard`-tier routing so large source-evidence packs can reach the extended-context model) and adds a max-context output guard (`guardOutputAgainstContextWindow`) that clamps output tokens to `maxContextTokens` (warn + 512 floor when the prompt over-fills the window). Commits `d90d0a91` (code) + `321d7b68` (beads), pushed to `origin/develop`, in sync.
- Verified: `pnpm type-check` exit 0; 139 career-playbook stage unit tests pass (4 new `runtime.test.ts` cases); independent correctness review APPROVE, no blockers; CI/CD run `28657970161` green and **Deploy to Dev success** — fixes are live on `https://dev.ai.megacampus.ru` (health 200).
- `mc2-gusxd` DONE (`70e3b87a`): cache-first tier resolution (`resolvePhaseTierFromCache`) removes the per-call 2-tier DB fetch + phase-cache bypass introduced by token-aware routing; model selection unchanged. 37 model-config tests (+5) + 330 stage/shared tests pass.
- `mc2-t5auh` DONE (`d8ef574f`): follow-up-questions LLM cost now persisted into `cost_breakdown` via a shared accumulator; handler reuses the shared sum. Digest-refresh is deterministic (no LLM cost). Closes the follow-up cost-accounting hole.
- `mc2-db696.61` (P2, open): evaluate phase-specific source-evidence budgets — evaluation recorded (real target = follow-up-questions generator's 250k reuse; proposed ~24–32k override; block/group gen is a no-op). Now UNBLOCKED (t5auh persists follow-up cost) but stays evaluate/measure pending ONE real large-corpus run to justify the ~1-line override.
- `mc2-irt6v` CLOSED: both `https://ai.megacampus.ru` and `https://dev.ai.megacampus.ru` return HTTP 200; develop→dev deploy succeeded. Recovery was infra-side (no code fix).

## Career Playbook shipped-fix validation (criterion #1) — PASSED

- Code-level: CONFIRMED — 330 stage/orchestrator/shared tests + `pnpm type-check` green.
- Live-generation (2026-07-03, dev, playbook `6b55ca50`, universal "Sales Manager B2B" fixture, since deleted): ALL criterion-#1 checks passed on real data:
  - `cost_breakdown.total_cost_usd = $0.4963` across 65 nodeCosts (real per-node accounting + persisted follow-up cost).
  - No wrong-language leakage (en fixture → zero Cyrillic); no `{{…}}`/`[[…]]` unresolved placeholders; 27 blocks, `final_markdown` 152 429 chars.
  - Duration 73.4 min (< 120-min TTL cap — no runaway).
- Note: the smoke run was UNIVERSAL (no source files), so it did NOT exercise the 250k source-evidence pack — `mc2-db696.61` still needs a large-corpus run to measure the follow-up-questions budget.
- Runner artifact: the live-smoke runner exited on a getStatus auth quirk (`mc2-1nots`); generation completed server-side regardless and was validated + cleaned up via Supabase directly.

## Runbook — real dev generation for criterion #1

Non-mutating preflight (safe): `pnpm --dir packages/course-gen-platform smoke:career-playbook:live --mode plan --target dev`

Real run (human supplies token + disposable fixtures + budget):

```
export CAREER_PLAYBOOK_SMOKE_TOKEN=<disposable dev user bearer token>
pnpm --dir packages/course-gen-platform smoke:career-playbook:live \
  --mode mutation-smoke --target dev --confirm-live-mutation \
  --trpc-url https://dev.ai.megacampus.ru/api/trpc \
  --queue course-generation-dev \
  --expected-user-id <disposable dev user uuid> \
  --expected-organization-id <disposable dev org uuid> \
  --cleanup-scope playbook-only \
  --max-cost-usd 5 \
  --poll-timeout-ms 7200000 --json
```

Queue MUST be `course-generation-dev` (the dev worker's queue) or the job hangs. `--poll-timeout-ms 7200000` (120 min) matches the TTL cap so the poll does not give up early.

Post-run verification (shared Supabase `diqooqbuchsliypgwksu`, table `career_playbooks`), newest row must show:
`cost_breakdown->>'total_cost_usd' > 0`, `language='ru'` with no wrong-language/`{{…}}` leakage in `final_markdown`, and duration `< 120 min`.

## Next recommended

1. `mc2-db696.61`: run ONE large-corpus (uploaded sources, raw >100k tokens) mutation-smoke to measure the follow-up-questions 250k-pack cost (now persisted); then decide on the ~24–32k override.
2. `mc2-1nots` (P3): fix the runner getStatus auth quirk so the live-smoke can self-validate + self-clean without manual Supabase steps.
3. Optional: investigate the ~47-min early-phase latency observed once (universal playbook, spec/research appeared late) if it recurs.

## Closeout Markers

docs-reviewed: updated - handoff rewritten to current state; runbook + verification query recorded.
project-index: reviewed-no-change - no stable routes/entrypoints/verification commands changed.
graph-reviewed: updated - `graphify update . --force` after the runtime.ts change; graph now at `b3386855` code state (52435 nodes).
