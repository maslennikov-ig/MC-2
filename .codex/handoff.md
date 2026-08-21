# Orchestrator Handoff

Updated: 2026-08-21. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries.

## Current stage

The Career Playbook quality track is **accepted** (`mc2-db696.110`, editorial read 4.4 / 5 against a
4.0 threshold, run cost USD 0.352; evidence in `.codex/stages/mc2-db696.110/evidence/`). Its two
process rules are in `06-quality-acceptance.md` and still hold: read the artifact before calling a
run accepted, and clean up **after** the editorial pass. Epic `mc2-qrdkt` is closed; no stage is
active.

## RAG retrieval, chunking and parent expansion (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`, `mc2-o3s4r`; `mc2-lrav0` on the owner's
"no backfill". Details in `54a5c5e44`, `c18e2a9ea`, `217e3d112` and the stage summaries. What still
constrains work:

- Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
  ceiling), and a test rejects any literal above that ceiling. The old `0.7` was unreachable against
  embeddings topping out near 0.58, which made hybrid search BM25-only.
- Degenerate parents no longer reach the index (`selectIndexableChunks`); search drops repeated text
  as a safety net. Production was cleaned 13712 → 6856 points. Both chunking paths were measured and
  are healthy; `groupIntoParents()` was accused twice and caused neither defect.
- Only children are indexed, plus any childless parent; the passage is rebuilt at retrieval time from
  siblings, **after reranking** in the two paths that rerank. The budget is a ceiling on what
  expansion adds, never a reason to drop a retrieved chunk. On for Stage 5 section RAG, Stage 6
  lesson RAG and `search_documents`; off for evidence retrieval, where a citation must point at the
  fragment that matched. It is a no-op on points indexed before it. Measured 2026-08-13: siblings on
  105 of 110 indexed children, average expansion 5.5×. Resulting **quality** is not measured.

## Routing and models (2026-08-12, `43ab557d6`)

Seven live models (`LIVE_ROUTING_MODEL_IDS`): simple work on `deepseek/deepseek-v4-flash-0731`
(a pinned snapshot since 2026-08-21; see the correction below), complex on
`openai/gpt-5.6-luna` and `z-ai/glm-5.2`, plus
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

**The `~` was never a harmless spelling — root cause, closed 2026-08-21 (`mc2-qch4w`).** OpenRouter
documents `~deepseek/deepseek-v4-flash-latest` as a redirect that _«always redirects to the latest
model in the DeepSeek V4 Flash family»_. On 17 August the family moved, the alias followed it to
`-0731`, median call latency went from 8.7 s to 102 s with no change on our side, and that is what
aborted Stage 4 and failed the career playbook through 20 August. Routing is now pinned to
`deepseek/deepseek-v4-flash-0731` — chosen because the alias was already resolving to it (same
1310720 context), so the pin froze the behaviour rather than altering it, and because that snapshot
carries 30 endpoints against 18 for the undated id, with the same cheapest endpoint at
$0.065/$0.180. `DEFAULT_MODEL_ID`, all 92 occurrences in `config-seed.json` and the active rows of
`llm_model_config` were changed together, since the database wins over the seed at runtime.

## Phase configs audited (2026-08-13, `7ad421986`)

Stored configuration is clean on the checks that matter: no budget exceeds a model ceiling once the
reasoning budget is added, no reasoning on a model that refuses it, every model catalogued and live,
every fallback crossing vendors. What was open was the seam, not the data — Stage 5, metadata
generation and `getModelForPhase` each dropped part of a phase config; all three now go through
`buildProviderParams`, held by `tests/unit/phase-config-provider-contract.test.ts`. The collision
fallback is `google/gemini-3.7-flash`.

Open from the audit, none in the current epics: `mc2-s1vg5` (`generate:config-seed` exits 0 on an
unreachable database), `mc2-9yrgb` (`stage_5_escalation` configured but requested by nothing — do not
delete on that alone), `mc2-p6u8k` (Stage 5 last-resort constants name retired models).

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete (17 of 17). Three paid runs in August took the recorded share of the
OpenRouter bill from **48% → 55% → 54%**; the fixes behind that are merged and their evidence lives
in the `bd` close reasons, not here.

What still constrains work:

- **One rule, held by a guard.** A paid call prices itself at the call, from its own token split and
  the model the provider actually served; a node-level summary row keeps tokens and carries **no**
  price. A priced call is _stamped_ `input_data.billedCall`, because neither token counts nor step
  names can tell a call from a summary: `cost:report` had been reporting 21 rows of "money the ledger
  missed" on a window whose true answer was 0.
- **The catalogue is an estimate, not the price.** Every OpenRouter call settles against
  `/api/v1/generation`. `MODEL_CATALOG` is what a budget and a `provider.max_price` ceiling are built
  from; `tests/unit/model-catalog-coverage.test.ts` is a hand-updated snapshot that stays offline on
  purpose, because routing must not depend on a third party being reachable.
  `scripts/check-model-catalog-drift.ts` is the online half: it reads `/api/v1/models`, names any
  entry that disagrees, and exits **2** when it cannot reach the API against **1** when the catalogue
  is wrong — those two must not look alike. Default scope is `LIVE_ROUTING_MODEL_IDS` and is green;
  `--all` also covers retired entries, four of which are still adrift (`mc2-g1zt9`).
- **Nothing routes to a `~`-alias any more** — see the routing section above (`mc2-qch4w`). The alias
  entry stays in the catalogue only so rows it already wrote still resolve.
- **The second price table is gone; images price like everything else.** `MODEL_COSTS` in the image
  service (0.038 / 0.007 / 0.04, plus `DEFAULT_COST_USD = 0.04` for anything unrecognised) is
  deleted. Image models carry `imageOutputPricePerMillion` in `MODEL_CATALOG` — OpenRouter's
  published `image_output` rate, which nothing had ever read — and an image call's completion tokens
  are image tokens, so the estimate is the same arithmetic as any other call. An uncatalogued image
  model is traced **unpriced** and warns, instead of resolving to a confident $0.04. The estimate is
  only a placeholder: the service now uses the shared transport, so `x-generation-id` arrives and
  `settleTraceCostFromProvider` replaces it with the real charge (`mc2-5mhlb`).
- **One transport, and a guard against the next one.** Every OpenRouter chat client comes from
  `shared/llm/openrouter-client.ts`, the only place `instrumentFetchWithGenerationId` is attached.
  `tests/unit/shared/llm/one-openrouter-transport.test.ts` fails on a `new OpenAI(` or a hand-written
  `openrouter.ai/api/v1` anywhere else; the exception list may shrink, never grow silently. Writing
  it turned up two transports nobody had counted — Stage 5's `metadata-generator.ts` and
  `section-batch/constants.ts`, both `ChatOpenAI`, both reading `process.env` for the key.
  Grandfathered as `mc2-me7nx`: their calls are priced from the catalogue, not from a receipt.
- **The playbook cover reaches a ledger.** `generation_trace.course_id` is a foreign key into
  `courses` and a playbook is not a course, so the cover was logged as unattributable — it was the
  entire $0.045080 residual of the 2026-08-21 run. It is now a `cardImage` node cost appended to
  `career_playbooks.cost_breakdown`, written from the image job because that job finishes _after_ the
  playbook row (`mc2-j9pmq`). A cover whose call _fails_ still leaves no row: `mc2-ietzn`.
- **Stage 6 and Stage 7 run their own workers, queues and containers.** Anything added to the general
  sandboxed processor misses them. Cost was wrong three times for exactly this.
- **One hole is named rather than closed**, and sits in the guard's exception list so it can shrink
  but not grow in silence: document evidence prices itself into its own coverage ledger and never
  reaches the course total (`mc2-b7olk.4`). Course editing (`mc2-b7olk.5`) now has `stage_edit` and
  is live and proven.

**The find that reshaped all of this.** `x-generation-id` arrives with the response headers — before
the body, and before any timeout abort — and `GET /api/v1/generation?id=` then returns `usage` (what
OpenRouter actually billed), the real token counts, `cancelled`, and `provider_name`. An aborted call
becomes countable and the price stops being a catalogue estimate.

**Run of 2026-08-21 — the reconciliation became arithmetic.** Window from 09:37:27Z: OpenRouter
billed **USD 0.165079**, `cost:report --since` reported **USD 0.119999**, residual **USD 0.045080**.
Thirty LLM calls, all thirty priced from `/api/v1/generation`, `unknown_cost_attempts` 0, and the
worker log for the window held exactly thirty `Career Playbook LLM call succeeded` lines plus one
other paid call — so the residual was not a gap but one named call, the playbook's card image, at a
hardcoded USD 0.007 against USD 0.045080 charged. Both causes are fixed above (`mc2-j9pmq`,
`mc2-5mhlb`); the next run is the first to test that. Compare 2026-08-20: 46% adrift and
unattributable.

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

**Timeouts are set from measurement, and waiting is the owner's chosen trade.**
`DEFAULT_LLM_TIMEOUT_MS` is **300000**, and all eleven `stage_career_playbook_*` phases carry 238000
in both `config-seed.json` and `llm_model_config`. That was the load-bearing fix of 2026-08-20/21: a
realistic Stage 4 request measured 119.0s, two calls exceeded even a 238s budget, and on 2026-08-21 a
`group_3` call took 229s and a `group_6` call spent the full 238s — all of which a smaller budget
would have aborted and re-billed. Still far under the 620s hang the abort bound catches
(`mc2-wg60c`).

**Attempt 1 stays on the primary.** `FALLBACK_FROM_ATTEMPT = 2`: the old
`useFallback = ... || attempt > 0` spent three of four attempts on the slow alias. `spec-builder.ts`
was accused of a standing pin and did not deserve it — that line is an escalation inside
`catch (retryError)`. Write-up in `mc2-rqukn`; `mc2-xm7yf`, `mc2-ajg9h` closed.

**A deploy can be skipped on a green pipeline.** Run 31776031693 was fully green but touched only a
test file, so `Detect Deploy-Relevant Changes` skipped `Deploy to Dev` and dev kept running old code.
Confirm the `Deploy to Dev` job's own conclusion, not the run's.

## Stage 6 Batch API (2026-08-14, off by default)

`FEATURE_STAGE6_BATCH_GENERATION` sends a course's initial lesson generation as one asynchronous
OpenRouter batch (`/api/beta/batches`, plain model slug, 24h window). A coordinator polls and releases
its worker between checks; each lesson is also enqueued with a `STAGE6_BATCH_MAX_WAIT_MS` delay, so it
generates synchronously by itself if the batch never lands. Eligibility is decided per call against
the **live** catalogue: the `:batch` sibling must exist, be cheaper on both legs and fit the request.
Not a config switch — a `:batch` id posted to the synchronous endpoint breaks the caller. A `:batch`
tariff is **not** reliably half the base one: two of the four were recorded that way and were wrong
(see the catalogue drift note above).

`MODEL_CATALOG` prices are the `/models` base rate. With many providers that rate is a default, not a
promise: `z-ai/glm-5.2` ran from $0.49 to $1.40 per million input on one day.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order: 49 work items plus 5
epics; do not re-open the 27 already closed with a commit or a measurement, and do not re-rank by
tracker priority. Complete through `mc2-sznhi` (T1), `mc2-3sz3d` (T2), `mc2-jz6y0.13.6` (T3),
`mc2-iioip` (T4) and the `mc2-wxun`/`mc2-vjbb` boundary (T5). Live, migration, research and
owner-decision items remain explicitly deferred.

## Live operational facts

- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- `course_embeddings_v1` holds **6856 points** after the 2026-08-12 deduplication. Any restore of a
  snapshot older than that returns 13712 and is not evidence of a fault — half of those are copies.
- Qdrant and uploads have a daily restricted pull to `helixa-new` (14-day/14-copy bounds, 10 GiB
  floor, 30-day local retention). On-host snapshots share the docker volume with live data, so that
  pull is the only real mitigation — a second machine, not disaster recovery. `mc2-hfoh3` closed.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production. Worker logs
  carry a real `environment` label — before that fix every dev container called itself `production`.
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
- `mc2-gmab0` mandatory-reasoning recovery — no model has refused to disable reasoning in any run, so
  it is still held by unit tests only; it rides along with the next paid run.
- `mc2-b7olk.4` — document evidence keeps its own cost ledger and never reaches the course total. It
  needs a decision about where that money belongs, not a forgotten argument.
- `mc2-z0xr3` — stays open until a run on the repaired code reconciles without an unnamed residual.
- `mc2-dgw4u` — **owner question:** Stage 7 audio bills a separate OpenAI account and is outside every
  OpenRouter reconciliation by construction. The boundary is now named in the runbook; whether audio
  stays on a direct account is not decided.
- The eight §9 exclusions listed under Safety boundary — gates already recorded there.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: the paid run in `docs/runbooks/cost-ledger-paid-run.md`, then epic `mc2-4clyr`

Recommended action: sections A–H of `docs/plans/settled-picture-osprey.md` are delivered
(`mc2-l17v5`, `mc2-5mhlb`, `mc2-j9pmq`, `mc2-z7ryi`, `mc2-qch4w`, `mc2-hc91g`, `mc2-9nf9q`,
`mc2-dgw4u`). What remains is the repeat paid run — that plan's acceptance, not separate work, and
the first run on code where images price themselves and nothing routes to a `~`-alias.

Do not start `mc2-4clyr` before the number holds. The epic is about cutting generation cost, and its
headline also needs correcting: across all 1589 judged lessons rather than the 490 that reached a
judge, 69.2% are settled free by heuristics, 6.3% take one judge, 17.6% two and 6.9% three — so the
full panel runs _below_ its 15-20% design target, not four times above it. `mc2-r31fw` step 1 cannot
be done from history: `singleJudge` is null in every stored cascade row.

**Three owner decisions of 2026-08-20/21 bind the routing work** and must not be revisited without a
new decision: a provider that fails is ignored only inside the current chain of attempts, never in a
standing blocklist, and the next call starts again with the cheapest; cheapest stays the goal, so
`max_price` is a ceiling and `sort=throughput` is out; waiting is acceptable, so raise timeouts
rather than chase speed. Key stages may move to `openai/gpt-5.6-luna` at ~8× the per-call price.

## Starter prompt for next orchestrator

Run the paid run in `docs/runbooks/cost-ledger-paid-run.md` against `develop` on dev, then reconcile
`pnpm cost:report --since <T0>` TOTAL against the delta of `/api/v1/credits` for the same window and
answer the acceptance list of `docs/plans/settled-picture-osprey.md` line by line. Ask before
spending. Use $orchestrator-stage for the epic itself; single tasks are ordinary local work. Do not
enable the cohort, change its threshold, reindex, force-push, migrate beyond `mc2-ufpko`, or spend
beyond the USD 5 ceiling without separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
