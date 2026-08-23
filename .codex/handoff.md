# Orchestrator Handoff

Updated: 2026-08-23. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries.

## Current stage

No stage is active. `docs/plans/brawny-mellow-quokka.md` ran on 2026-08-23: phases 1, 3, 4.1, 4.2,
4.3, 5 and 6 delivered, phase 2 partly. What that plan still owes is under "Still open" below.
The Career Playbook quality track stays **accepted** (`mc2-db696.110`), and its two process rules in
`06-quality-acceptance.md` still hold: read the artifact before calling a run accepted, and clean up
**after** the editorial pass.

## RAG retrieval, chunking and parent expansion (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`, `mc2-o3s4r`; `mc2-lrav0` on the owner's
"no backfill". What still constrains work:

- Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
  ceiling), and a test rejects any literal above it. The old `0.7` was unreachable against embeddings
  topping out near 0.58, which made hybrid search BM25-only.
- Degenerate parents no longer reach the index (`selectIndexableChunks`); search drops repeated text
  as a safety net.
- Only children are indexed, plus any childless parent; the passage is rebuilt at retrieval time from
  siblings, **after reranking** in the two paths that rerank. On for Stage 5 section RAG, Stage 6
  lesson RAG and `search_documents`; off for evidence retrieval, where a citation must point at the
  fragment that matched. Average expansion 5.5x; resulting **quality** is not measured.

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
1318 of 1911 lessons, against 608 that reach a panel — and it had held the dearest model of the pool
(glm-5.2 $0.00729 a pass against deepseek $0.00055).

**The playbook's prose groups joined the lesson body on Luna, 2026-08-23** (`mc2-gg65o`,
`2e01e0b02`). Measured on one input: DeepSeek wrote 1.3-4.4x shorter and, in `group_1`, invented a
whole "Текущее значение" column — CSAT 87%, FCR 68%, backlog 8% — where the spec's `metric_ledger`
carries only targets. Every fabricated figure landed inside that metric's own yellow band, i.e. it
was reverse-engineered from the thresholds and served as fact about the customer's company.
Intermittent: one run in two. Luna invented none, was **faster** (35-78s against 86-240s), and
finished `group_6`, which DeepSeek never did in four attempts (`mc2-avjau`). Cost $0.0259 vs $0.0039.
Tool: `scripts/career-playbook-model-ab.ts` — it wraps the runtime's `modelConfigService` and changes
no stored configuration, because a global `UPDATE` moves other people's runs on the shared database
and `llm_model_config.course_id` cannot reference a playbook at all.

**Settled 2026-08-23 (`d179a18d0`): whatever AUTHORS prose the reader opens runs on Luna** —
`stage_6_content`, the three tier variants, `section_expander`, `refinement`, both tiers, database
and offline defaults. `mc2-tux1y`/`mc2-bneet` closed on the measurement: same course, same settings,
DeepSeek wrote 29% shorter, taught by narration rather than a worked example, and invented "более 60%
людей" with no source, while the judge moved only 0.92 → 0.88. The saving would have been $0.008 per
micro-course and `stage_6_simple` is 166 of 274 lessons. What EDITS under an instruction (`patcher`)
or never reaches the reader (`arbiter`, `rag_planning`, secondary judge, Stage 2/3/4 internals,
`stage_5_simple`) stays on DeepSeek. The playbook's groups 1-4 and 6 are still
DeepSeek and are a separate question, unmeasured.

Model ids are declared **once**: `PROSE_MODEL_ID` / `PROSE_FALLBACK_MODEL_ID` beside `DEFAULT_*` in
`model-defaults.ts`. `model-ids-live-in-one-place.test.ts` holds it. A row also carries the id a
second time as `primary_display_name`; an `UPDATE` that forgets it labels the admin screen with the
wrong model, which is what CI caught. 14 stale `course_override` rows and 2 inactive duplicates are
filed as `mc2-f6del`.

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

Stage 5, metadata generation and `getModelForPhase` all go through `buildProviderParams`, held by
`tests/unit/phase-config-provider-contract.test.ts`. Collision fallback: `LARGE_CONTEXT_MODEL_ID`.
`mc2-s1vg5`, `mc2-9yrgb`, `mc2-p6u8k` closed 2026-08-23. `stage_5_escalation` is now first in
`getEscalationChain('generation')`, ahead of `stage_4_expert`, which had been retrying Stage 5 on the
model that just failed with a SMALLER output budget than a normal attempt. Output ceilings were
checked BEFORE wiring it up. Still owed: a run in which Stage 5 really escalated.

## Cost accounting: where it stands

Epic `mc2-qrdkt` is complete and the ledger **reconciles** — three times, most recently to the sixth
decimal on two runs of 2026-08-22. What still constrains work:

- **The receipt exists.** `GET /api/v1/generation?id=` returns what OpenRouter actually billed. The
  id is in the body **and** in the `x-generation-id` header, which arrives before any abort, so even
  a timed-out call is countable. The record takes ~9.6 s to become readable — for a call still
  running, never.
- **One rule, held by a guard.** A paid call prices itself at the call; a node-level summary row
  keeps tokens and carries **no** price, and a priced call is _stamped_ `input_data.billedCall`.
  Guard: `tests/unit/shared/metrics/no-anonymous-spend`.
- **The catalogue is an estimate, not the price.** `MODEL_CATALOG` builds budgets and the
  `provider.max_price` ceiling; every call settles against the provider.
  `model-catalog-coverage.test.ts` stays offline on purpose — routing must not depend on a third
  party being reachable. `scripts/check-model-catalog-drift.ts` is the online half; it exits **2**
  when it cannot reach the API against **1** when the catalogue is wrong, and it is in **no** CI job
  deliberately, since a provider's tariff change must not fail the build and with it the deploy. It
  runs nightly in its own workflow, filing ONE standing GitHub issue on drift; the first run found
  three entries 1.30x-4.03x over (`mc2-ts9i2`). Do not retype a rate in a test — that is what made
  one correction turn eight cases in five files red for no defect.
- **One transport, one place.** Every OpenRouter client comes from `shared/llm/openrouter-client.ts`,
  the only place `instrumentFetchWithGenerationId` is attached. `one-openrouter-transport.test.ts`
  fails on a new one; its exception list may shrink, never grow.
- **Images price like everything else.** Cards go through `POST /api/v1/images` at `quality: medium`,
  the only endpoint carrying that control — $0.045076 to $0.0085605 per card (`mc2-xbqz8`). Covers
  stay on chat completions by the owner's decision. `mc2-bnm62`: the `stage_7_card`/`stage_7_cover`
  rows in `llm_model_config` are read by nothing.
- **A playbook is not a course**, and `generation_trace.course_id` is a foreign key into `courses`,
  so playbook money lives in `career_playbooks.cost_breakdown` (`mc2-j9pmq`, `mc2-ietzn`). The same
  fact is why a playbook cannot have a `course_override` row.
- **Stage 6 and Stage 7 run their own workers, queues and containers.** Anything added to the general
  processor misses them; cost was wrong three times for exactly this.
- **Editing is inside the course total** (`mc2-b7olk.5`, verified live 2026-08-23):
  `generation_trace.stage` accepts `stage_edit`, `stageOfPhase` knows `chat_*`/`inline_*`, and
  `get_audit_summary` returns `stage_edit` as its own row, which is the split the owner asked for.
- **`provider.max_price` below every endpoint is a refusal**, not a cheaper route: one wrong
  catalogue price would fail every call for that model, so the ceiling yields and the generation
  lives.

**Each attempt pins its own endpoint, because a hung one never names itself.** `provider.order` with
one `tag` from `/models/{model}/endpoints` and `allow_fallbacks: false`; the next attempt takes the
next cheapest, sorted by live price, nothing outliving the call, no pin when the list cannot be
fetched. `GET /api/v1/generation` cannot help here — it is unreadable while the call still runs,
which is exactly what a timeout is — and `X-Provider-Name` is advertised but never sent. The 1.5x
price ceiling still holds over the pin. Proven live and closed (`mc2-6crnj`).

**A pinned endpoint can also answer with nothing** (`mc2-f1tqd`, open): five attempts died on
`Cannot read properties of undefined` with no generation record at all — empty, not wrong — and the
parse crashed instead of naming what arrived.

**`requiresReasoning` is a net, not only a list** (`mc2-148j9`). A 400 whose body says reasoning is
mandatory is re-sent once with `reasoning: {effort:'low'}` and a budget grown by
`MANDATORY_REASONING_RESERVE_TOKENS`, capped by the model's output ceiling. It lives in
`configuration.fetch`, a **constructor** field, so it survives the `new ChatOpenAI(fields)` clone —
the same reason cost recording rides in `callbacks` — and being below `invoke` it covers `stream`
and `batch`. An earlier version wrapped `invoke` and the four structured call sites missed it.

**A log line says which deployment it came from**: the pino base uses `detectEnvironment()`, not
`NODE_ENV` (every dev container sets it to `production`), and the image carries `APP_VERSION`.

**Timeouts are set from measurement, and waiting is the owner's chosen trade.**
`DEFAULT_LLM_TIMEOUT_MS` is **300000**; all eleven `stage_career_playbook_*` phases carry 238000 in
both `config-seed.json` and `llm_model_config`, because measured calls have taken 229s and the full
238s and a smaller budget would abort and re-bill them (`mc2-wg60c`).

**Attempt 1 stays on the primary**: `FALLBACK_FROM_ATTEMPT = 2` (`mc2-rqukn`).

**A deploy can be skipped on a green pipeline**: `Detect Deploy-Relevant Changes` skips `Deploy to
Dev` for a test-only change. Confirm that job's own conclusion, not the run's.

## Stage 6 Batch API (off by default)

`FEATURE_STAGE6_BATCH_GENERATION` sends a course's initial lesson generation as one asynchronous
OpenRouter batch (`/api/beta/batches`, plain model slug, 24h window). A coordinator polls; each
lesson is also enqueued with a `STAGE6_BATCH_MAX_WAIT_MS` delay so it generates synchronously if the
batch never lands. Eligibility is decided per call against the **live** catalogue. Not a config
switch: a `:batch` id posted to the synchronous endpoint breaks the caller, and a `:batch` tariff is
**not** reliably half the base one.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order; do not re-open the 27
already closed with a commit or a measurement, and do not re-rank by tracker priority. Complete
through `mc2-sznhi` (T1), `mc2-3sz3d` (T2), `mc2-jz6y0.13.6` (T3), `mc2-iioip` (T4), `mc2-wxun`/`mc2-vjbb` (T5).

## Live operational facts

- `course_embeddings_v1` holds **6856 points** after deduplication; a snapshot restoring 13712 is not
  a fault, half are copies.
- Qdrant and uploads pull daily to `helixa-new`; on-host snapshots share the docker volume with live
  data, so that pull is the only real mitigation.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production.
- Nine source documents are accepted as lost and are **not** in the indexed set; do not reopen.
  Uploads live on the production host, not in Supabase Storage.
- Monitoring drift is a separate job, never a deploy step: it can trigger rollback.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infra work uses `scripts/with_host_operation_lock.sh`. Production workers read
  `.env.<active_color>` (`cat /opt/megacampus/active_color`), **not** `.env.production`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests. `MC2_Q12_REAL_CONTROLLER` runs on uid 1000 only.
- `graph-reviewed: blocked` — Graphify 0.9.14 has no `build` subcommand; the graph is read, not
  refreshed.

## Owner decisions

Answered: `mc2-jz6y0.13.6` (pull-based off-host snapshots), `mc2-lrav0` (no backfill of dev Qdrant),
`mc2-db696.61` (`career_playbook_sources` has never held a row, so the first real `company_specific`
run measures it by itself).

**Answered 2026-08-22.** `mc2-dgw4u` — Stage 7 audio stays on its own OpenAI account, **paused, not
settled**: a reconciliation must keep saying "the OpenRouter spend is accounted for", not "the run
is". `mc2-b7olk.4` — delivered and accepted live. Migrations approved when necessary, useful and
current, one at a time. `mc2-hqfc3` video stays parked.

**Answered 2026-08-23, all delivered:** `stage_5_escalation` joins the Stage 5 chain (`mc2-9yrgb`);
course edits count inside the course total (`mc2-b7olk.5`); the playbook model is decided by
measurement (`mc2-gg65o`) — see Routing; the 14 `course_override` rows are **deleted**, both courses
follow global policy, contents preserved in `mc2-sjwm0` (closed).

**Answered 2026-08-23, shaping the next session:** cookies are **not** updated, so no live NLM proof is in scope; `mc2-yson0` is fixed by **rewriting the reconciliation procedure** onto own `generation_id`s, not by a second key; the job-description rework (plan 4.5) **stays parked**.

**Still open:** `mc2-v6fqp` — which third language. "ru and en" stays the test language.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when they prove necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production.

**Do not reconcile a run against the delta of `/api/v1/credits`** (`mc2-yson0`, measured
2026-08-23). The key is shared with production and that traffic never stops: two idle samples with
no call of mine spent $0.084 in 45 s and $0.072 in 150 s, while a whole ten-call measurement cost
$0.0298 — about one minute of the background. Over two hours the delta read $1.4739 against my
$0.03. `llmResult.costUsd` comes from `/api/v1/generation`, so the honest reconciliation is the sum
over **your own** generation ids; remaining credit is a ceiling check, not an attribution.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f` or `mc2-1nots`; see §9
of the active spec for exact reopen gates. `mc2-qd12b` and `mc2-5e4ek.1` closed 2026-08-23.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes
the branch it delivered, so a report naming a branch again means something really was left behind.
Branches were swept 2026-08-22 (`mc2-3mq9b`); every deleted sha is in
`.codex/deleted-branches-2026-08-22.tsv`.

## Explicit defers

- `mc2-6ye5z.4/.5/.8` — handlers written 2026-08-23; only live proof waits on `mc2-3lo22`.
  `mc2-rmbwo`, `mc2-p99f1` — wait on `mc2-3lo22`. `mc2-db696.106`/`.107` — PDF fidelity/grounding, separate deploy accounts: not
  planned. `mc2-gmab0` — held by unit tests.

## NotebookLM and languages

**The hop is live** (`mc2-xjykw`): SOCKS5 through `helixa-new` (82.26.152.8, NL), own revocable key,
system unit `megacampus-socks.service`. Judge it by its listener and its egress, never by unit state.

**Cookies are the only NLM blocker** (`mc2-3lo22`, owner-owned): earliest expired 2026-03-31, which
matches the last NLM generation. `mc2-p99f1` has **no gate at all** — every layer already accepts the
four types, and `ON_DEMAND_ENRICHMENT_TYPES` is read by nobody. Three more enum values
are applied to the database and **their handlers now exist** (`dbe094e21`), held by
`stage7-new-nlm-types-are-real.test.ts`: every value the schema accepts routes to a handler. One
design point worth keeping: `nlm_report` is `artifacts.generate_report` with a format that is **not**
`study_guide`, refused at both the bridge and the handler, because in NotebookLM every report is one
artifact type and the two types would otherwise be indistinguishable once stored. Only live proof
waits on the cookies.

**Spanish and Chinese both complete** (`mc2-v6fqp`), read by eye. Chinese never could before: five
thresholds calibrated on Latin script, each invisible until the previous was fixed. Weight by script,
never lower the number.

## Next recommended

Accepted stage id: `mc2-qrdkt` · Current stage id: none
Next stage id: **`mc2-51epl`** — phase 2 of `docs/plans/brawny-mellow-quokka.md`, the only phase left
substantially undone. Two of its eight warnings are fixed (`a0a941dfc`): "Orphaned job detected"
fired on every fresh course (425 rows in `system_metrics`) and the Docling chunking warning fired at
warn on `.md` uploads Docling never converts. Warning 1 was repaired 2026-08-22 by `cd9b60138`;
whether it now RUNS is a question for a log. Warnings 2, 3, 5, 6, 8 untouched. Recommended action:
diagnose those from the code as 4 and 7 were, then meet the stated acceptance — one paid run whose
log carries none of the eight lines without an explanation of why it is legitimate. Budget against
your OWN generation ids. Use $orchestrator-stage for an epic.

Also open: `mc2-avjau` (DeepSeek never returns on `group_6`), `mc2-yson0`, `mc2-ipc80` — three
course-delete paths, and the DELETE on `app/api/courses/[orgSlug]/[courseSlug]/route.ts` never cleans
Qdrant, Redis or files at all, which is the reported symptom; located, not fixed. `mc2-ibzcc`'s
upstream gate has **opened**: docling-mcp 3.1.0 (2026-08-14) fixes the cache key its wrapper exists for; the timeout half is unfixed and the pin bump is an owner call on a production image.
`mc2-8m90f` moved without firing: 7 accepted `document_evidence_runs` against 0 on 2026-08-01, none on the six affected courses.

## Starter prompt for next orchestrator

Read `docs/plans/brawny-mellow-quokka.md` whole first, then the section above for what it still owes;
`snuggly-wiggling-sutton.md` is **done** and `.codex/next-goal-four-doors.md` is **stale** — ignore
both. **Do not ask — act and report**, inside the standing authorization under Safety boundary.
Note: `codex/overnight-helixa-sync-mc2` carries eleven undelivered commits that belong to another
agent — leave them alone. That agent also broke the root `node_modules` once: if a pre-commit hook
cannot find `prettier-plugin-tailwindcss`, relink the symlink into `node_modules/.pnpm/...` by hand
rather than running `pnpm install`.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
