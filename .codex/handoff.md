# Orchestrator Handoff

Updated: 2026-07-03
Stage: Career Playbook — model-routing hardening + shipped-fix validation
Branch: `develop`
Beads: `mc2-db696.62` + `mc2-gusxd` + `mc2-t5auh` closed; `mc2-db696.61` open (evaluate/measure, unblocked, needs one real run); `mc2-irt6v` recovered (see below)

## Current State

- `mc2-db696.62` DONE and delivered: Career Playbook LLM runtime now threads the rendered prompt token count into `getModelForPhase` (fixes always-`standard`-tier routing so large source-evidence packs can reach the extended-context model) and adds a max-context output guard (`guardOutputAgainstContextWindow`) that clamps output tokens to `maxContextTokens` (warn + 512 floor when the prompt over-fills the window). Commits `d90d0a91` (code) + `321d7b68` (beads), pushed to `origin/develop`, in sync.
- Verified: `pnpm type-check` exit 0; 139 career-playbook stage unit tests pass (4 new `runtime.test.ts` cases); independent correctness review APPROVE, no blockers; CI/CD run `28657970161` green and **Deploy to Dev success** — fixes are live on `https://dev.ai.megacampus.ru` (health 200).
- `mc2-gusxd` DONE (`70e3b87a`): cache-first tier resolution (`resolvePhaseTierFromCache`) removes the per-call 2-tier DB fetch + phase-cache bypass introduced by token-aware routing; model selection unchanged. 37 model-config tests (+5) + 330 stage/shared tests pass.
- `mc2-t5auh` DONE (`d8ef574f`): follow-up-questions LLM cost now persisted into `cost_breakdown` via a shared accumulator; handler reuses the shared sum. Digest-refresh is deterministic (no LLM cost). Closes the follow-up cost-accounting hole.
- `mc2-db696.61` (P2, open): evaluate phase-specific source-evidence budgets — evaluation recorded (real target = follow-up-questions generator's 250k reuse; proposed ~24–32k override; block/group gen is a no-op). Now UNBLOCKED (t5auh persists follow-up cost) but stays evaluate/measure pending ONE real large-corpus run to justify the ~1-line override.
- `mc2-irt6v` (still marked BLOCKED but appears RECOVERED): both `https://ai.megacampus.ru` and `https://dev.ai.megacampus.ru` now return HTTP 200; the develop→dev CI/CD deploy succeeded, so the VPS/network perimeter is reachable again. No code fix was applied here; recovery was infra-side. User to confirm and close.

## Career Playbook shipped-fix validation (criterion #1)

- Code-level: CONFIRMED — 140 stage/orchestrator/cost tests pass across the shipped fixes (graph, cross-block-judge, processor-ttl, model-config-service, admin costs, runtime).
- Live-data: all persisted `career_playbooks` rows predate the 2026-07-03 fixes and carry `cost_breakdown.total_cost_usd = 0`. Pre-fix TTL runaways confirmed in data (167 / 1928 / 113 min) — the P1 attempts cap targets these.
- Live-generation: fixes are now deployed to dev, but a REAL generation requires the credential-gated mutation-smoke (bearer token + disposable fixtures + budget + `course-generation-dev` queue). Must be launched by a human holding the token — see runbook below.

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

1. Run the mutation-smoke above to close criterion #1 empirically; then reassess `mc2-db696.61` with real per-phase cost data.
2. Address `mc2-gusxd` (cache-aware token routing) in `model-config-service`.
3. Confirm/close `mc2-irt6v` now that both sites are reachable.

## Closeout Markers

docs-reviewed: updated - handoff rewritten to current state; runbook + verification query recorded.
project-index: reviewed-no-change - no stable routes/entrypoints/verification commands changed.
graph-reviewed: updated - `graphify update . --force` after the runtime.ts change; graph now at `b3386855` code state (52435 nodes).
