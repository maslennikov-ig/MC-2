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
Open, none in the current epics: `mc2-s1vg5` (`generate:config-seed` exits 0 on an unreachable
database), `mc2-9yrgb` (`stage_5_escalation` requested by nothing — do not delete on that alone),
`mc2-p6u8k` (Stage 5 last-resort constants name retired models).

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete and the ledger **reconciles**: the run of 2026-08-22 came to
$0.202480 against a `/api/v1/credits` delta of $0.202481, with a third figure — the provider's
charge summed over all 65 recorded generation ids — agreeing to the same decimals. 25 of 25 billed
calls carried a provider receipt (`mc2-z0xr3`, `mc2-79lvc`). Evidence is in the `bd` close reasons.

What still constrains work:

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
rate, which with many providers is a default rather than a promise: `z-ai/glm-5.2` ran $0.49 to $1.40
per million input on one day.

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
  infra work must use `scripts/with_host_operation_lock.sh`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` suites run on uid 1000
  only, 120s budget (mc2-bvynv).
- `graph-reviewed: blocked` — Graphify 0.9.14 has no `build` subcommand, so a rebuild goes through
  the `/graphify` skill flow; the graph is read, not refreshed.

## Owner decisions

- `mc2-jz6y0.13.6` — answered: pull-based off-host snapshots, 14-day retention, low priority.
- `mc2-lrav0` — answered: do not backfill dev Qdrant embeddings. `mc2-db696.61` — needs a live run
  and a cost/quality decision.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** It covers paid runs inside
the USD 5 ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, and branch/worktree cleanup. The OpenRouter key is shared
with production, so read its remaining credit before and during a run.

Outside it, and needing a fresh decision each time: reindex, force-push, secrets or access changes,
production mutation, and schema migrations — the only approved one is `mc2-ufpko` (2026-08-13).

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`,
`mc2-1nots`, or `mc2-5e4ek.1`; see §9 of the active spec for exact reopen gates.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`. Branches were swept
on 2026-08-22 (`mc2-3mq9b`): 200 remote and 69 local down to 10 and 10, shas preserved in
`.codex/deleted-branches-2026-08-22.tsv`, and `/push-dev` now deletes the branch it delivered — so a
report that names a branch again means something really was left behind.

## Explicit defers

- `mc2-v6fqp` — live Stage 6 multilingual quality matrix; needs an approved spend budget and
  disposable inputs.
- `mc2-wxun`, `mc2-vjbb` — instrumented, disabled, locally accepted; enabling a cohort and changing
  0.15 are owner actions.
- `mc2-r7udy`, `mc2-6ye5z.4/.5/.8` — each needs a new enum value or table; the only migration the
  owner approved was `mc2-ufpko` (2026-08-13).
- `mc2-db696.106`/`.107` — PDF fidelity and content grounding; `.108` partly overtaken.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`.
- `mc2-gmab0` mandatory-reasoning recovery — no model has refused in any run, so it is held by unit
  tests only. It does now cover the structured call sites (`mc2-148j9` closed).
- `mc2-b7olk.4` — document evidence prices itself into its own coverage ledger and never reaches the
  course total; where that money belongs is a decision, not a forgotten argument.
- `mc2-f1tqd` — five attempts died reading an empty provider response instead of naming it; free but
  slow, and hidden behind the retry that saved it.
- `mc2-dgw4u` — **owner question:** Stage 7 audio bills a separate OpenAI account, outside every
  OpenRouter reconciliation by construction; whether it stays there is undecided.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: **`docs/plans/cheaper-verdict-heron.md`** — the paid run that turns 2026-08-22's
calculated savings into measured ones (`mc2-bxmje`), then the writing-phase comparison it unblocks
(`mc2-tux1y`, with `mc2-oofx5` riding along). Both inside epic `mc2-4clyr`, now 3 of 6.

Recommended action: run `mc2-bxmje` against that plan, then `mc2-tux1y`.
Use $orchestrator-stage for the epic; single tasks are ordinary local work.

**Correct the epic's headline before planning from it.** Across all 1589 judged lessons rather than
the 490 that reached a judge: 69.2% settled free by heuristics, 6.3% one judge, 17.6% two, 6.9%
three — the full panel runs _below_ its 15-20% design target, not four times above it. And "Stage 6
is 90%" is a share **by tokens**: by money, on a small course, the two card images were 46% of the
window until `mc2-xbqz8` cut them by 81%.

**What 2026-08-22 changed in the cascade** is in the plan in full: the single-judge seat moved off
the pool's dearest model, the threshold went 0.80 → **0.75** off a measured distribution (1302
verdicts, median **0.820**, so 0.80 sat on the steepest point of the curve), the single judge and the
panel had **different prompts** and now share the panel's, and only because of that a lesson reaching
the panel is no longer judged twice. Held by
`tests/unit/stages/stage6-lesson-content/judge/cascade/single-verdict-is-accepted.test.ts`, written
as behaviour so the number can move again.

Estimated at list rates, per lesson past the heuristics: judging **$0.01173 → $0.00140**. An
estimate, not an invoice. Two caveats arithmetic cannot remove: 21.2% is the third-judge rate over
the _old_ panel population, and the run cannot show the threshold effect at all — see the plan.

**Three owner decisions of 2026-08-20/21 bind the routing work**, not to be revisited without a new
one: a failing provider is ignored only inside the current chain of attempts, never in a standing
blocklist; cheapest stays the goal, so `max_price` is a ceiling and `sort=throughput` is out; waiting
is acceptable, so raise timeouts rather than chase speed.

## Starter prompt for next orchestrator

It is written and checked: **`.codex/next-goal-cheaper-verdict.md`** (`prompt-check` clean at 1500
chars). Paste it into a fresh session. It is on disk and **untracked** — `.gitignore` keeps
`.codex/*` out bar the named few — so look for the file, not a commit; everything it depends on is
tracked, and it repeats the standing authorization for a reader who has only the prompt.

In short: `mc2-bxmje` against `docs/plans/cheaper-verdict-heron.md`, then `mc2-tux1y`.
$orchestrator-stage for the epic; single tasks are ordinary local work. **Do not ask — act and
report**, inside the standing authorization under Safety boundary.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
