# Orchestrator Handoff

Updated: 2026-08-28. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries.

## Current stage

The technical-debt epic `mc2-cuk7j` is **complete, six of six**. Four closed 2026-08-24 (`.1` web
tests that could not parse, `.5` lint warnings to zero, `.3` closed as WRONG — the pipeline had
built the bridge image since 2026-07-12 — and `.6` the Q12 manifest generator plus the dead
`.venv-nlm`). The two owner-gated items closed 2026-08-25 and are the only ones that still
constrain work:

`mc2-cuk7j.4` — **the bridge re-mints its own cookies now.** One browser sign-in yielded a durable
master token; `app/master_token_refresh.py` mints the web session from it on a weekly interval with
no browser at all. It lives in the FastAPI lifespan rather than in `deploy/systemd`, because CI
deliberately does not install those units and `is-active` is green whether or not the file moves.
`/health` gained a `master_token` check that FAILS while no token is present. Building it exposed a
live trap that took production and dev down together for a minute: the CLI's group callback MOVES
the home-root `storage_state.json` into `profiles/default/`, and only the **group-level**
`--storage` (before the subcommand) skips it. The loop reconciles that fork on its own tick; the
full account is in `.codex/repository-failure-modes.md`.

`mc2-cuk7j.2` — production carries the fixed image and the `:rw` secrets mount, delivered by an
ordinary `develop → master` release. Patching the host is what caused the original problem: the
next master deploy restores whatever the file says.

`docs/plans/composed-dazzling-moore.md` is **complete and live** — the coordinated Docling stack
jump (Serve 1.31.0, docling-slim 2.121.0, core 2.92.0, MCP 3.1.0) with PDF heading inference on in
both places it is read, verified on the host after the deploy. Its three durable guards moved to
`.codex/repository-failure-modes.md`; the measurements are in the plan and in the commits.

Off-host Qdrant retention is **7 days** by owner decision (2026-08-23); the allow-list interpolates
`EXPECTED_RETENTION_DAYS` rather than repeating it, after the two copies drifted to 7 against 14.

The previous stage remains accepted: `docs/plans/brawny-mellow-quokka.md` is **complete**, every
phase delivered, phase 2 (`mc2-51epl`) **accepted** on the paid run of 2026-08-23 — course
`6b3b183e`, dev workers on `afe03056f`. The Career Playbook quality track stays **accepted**
(`mc2-db696.110`); its two rules in `06-quality-acceptance.md` hold: read the artifact before calling
a run accepted, and clean up **after** the editorial pass.

## The eight warnings (2026-08-23, `mc2-51epl`) — accepted

The run: 0 errors, 9 warn lines, and of the eight only **"Section duplication detected"** (3x),
which fires exactly when the filter fails and here reported a real one. The self-reviewer trio
stayed silent too, so `cd9b60138` is not only repaired but running. Ledger: 0 billed calls unpriced,
23 of 23 generation ids answered, provider $0.037857 against a recorded $0.037859. What constrains
work from here:

- **`prompt_templates` is now fully guarded.** `scripts/sync-prompt-templates-to-registry.ts`
  reads `0 that no longer fit` and **0 with no registry entry**: the five orphans were retired
  2026-08-24 (`mc2-jraut` closed), so 21 active rows became **16, every one inside
  `checkOverrideContract`**. Retire another with `--deactivate=key_a,key_b`. Why the guard exists,
  and the two traps in retiring a row, are in `.codex/repository-failure-modes.md`.
- **A pure routing function cannot end a lesson.** The judge now writes its own terminal
  review_required when the regeneration cap is reached, naming the cap and the score, so
  `executeStage6`'s safety net is a net again — it had been the only path, 76 of the 154
  `review_required` rows.
- **Layer-3 Stage 4 recovery is real but narrow.** `initialize_fsm_with_outbox` accepts only
  NULL/`pending`/`completed`/`failed`/`cancelled` and raises 23505 from anything else. Every
  `stage_4_*` status now counts as initialised, and one the RPC cannot accept is reported rather
  than attempted. 37 of the 182 FSM initialisations in this database came from this path.

## RAG retrieval, chunking and parent expansion (2026-08-12/13, measured 2026-08-26)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`, `mc2-o3s4r`; `mc2-lrav0` on the owner's
"no backfill". What still constrains work:

Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.65
ceiling); why, and the rule it produced, are in `.codex/repository-failure-modes.md`. Degenerate
parents no longer reach the index (`selectIndexableChunks`). Only children are indexed, plus any
childless parent; the passage is rebuilt at retrieval time from siblings, **after reranking** in the
two paths that rerank. On for Stage 5 section RAG, Stage 6 lesson RAG and `search_documents`; off for
evidence retrieval, where a citation must point at the fragment that matched.

**Expansion runs at 1.00x on the live corpus, not 5.5x** (`mc2-xg6g8`). `sibling_chunk_ids` is empty
on all 6856 points — every one was indexed in July 2026 with `total_chunks: 1`, before degenerate
parents were kept out — so there is nothing to stitch and 0 of 7785 measured results widened. The
5.5x is what expansion **will** cost once a document is indexed with the current chunker; it is not
what production pays today. The token ceilings (20K Stage 6, 40K Stage 5) are never approached.

**Retrieval quality is a number now:** recall@5 **0.9677** Stage 5, **0.9677** Stage 6, **0.4839**
`search_documents` (the only path that does not ask for hybrid). Re-run with
`pnpm --filter @megacampus/course-gen-platform benchmark:rag run` against the live collection
read-only; the 76-query set and its vectors are in `packages/course-gen-platform/eval/rag-retrieval/`.
Full results and method: `docs/rag/2026-08-26-retrieval-quality-measurement.md`; the read-only
platform pass is `docs/rag/2026-08-26-qdrant-operations-recheck.md`.

Three things that measurement changed or exposed:

- **Stage 5 was never hybrid for a section plan of three or fewer queries.** `max_query_limit` is 100
  and applies to a prefetch limit; Stage 5 asked for 300/150/102 and got `Bad Request` → dense-only,
  on every such query. `getPrefetchLimit` now clamps to the collection's own ceiling. Stage 5
  recall@5 0.7742 → 0.9677, MRR 0.6290 → 0.9097, fallbacks 76/76 → 0/76.
- **The dense threshold costs nothing between 0.15 and 0.30** on any entry point, and above 0.30 only
  the dense-only path loses answers. 0.25 stays, now measured rather than inherited.
- **A fused RRF score is NOT on a different scale from a dense cosine one.** The old comment said 0.7
  was unreachable for RRF by construction; measured, fused scores reach 1.0000 against dense bests of
  0.45–0.65. The advice stands, the stated reason was wrong in the dangerous direction.

**Stage 6 no longer caps results per document** (`mc2-zewto`, owner-authorised 2026-08-27, reversing
`mc2-jz6y0.16` for lesson content only). The cap cost 22.6 points of recall@5 and bought 0.11
documents per lesson: one document already supplied the whole context in six lessons of nine WITH it
in force, because these courses do not hold several documents bearing on one lesson. Removing it took
Stage 6 to recall@5 0.9677, MRR 0.7774, 29.97 candidates per query — the pool `candidateMultiplier: 4`
was always asking for — and took accepted-results-outside-the-fusion from 124 of 475 to zero.
Grouping is untouched where it earns its keep: Stage 4 evidence preflight, conflict detection and
Stage 5 advisory enrichment group deliberately, because their job is per-document coverage.

## Routing and models (2026-08-12, `43ab557d6`)

Ten live models. The workhorse is `deepseek/deepseek-v4-flash-0731` — a **pinned snapshot** — with
`openai/gpt-5.6-luna` as its fallback (owner, 2026-08-22), `z-ai/glm-5.3-flash` for prose,
`z-ai/glm-5.2` for the deciding judge and Stage 6's last chance, plus `google/gemini-3.7-flash`,
`minimax/minimax-m3` and four image models. Four invariants: judges keep three separate vendors,
`emergency` stays off OpenAI, every fallback crosses vendors, and the three escalation phases avoid
the default model on both hops because by the time they run it has already failed.

**Images, settled 2026-08-27** (`abf4209d3`). Card `openai/gpt-5-image-mini` at `quality: 'medium'`,
$0.0091 a frame — measured against all 47 square-capable models on OpenRouter and cheapest of them,
so this is a finished search rather than a preference. Banner `sourceful/riverflow-v2.5-fast`,
$0.013954 against the previous Gemini's $0.038725, fallback `openai/gpt-image-2` because the mini
line cannot do 16:9 at all. Three things had to be true first and none of them were: the route asked
`startsWith('openai/')` and so sent 37 of the 48 image models to a chat endpoint that does not carry
them; `quality` went to every model on the Images API when only 7 publish it; and the catalogue
priced images per token when 26 of the 48 charge per frame and report no tokens
(`imagePriceFlatUsd`). Banner ratio is **16:9, matching the prompt templates**, which had said so
all along while the code asked for 21:9. Gemini keeps a flex pin — half price, and OpenRouter never
selects it unasked — for whenever it is routed to again. Card prompts carry `input_references`: a
lesson card is shown the course card, so a set looks like a set rather than merely satisfying the
same four lines of prose.

**Judges, reshuffled 2026-08-22 by price** (`mc2-d1d09`): primary `gpt-5.6-luna`, secondary
**`deepseek-v4-flash-0731`**, tiebreaker **`glm-5.2`** (fallback `minimax-m3`). `executeSingleJudge`
takes `judgeModels.secondary`, the **most frequent judge call** — 1318 of 1911 lessons.

**Superseded 2026-08-27 (`a8df57ecc`, `mc2-r8shw`): prose now runs on `z-ai/glm-5.3-flash`.** Same
seats as the 2026-08-23 ruling below — `stage_6_content` and its tier variants, `section_expander`,
`refinement`, and the playbook's prose groups, 18 rows. Like for like on one topic through one
pipeline: total $0.019854 against $0.037859, Stage 6 $0.005267 against $0.024493 — 48% and 78%
lower. The 78% is `content` and `section_expander` only: `refinement` had been on DeepSeek at
$0.064/1M against this model's $0.074, so that move bought better prose at the same price and no
saving. Judges, every `chat_*`, Stage 2/4/5, the playbook spec and both escalation hops stayed put —
those parse the answer, and this model ignores a strict `json_schema`, replying in a shape of its
own. The trap it exposed is the one to remember: `requiresReasoning` shipped in the same commit as
the routing, so the first live run measured a container that did not yet know the model and looked
like a model failure. **Never measure a model on a container that has not been told about it.**

**Its fallback stopped being DeepSeek on 2026-08-28** (`24d14edd6`). The cross-vendor rule was
satisfied and the point was still missed: DeepSeek is not the other model for prose, it is the one
this seat was taken away from — the 0.88-against-0.92 lesson below is exactly what a z-ai outage
would have served, and the judge that missed the fabricated "более 60% людей" once would have missed
it again. `PROSE_FALLBACK_MODEL_ID` is `openai/gpt-5.6-luna`: third vendor, itself the prose model
until 2026-08-26, ten times DeepSeek's output rate and reached only when the primary fails, which in
90 days of `generation_trace` it never has. Eighteen rows plus `stage_6_content`, which has no row
and is served from `STAGE6_CANONICAL_PHASE_DEFAULTS`. Judges, `patcher` and `arbiter` stay on
DeepSeek for the reason below.

The 2026-08-23 ruling it replaces, kept for its method:

**Settled 2026-08-23 (`d179a18d0`, `2e01e0b02`): whatever AUTHORS prose the reader opens runs on
Luna** — `stage_6_content` and its three tier variants, `section_expander`, `refinement`, both
tiers, database and offline defaults, and the playbook's prose groups. The method matters more than
the result: same input twice, read the artifact, do not trust the judge. It moved only 0.92 → 0.88
on a lesson where DeepSeek wrote 29% shorter, narrated instead of working an example, and invented
"более 60% людей" with no source; in the playbook it invented a whole "Текущее значение" column —
CSAT 87%, FCR 68%, backlog 8% — reverse-engineered from each metric's own yellow band and served as
fact about the customer's company, one run in two. `stage_6_simple` is 166 of 274 lessons, so this
is most of the product, not a cheap tier. What EDITS under an instruction (`patcher`) or never
reaches the reader (`arbiter`, `rag_planning`, secondary judge, Stage 2/3/4 internals,
`stage_5_simple`) stays on DeepSeek. Tool: `scripts/career-playbook-model-ab.ts`, which changes no
stored configuration — a global `UPDATE` moves other people's runs on the shared database, and
`llm_model_config.course_id` cannot reference a playbook at all.

Reasoning is on for `stage_6_complex`, `stage_5_escalation` and `stage_6_auto_last_chance` only.
Two inactive duplicate rows remain (`mc2-f6del`).

**Where the money goes, remeasured 2026-08-27 in dollars rather than tokens** (epic `mc2-4clyr`).
The old "Stage 6 is ~90%" was a token count taken before the card was billed at all, and it is no
longer the shape. A month of real courses to 2026-08-26 came to $0.9728: Stage 6 prose 49.6%, the
**cover image 25.6%**, judges 13.1%, Stage 4 6.4%, Stage 5 4.9%. After the prose move that leaves
the card as the largest single line of a small course — 47% of a four-lesson one, since it is one
picture per course while Stage 6 scales with lessons. All three of the epic's levers have landed:
the judge cascade (a cheap secondary gate settles 37% of lessons alone, which is why judging fell
from 30% to 13%), the model substitution, and cost accounting itself.

**The `~`-alias question is settled: routing stays on the pinned snapshot** (owner, 2026-08-22).
Both reasons — the 2026-08-17 latency incident and the empty endpoint list that silently disables
the attempt pin — are in `.codex/repository-failure-modes.md`, together with how a model id must be
changed (database first, then `pnpm generate:config-seed`) and why a reasoning budget is added to
`max_tokens` rather than taken out of it.

**Ten models, and the derived set is exactly the declared one.** `collectRoutableModelIds()`
returned 20 before 2026-08-28 and returns 10 now, matching `LIVE_ROUTING_MODEL_IDS` element for
element; `model-catalog-coverage` asserts the equality, which fails both when a registry goes silent
and when a new one appears undeclared. The alias `deepseek/deepseek-v4-flash` and
`qwen/qwen3-235b-a22b-2507` left routing entirely (`mc2-v6r1p` closed by that measurement, not by
updating its numbers). The last thing keeping an eleventh model on the wire was the rename map —
`qwen/qwen3.5-plus-02-15` pointed at `qwen/qwen3.7-plus`, named by nothing else — so a replacement
must now be in **live routing**, not merely catalogued.

**The cheapest endpoint is now the cheapest that can finish** (2026-08-28, `263ae6c37`, `mc2-6a1x4`).
`MIN_ENDPOINT_THROUGHPUT_TPS = 30`, derived from the largest ordinary Stage 6 budget (8000 tokens)
against its 300 s phase timeout. It matters because price-only sorting was sending the workhorse
`deepseek/deepseek-v4-flash-0731` to a **9 tok/s** endpoint that could not finish inside that
timeout, with a 99 tok/s one available for three hundredths of a cent more per million. Exactly two
of the ten live models move. The floor cannot refuse every endpoint, ignores an endpoint that
publishes no figure, and never reaches across service tiers — `openai/flex` at $0.10/26 tok/s
against `azure` at $0.20/68 is why. `throughput_last_30m` is an **object** `{p50,p75,p90,p99}`;
`uptime_last_30m` beside it is a number. Uptime is deliberately not a criterion (owner, 2026-08-27):
a down endpoint fails its attempt and the chain moves on; a slow one just spends the budget.

**One table decides which model a phase gets** (2026-08-28, `3cb14ffb6`, `mc2-u8kwx`). The decision
lives in `llm_model_config`, the superadmin panel edits it, `config-seed.json` is the committed
snapshot every offline path reads, and `model-defaults.ts` names the four roles a snapshot cannot
express (default, fallback, large-context, prose). Everything else was a second answer and is gone:
`PHASE_FALLBACK_CONFIG` (a hand-kept copy that disagreed with the database on **eleven** phases, and
not dormant — `langchain-models.ts` routes every config-service failure into it, which is what put
eleven distinct model ids into sixty days of `generation_trace`, the `mc2-a6qxc` mystery);
pipeline-admin's `DEFAULT_MODEL_CONFIGS` (60 phases typed by hand, so "reset to default" wrote a
third opinion — and could not reset the eleven `stage_career_playbook_*` phases at all);
`shared/llm/model-selector.ts` in full (eleven models nothing selected, yet the price gate read it
and believed four dead ids were live routes); Stage 5's `MODEL_FALLBACK` (its `modelOverride` was
written into graph state and read by nothing, so the log named a model no call was made with).
**The guard is `model-ids-live-in-one-place.test.ts`**: it walks every tracked file under `src/` and
fails on a model id spelt out anywhere outside six named registries. Two further checks state the
invariant directly — the panel's default and the runtime's default agree for every phase in
`phaseNameSchema`, and every phase the panel can reset has something to reset to.

**Phase configs** (2026-08-13, `7ad421986`): Stage 5, metadata generation and `getModelForPhase` all
go through `buildProviderParams`, held by `tests/unit/phase-config-provider-contract.test.ts`;
collision fallback `LARGE_CONTEXT_MODEL_ID`. `stage_5_escalation` is now first in
`getEscalationChain('generation')`, ahead of `stage_4_expert`, which had been retrying Stage 5 on
the model that just failed with a SMALLER output budget than a normal attempt; output ceilings were
checked BEFORE wiring it up (`mc2-s1vg5`, `mc2-9yrgb`, `mc2-p6u8k` closed). Giving those rows a
caller also made one of them matter: five pointed at Luna and the sixth, `en`/`standard`, at
DeepSeek, so an English standard course escalated _downwards_ — and for `stage_5_simple` onto the
model that had just failed, the exact thing the change was written to stop. Corrected 2026-08-27
before it ever fired (`602c4c075`, `mc2-v1p12`); `routing-seed-integrity` now fails any phase whose
model changes with language alone, which found exactly that one row.

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete and the ledger **reconciles** — three times, most recently to the sixth
decimal on two runs of 2026-08-22. What still constrains work:

- **The receipt exists.** `GET /api/v1/generation?id=` returns what OpenRouter actually billed. The
  id is in the body **and** in the `x-generation-id` header, which arrives before any abort, so even
  a timed-out call is countable — proven again 2026-08-23, $0.000898068 recovered from an attempt
  that returned nothing. The record takes ~9.6 s to become readable; for a call still running, never.
  A paid call prices itself at the call; a node-level summary row keeps tokens and carries **no**
  price, and a priced call is _stamped_ `input_data.billedCall`. Guard: Guard: `tests/unit/shared/metrics/no-anonymous-spend`.
- **The catalogue is an estimate, not the price.** `MODEL_CATALOG` builds budgets and the
  `provider.max_price` ceiling; every call settles against the provider.
  `model-catalog-coverage.test.ts` stays offline on purpose, and
  `scripts/check-model-catalog-drift.ts` is the online half, in **no** CI job deliberately (a
  provider's tariff change must not fail the build and with it the deploy). It runs nightly and
  **writes** the published rates into the catalogue and its snapshot, committing to `develop`; only a
  move of 1.5x or more — the same factor `max_price` is built from, past which a frozen rate starts
  refusing calls — goes to Telegram. It filed a GitHub issue for two months instead, which asked a
  person to retype two numbers the job already had. Never retype a rate in a test: that turned eight
  cases red for no defect.
- **One transport, one place.** Every OpenRouter client comes from `shared/llm/openrouter-client.ts`,
  the only place `instrumentFetchWithGenerationId` is attached; `one-openrouter-transport.test.ts`
  fails on a new one, and its exception list may shrink, never grow.
- **Images price like everything else.** Cards go through `POST /api/v1/images` at `quality: medium`,
  the only endpoint carrying that control — $0.045076 to $0.0085605 per card (`mc2-xbqz8`). Covers
  stay on chat completions by the owner's decision. The `stage_7_cover` row is read again since
  2026-08-27: `processImagePipeline` called `generateImage`, not `generateCoverImage`, so the
  configured cover model was ignored for as long as the row existed (`mc2-bnm62`).
- **A playbook is not a course**, and `generation_trace.course_id` is a foreign key into `courses`,
  so playbook money lives in `career_playbooks.cost_breakdown` (`mc2-j9pmq`, `mc2-ietzn`) — the same
  fact is why a playbook cannot have a `course_override` row. **Stage 6 and Stage 7 run their own
  workers, queues and containers**: anything added to the general processor misses them, and cost
  was wrong three times for this.
- **Editing is inside the course total** (`mc2-b7olk.5`, verified live 2026-08-23):
  `generation_trace.stage` accepts `stage_edit`, `stageOfPhase` knows `chat_*`/`inline_*`, and
  `get_audit_summary` returns `stage_edit` as its own row, the split the owner asked for.
  **`provider.max_price` below every endpoint is a refusal**, not a cheaper route: the ceiling
  yields so the call lives.

**Attempt 1 stays on the primary**: `FALLBACK_FROM_ATTEMPT = 2` (`mc2-rqukn`). The 1.5x ceiling
holds over the per-attempt endpoint pin (`mc2-6crnj`, closed); `mc2-f1tqd` stays **open** — a pinned
endpoint that answered with nothing at all, five attempts, no record.

Five rules that came out of this epic outlive it and moved to
`.codex/repository-failure-modes.md`: each attempt pins its own endpoint, a LangChain option must
ride a constructor field, a log line must name its deployment, timeouts come from measurement, and a
green pipeline can still skip the deploy.

## Stage 6 Batch API, and backlog order

`FEATURE_STAGE6_BATCH_GENERATION` (off) sends a course's initial lesson generation as one
asynchronous OpenRouter batch; a coordinator polls, and each lesson is also enqueued with a
`STAGE6_BATCH_MAX_WAIT_MS` delay so it generates synchronously if the batch never lands. Turning it
on is not a config switch — see `:batch` in `.codex/repository-failure-modes.md`.

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order; do not re-open the 27
already closed with a commit or a measurement, and do not re-rank by tracker priority. Complete
through `mc2-sznhi` (T1), `mc2-3sz3d` (T2), `mc2-jz6y0.13.6` (T3), `mc2-iioip` (T4),
`mc2-wxun`/`mc2-vjbb` (T5).

## Live operational facts

- `course_embeddings_v1` holds **6856 points** after deduplication; a snapshot restoring 13712 is not
  a fault, half are copies. Qdrant and uploads pull daily to `helixa-new`; on-host snapshots share
  the docker volume with live data, so that pull is the only real mitigation.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production.
- Nine source documents are accepted as lost and are **not** in the indexed set; do not reopen.
  Uploads live on the production host, not Supabase Storage. Monitoring drift is a separate job,
  never a deploy step: it can trigger rollback.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infra work uses `scripts/with_host_operation_lock.sh`. Production workers read
  `.env.<active_color>` (`cat /opt/megacampus/active_color`), **not** `.env.production`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` runs on uid 1000 only.
  Graphify 0.9.14 has no `build` subcommand, so the graph is read, never refreshed.

## Owner decisions

Answered: `mc2-jz6y0.13.6` (pull-based off-host snapshots), `mc2-lrav0` (no backfill of dev Qdrant),
`mc2-db696.61` (`career_playbook_sources` has never held a row, so the first real `company_specific`
run measures it).

**Answered 2026-08-22.** `mc2-dgw4u` — Stage 7 audio stays on its own OpenAI account, **paused, not
settled**: a reconciliation must keep saying "the OpenRouter spend is accounted for", not "the run
is". `mc2-b7olk.4` — delivered and accepted live. Migrations approved when necessary, useful and
current, one at a time. `mc2-hqfc3` video stays parked.

**Answered 2026-08-23, all delivered:** `stage_5_escalation` joins the Stage 5 chain (`mc2-9yrgb`);
course edits count inside the course total (`mc2-b7olk.5`); the playbook model is decided by
measurement (`mc2-gg65o`); the 14 `course_override` rows are **deleted**, contents in `mc2-sjwm0`;
`mc2-yson0` is fixed by **rewriting the reconciliation procedure** onto own `generation_id`s, not by
a second key; the job-description rework (plan 4.5) **stays parked**.
**Answered 2026-08-25:** the `develop → master` release for `mc2-cuk7j.2` was authorized and run.

**Still open:** `mc2-v6fqp` — which third language. "ru and en" stays the test language.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production.

After a paid run, reconcile with `pnpm cost:report --since <T0> --verify-with-provider` (`mc2-yson0`,
closed). Why the credits endpoint cannot be used for this, and why an `await` on an `unref`'d timer
let a process exit 0 with no output (`mc2-avjau`, closed), are both in
`.codex/repository-failure-modes.md`.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f` or `mc2-1nots`; see §9 of the active
spec for exact reopen gates. `mc2-qd12b`, `mc2-5e4ek.1` and `mc2-ibzcc` closed 2026-08-23.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes
the branch it delivered, so a report naming a branch again means something really was left behind.
Branches were swept 2026-08-22 (`mc2-3mq9b`); every deleted sha is in
`.codex/deleted-branches-2026-08-22.tsv`.

## Explicit defers

`mc2-6ye5z.4/.5/.8` — handlers written 2026-08-23; live proof was blocked by `mc2-3lo22` and is now
merely unrun, as for `mc2-rmbwo` and `mc2-p99f1`. `mc2-db696.106`/`.107` (PDF fidelity/grounding,
separate deploy accounts) not planned; `mc2-gmab0` held by unit tests.

`mc2-kim48` — four document-evidence alert rules cannot fire; their metrics are absent because the
writer is configured on staging, which is idle, and not on dev, where the runs happen.

`mc2-zewto` — Stage 6 grouping costs 22.6pp of recall@5. Owner's trade, measured, not acted on.

**Settled 2026-08-27, `mc2-78ya6` — the bridge healthcheck took both halves.** The Q12 asset manifest
pins `docker-compose.infra.yml`, so `27790d81d` moved its sha and H2 went red; `4268a8e7a`
regenerated the manifest from the tree. That alone would have turned the test green while the **host
still ran the old healthcheck** — the manifest tracks the repository, and only a deploy makes the
host agree with it. Delivered on owner authorization 2026-08-27: the compose file was copied to
`/opt/megacampus` (previous version kept beside it as
`docker-compose.infra.yml.bak-bridge-healthcheck-20260827T044334Z`) and `notebooklm-bridge` was
recreated with `--no-deps`. Tree, manifest and host now all read `e447c928…`, and the container's
health is earned rather than asserted: `/health` answers 200 with the proxy reachable and the session
good to 2028-08-24. Nothing else on the host was touched.

## NotebookLM and languages

**The hop is live** (`mc2-xjykw`): SOCKS5 through `helixa-new` (82.26.152.8, NL), own revocable key,
system unit `megacampus-socks.service`. Judge it by its listener and its egress, never by unit state.
**Cookies are no longer a blocker** (`mc2-3lo22`, `mc2-cuk7j.4`): the session is minted from a master
token, `/health` reads `2028-08-24 (730d)` and `notebooks.list()` answers. **Nothing has yet run a
real NLM generation through it** — that is the one proof still owed, and it now needs only a run.
`mc2-p99f1` has **no gate at all** — every layer already accepts the
four types, and `ON_DEMAND_ENRICHMENT_TYPES` is read by nobody. Three more enum values are applied to
the database and **their handlers now exist** (`dbe094e21`), held by
`stage7-new-nlm-types-are-real.test.ts`. `nlm_report` is `artifacts.generate_report` with a format
that is **not** `study_guide`, refused at both bridge and handler, because in NotebookLM every report
is one artifact type and the two would otherwise be indistinguishable once stored.

**Spanish and Chinese both complete** (`mc2-v6fqp`), read by eye. Chinese never could before: five
thresholds calibrated on Latin script, each invisible until the previous was fixed. Weight by
script, never lower the number.

## Next recommended

Accepted stage id: `mc2-51epl` · Current stage id: none · Next stage id: **owner's call**
`brawny-mellow-quokka.md` is finished and nothing in it is owed. Recommended action: pick the next
track — `mc2-db696` (Career Playbook) and `mc2-uv7n7` (UI redesign, 22 Stitch screens) are the two
standing directions, and `specs/026-post-triage-priorities/spec.md` holds the backlog order.
Three small debts can ride any future paid run rather than justify one: `stage_5_escalation` has
never actually escalated, the judge's new terminal path has never fired — both needing a generation
forced to fail — and **no real NLM generation has run since the cookies were restored**, which now
needs only a run. Use $orchestrator-stage when the next track becomes an epic.

Open after 2026-08-27, both small and neither blocking: `mc2-v6r1p` — two catalogue prices have
drifted (deepseek-v4-flash 1.11x, qwen3-235b 1.57x on output), and the question is not the numbers
but whether either model belongs in live routing at all: the first is an **alias** beside its own
pinned snapshot, the second has had zero calls in 90 days. `mc2-z08mv` — revisit `glm-5.3` when it
has more than one provider. The image search is finished and needs nothing: nothing on OpenRouter
undercuts the card model, and no image model anywhere has a `:batch` sibling, with flex published
for exactly one (`gemini-2.5-flash-image`, and only through chat completions).

`mc2-h6nlv` is closed — the bridge healthcheck asks `/health` now and the same string is in the
image and all three compose files. The trap it left behind is worth keeping: the container has
`HTTP_PROXY=socks5h://…`, urllib takes the proxy branch even for loopback, so the check uses
`http.client`, which does not.

`mc2-ibzcc` is **closed**, but its docling-mcp 3.1.0 image is **neither published nor deployed** —
that is the manual `build-docling-images.yml` workflow and a recorded `image@sha256`, a production
mutation of its own. `mc2-vlskb` stays open: 3.1.0 still drops
`service_timeout`/`service_max_retries`. `mc2-8m90f`'s reopen gate narrowed to "a run on one of the
six affected courses" — re-measured 2026-08-24, still none. `mc2-pdcb7`: covers drawn without their
visual style, fixed; whether to pay to redraw is the owner's. `mc2-o5ktb`, `mc2-b7olk.8` and
`mc2-p2908` are closed with their evidence in the tickets.

## Starter prompt for next orchestrator

Read `docs/plans/brawny-mellow-quokka.md` whole first, then the section above for what it still owes;
`snuggly-wiggling-sutton.md` is **done** and `.codex/next-goal-four-doors.md` is **stale** — ignore
both. **Do not ask — act and report**, inside the standing authorization under Safety boundary.

The Helixa AIOS bridge belongs to another agent — leave it alone. **16 unique commits, 6149 lines**,
reported by three refs; its three blockers are fixed on `fix/helixa-blockers` and handed over, not
merged (`mc2-gxese`). Still the branch owner's call, and **not** covered by re-pinning the manifest:
its migrations install six triggers on `courses`, `career_playbooks` and `file_catalog`, inert while
`helixa_knowledge_sync_bindings` is empty but present at the database level, where the env flag does
not reach — and dev and staging share one database. Both branches are in
`.codex/stranded-commit-allowlist.txt`; remove the two entries together. That agent also broke the
root `node_modules` once, so if a pre-commit hook cannot find `prettier-plugin-tailwindcss`, relink
the symlink into `node_modules/.pnpm/...` by hand rather than running `pnpm install`.

`pnpm test:unit` covers **all three** packages since `mc2-cuk7j.1`; earlier notes here said it
covered two and that 47 `packages/web` `.tsx` files were an unfixable local parse failure. Both were
wrong — the cause was `"jsx": "preserve"` reaching oxc.

Read first: `AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`, `.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
