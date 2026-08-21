# Orchestrator Handoff

Updated: 2026-08-21. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries.

## Current stage

The Career Playbook quality track is **accepted** (`mc2-db696.110`, editorial read 4.4 / 5 against a
4.0 threshold, run cost USD 0.352; evidence in `.codex/stages/mc2-db696.110/evidence/`). Its two
process rules are in `06-quality-acceptance.md` and still hold: read the artifact before calling a
run accepted, and clean up **after** the editorial pass. Epic `mc2-qrdkt` is closed; no stage is
active.

## RAG retrieval and chunking repaired (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`; `mc2-lrav0` on the owner's "no backfill".
Details in `54a5c5e44`, `c18e2a9ea` and the stage summaries. What still constrains work:

- Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
  ceiling), and a test rejects any literal above that ceiling. The old `0.7` was unreachable against
  embeddings topping out near 0.58, which made hybrid search BM25-only.
- Degenerate parents no longer reach the index (`selectIndexableChunks`); search drops repeated text
  as a safety net. Production was cleaned 13712 → 6856 points. Both chunking paths were measured and
  are healthy; `groupIntoParents()` was accused twice and caused neither defect.

## Parent context expansion (2026-08-13, `217e3d112`)

`specs/027-parent-context-expansion/spec.md`, implemented. Only children are indexed, plus any
childless parent; the passage is rebuilt at retrieval time from siblings. Expansion runs **after
reranking** in the two paths that rerank, and the budget is a ceiling on what it adds, never a reason
to drop a retrieved chunk. On for Stage 5 section RAG, Stage 6 lesson RAG and `search_documents`; off
for evidence retrieval, where a citation must point at the fragment that matched. `getParentChunk` is
gone. It is a no-op on points indexed before it and takes effect per document as they are reprocessed.

Measured on ordinary teaching material (2026-08-13): siblings on **105 of 110 indexed children
(95.5%)**, average expansion 5.5×, median rebuilt passage 529 tokens against 180 for the chunk that
matched, no broken or one-sided links. Resulting quality is **not** measured: Stage 5-6 never ran.

## Routing and models (2026-08-12, `43ab557d6`)

Seven live models (`LIVE_ROUTING_MODEL_IDS`): simple work on `~deepseek/deepseek-v4-flash-latest`
(the `~` is part of the id), complex on `openai/gpt-5.6-luna` and `z-ai/glm-5.2`, plus
`google/gemini-3.7-flash`, `minimax/minimax-m3` and the two image models. Four invariants to
preserve: judges keep three separate vendors, `emergency` stays off OpenAI, every fallback crosses
vendors, and the three escalation phases avoid the default model on both hops because by the time
they run it has already failed.

Reasoning is per-phase and the budget is the load-bearing part — OpenRouter bills reasoning tokens
against `max_tokens`, so the budget is ADDED, and both the database and the seed generator refuse
`reasoning_enabled` without one. On for `stage_6_complex`, `stage_5_escalation`,
`stage_6_auto_last_chance` only. Models and prices have one source, `MODEL_CATALOG` in shared-types.

Cost by tokens: **Stage 6 is ~90%** — 37.9% lesson generation, 30.0% judging, 20.2% section
generation; Stage 5 ~5.5%, Stage 4 ~1.9%. Epic `mc2-4clyr` holds what follows from that.

**Correction, 2026-08-20.** The `~` is not a harmless spelling. OpenRouter documents
`~deepseek/deepseek-v4-flash-latest` as a redirect — _«always redirects to the latest model in the
DeepSeek V4 Flash family»_ — while `deepseek/deepseek-v4-flash` is the pinned 0423 snapshot the
routing table used to name. On 17 August the family moved and the alias followed it to `-0731`:
median call latency went from 8.7 s to 102 s, and that is what aborts Stage 4 and fails the career
playbook. Root cause and the measurements are `mc2-qch4w`; the repair plan is
`docs/plans/steady-routing-heron.md`.

## Phase configs audited (2026-08-13, `7ad421986`)

`mc2-o3s4r` closed. Stored configuration is clean on the checks that matter: no budget exceeds a
model ceiling once the reasoning budget is added, no reasoning on a model that refuses it, every
model catalogued and live, every fallback crossing vendors. What was open was the seam, not the data:
Stage 5 passed on only the model id, metadata generation rebuilt an unconfigured model, and
`getModelForPhase` dropped `config.reasoning`. All three now go through `buildProviderParams`, and
`tests/unit/phase-config-provider-contract.test.ts` states that contract against the defect. The
collision fallback is now `google/gemini-3.7-flash`.

Open from the audit, none in the current epics: `mc2-s1vg5` (`generate:config-seed` exits 0 on an
unreachable database), `mc2-9yrgb` (`stage_5_escalation` configured but requested by nothing — do not
delete on that alone), `mc2-p6u8k` (Stage 5 last-resort constants name retired models).

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete (17 of 17). Three paid runs in August took the recorded share of the
OpenRouter bill from **48% → 55% → 54%**; the fixes behind that are merged and their evidence lives
in the `bd` close reasons, not here.

What still constrains work:

- **One rule, held by a guard.** A paid call prices itself at the call, from its own token split and
  the model the provider actually served. A node-level summary row keeps tokens and carries **no**
  price — `generator_complete` and `judge_complete` are summaries, so nothing is double-counted.
  Since 2026-08-21 a priced call is _stamped_ `input_data.billedCall`, because neither token counts
  nor step names can tell a call from a summary: `cost:report` had been reporting 21 rows of "money
  the ledger missed" on a window whose true answer was 0.
- **The catalogue is an estimate, not the price.** Every OpenRouter call settles against
  `/api/v1/generation`. `MODEL_CATALOG` is what a budget and a `provider.max_price` ceiling are built
  from, and `tests/unit/model-catalog-coverage.test.ts` is a hand-updated snapshot — four entries had
  drifted by 2026-08-21, so a live drift check is filed as `mc2-hc91g`. Images are the one place a
  price is still invented (`mc2-5mhlb`).
- **Stage 6 and Stage 7 run their own workers on their own queues in their own containers.**
  Anything added to the general sandboxed processor misses them. Cost was wrong three times for
  exactly this.
- **Two holes are named rather than closed**, and sit in the guard's exception list so it can shrink
  but not grow in silence: document evidence prices itself into its own coverage ledger and never
  reaches the course total (`mc2-b7olk.4`), and course editing had no stage to charge (`mc2-b7olk.5`)
  — the `stage_edit` half of that is now live and proven, see the 2026-08-20 run below.
- **`mc2-gmab0`'s mandatory-reasoning recovery is still unproven live.** No model has refused to
  disable reasoning in any run so far, so it is held by unit tests alone.

**Run of 2026-08-20 (`mc2-z0xr3` — the run the ledger work was waiting for).**
Course `bf1151ca` on dev finished; career playbook `c8649a86` **failed**. OpenRouter billed
**USD 0.144177** for the window against **USD 0.077338** recorded — 0.076998 in `generation_trace`
plus 0.000340 in `career_playbooks.cost_breakdown`. No other traffic on the key: every
staging/production container was silent, and the key is the same everywhere.

For the first time the gap is split rather than named:

- **USD 0.010388 is the catalogue lying.** `openai/gpt-5.6-luna` is priced at exactly half the
  provider's rate — 0.10/0.60 against 0.20/1.20 (`mc2-v1pn2`). Against it, `z-ai/glm-5.2` is
  overpriced 1.23× and `~deepseek/...-latest` 1.45× (`mc2-156kg`), which is why each model looked
  roughly right on its own while none of them was.
- **About USD 0.056 is calls with no row at all**: two Stage 4 aborts at 238 s and four playbook
  timeouts at 120 s (`mc2-64n8i`).
- **Structural blindness**: playbook spend never enters `generation_trace` (`mc2-rkmeg`), and a
  failed playbook records nothing anywhere (`mc2-ajqun`).

What now works: `stage_edit` rows appear and carry a price (chat guidance 0.000065, node refinement
0.000140), and the storage quota moved by exactly the uploaded bytes with no failed upload.

**The find that reshaped it.** `x-generation-id` arrives with the response headers — before the body,
and before any timeout abort — and `GET /api/v1/generation?id=` then returns `usage` (what OpenRouter
actually billed), the real token counts, `cancelled`, and `provider_name`. An aborted call becomes
countable and the price stops being a catalogue estimate. Plan:
`docs/plans/steady-routing-heron.md`. Sections A–F shipped 2026-08-21 in `fe8f40b54`, `0664c7b07`,
`37ecd2047`.

**Run of 2026-08-21 — the reconciliation is arithmetic now.** Two career playbooks on the same
questionnaire that failed on 2026-08-20; both completed. Second run, window from 09:37:27Z:

|                                        |                  |
| -------------------------------------- | ---------------- |
| OpenRouter, delta of `/api/v1/credits` | **USD 0.165079** |
| `pnpm cost:report --since` TOTAL       | **USD 0.119999** |
| Residual                               | **USD 0.045080** |

Thirty LLM calls, **all thirty** priced from `/api/v1/generation` rather than the catalogue,
`unknown_cost_attempts` 0. The worker log for the window holds exactly thirty
`Career Playbook LLM call succeeded` lines and exactly one other paid call. So the residual is not a
gap to investigate but one named call: the playbook's card image, which records its price nowhere
(`mc2-j9pmq`) and whose hardcoded USD 0.007 is 6.4× under the USD 0.045080 actually charged
(`mc2-5mhlb`). Compare 2026-08-20: 46% adrift and unattributable.

Three things that only a live run could say:

- **A generation record takes ~9.6 s to become readable.** The first implementation read once after
  1.5 s, settled zero of 33 nodes, and reported success. The lookup now polls to 30 s, and the
  playbook collects every receipt in one pass at persist time rather than waiting per call.
- **`provider.max_price` set below every endpoint is a refusal**, not a cheaper route —
  `No endpoints found that satisfy the max price for this request`. One wrong catalogue price would
  fail every call for that model, so the ceiling yields and the generation lives.
- **`provider.ignore` accepts display names, slugs and a naive lower-cased form alike.** The
  documented slug is what we send; the fallback to the display name is now safe rather than a guess.

**Still unproven live:** the per-chain provider ignore. The 2026-08-21 run had no failed attempt, so
nothing routed around anything. Held by unit tests and the 2026-08-20 manual measurement
(205 s on OpenInference at status `-2`; 58.7 s on Sail Research with it excluded).

**The ceiling is doing its job.** All three endpoints the run used for the deepseek alias — Sail
Research, Relace, Decart — are the three cheapest of ~30, all inside the 1.5× ceiling. The 21 above
it, up to AtlasCloud at 6.8× the cheapest, were never reachable.

**`requiresReasoning` is a net now, not only a list.** A model that refuses to disable reasoning is
recognised by what the provider says, remembered for the life of the process, and retried asking for
the least deliberation — on both the OpenAI-SDK and the LangChain path. The catalogue entry is still
primary; the remembering is logged at warn so it gets added.

**A log line says which deployment it came from.** Every dev container runs `NODE_ENV=production`, so
every dev log line claimed to be production. The pino base now uses `detectEnvironment()` — the same
vocabulary as `error_logs.environment` — and the backend image carries `APP_VERSION` from `VCS_REF`
instead of `0.0.0`.

**The blocker, closed.** `mc2-wg60c`: the 60s per-call budget was smaller than the default model's
real answer time — a realistic Stage 4 request (8204 input tokens, `max_tokens` 16000) took **119.0s**
measured through the same SDK from the same worker container with reasoning already off. The budget is
now `DEFAULT_LLM_TIMEOUT_MS` = 238s, twice the measurement, and still far under the 620s hang the
abort bound turned into an honest failure on 2026-08-13. Routing rows were left alone.

**Leaving the routing rows alone is what kept it open — closed 2026-08-21.** On 2026-08-20 two
Stage 4 calls exceeded even 238s, and a direct measurement found 205s on a provider whose endpoint
status is already `-2`. `DEFAULT_LLM_TIMEOUT_MS` is now **300000**, and all eleven
`stage_career_playbook_*` phases moved from 120000 to 238000 in both `config-seed.json` and
`llm_model_config`. That was the load-bearing fix: on 2026-08-21 a `group_3` call took 229s and a
`group_6` call spent the full 238s, both of which the old budget would have aborted.

**One diagnosis in that plan did not survive checking.** `spec-builder.ts:407` is an escalation
inside `catch (retryError)`, not a standing pin; the first specBuilder call carries no
`preferFallbackModel` and does reach `openai/gpt-5.6-luna` — which on 2026-08-21 answered on attempt
0 in 20.8s. The real mechanism was `useFallback = ... || attempt > 0`, which spent three of four
attempts on the slow alias. `FALLBACK_FROM_ATTEMPT = 2` now keeps attempt 1 on the primary. Write-up
in `mc2-rqukn`; the plan carries a correction note. `mc2-xm7yf`, `mc2-ajg9h` closed.

**Closed with it.** `mc2-ufpko` (cascade exemption for the conflict-checkpoint trigger, migration
`20260813140000`), `mc2-s2x84` (evidence failures record their cause, not the document),
`mc2-fqbrj` (run identity no longer reads the classifier's own output), `mc2-o7740` (cost priced from
`MODEL_CATALOG` and summed into `courses.estimated_cost_usd`), `mc2-43c75` (readiness keys scoped by
queue), `mc2-5gdzw` (reasoning is now switched off explicitly; silence read as consent and OpenRouter
bills deliberation against `max_tokens`), `mc2-hb8mn` (the stage-level config layer was deleted, not
repaired — there is no stage config entity, every row is phase-bound).

**Proven live, not only in tests.** Cost lands in the trace (`stage_4_classification`, 14007 tokens,
USD 0.001695). `delete_course_cascade` leaves no row, vector, file or Redis key.

**A deploy can be skipped on a green pipeline.** Run 31776031693 was fully green but touched only a
test file, so `Detect Deploy-Relevant Changes` skipped `Deploy to Dev` and dev kept running old code.
Confirm the `Deploy to Dev` job's own conclusion, not the run's.

## Stage 6 Batch API (2026-08-14, off by default)

`FEATURE_STAGE6_BATCH_GENERATION` sends a course's initial lesson generation as one asynchronous
OpenRouter batch (`/api/beta/batches`, plain model slug, 24h window). A coordinator polls and releases
its worker between checks; each lesson is also enqueued with a `STAGE6_BATCH_MAX_WAIT_MS` delay, so it
generates synchronously by itself if the batch never lands. Eligibility is decided per call against
the **live** catalogue: the `:batch` sibling must exist, be cheaper on both legs and fit the request.
Not a config switch — a `:batch` id posted to the synchronous endpoint breaks the caller.

`MODEL_CATALOG` prices are the `/models` base rate, verified 2026-08-14. With many providers that rate
is a default, not a promise: `z-ai/glm-5.2` ran from $0.49 to $1.40 per million input on that day, and
one provider's rate had been recorded as the base one.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority. Complete: Tier 1 through `mc2-sznhi`, Tier 2
through `mc2-3sz3d`, Tier 3 through `mc2-jz6y0.13.6`, Tier 4 through `mc2-iioip`, accessible Tier 5
through the `mc2-wxun`/`mc2-vjbb` boundary. Live, migration, research and owner-decision items
remain explicitly deferred.

## Live operational facts

- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- `course_embeddings_v1` holds **6856 points** after the 2026-08-12 deduplication. Any restore of a
  snapshot older than that returns 13712 and is not evidence of a fault — half of those are copies.
- Qdrant and uploads have a daily restricted pull to `helixa-new` (14-day/14-copy bounds, 10 GiB
  floor, 30-day local retention). On-host snapshots share the docker volume with live data, so that
  pull is the only real mitigation — a second machine, not disaster recovery. `mc2-hfoh3` closed.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production.
- Both environments carry the live-run fixes as of 2026-08-16: dev on `857c3f05e`, staging on
  `b065399dc` (29 commits, Blue/Green switched to green, all CI jobs green). Staging worker logs now
  read `environment: "stage"`, which is the label fix working — before it, the staging host called
  itself `production` and was indistinguishable from it in a log search.
- Nine source documents are accepted as lost; do not reopen them. They are **not** in the indexed
  set (all 87 files behind the 218 indexed documents are present on disk, verified 2026-08-13).
  Uploads live on the production host, not in Supabase Storage — the only bucket is
  `course-enrichments` with 14 objects.
- Monitoring drift is a separate job and must never become a deploy step: it can trigger rollback.
- `AGENTS.md` is rewritten by a `bd` hook: stage and commit explicit paths, never `git add -A`.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infrastructure work must use `scripts/with_host_operation_lock.sh`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` suites run on uid 1000
  only — exercised locally, skipped on CI runners — and carry a 120s budget because their wall clock
  is four concurrent real subprocess chains, not their own work (mc2-bvynv).
- `graph-reviewed: blocked` — the graph is read, not refreshed. Graphify 0.9.14 has no `build`
  subcommand, so a rebuild runs through the `/graphify` skill flow, not from closeout.

## Owner decisions

- `mc2-jz6y0.13.6` — answered: pull-based off-host snapshots, 14-day retention, low priority.
- `mc2-db696.61` — needs a live run and a cost/quality decision.
- `mc2-lrav0` — answered: do not backfill dev Qdrant embeddings.

## Safety boundary

No reindex, force-push, or secrets/access change. Schema migrations stay forbidden except the one
the owner approved on 2026-08-13 for `mc2-ufpko`. Deploy only under the standing authorization and
only on a green pipeline. Live paid work only within the USD 5 ceiling set for `mc2-2pplo`; the
OpenRouter key is shared with production, so check its remaining credit before and during a run.

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`,
`mc2-1nots`, or `mc2-5e4ek.1`; see §9 of the active spec for exact reopen gates.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`.

## Explicit defers

- `mc2-v6fqp` — live Stage 6 multilingual quality matrix, only after the owner approves a concrete
  LLM spend budget and disposable inputs.
- `mc2-wxun`, `mc2-vjbb` — instrumentation complete, disabled and locally accepted; enabling a
  cohort and deciding whether to change 0.15 are live/owner actions.
- `mc2-r7udy`, `mc2-6ye5z.4`, `mc2-6ye5z.5`, `mc2-6ye5z.8` — each needs a new enum value or table.
  The owner approved a migration on 2026-08-13 **only** for `mc2-ufpko`; these stay deferred.
- `mc2-db696.61` — owner decision above.
- `mc2-db696.106`/`.107` — PDF fidelity and content grounding. `.108` is partly overtaken: the
  transport is bounded by an explicit signal, receipts are not.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`.
- `mc2-gmab0` mandatory-reasoning recovery — the 2026-08-16 run did not exercise it, because no model
  refused to disable reasoning. Still held by unit tests only; it rides along with the next paid run.
  The two cost fixes in that issue are confirmed live and no longer deferred.
- `mc2-b7olk.4`, `mc2-b7olk.5` — document evidence keeps its own cost ledger, and course editing has
  no stage to charge. Both need a decision about where that money belongs, not a forgotten argument.
- `mc2-z0xr3` — **run on 2026-08-20, stays open.** It did what it was for: the gap is now split into
  named causes instead of one number. It closes when a run on the repaired code reconciles.
- The eight §9 exclusions listed under Safety boundary — gates already recorded there.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: `docs/plans/steady-routing-heron.md`, then epic `mc2-4clyr`

Recommended action: work the plan in `docs/plans/steady-routing-heron.md`. Start with `mc2-ihhwp` —
knowing the provider and the generation id of every call is the foundation, and it blocks
`mc2-pdsjz`, `mc2-svokw` and `mc2-jukal`. After that the routing stream (`mc2-pdsjz`, `mc2-svokw`,
`mc2-ajg9h`, `mc2-xm7yf`, `mc2-qch4w`) and the money stream (`mc2-jukal`, `mc2-v1pn2`, `mc2-156kg`,
`mc2-64n8i`, `mc2-ajqun`, `mc2-rkmeg`, `mc2-wjdfe`, `mc2-wjmrd`, `mc2-9nf9q`) run in parallel; they
do not share files. A repeat paid run is part of that plan's acceptance, not separate work.

Do not start `mc2-4clyr` before the number holds. The epic is about cutting generation cost, and on
2026-08-20 the recorded cost was still 54% of the real one. Costing it today would cost it on a
number we already know is wrong.

**Three owner decisions of 2026-08-20 bind the routing work** and must not be revisited without a
new decision: a provider that fails is ignored only inside the current chain of attempts, never in a
standing blocklist, and the next call starts again with the cheapest; cheapest stays the goal, so
`max_price` is a ceiling and `sort=throughput` is out; waiting is acceptable, so raise timeouts
rather than chase speed. Key stages may move to `openai/gpt-5.6-luna` at ~8× the per-call price.

`mc2-4clyr`'s headline number needs correcting first: across all 1589 judged lessons rather than the 490 that
reached a judge, 69.2% are settled free by heuristics, 6.3% take one judge, 17.6% two and 6.9% three,
so the full panel runs _below_ its 15-20% design target, not four times above it. `mc2-r31fw` step 1
cannot be done from history — `singleJudge` is null in every stored cascade row.

## Starter prompt for next orchestrator

The starter prompt for the routing and cost work is in the handoff notes of
`docs/plans/steady-routing-heron.md`; the older one at the end of
`docs/plans/humble-floating-widget.md` is superseded for that stream. Use $orchestrator-stage
for the epic itself; single tasks are ordinary local work. Do not enable the cohort, change its
threshold, reindex, force-push, deploy, migrate beyond `mc2-ufpko`, or spend beyond the USD 5 ceiling
without separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
