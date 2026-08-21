# Runbook: proving the cost ledger with one paid run

**Why this exists.** Over 2026-08-20 nine defects in cost accounting were found, fixed
and shipped to dev and staging. Every one was invisible to the test suite and only
provable against real data. The ledger has never recorded a real edit: `generation_trace`
held **zero** `stage_edit` rows when that work finished, and nothing has run since. The
wiring is verified; the behaviour is not.

Twice before, a paid run found defects no test had. Expect this one to as well. Finding
one is the run succeeding, not failing.

Open task this closes or updates: `mc2-z0xr3` — reconcile a course's recorded cost
against the OpenRouter invoice. On 2026-08-16 a course showed $0.031 while the provider
billed $0.065, and there was no way to see where the difference lived.

## What this run exercises first

`updateStorageQuota` in `packages/course-gen-platform/src/shared/qdrant/lifecycle.ts`
now throws when its RPC fails. It used to write only `updated_at` while claiming to
update the counter, which is how `organizations.storage_used_bytes` sat at 0 for ten
months and no upload could ever exceed a quota. Document upload is the first thing that
touches it.

If an upload fails with `Failed to update storage quota`, that is a real defect
surfacing. Capture it; do not retry past it.

Also newly live: editing spend records under stage `stage_edit` (the CHECK constraint
that rejected it is fixed), and chat intent classification, Stage 6 generation, image
calls, served model variants and genuine $0 calls are all priced.

Since 2026-08-21 three more things are live and this run is the first to exercise them:

- **Prices come from the provider, not the catalogue.** Each call's `x-generation-id` is
  read from the response headers and settled against `GET /api/v1/generation`, which
  reports what OpenRouter actually charged. The catalogue is now an estimate for budgets.
  The report counts how many rows were settled this way.
- **A provider that fails is skipped for the rest of that call.** Not a standing
  blocklist — the next call starts again at the cheapest endpoint. Every request also
  carries a `max_price` ceiling at 1.5x the catalogue rate.
- **Career Playbook spend is in the TOTAL.** It lives in `career_playbooks.cost_breakdown`
  rather than `generation_trace`, and the report now reads both. Before this, half the
  product was outside every reconciliation.

## Steps

1. Record the start time before touching anything. The reconciliation needs it.

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ    # keep this as T0
   ```

2. Ask the user which environment and what topic. Default to dev,
   `https://dev.ai.megacampus.ru`; staging is `https://ai.megacampus.ru`. They share one
   Supabase database. Career playbook lives at `/<locale>/career-playbook`. Keep the
   course small — the point is covering the pipeline, not volume.

3. The user drives the UI. Watch for failures rather than guessing:

   ```bash
   ssh megacampus-prod "docker logs --since 10m megacampus-worker-dev 2>&1 \
     | grep -iE 'error|failed|quota|cost' | tail -30"
   ```

   Repeat for `megacampus-worker-stage6-dev` and `megacampus-worker-stage7-dev`.

4. After both finish, run the cost report. It is read-only and never writes.

   ```bash
   cd packages/course-gen-platform
   pnpm cost:report <courseId>
   pnpm cost:report --since <T0>
   ```

5. Then have the user make one chat edit to the finished course. That is the only way
   `stage_edit` rows appear. Re-run the report.

## Acceptance

Report pass or fail on each line, naming what failed.

- Both generations complete without a stage failing.
- `billed calls with NO price` is **0**. Anything above 0 is money the ledger still
  misses; the report lists the exact stage, phase, step and model — quote them. This
  counts only rows a recorder stamped as a paid call: stage progress markers such as
  `judge_complete` carry token totals and are unpriced on purpose, because the calls they
  summarise price themselves. The report reports those separately as `progress markers`.
- `priced by the provider` is above 0, and close to the number of billed calls. A low
  figure means the generation lookup is not landing — quote it.
- `stage_edit rows` is above 0 after the chat edit, and their cost is not null.
- `courses.estimated_cost_usd` matches the trace sum. The report prints both and says
  `match` or `MISMATCH`.
- The report's TOTAL is compared against the OpenRouter figure for T0 → now, either the
  dashboard or the delta of `GET /api/v1/credits`. Ask the user for that figure; do not
  estimate it. A gap is the finding — and now that most rows carry the provider's own
  charge, a gap points at a call that left no row rather than at a wrong price.
- The worker logs show at least one retry that routed around a provider, if any call
  failed: search for `routes around it`. If nothing failed, say so — it is not a failure
  of this line.
- No upload failed on the storage quota, and the counter moved:

  ```sql
  select name, storage_used_bytes from organizations where storage_used_bytes > 0;
  ```

## Stop and ask

- Confirm a paid run is intended now before spending anything.
- If a generation stalls past 15 minutes with no movement in the worker logs, stop and
  ask rather than restarting. A stalled worker is itself a finding — Stage 7 had a
  32-minute stall earlier in this epic.
- Do not run `docker image prune -a` on the host. On 2026-08-20 it removed the pinned
  Docling rollback image and cost three failed deploys re-pulling 8.5 GB.
  `docker builder prune -af` is the safe one. The rollback images are now pinned as
  `hold/docling-mcp-rollback:pinned` and `hold/docling-mcp-previous:pinned` so ordinary
  pruning cannot take them.
- Do not fix anything mid-run. Finish the observation, then propose.

## Filing what you find

`bd create "BUG: ..." -t bug -p <0-3> -d "<file>:<line> — what, evidence, fix"` then
`bd update <id> --add-label code-review`. Reference `mc2-z0xr3`.
