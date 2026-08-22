# Runbook: proving the cost ledger with one paid run

**Why this exists.** Over 2026-08-20 nine defects in cost accounting were found, fixed
and shipped to dev and staging. Every one was invisible to the test suite and only
provable against real data. That is the standing reason to run this: unit tests verify the
wiring, and only a paid run verifies the behaviour.

Twice before, a paid run found defects no test had. Expect this one to as well. Finding
one is the run succeeding, not failing.

**Last result — 2026-08-22, `27d4453da`: two runs, every acceptance line passed.**

Course `9a22e60d`, the judge and image acceptance (`mc2-bxmje`): TOTAL $0.030963 against a
`/credits` delta of $0.030962, 19 of 19 billed calls priced by the provider, one
`stage_edit` row. Course `04c03c82`, the first run **with an uploaded document**
(`mc2-b7olk.4`): TOTAL $0.037501 against a delta of $0.037501, 25 of 25 priced. Both found
a defect, which is the run working: `mc2-80o1t`, one `null` from the model discarding a
lesson's whole self-review.

Earlier, on `7c80e479c`: TOTAL $0.202480 against $0.202481, with a third figure summed from
`GET /api/v1/generation` over 65 ids agreeing to the same six decimals.

So the purpose of the next run is to **measure a change**, not to look for holes — and it
does not need to be this whole runbook unless the change touches the ledger.

**Nobody drives the UI.** The owner's answer of 2026-08-20 stands: these runs are driven
from code. Mint a session with `auth/v1/admin/generate_link` → `auth/v1/verify`
(`token_hash` + `type` only), then call `https://dev.ai.megacampus.ru/api/trpc/<procedure>`
with `Authorization: Bearer`. The course flow is a `courses` insert under RLS then
`generation.initiate`; the playbook flow is `careerPlaybook.session.start` →
`submitAnswer` per fixed key → `business_context` → `generation.requestFollowups` →
`submitAnswer` per follow-up **by `question_id`** → `generation.approveAndGenerate`.
`requestFollowups` takes a record of whole answer objects, not of strings.

The task this existed for is closed: `mc2-z0xr3` — reconcile a course's recorded cost
against the OpenRouter invoice. On 2026-08-16 a course showed $0.031 while the provider
billed $0.065, and there was no way to see where the difference lived; on 2026-08-22 the
two figures agreed to the sixth decimal. File whatever the next run finds against a new
issue and reference that one.

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

Live since the 2026-08-21 run, and confirmed by it:

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

Exercised for the first time by the 2026-08-22 run, and all three held:

- **Images are priced like everything else.** The image service used to keep a private
  price table — `openai/gpt-5-image-mini` at $0.007 against a real $0.045080, 6.4x low —
  and its client was built by hand, so no `x-generation-id` ever reached it. It now goes
  through the shared transport and settles against the provider like a token call.
- **The playbook cover reaches a ledger at all.** It belongs to no course, so
  `generation_trace` had no row to charge it to and it was logged as unattributable. It is
  now a `cardImage` node cost inside `career_playbooks.cost_breakdown`.
- **The default model is a pinned snapshot.** `deepseek/deepseek-v4-flash-0731` in place of
  the `~deepseek/deepseek-v4-flash-latest` alias, which silently followed its family on
  2026-08-17 and took median latency from 8.7s to 102s. The alias resolved to this same
  snapshot on 2026-08-21, so the pin froze the behaviour rather than changing it.

## What this reconciliation cannot see

**Stage 7 audio is not on this bill.** `stage7-enrichments/handlers/audio-handler.ts`
builds an OpenAI client with no `baseURL`, so it calls `api.openai.com` and is charged to
a separate OpenAI account. It has no generation record, and the `/api/v1/credits` delta
cannot see it in principle. Its cost is estimated from a per-character TTS rate in that
handler's own table.

So "the report's TOTAL matches the OpenRouter figure" means _the OpenRouter spend is fully
accounted for_. It does not mean every dollar the run cost is accounted for. If the run
generated audio, the OpenAI account has to be read separately or the audio named as
excluded. Whether audio stays on a direct OpenAI account is an open question for the owner
(`mc2-dgw4u`).

## Steps

1. Record the start time before touching anything. The reconciliation needs it.

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ    # keep this as T0
   ```

2. Ask the user which environment and what topic. Default to dev,
   `https://dev.ai.megacampus.ru`; staging is `https://ai.megacampus.ru`. They share one
   Supabase database. Career playbook lives at `/<locale>/career-playbook`. Keep the
   course small — the point is covering the pipeline, not volume.

   **Uploading a document is fine now.** It used not to be: evidence extraction priced
   itself into the document-evidence coverage registry and nowhere else, so an upload put a
   knowingly unattributable delta into the window (`mc2-b7olk.4`). It threads `costContext`
   through `StructuredEvidencePort` since `eb939d21f`, and the run of 2026-08-22 proved it
   live — course `04c03c82`, one uploaded document, `stage_4_evidence_map` and
   `stage_4_conflict_detection` each a priced `generation_trace` row carrying
   `billedByProvider`, window TOTAL $0.037501 against a `/credits` delta of $0.037501.
   The registry is analytics; the money is in one table.

   Keep the document small, and expect Stage 2 in the window — chunking, embedding, Qdrant
   upload and one `stage_2_summarization` call.

3. Drive both generations from code (see above). Watch for failures rather than guessing:

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

5. Then make one chat edit to the finished course — `generation.chat` with
   `chatType:'node'` and `blockPath: 'sections[0].lessons[0]'`, then `applyProposal`. That
   is the only way `stage_edit` rows appear. Ask for something the schema can actually
   change: a rename produced a proposal on 2026-08-22 where rewriting a lesson
   _description_ returned advice and no proposal, because that field is not editable.
   Re-run the report.

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
  charge, a gap points at a call that left no row rather than at a wrong price. Stage 7
  audio is outside this comparison by construction; see the section above.
- The card image and the playbook cover carry the provider's charge, not an estimate. In
  `generation_trace`, `output_data.billedByProvider` is true for `step_name='image_call'`;
  in `career_playbooks.cost_breakdown`, the `cardImage` node has `billed_by_provider`.
  A cover recorded at $0.007 is the old private table still in play.
- No `~`-alias appears in the routing that ran:

  ```sql
  select phase_name, model_id, fallback_model_id from llm_model_config
  where is_active and (model_id like '~%' or fallback_model_id like '~%');
  ```

- The worker logs show at least one retry that routed around a provider, if any call
  failed: search for `routes around it`. If nothing failed, say so — it is not a failure
  of this line.
- A third figure, when the first two disagree and you need to know which is wrong: sum
  `GET /api/v1/generation?id=` over every id in `generation_trace.output_data.generationId`
  and `career_playbooks.cost_breakdown.nodeCosts[].generation_id`. It is free, it comes
  from the provider rather than from our arithmetic, and it separates "a row carries the
  wrong price" from "a call left no row at all". Ids the provider cannot find are calls
  that were never billed.

- If, and only if, the run uploaded a document: no upload failed on the storage quota, and
  the counter moved:

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
