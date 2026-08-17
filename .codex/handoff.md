# Orchestrator Handoff

Updated: 2026-08-16. Effective kernel: `shared-orchestration/v1`.

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

## Live course run (2026-08-15, `mc2-2pplo` — a course reached Stage 6 and published)

Epic `mc2-qrdkt` is complete, 17 of 17. Course `8a174ee7` finished: `published`, 3 lessons,
quality 0.93, 18-22 KB of real Russian content per lesson on `openai/gpt-5.6-luna`. Total spend
across every attempt **USD 0.222333** of the USD 5 ceiling; the successful course itself cost
USD 0.042368 (stage_4 0.0118, stage_5 0.0013, stage_6 0.0293). Test data was removed in full.

Eight defects, each of which alone stopped a course, were found and fixed during the run: the shape
of Stage 4's lists, a number sent as a string, the conflict detector's envelope, mandatory reasoning
on five models rather than one, `answer_source='system'` against a CHECK plus a cost-rounding guard,
10 KB of JSON in a PostgREST URL, a micro course judged against `general_auto`, and a generation
lock held across a stage handoff. Details in the `bd` close reasons.

**What the run taught, beyond the fixes (2026-08-16).** Most causes were known to the code and never
printed. Four blindness sites were repaired during the run and the sweep afterwards found more:
twelve pipeline sites reduced a PostgREST error to `message` alone (`describeDatabaseError` now
appends `code`/`details`/`hint`), the downstream reducer checked its unit set outside the retry
budget written for it, the Stage 6 judge parser said how many bytes came back instead of which field
was wrong. Audits of the other three failure families — envelope fragility, validation outside a
retry budget, a lock held across a handoff — found one real instance each and are recorded closed
with the places checked (`mc2-qrdkt.4` through `.7`).

**Stage 6 and Stage 7 spend now reaches the course.** `courses.estimated_cost_usd` stopped at
Stage 5 because the refresh lives in the general sandboxed processor and those two stages run on
their own queues in their own containers. Stage 7 was unpriced for a second, separate reason, and
the first attempt named the wrong one: widening `stageOfPhase` to `stage_7` priced nothing, because
Stage 7 does not use the LangChain path that function belongs to. Its six calls go through the
OpenAI SDK client and none passed a `costContext`, so they left no trace row at all. All six now do,
and a guard reads the sources so the next call site cannot forget (`mc2-gmab0`).

**Live confirmation run (2026-08-16, course `944e6795` on dev, USD 0.0646 billed).** A micro course
ran end to end plus one Stage 7 quiz, with no other traffic on the key in the window. Two of the three
`mc2-gmab0` fixes are now proven on real data, and the run found what the tests could not:

- Confirmed: the Stage 6 container itself refreshes the course total (`0.003264 → 0.020332 →
0.027658`), and Stage 7 SDK calls now write priced `stage_7` trace rows — including the two that
  failed, which is the failed-stage-spend fix working.
- Not confirmed: the mandatory-reasoning recovery never fired. No model refused, so it stays held by
  unit tests alone.
- **The course total is still wrong, for a reason the fix did not touch.** Recorded 0.0310 against
  0.0646 actually billed. Stage 6 lesson generation carries no price at all on the synchronous path
  (`mc2-4wiot`, P0: `generationCostUsd` is only set from a Batch prefetch or a retry, and Batch is off
  by default), and the card image's USD 0.007 lives only in the enrichment metadata (`mc2-acjgd`).
  About a cent beyond those two is still unexplained — `mc2-z0xr3` is the reconciliation.
- Also found: quiz generation dies whenever the model answers `time_limit_minutes: null`, and pays
  for both attempts (`mc2-d3726`); the Stage 6 finalize progress warning names no field (`mc2-g3v9c`).

**Everything that run exposed is fixed and merged, except the count itself (`mc2-b7olk`).** One rule
replaced four half-conventions: a paid call prices itself at the call, from its own token split and
the model the provider actually served; a node-level summary row keeps tokens and carries no price.
Writing lessons, continuing a truncated one, regenerating a section, self-review, both judge paths,
the patcher, the delta judge, the expander, image generation, Stage 2 summarization, Stage 3
classification, the Stage 4 visual style, the mermaid repair and the presentation critic all do this
now. `judge_complete` stopped estimating — it split the whole cascade's tokens evenly across judges
and charged refinement tokens at judge rates — because pricing the calls while it still estimated
would have counted the same tokens twice.

Two holes are named rather than closed, both found by the guard while writing it: document evidence
prices itself into its own coverage ledger and never reaches the course total (`mc2-b7olk.4`), and
editing a course — chat, inline blocks, element CRUD — has no stage in `generation_trace` to charge
at all (`mc2-b7olk.5`). They are in the guard's exception list with those ids, so the list can shrink
but not grow in silence.

**Second confirmation run (2026-08-17, course `b0b2efde` on dev, USD 0.092839 billed).** No other
traffic on the key: the baseline read equalled the previous run's closing figure to the cent, and all
production containers were silent through the window.

- The recompute is exact: `estimated_cost_usd` 0.0509 == `sum(generation_trace.cost_usd)` 0.050911.
- Newly visible, and previously worth nothing: lesson generation (`stage_6_content`, 5 calls, 29544
  tokens, 0.012492), the section expander (0.002745), the card image (`image_call`, 0.007).
- Nothing is double-counted: `generator_complete` and `judge_complete` carry tokens and no price.
- The recorded share of the bill went from 48% (0.0310 of 0.0646) to 55% (0.0509 of 0.0928).

**The sum still does not reconcile — 0.0419 unexplained — but the run named three reasons instead of
leaving a mystery.** Self-review passed no `courseId`, so five calls and 37159 tokens were
unattributed; that is fixed here, and it is the class the source guard cannot see, because the call
site does pass a context and the context is simply empty. The provider served
`deepseek-v4-flash-0731`, a dated snapshot that is not a catalogue key, so that row was written with
no price at all — and its real tariff is 1.7× the alias it was asked for (`mc2-b7olk.6`). Three quiz
attempts died on a 4-minute timeout and left no row at all, because the price is recorded only after
a successful response (`mc2-b7olk.7`); the timeouts themselves are `mc2-b7olk.8`, and they cost the
course its quiz. Those three come to roughly 0.013 of the 0.0419; about 0.029 is still unaccounted.

`mc2-z0xr3` stays open, and the next run belongs after `mc2-b7olk.6` and `.7` — otherwise the gap is
again a sum of several causes and again impossible to split.

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
- `mc2-z0xr3` — the one paid run that proves the total. Needs current authorization to spend; the
  fixes it verifies are merged and deployed.
- The eight §9 exclusions listed under Safety boundary — gates already recorded there.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: `mc2-z0xr3`, then epic `mc2-4clyr`

Recommended action: `mc2-z0xr3` — one paid micro course, `/credits` read before and after, recorded
total compared against the delta. Every fix it verifies is merged; what is not verified is that they
add up. Do not start `mc2-4clyr` before that number holds: the epic is about cutting generation cost,
and on 2026-08-16 the recorded cost was roughly half the real one. Costing it on today's numbers
would cost it on a number we already know is wrong.

`mc2-4clyr`'s headline number needs correcting first: across all 1589 judged lessons rather than the 490 that
reached a judge, 69.2% are settled free by heuristics, 6.3% take one judge, 17.6% two and 6.9% three,
so the full panel runs _below_ its 15-20% design target, not four times above it. `mc2-r31fw` step 1
cannot be done from history — `singleJudge` is null in every stored cascade row.

## Starter prompt for next orchestrator

The starter prompt lives at the end of `docs/plans/humble-floating-widget.md`. Use $orchestrator-stage
for the epic itself; single tasks are ordinary local work. Do not enable the cohort, change its
threshold, reindex, force-push, deploy, migrate beyond `mc2-ufpko`, or spend beyond the USD 5 ceiling
without separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
