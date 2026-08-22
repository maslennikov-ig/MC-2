# Orchestrator Handoff

Updated: 2026-08-22. Effective kernel: `shared-orchestration/v1`.

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
  as a safety net. Production was cleaned 13712 → 6856 points. Both chunking paths are healthy;
  `groupIntoParents()` was accused twice and caused neither defect.
- Only children are indexed, plus any childless parent; the passage is rebuilt at retrieval time from
  siblings, **after reranking** in the two paths that rerank. The budget caps what expansion adds and
  never drops a retrieved chunk. On for Stage 5 section RAG, Stage 6 lesson RAG and
  `search_documents`; off for evidence retrieval, where a citation must point at the fragment that
  matched. A no-op on older points. Measured 2026-08-13: siblings on 105 of 110 indexed children,
  average expansion 5.5×; resulting **quality** is not measured.

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

Stored configuration is clean on the checks that matter. What was open was the seam, not the data:
Stage 5, metadata generation and `getModelForPhase` each dropped part of a phase config, and all
three now go through `buildProviderParams`, held by
`tests/unit/phase-config-provider-contract.test.ts`. Collision fallback: `google/gemini-3.7-flash`.
Open, none in the current epics: `mc2-s1vg5` (`generate:config-seed` exits 0 on an unreachable
database), `mc2-9yrgb` (`stage_5_escalation` requested by nothing — do not delete on that alone),
`mc2-p6u8k` (Stage 5 last-resort constants name retired models).

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete (17 of 17); the evidence lives in the `bd` close reasons, not here.
What still constrains work:

- **One rule, held by a guard.** A paid call prices itself at the call, from its own token split and
  the model the provider served; a node-level summary row keeps tokens and carries **no** price. A
  priced call is _stamped_ `input_data.billedCall`: neither token counts nor step names tell a call
  from a summary, and `cost:report` once reported 21 rows of "missing money" where the answer was 0.
- **The catalogue is an estimate, not the price.** Every OpenRouter call settles against
  `/api/v1/generation`. `MODEL_CATALOG` is what a budget and a `provider.max_price` ceiling are built
  from; `tests/unit/model-catalog-coverage.test.ts` is a hand-updated snapshot that stays offline on
  purpose, because routing must not depend on a third party being reachable.
  `scripts/check-model-catalog-drift.ts` is the online half: it reads `/api/v1/models` and exits **2**
  when it cannot reach the API against **1** when the catalogue is wrong — those must not look alike.
  Both scopes green 2026-08-21; `--all` found five adrift entries, not the four the plan named, the
  fifth being `deepseek/deepseek-v4-flash`, which every undated V4 Flash snapshot is priced from
  (`mc2-g1zt9`). It runs in **no** CI job, deliberately: a provider's tariff change must not be able
  to fail our build and with it the deploy. Scheduled non-blocking check: `mc2-ts9i2`.
- **Nothing routes to a `~`-alias any more** (`mc2-qch4w`); its catalogue entry stays only so rows it
  already wrote still resolve.
- **The second price table is gone; images price like everything else.** `MODEL_COSTS` in the image
  service (0.038 / 0.007 / 0.04, plus `DEFAULT_COST_USD = 0.04` for the unrecognised) is deleted.
  Image models carry `imageOutputPricePerMillion` in `MODEL_CATALOG` — OpenRouter's published
  `image_output` rate, which nothing had ever read — and an image call's completion tokens are image
  tokens, so the estimate is the same arithmetic as any other call. An uncatalogued image model is
  traced **unpriced** and warns, instead of a confident $0.04. The estimate is only a placeholder:
  the service uses the shared transport, so `x-generation-id` arrives and the settlement replaces it
  with the real charge (`mc2-5mhlb`).
- **One transport, and a guard against the next one.** Every OpenRouter chat client comes from
  `shared/llm/openrouter-client.ts`, the only place `instrumentFetchWithGenerationId` is attached.
  `tests/unit/shared/llm/one-openrouter-transport.test.ts` fails on a `new OpenAI(` or a hand-written
  `openrouter.ai/api/v1` anywhere else; the exception list may shrink, never grow silently. Writing
  it turned up two transports nobody had counted — Stage 5's `metadata-generator.ts` and
  `section-batch/constants.ts`, both reading `process.env` for the key. Both go through the shared
  factory as of 2026-08-21 and both entries are gone from the list, leaving one: Stage 7 audio
  (`mc2-me7nx` closed). Metadata generation was also asking `getModelForPhase` for a model without a
  course id, so it spent anonymously; it passes one now.
- **A LangChain call prices itself from the constructor, and reads its receipt off the message.**
  `ChatOpenAI.withConfig` — which `withStructuredOutput` and `bindTools` both funnel through — is
  `new ChatOpenAI(this.fields)` by design (langchainjs#8586), so anything attached to a built model
  is dropped by the clone; that silently cost every structured call its price. Hence
  `createCostRecordingModel`/`Async` in the factory, never build-then-attach. The generation id comes
  from `generations[0][0].message.id` — OpenRouter's `gen-…`, the same value the header carries — so
  the course pipeline needs no `AsyncLocalStorage` slot. Identical in @langchain/openai 1.4.7 and
  1.5.10, and `tests/unit/shared/llm/structured-output-reaches-invoke.test.ts` fails if that changes
  (`mc2-258fi`). The wrapped `fetch` stays for the failure path, which produces no message — that is
  what the Career Playbook reads.
- **The playbook cover reaches a ledger.** `generation_trace.course_id` is a foreign key into
  `courses` and a playbook is not a course, so the cover was logged as unattributable — it was the
  entire $0.045080 residual of the 2026-08-21 run. It is now a `cardImage` node cost appended to
  `career_playbooks.cost_breakdown`, written from the image job because that job finishes _after_ the
  playbook row (`mc2-j9pmq`). A cover whose call fails now leaves a row too, unpriced until the settlement (`mc2-ietzn`).
- **Stage 6 and Stage 7 run their own workers, queues and containers.** Anything added to the general
  sandboxed processor misses them. Cost was wrong three times for exactly this.
- **One hole is named rather than closed:** document evidence prices itself into its own coverage
  ledger and never reaches the course total (`mc2-b7olk.4`). Course editing (`mc2-b7olk.5`) has
  `stage_edit` and is live and proven.

**The find that reshaped all of this.** `GET /api/v1/generation?id=` returns `usage` (what OpenRouter
actually billed), the real token counts, `cancelled` and `provider_name`. The id is in the response
body, and also in the `x-generation-id` header — which arrives before the body and before any timeout
abort, so even an aborted call becomes countable.

**The ledger reconciles. Run of 2026-08-22, `7c80e479c`** (`mc2-z0xr3`, `mc2-79lvc` closed):

|                                                  |           |
| ------------------------------------------------ | --------- |
| report TOTAL, `cost:report --since T0`           | $0.202480 |
| delta of `/api/v1/credits`                       | $0.202481 |
| provider sum over the 65 recorded generation ids | $0.202481 |

Three numbers, one of them independent of our own arithmetic, and the gap is the report's sixth
decimal. **25 of 25** billed calls carried a provider receipt, against 1 of 15 the day before; zero
billed calls without a price; `courses.estimated_cost_usd` matches the trace sum. Both covers carry
the provider's charge — course card $0.045076, playbook cover $0.048609, neither the $0.007 of the
deleted private table. No production container touched the key in the window. The 2026-08-21
residual of $0.007506 is gone with the two defects that made it (`mc2-lymou`, `mc2-ai4a8`).

Five of the playbook's 40 attempts are recorded `cost_unknown`; the provider has no generation
record for any of them, and the exact match proves they cost nothing. They are a defect of a
different kind — `mc2-f1tqd`, below.

The run did **not** upload a document, deliberately: document evidence keeps its own ledger
(`mc2-b7olk.4`) and would have put a known-unattributable delta into the window this run existed to
close. The storage-quota line was proven on 2026-08-20 instead.

Three things that only a live run could say:

- **A generation record takes ~9.6 s to become readable**, and for a call still running, never. The
  first implementation read once after 1.5 s, settled zero of 33 nodes and reported success. The
  lookup polls to 30 s and the playbook collects receipts in one pass at persist time; routing no
  longer waits on it.
- **`provider.max_price` set below every endpoint is a refusal**, not a cheaper route —
  `No endpoints found that satisfy the max price for this request`. One wrong catalogue price would
  fail every call for that model, so the ceiling yields and the generation lives. A pinned attempt is
  also filtered against it up front, on live prices, so the pin cannot spend an attempt on a refusal.

**The attempt names its endpoint, because a hung one never names itself.** Routing around a failure
used to need `GET /api/v1/generation` to name the provider, and that record is unreadable while the
call is still running — which is what a timeout is. Proven on 2026-08-21: an attempt hung 238 s,
`ignoredInThisChain` was empty, the retry returned to the same provider for 504 s more. Measured
alternatives both fail: `X-Provider-Name` is advertised in `access-control-expose-headers` and never
sent; `provider` is in the body and every SSE chunk, but that call produced neither. So an attempt is
pinned — `provider.order` with one `tag` from `/models/{model}/endpoints`, `allow_fallbacks: false` —
and the next takes the next cheapest. Sorted by live price, degraded endpoints skipped as OpenRouter
skips them, nothing outliving the call, no pin when the list cannot be fetched. **The
ceiling holds:** the run used the three cheapest of ~30, and the 21 above the 1.5× ceiling — to
AtlasCloud at 6.8× — were unreachable.

**Proven live on 2026-08-22 and closed** (`mc2-6crnj`). The same failure, twice, and this time the
retry left: `group6Generator` and `crossBlockJudge` each hung the full 238 s on `sail-research/fp4`,
and each attempt 1 was pinned to `open-inference/fp4` and answered — one of them in 44.7 s. 26 pin
lines in the run, every new call starting again at the cheapest, no standing blocklist.

**A pinned endpoint can also answer with nothing** (`mc2-f1tqd`, open). Five attempts on that same
`sail-research/fp4` died on `Cannot read properties of undefined` — `'map'` in `crossBlockJudge`,
`'message'` in `group2Generator` — and the provider has no generation record for any of them, so the
response was empty rather than wrong. The parse crashes instead of naming what arrived; the retry on
another endpoint succeeded every time. Not money, ~85 s and five extra calls.

**`requiresReasoning` is a net now, not only a list.** A model that refuses to disable reasoning is
recognised by what the provider says, remembered for the process, and retried asking for the least
deliberation; the catalogue entry stays primary and the remembering is logged at warn. The net used
to have a hole — it replaced `invoke`, so the four structured call sites reached a clone that never
had it. Since 2026-08-22 the recovery is a **transport** wrapper in `configuration.fetch`
(`mc2-148j9`): a 400 whose body says reasoning is mandatory is re-sent once with
`reasoning: {effort:'low'}` and a budget grown by `MANDATORY_REASONING_RESERVE_TOKENS`, capped by
the model's output ceiling. `configuration` is a constructor field, so it survives the
`new ChatOpenAI(fields)` clone — the same reason cost recording rides in `callbacks` — and being
below `invoke` it now covers `stream` and `batch` too. A body already carrying the floor is not
re-sent, so a second refusal is an ordinary error rather than a loop.

**A log line says which deployment it came from.** Every dev container runs `NODE_ENV=production`, so
every dev log line claimed to be production. The pino base uses `detectEnvironment()`, and the image
carries `APP_VERSION` from `VCS_REF`.

**Timeouts are set from measurement, and waiting is the owner's chosen trade.**
`DEFAULT_LLM_TIMEOUT_MS` is **300000**, and all eleven `stage_career_playbook_*` phases carry 238000
in both `config-seed.json` and `llm_model_config`. A realistic Stage 4 request measured 119.0s, and
on 2026-08-21 a `group_3` call took 229s and a `group_6` call spent the full 238s — all of which a
smaller budget would have aborted and re-billed. Under the 620s hang the abort bound catches
(`mc2-wg60c`).

**Attempt 1 stays on the primary.** `FALLBACK_FROM_ATTEMPT = 2`: the old
`useFallback = ... || attempt > 0` spent three of four attempts on the slow alias. `spec-builder.ts`
was accused of a standing pin and did not deserve it — that line is an escalation inside
`catch (retryError)` (`mc2-rqukn`; `mc2-xm7yf`, `mc2-ajg9h` closed).

**A deploy can be skipped on a green pipeline.** Run 31776031693 was fully green but touched only a
test file, so `Detect Deploy-Relevant Changes` skipped `Deploy to Dev` and dev kept running old code.
Confirm the `Deploy to Dev` job's own conclusion, not the run's.

## Stage 6 Batch API (2026-08-14, off by default)

`FEATURE_STAGE6_BATCH_GENERATION` sends a course's initial lesson generation as one asynchronous
OpenRouter batch (`/api/beta/batches`, plain model slug, 24h window). A coordinator polls and releases
its worker between checks; each lesson is also enqueued with a `STAGE6_BATCH_MAX_WAIT_MS` delay, so it
generates synchronously by itself if the batch never lands. Eligibility is decided per call against
the **live** catalogue: the `:batch` sibling must exist, be cheaper on both legs and fit the request.
Not a config switch — a `:batch` id posted to the synchronous endpoint breaks the caller, and a
`:batch` tariff is **not** reliably half the base one. `MODEL_CATALOG` prices are the `/models` base
rate, which with many providers is a default rather than a promise: `z-ai/glm-5.2` ran $0.49 to $1.40
per million input on one day.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order: 49 work items plus 5
epics; do not re-open the 27 already closed with a commit or a measurement, and do not re-rank by
tracker priority. Complete through `mc2-sznhi` (T1), `mc2-3sz3d` (T2), `mc2-jz6y0.13.6` (T3),
`mc2-iioip` (T4) and the `mc2-wxun`/`mc2-vjbb` boundary (T5).

## Live operational facts

- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- `course_embeddings_v1` holds **6856 points** after the 2026-08-12 deduplication. Any restore of a
  snapshot older than that returns 13712 and is not evidence of a fault — half of those are copies.
- Qdrant and uploads have a daily restricted pull to `helixa-new` (14-day/14-copy bounds, 10 GiB
  floor, 30-day local retention). On-host snapshots share the docker volume with live data, so that
  pull is the only real mitigation — a second machine, not disaster recovery.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production. Worker logs
  carry a real `environment` label — before that fix every dev container called itself `production`.
- Nine source documents are accepted as lost; do not reopen them. They are **not** in the indexed set
  (all 87 files behind the 218 indexed documents are on disk, verified 2026-08-13). Uploads live on
  the production host, not in Supabase Storage; the only bucket is `course-enrichments`, 14 objects.
- Monitoring drift is a separate job and must never become a deploy step: it can trigger rollback.
  `AGENTS.md` is rewritten by a `bd` hook: stage explicit paths, never `git add -A`.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infrastructure work must use `scripts/with_host_operation_lock.sh`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` suites run on uid 1000
  only and carry a 120s budget: their wall clock is four concurrent subprocess chains (mc2-bvynv).
- `graph-reviewed: blocked` — the graph is read, not refreshed: Graphify 0.9.14 has no `build`
  subcommand, so a rebuild goes through the `/graphify` skill flow.

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
- `mc2-db696.106`/`.107` — PDF fidelity and content grounding. `.108` is partly overtaken: the
  transport is bounded by an explicit signal, receipts are not.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`.
- `mc2-gmab0` mandatory-reasoning recovery — no model has refused in any run, so it is still held by
  unit tests only. It does now cover the structured call sites (`mc2-148j9` closed).
- `mc2-b7olk.4` — document evidence keeps its own cost ledger and never reaches the course total. It
  needs a decision about where that money belongs, not a forgotten argument.
- `mc2-f1tqd` — five attempts died reading an empty provider response instead of naming it. Free but
  slow, and it hid behind the retry that saved it.
- `mc2-dgw4u` — **owner question:** Stage 7 audio bills a separate OpenAI account and is outside every
  OpenRouter reconciliation by construction; whether it stays there is not decided.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: epic `mc2-4clyr`.

`docs/plans/honest-receipt-kestrel.md` is complete: sections A–G delivered, and its acceptance — the
repeat paid run — passed on 2026-08-22 with every line answered (`mc2-z0xr3`). **The number holds, so
the bar on `mc2-4clyr` is lifted.**

The epic is about cutting generation cost, and its headline needs correcting first: across all 1589
judged lessons rather than the 490 that reached a judge, 69.2% are settled free by heuristics, 6.3%
take one judge, 17.6% two and 6.9% three — so the full panel runs _below_ its 15-20% design target,
not four times above it.

**Step 1 of `mc2-r31fw` is done, and it changes the whole shape of the epic.** The score _is_ stored
— `generation_trace.output_data.enrichedOutput.singleJudge.score`, populated on 1302 of 2567
`judge_complete` rows (an earlier note in this file claimed it was null everywhere; it was wrong).
Measured distribution: min **0.520**, p10 0.700, median **0.820**, p90 0.880, max 0.930.

- The acceptance rule (`cascade/orchestrator.ts:341-344`) has three clauses and **two are dead**. The
  lower arm `score < 1 - threshold` (0.2) has never fired: 0 of 1302. `confidence >= medium` has
  never blocked anything either: 1027 high, 275 medium, **no** `low` in the entire history. What
  runs is `score >= 0.8` and nothing else.
- 0.8 sits just under the median, i.e. at the point of maximum sensitivity. Panel rate by threshold:
  **0.80 → 45.5%**, 0.78 → 32.9%, 0.75 → 24.3%, 0.70 → 9.8%. Two points of threshold move a eighth
  of the corpus.
- **The "single cheap judge" is the most expensive model in the pool.** `executeSingleJudge` takes
  `judgeModels.secondary` under a comment reading "cheapest"/"cheaper"; `secondary` is `z-ai/glm-5.2`
  at $0.966/$3.036 per million against luna $0.200/$1.200, minimax $0.300/$1.200 and deepseek
  $0.080/$0.180. It is also the pool's widest provider spread. That inverts `mc2-d1d09`: swapping
  `secondary` with `tiebreaker` does not shave 40% off an occasional second vote, it moves the
  **most frequent** judge call from the dearest model to a third of its price.
- **A lesson that reaches the panel is judged by glm-5.2 twice.** `executeCLEVVoting` re-runs
  `primary` and `secondary` from scratch and the single judge's verdict — cast by that same
  `secondary` — is discarded rather than counted as one of the panel's votes.

Measured token shape of one judge pass, from the 2026-08-22 run: 5144 in / 764 out. At list rates
that is $0.00729 on glm-5.2 (billed $0.01046, served above list), $0.00246 on minimax, $0.00195 on
luna, $0.00055 on deepseek.

What that run says about where the money is overall: of $0.202480, the two card images are $0.093685
— **46%** — against $0.052570 for all of Stage 6 and $0.004523 for Stages 4 and 5 together. On a
small course an image costs more than the whole text pipeline. Stage 6 remains the target on a real
course; the images are worth a separate look and are **not** in the epic.

**Three owner decisions of 2026-08-20/21 bind the routing work** and must not be revisited without a
new decision: a provider that fails is ignored only inside the current chain of attempts, never in a
standing blocklist, and the next call starts again with the cheapest; cheapest stays the goal, so
`max_price` is a ceiling and `sort=throughput` is out; waiting is acceptable, so raise timeouts
rather than chase speed. Key stages may move to `openai/gpt-5.6-luna` at ~8× the per-call price.

## Starter prompt for next orchestrator

Open epic `mc2-4clyr` — cutting Stage 6 generation cost. Correct its headline against the 1589-lesson
figures above before planning from it, and read the 2026-08-22 run's split: on a small course the two
cover images outweigh the whole text pipeline. Use $orchestrator-stage for the epic itself; single
tasks are ordinary local work. Ask before spending: the cost ledger is now proven, so a paid run is
for measuring a change, not for finding holes. Do not enable the cohort, change its threshold,
reindex, force-push, migrate beyond `mc2-ufpko`, or spend beyond the USD 5 ceiling without separate
current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
