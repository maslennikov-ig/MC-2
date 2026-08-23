# Orchestrator Handoff

Updated: 2026-08-23. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries.

## Current stage

`docs/plans/brawny-mellow-quokka.md` is **complete**: every phase delivered, and phase 2
(`mc2-51epl`) **accepted** on the paid run of 2026-08-23 — course `6b3b183e`, dev workers on
`afe03056f`, one of the eight lines left in the log and it is the legitimate one. The Career
Playbook quality track stays **accepted** (`mc2-db696.110`); its two rules in
`06-quality-acceptance.md` hold: read the artifact before calling a run accepted, and clean up
**after** the editorial pass.

## The eight warnings (2026-08-23, `mc2-51epl`) — accepted

The run: 0 errors, 9 warn lines, and of the eight only **"Section duplication detected"** (3x),
which fires exactly when the filter fails and here reported a real one. The self-reviewer trio
stayed silent too, so `cd9b60138` is not only repaired but running. Ledger: 0 billed calls unpriced,
23 of 23 generation ids answered, provider $0.037857 against a recorded $0.037859. What constrains
work from here:

- **`prompt_templates` overrides `PROMPT_REGISTRY` at runtime, and a row can outlive its caller.**
  7 of 21 active rows had. `checkOverrideContract` now refuses a row that references a placeholder
  the registry lacks or drops a required variable the registry renders, and uses the registry
  instead; a placeholder counts as unknown only when the registry's own template lacks it too, so
  Mustache sections and RAG-borne Helm/Jinja need no second list.
  `scripts/sync-prompt-templates-to-registry.ts` reports by default and rewrites under `--apply`; it
  read `0 that no longer fit` after the sync, and five rows with no registry entry are left alone
  (`mc2-jraut`). The loud row cost Stage 4 Phase 3 its schema for nine months; the silent one cost
  every lesson cover its art direction (`mc2-pdcb7`), because an ignored variable leaves no
  unresolved placeholder to warn about.
- **A pure routing function cannot end a lesson.** The judge now writes its own terminal
  review_required when the regeneration cap is reached, naming the cap and the score, so
  `executeStage6`'s safety net is a net again — it had been the only path, 76 of the 154
  `review_required` rows.
- **Layer-3 Stage 4 recovery is real but narrow.** `initialize_fsm_with_outbox` accepts only
  NULL/`pending`/`completed`/`failed`/`cancelled` and raises 23505 from anything else. Every
  `stage_4_*` status now counts as initialised, and one the RPC cannot accept is reported rather
  than attempted. 37 of the 182 FSM initialisations in this database came from this path.

## RAG retrieval, chunking and parent expansion (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`, `mc2-o3s4r`; `mc2-lrav0` on the owner's
"no backfill". What still constrains work:

Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
ceiling), and a test rejects any literal above it — the old `0.7` was unreachable against embeddings
topping out near 0.58, which made hybrid search BM25-only. Degenerate parents no longer reach the
index (`selectIndexableChunks`). Only children are indexed, plus any childless parent; the passage
is rebuilt at retrieval time from siblings, **after reranking** in the two paths that rerank. On for
Stage 5 section RAG, Stage 6 lesson RAG and `search_documents`; off for evidence retrieval, where a
citation must point at the fragment that matched. Average expansion 5.5x; **quality** unmeasured.

## Routing and models (2026-08-12, `43ab557d6`)

Seven live models: the workhorse is `deepseek/deepseek-v4-flash-0731` — a **pinned snapshot** — with
`openai/gpt-5.6-luna` as its fallback (owner, 2026-08-22), `z-ai/glm-5.2` for the deciding judge and
Stage 6's last chance, plus `google/gemini-3.7-flash`, `minimax/minimax-m3` and the two image
models. Four invariants: judges keep three separate vendors, `emergency` stays off OpenAI, every
fallback crosses vendors, and the three escalation phases avoid the default model on both hops
because by the time they run it has already failed.

**Judges, reshuffled 2026-08-22 by price** (`mc2-d1d09`): primary `gpt-5.6-luna`, secondary
**`deepseek-v4-flash-0731`**, tiebreaker **`glm-5.2`** (fallback `minimax-m3`). `executeSingleJudge`
takes `judgeModels.secondary`, the **most frequent judge call** — 1318 of 1911 lessons.

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

Model ids are declared **once**: `PROSE_MODEL_ID` / `PROSE_FALLBACK_MODEL_ID` beside `DEFAULT_*` in
`model-defaults.ts`, held by `model-ids-live-in-one-place.test.ts`. A row also carries the id a
second time as `primary_display_name`; an `UPDATE` that forgets it labels the admin screen with the
wrong model, which is what CI caught. Two inactive duplicate rows remain (`mc2-f6del`).

Reasoning is per-phase and the budget is load-bearing: OpenRouter bills reasoning tokens against
`max_tokens`, so the budget is ADDED, and both the database and the seed generator refuse
`reasoning_enabled` without one. On for `stage_6_complex`, `stage_5_escalation`,
`stage_6_auto_last_chance` only. Cost by tokens: **Stage 6 is ~90%** — 37.9% lesson generation,
30.0% judging, 20.2% section generation; Stage 5 ~5.5%, Stage 4 ~1.9% (epic `mc2-4clyr`).

**The `~`-alias question is settled: routing stays on the pinned snapshot** (owner, 2026-08-22).
Both reasons — the 2026-08-17 latency incident and the empty endpoint list that silently disables
the attempt pin — are in `.codex/repository-failure-modes.md`.

**How to change any model id:** `DEFAULT_MODEL_ID`, every occurrence in `config-seed.json` and the
active rows of `llm_model_config` move **together**, and the database wins over the seed at runtime —
so edit the database first, then `pnpm generate:config-seed`, which reads it and rewrites the seed.
That order is the only correct one.

**Phase configs** (2026-08-13, `7ad421986`): Stage 5, metadata generation and `getModelForPhase` all
go through `buildProviderParams`, held by `tests/unit/phase-config-provider-contract.test.ts`;
collision fallback `LARGE_CONTEXT_MODEL_ID`. `stage_5_escalation` is now first in
`getEscalationChain('generation')`, ahead of `stage_4_expert`, which had been retrying Stage 5 on
the model that just failed with a SMALLER output budget than a normal attempt; output ceilings were
checked BEFORE wiring it up (`mc2-s1vg5`, `mc2-9yrgb`, `mc2-p6u8k` closed).

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
  provider's tariff change must not fail the build and with it the deploy). It runs nightly, filing
  ONE standing GitHub issue; its first run found three entries 1.30x-4.03x over (`mc2-ts9i2`).
  Never retype a rate in a test: that turned eight cases red for no defect.
- **One transport, one place.** Every OpenRouter client comes from `shared/llm/openrouter-client.ts`,
  the only place `instrumentFetchWithGenerationId` is attached; `one-openrouter-transport.test.ts`
  fails on a new one, and its exception list may shrink, never grow.
- **Images price like everything else.** Cards go through `POST /api/v1/images` at `quality: medium`,
  the only endpoint carrying that control — $0.045076 to $0.0085605 per card (`mc2-xbqz8`). Covers
  stay on chat completions by the owner's decision; the `stage_7_card`/`stage_7_cover` rows in
  `llm_model_config` are read by nothing (`mc2-bnm62`).
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

**Each attempt pins its own endpoint, because a hung one never names itself.** `provider.order` with
one `tag` from `/models/{model}/endpoints` and `allow_fallbacks: false`; the next attempt takes the
next cheapest by live price, nothing outliving the call, no pin when the list cannot be fetched.
`GET /api/v1/generation` cannot help — unreadable while the call still runs, which is exactly what a
timeout is — and `X-Provider-Name` is advertised but never sent. The 1.5x ceiling holds over the
pin. Closed (`mc2-6crnj`) and proven again 2026-08-23: a `group_6_wrap` attempt hung 238 s on
`open-inference/fp4` and `relace/fp4` answered the identical request in 124 s. A pinned endpoint
can also answer with nothing at all — five attempts, no record (`mc2-f1tqd`, open).

**`requiresReasoning` is a net, not only a list** (`mc2-148j9`). A 400 whose body says reasoning is
mandatory is re-sent once with `reasoning: {effort:'low'}` and a budget grown by
`MANDATORY_REASONING_RESERVE_TOKENS`, capped by the model's output ceiling. It lives in
`configuration.fetch`, a **constructor** field, so it survives the `new ChatOpenAI(fields)` clone —
the same reason cost recording rides in `callbacks` — and below `invoke` it covers `stream` and
`batch`. An earlier version wrapped `invoke` and the four structured call sites missed it.

**A log line says which deployment it came from**: the pino base uses `detectEnvironment()`, not
`NODE_ENV` (every dev container sets it to `production`), and the image carries `APP_VERSION`.
**Timeouts come from measurement**: `DEFAULT_LLM_TIMEOUT_MS` is **300000** and all eleven
`stage_career_playbook_*` phases carry 238000 in `config-seed.json` and `llm_model_config`, because
measured calls have taken the full 238 s and a smaller budget re-bills them (`mc2-wg60c`).

**Attempt 1 stays on the primary**: `FALLBACK_FROM_ATTEMPT = 2` (`mc2-rqukn`). **A deploy can be
skipped on a green pipeline**: `Detect Deploy-Relevant Changes` skips `Deploy to Dev` for a test-only
change — confirm that job's own conclusion, not the run's.

## Stage 6 Batch API, and backlog order

`FEATURE_STAGE6_BATCH_GENERATION` (off) sends a course's initial lesson generation as one
asynchronous OpenRouter batch; a coordinator polls, and each lesson is also enqueued with a
`STAGE6_BATCH_MAX_WAIT_MS` delay so it generates synchronously if the batch never lands. Not a
config switch: a `:batch` id on the synchronous endpoint breaks the caller, and its tariff is
**not** reliably half the base one.

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
measurement (`mc2-gg65o`); the 14 `course_override` rows are **deleted**, contents in `mc2-sjwm0`.

**Answered 2026-08-23, shaping the next session:** cookies are **not** updated, so no live NLM proof
is in scope; `mc2-yson0` is fixed by **rewriting the reconciliation procedure** onto own
`generation_id`s, not by a second key; the job-description rework (plan 4.5) **stays parked**; the
docling-mcp pin is **bumped and the redundant wrapper deleted**, and the seven drifted
`prompt_templates` rows **rewritten to the registry text** — both delivered the same day.

**Still open:** `mc2-v6fqp` — which third language. "ru and en" stays the test language.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production.

**Reconcile with `pnpm cost:report --since <T0> --verify-with-provider`** (`mc2-yson0`, closed): it
sums `/api/v1/generation` over the generation ids that window produced, from `generation_trace` and
`career_playbooks.cost_breakdown` alike, and names any id the provider has no record of. **Never the
delta of `/api/v1/credits`** — the key is shared with production and that traffic never stops: two
idle samples with no call of mine spent $0.084 in 45 s and $0.072 in 150 s, and over two hours the
delta read $1.4739 against my $0.03. Remaining credit is a ceiling check, not attribution.

**An `await` on an `unref`'d timer is a promise Node may abandon** (`mc2-avjau`, closed): the waits
in `fetchGenerationFact` were unreferenced, so a failed Career Playbook attempt slept in the
generation lookup and the process left with **code 0 and no output**, which a caller reads as
success. Visible only in a one-shot script; a worker's own sockets keep the loop alive. The wait now
holds the loop, bounded at 30 s; the background settle in `llm-cost.ts` opts out explicitly.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f` or `mc2-1nots`; see §9 of the active
spec for exact reopen gates. `mc2-qd12b`, `mc2-5e4ek.1` and `mc2-ibzcc` closed 2026-08-23.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes
the branch it delivered, so a report naming a branch again means something really was left behind.
Branches were swept 2026-08-22 (`mc2-3mq9b`); every deleted sha is in
`.codex/deleted-branches-2026-08-22.tsv`.

## Explicit defers

`mc2-6ye5z.4/.5/.8` — handlers written 2026-08-23, only live proof waits on `mc2-3lo22`, as do
`mc2-rmbwo` and `mc2-p99f1`. `mc2-db696.106`/`.107` (PDF fidelity/grounding, separate deploy
accounts) not planned; `mc2-gmab0` held by unit tests.

## NotebookLM and languages

**The hop is live** (`mc2-xjykw`): SOCKS5 through `helixa-new` (82.26.152.8, NL), own revocable key,
system unit `megacampus-socks.service`. Judge it by its listener and its egress, never by unit state.
**Cookies are the only NLM blocker** (`mc2-3lo22`, owner-owned): earliest expired 2026-03-31, which
matches the last NLM generation. `mc2-p99f1` has **no gate at all** — every layer already accepts the
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
Two small debts can ride any future paid run rather than justify one: `stage_5_escalation` has
never actually escalated and the judge's new terminal path has never fired, both needing a
generation forced to fail. Use $orchestrator-stage when the next track becomes an epic.

`mc2-ibzcc` is **closed**: docling-mcp is on 3.1.0 and most of the cache wrapper is gone, but the
image is **neither published nor deployed** — that runs through the manual
`build-docling-images.yml` workflow and a recorded `image@sha256`, a production mutation of its own.
`mc2-vlskb` stays open: 3.1.0 still drops `service_timeout`/`service_max_retries`. `mc2-8m90f` moved
without firing: 7 accepted `document_evidence_runs` against 0 on 2026-08-01, none on the six
affected courses. New: `mc2-pdcb7` (covers drawn without their visual style — fixed; whether to pay
to redraw is the owner's) and `mc2-jraut` (five orphan prompt rows).

## Starter prompt for next orchestrator

Read `docs/plans/brawny-mellow-quokka.md` whole first, then the section above for what it still owes;
`snuggly-wiggling-sutton.md` is **done** and `.codex/next-goal-four-doors.md` is **stale** — ignore
both. **Do not ask — act and report**, inside the standing authorization under Safety boundary.
`codex/overnight-helixa-sync-mc2` carries eleven undelivered commits belonging to another agent —
leave them alone; that agent also broke the root `node_modules` once, so if a pre-commit hook cannot
find `prettier-plugin-tailwindcss`, relink the symlink into `node_modules/.pnpm/...` by hand rather
than running `pnpm install`. The 47 failing `.tsx` files under `packages/web` are a pre-existing
JSX parse failure in the local rolldown transform, reproduce on `origin/develop`, and are in no CI
job — `pnpm test:unit` covers `course-gen-platform` and `shared-types` only.

Read first: `AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`, `.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
