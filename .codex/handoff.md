# Orchestrator Handoff

Updated: 2026-08-22. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries.

## Current stage

No stage is active. `four-doors-marten.md` ran on 2026-08-22 — tracks A, B and D closed, C blocked;
see the section near the end. The Career Playbook quality track stays **accepted**
(`mc2-db696.110`), and its two process rules in `06-quality-acceptance.md` still hold: read the
artifact before calling a run accepted, and clean up **after** the editorial pass.

## RAG retrieval, chunking and parent expansion (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`, `mc2-o3s4r`; `mc2-lrav0` on the owner's
"no backfill". What still constrains work:

- Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
  ceiling), and a test rejects any literal above that ceiling. The old `0.7` was unreachable against
  embeddings topping out near 0.58, which made hybrid search BM25-only.
- Degenerate parents no longer reach the index (`selectIndexableChunks`); search drops repeated text
  as a safety net. Production was cleaned 13712 → 6856 points.
- Only children are indexed, plus any childless parent; the passage is rebuilt at retrieval time from
  siblings, **after reranking** in the two paths that rerank. On for Stage 5 section RAG, Stage 6
  lesson RAG and `search_documents`; off for evidence retrieval, where a citation must point at the
  fragment that matched. Measured 2026-08-13: average expansion 5.5×; resulting **quality** is not
  measured.

## Routing and models (2026-08-12, `43ab557d6`)

Seven live models: the workhorse is `deepseek/deepseek-v4-flash-0731` — a **pinned snapshot** — with
`openai/gpt-5.6-luna` as its fallback (owner, 2026-08-22), `z-ai/glm-5.2` for the deciding
judge and Stage 6's last chance, plus `google/gemini-3.7-flash`, `minimax/minimax-m3` and the two
image models. Four invariants to preserve: judges keep three separate vendors, `emergency` stays off
OpenAI, every fallback crosses vendors, and the three escalation phases avoid the default model on
both hops because by the time they run it has already failed.

**Judges, reshuffled 2026-08-22 by price** (`mc2-d1d09`): primary `gpt-5.6-luna`, secondary
**`deepseek-v4-flash-0731`**, tiebreaker **`glm-5.2`** (fallback `minimax-m3`). `executeSingleJudge`
takes `judgeModels.secondary`, so that seat is the **most frequent judge call in the pipeline** —
every lesson past the heuristics, 1318 of 1911 by history, against 608 that reach a panel — and it
held the dearest model of the pool. One pass on the measured shape (5144 in / 764 out): glm-5.2
$0.00729, minimax $0.00246, luna $0.00195, deepseek $0.00055.

**What moved to DeepSeek, and what did not.** 16 global rows where DeepSeek already served the same
phase at the other tier now lead with it — same model, different input size, reversible. The 30 rows
where it runs nowhere on that phase are the product's writing (lesson body, course structure, Stage 4
expert, the playbook's authoring phases) and are deliberately untouched: that needs a comparison run,
not an `UPDATE` (`mc2-tux1y`). The 12 `course_override` rows on two courses are also untouched.

Reasoning is per-phase and the budget is load-bearing: OpenRouter bills reasoning tokens against
`max_tokens`, so the budget is ADDED, and both the database and the seed generator refuse
`reasoning_enabled` without one. On for `stage_6_complex`, `stage_5_escalation`,
`stage_6_auto_last_chance` only.

Cost by tokens: **Stage 6 is ~90%** — 37.9% lesson generation, 30.0% judging, 20.2% section
generation; Stage 5 ~5.5%, Stage 4 ~1.9%. Epic `mc2-4clyr` holds what follows from that.

**The `~`-alias question is settled: routing stays on the pinned snapshot** (owner, 2026-08-22).
It was tried again that day and rejected; both reasons — the 2026-08-17 latency incident and the
empty endpoint list that silently disables the attempt pin — are written up in
`.codex/repository-failure-modes.md`. `listModelEndpoints` follows `alias_target.slug`, so an alias
is no longer unsafe; it is simply not what we route on.

**How to change any model id:** `DEFAULT_MODEL_ID`, every occurrence in `config-seed.json` and the
active rows of `llm_model_config` move **together**, and the database wins over the seed at runtime —
so edit the database first, then `pnpm generate:config-seed`, which reads it and rewrites the seed.
That order is the only correct one.

## Phase configs audited (2026-08-13, `7ad421986`)

Stored configuration is clean on the checks that matter. What was open was the seam, not the data:
Stage 5, metadata generation and `getModelForPhase` each dropped part of a phase config, and all
three now go through `buildProviderParams`, held by
`tests/unit/phase-config-provider-contract.test.ts`. Collision fallback: `google/gemini-3.7-flash`.
Open, none in the current epics: `mc2-s1vg5`, `mc2-9yrgb` (`stage_5_escalation` requested by nothing
— do not delete on that alone), `mc2-p6u8k`.

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete and the ledger **reconciles** — three times now, most recently to the
sixth decimal on two runs of 2026-08-22, one of them with an uploaded document (see the four tracks
below). What still constrains work:

- **The receipt exists.** `GET /api/v1/generation?id=` returns what OpenRouter actually billed, plus
  `cancelled` and `provider_name`. The id is in the body **and** in the `x-generation-id` header,
  which arrives before the body and before any abort, so even a timed-out call is countable. The
  record takes ~9.6 s to become readable — and for a call still running, never.
- **One rule, held by a guard.** A paid call prices itself at the call; a node-level summary row keeps
  tokens and carries **no** price. A priced call is _stamped_ `input_data.billedCall` — neither token
  counts nor step names tell a call from a summary. Guard: `tests/unit/shared/metrics/no-anonymous-spend`.
- **The catalogue is an estimate, not the price.** `MODEL_CATALOG` builds budgets and the
  `provider.max_price` ceiling; every call then settles against the provider.
  `tests/unit/model-catalog-coverage.test.ts` stays offline on purpose, because routing must not
  depend on a third party being reachable. `scripts/check-model-catalog-drift.ts` is the online half
  and exits **2** when it cannot reach the API against **1** when the catalogue is wrong — those must
  not look alike. In **no** CI job, deliberately: a provider's tariff change must not fail our build
  and with it the deploy. Scheduled non-blocking check: `mc2-ts9i2`.
- **One transport, one place.** Every OpenRouter client — chat and images — comes from
  `shared/llm/openrouter-client.ts`, the only place `instrumentFetchWithGenerationId` is attached.
  `one-openrouter-transport.test.ts` fails on a new one; its exception list may shrink, never grow.
  A LangChain clone keeps only constructor fields — see `.codex/repository-failure-modes.md`.
- **Images price like everything else, and ask how much detail to pay for.** The private price table
  is gone; `imageOutputPricePerMillion` in `MODEL_CATALOG` is the estimate until the provider settles
  it. Cards go through `POST /api/v1/images` at `quality: medium` — the only endpoint carrying that
  control — which took a card from $0.045076 to $0.0085605 (`mc2-xbqz8`). Covers stay on chat
  completions: that path is manual, owner's decision. `mc2-bnm62`: the `stage_7_card`/`stage_7_cover`
  rows in `llm_model_config` are read by nothing.
- **The playbook cover reaches a ledger.** `generation_trace.course_id` is a foreign key into
  `courses` and a playbook is not a course, so the cover is a `cardImage` node cost in
  `career_playbooks.cost_breakdown`, written from the image job because that job finishes _after_ the
  playbook row (`mc2-j9pmq`, `mc2-ietzn`).
- **Stage 6 and Stage 7 run their own workers, queues and containers.** Anything added to the general
  processor misses them; cost was wrong three times for exactly this.
- **`provider.max_price` below every endpoint is a refusal**, not a cheaper route: one wrong
  catalogue price would fail every call for that model, so the ceiling yields and the generation
  lives.

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
rate, a default rather than a promise: `z-ai/glm-5.2` ran $0.49 to $1.40 per million input in a day.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order: 49 work items plus 5
epics; do not re-open the 27 already closed with a commit or a measurement, and do not re-rank by
tracker priority. Complete through `mc2-sznhi` (T1), `mc2-3sz3d` (T2), `mc2-jz6y0.13.6` (T3),
`mc2-iioip` (T4) and the `mc2-wxun`/`mc2-vjbb` boundary (T5).

## Live operational facts

- `course_embeddings_v1` holds **6856 points** after the 2026-08-12 deduplication; an older snapshot
  restoring 13712 is not a fault, half of those are copies.
- Qdrant and uploads have a daily restricted pull to `helixa-new`; on-host snapshots share the docker
  volume with live data, so that pull is the only real mitigation.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production.
- Nine source documents are accepted as lost and are **not** in the indexed set (verified
  2026-08-13); do not reopen. Uploads live on the production host, not in Supabase Storage.
- Monitoring drift is a separate job, never a deploy step: it can trigger rollback.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infra work must use `scripts/with_host_operation_lock.sh`. Production workers take their env from
  `.env.<active_color>` (`cat /opt/megacampus/active_color`), **not** `.env.production`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` suites run on uid 1000
  only, 120s budget (mc2-bvynv).
- `graph-reviewed: blocked` — Graphify 0.9.14 has no `build` subcommand, so a rebuild goes through
  the `/graphify` skill flow; the graph is read, not refreshed.

## Owner decisions

Answered: `mc2-jz6y0.13.6` (pull-based off-host snapshots), `mc2-lrav0` (no backfill of dev Qdrant),
`mc2-db696.61` (`career_playbook_sources` has never held a row, so the first real `company_specific`
run measures it by itself).

**Answered 2026-08-22.** `mc2-dgw4u` — Stage 7 audio stays on its own OpenAI account, **paused, not
settled**: a reconciliation must keep saying "the OpenRouter spend is accounted for", not "the run
is". `mc2-b7olk.4` — document-evidence money belongs in the course total, one call one priced row,
the coverage registry becoming analytics; **delivered and accepted live**, see track B below.
Migrations approved **when necessary, useful and current**, one at a time. `mc2-hqfc3` video stays
parked; NotebookLM checked instead — and found unreachable (`mc2-xjykw`).

**Still open:** `mc2-v6fqp` — which third language; `mc2-xjykw` — the geo-bypass host, i.e. track C. "ru and en" stays the test language.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, **the migrations named in
`four-doors-marten.md`** when they prove necessary, and **`RAG_SHADOW_RETRIEVAL_RATE` in
production**. The OpenRouter key is shared with production: read its remaining credit before and
during a run.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`,
`mc2-1nots`, or `mc2-5e4ek.1`; see §9 of the active spec for exact reopen gates.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`. Branches were swept
2026-08-22 (`mc2-3mq9b`): 200 remote and 69 local down to **11 and 8**, four stashes kept as
`stash-archive/2026-08-22-*` tags and dropped, every sha in
`.codex/deleted-branches-2026-08-22.tsv`. `/push-dev` deletes the branch it delivered, so a report
naming a branch again means something really was left behind.

## Explicit defers

- `mc2-6ye5z.4/.5/.8`, `mc2-rmbwo`, `mc2-p99f1` — all blocked on `mc2-xjykw`, below. `mc2-r7udy`
  needs no migration (`system_metrics` carries no CHECK).
- `mc2-db696.106`/`.107` — PDF fidelity and grounding. Separate deploy accounts: not planned.
  `mc2-gmab0` — held by unit tests. `mc2-f1tqd` — an empty provider response crashes the parse; did
  **not** recur on the 2026-08-22 runs.

## The four tracks of `four-doors-marten.md`, run 2026-08-22 (numbers in the `bd` close reasons)

**A and B are closed** (`mc2-bxmje`, `mc2-b7olk.4`), both reconciled to the `/credits` delta at the
sixth decimal. A cut a micro course $0.1027 → $0.030963 and the card image 4.9×; the single judge now
runs on deepseek. **What A could not show:** all three lessons scored 0.91–0.94, no panel convened,
so the 0.80 → 0.75 threshold move is still unmeasured — that needs accumulated `singleJudge.score`.
B was already built (`eb939d21f`); only the live acceptance was missing, and the runbook's "do not
upload a document" caveat is now lifted.

**C is blocked at the network, not the library (`mc2-xjykw`, P0).** NotebookLM is unreachable from
both bridges: the SOCKS5 geo-bypass at `172.19.0.1:1080` has no listener and the upstream
`185.200.177.180` refuses port 22, so restarting autossh cannot help. Without the hop a request lands
on `https://notebook.google/` and dies extracting a CSRF token — dropping the proxy is not a
workaround. Cookies are fine (66 of 70 alive, earliest expiry **2026-08-28** — renew soon). Nothing
has generated since 2026-04-15, so nobody noticed. A third-party host: the owner's call. Fixed
alongside: the health check passed on a set variable rather than an open socket; `mc2-aqsjj` pinned
`notebooklm-py==0.8.0` (dev 0.6.0, prod 0.8.0, chosen by build date); `mc2-3d3ku` — the bridge suite
is in no CI job and was red.

**D — switch live, proof pending (`mc2-wxun` closed).** `RAG_SHADOW_RETRIEVAL_RATE=0.05` is on the
running production Stage 6 worker, in **both** `.env.green` and `.env.blue` so a colour flip cannot
drop it. No rows yet — the shadow fires only on a Tier 1 exit and production has not generated since.
Count `step_name='tier1_shadow'`; raise 0.05 once rows land, then `mc2-vjbb`.

**Two defects the runs found**, which is the runs working. `mc2-80o1t` (fixed): one `null` from the
model discarded a lesson's entire LLM self-review, and two of three lessons reached the judge on
heuristics alone while Stage 6 reported success. `mc2-kznfz` (logged, cause open): a course with an
indexed document produced zero RAG chunks in 143 ms through the only empty path writing neither log
nor trace row — the lesson's documents and the accepted evidence set did not intersect. That branch
sits **above** the Tier 1 gate, so track D's cohort cannot see this case at all.

**Three owner decisions of 2026-08-20/21 bind the routing work:** a failing provider is ignored only
inside the current chain of attempts, never in a standing blocklist; cheapest stays the goal
(`max_price` a ceiling, `sort=throughput` out); waiting is acceptable, so raise timeouts.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: **`mc2-tux1y`** — the comparison run track A unblocks.
Recommended action: run `mc2-tux1y` (same course twice, one variable, plus an editorial read), then
`mc2-kznfz`. C waits on the owner. Use $orchestrator-stage for an epic; single tasks are local work.

## Starter prompt for next orchestrator

`.codex/next-goal-four-doors.md` is **stale** — three of its four tracks are closed. Start from the
four-tracks section above and `docs/plans/cheaper-verdict-heron.md` ("The decision this unblocks").
**Do not ask — act and report**, inside the standing authorization under Safety boundary.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
