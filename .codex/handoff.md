# Orchestrator Handoff

Updated: 2026-08-28. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and stage summaries. Durable traps
live in `.codex/repository-failure-modes.md`; this file says what still binds work.

## Current stage

**The callout fix is verified live and delivered to staging** (`mc2-ctlar`,
`docs/rag/2026-08-28-lesson-arms-batch/after-the-callout-fix.md`, master `22401f40c`). Ten lessons
regenerated for $0.065383: `needs_review` **11 of 20 → 0 of 10**, regenerations 1.20 → 0.00, quality
0.830 → 0.897 with the whole gain on the five lessons the gate used to damage, cost per lesson −39%.

Three findings the run produced, all recorded and none open:

- **Callouts rose, 4.70 → 5.30.** A third arm with the pre-fix prompts restored under the new rule
  put the same three lessons at 3.00 against 5.00, so the new wording ("about one per section is
  plenty") reads as a licence where the old cap read as a rule the model ignored. The **rule**, not
  the prompt, is what stopped the review flood. Both lessons read by eye keep the mandatory practical
  example, in prose instead of a callout box.
- **Five Stage 6 prompts nothing rendered are gone** (`mc2-53h8i`, `45e5fe90d`). `renderPrompt` takes
  two Stage 6 keys; the registry declared seven. Their `prompt_templates` rows were **active**, so
  the admin screen offered them for editing — retired with `--deactivate`, text kept. 16 active rows
  with 5 orphans became **11 active, 0 orphans, 0 mismatches**.
- **Lessons came out shorter at the same word target** (2718 → 1840). Owner ruling: length is not the
  criterion, meaning surviving is. Recorded, tracked nowhere (`mc2-c7ire`). Same ruling closed
  `mc2-hoke7`: one wrong equation in 141 checkable ones over 1910 stored lessons is model noise.

**Ten lessons per arm, 2026-08-28** (`docs/rag/2026-08-28-lesson-arms-batch/`). The arms share **3.2
of 7 chunks** and the cap buys **+1.0 documents** in what the model reads; quality does not move
(0.830 against 0.841, sign changes lesson by lesson), so the setting stays. Still open from it:
`mc2-zxzgf` — the Mermaid fallback is hardcoded English, in 123 lessons across 12 courses;
`mc2-hpful` — cross-lesson repetition is negligible, but 5.3% of lessons duplicate a block **of
themselves**, all of them long ones.

`mc2-d0e2n` is **complete, six of six**; `mc2-cuk7j` (technical debt) is **complete, six of six**;
`docs/plans/composed-dazzling-moore.md` (Docling stack jump) is complete and live;
`docs/plans/brawny-mellow-quokka.md` is complete with phase 2 (`mc2-51epl`) accepted. The Career
Playbook quality track stays accepted (`mc2-db696.110`); its two rules hold — read the artifact
before calling a run accepted, and clean up **after** the editorial pass.

The NotebookLM bridge **re-mints its own cookies** (`mc2-cuk7j.4`): a durable master token,
`app/master_token_refresh.py` on a weekly interval in the FastAPI lifespan, and a `/health` check
that FAILS while no token is present. Off-host Qdrant retention is **7 days** (owner, 2026-08-23);
the allow-list interpolates `EXPECTED_RETENTION_DAYS` rather than repeating it.

## RAG retrieval, chunking and parent expansion (measured 2026-08-26/28)

Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.65
ceiling). Degenerate parents no longer reach the index (`selectIndexableChunks`); only children are
indexed plus any childless parent, and the passage is rebuilt at retrieval time from siblings,
**after reranking**, for Stage 5 section RAG, Stage 6 lesson RAG and `search_documents` — off for
evidence retrieval, where a citation must point at the fragment that matched.

**Expansion runs at 1.00x on the live corpus, not 5.5x** (`mc2-xg6g8`): `sibling_chunk_ids` is empty
on all 6856 points, indexed in July 2026 with `total_chunks: 1`. The 5.5x is what expansion **will**
cost once a document is indexed with the current chunker. Token ceilings (20K Stage 6, 40K Stage 5)
are never approached.

**Retrieval quality is a number:** recall@5 **0.9677** Stage 5, **0.9677** Stage 6, **0.4839**
`search_documents` (the only path that does not ask for hybrid). Re-run read-only with
`pnpm --filter @megacampus/course-gen-platform benchmark:rag run`; the 76-query set is in
`packages/course-gen-platform/eval/rag-retrieval/`. Method:
`docs/rag/2026-08-26-retrieval-quality-measurement.md`.

What that measurement changed and still constrains:

- **Stage 5 was never hybrid for a plan of three or fewer queries** — `max_query_limit` is 100 and
  Stage 5 asked for 300/150/102, getting `Bad Request` → dense-only. `getPrefetchLimit` clamps to the
  collection's ceiling; Stage 5 recall@5 0.7742 → 0.9677, fallbacks 76/76 → 0/76.
- **The dense threshold costs nothing between 0.15 and 0.30**; 0.25 stays, now measured.
- **A fused RRF score is not on a different scale from a dense cosine one.** Fused scores reach
  1.0000 against dense bests of 0.45–0.65. The old advice stands; its stated reason was wrong.
- **Stage 6 no longer caps results per document** (`mc2-zewto`, owner 2026-08-27). The cap cost 22.6
  points of recall@5 and bought 0.11 documents per lesson. Grouping is untouched where it earns its
  keep: Stage 4 evidence preflight, conflict detection, Stage 5 advisory enrichment.
- **A per-query retrieval rate does not describe a ten-query lesson**: the per-query limit is a
  function of the query count, so the benchmark's 29.97 candidates (one-query harness) is 6 in a real
  lesson.

Three traps for the next measuring run: `[Lesson RAG] Retrieval complete` logs
`queriesExecuted: queries.length`, the number **planned**, not issued — count Jina embedding rows in
`generation_trace` instead; the dev workers point at `qdrant-dev` with **12 points**, so a lesson
driven through the dev queue never touches the 6856-point corpus on 6335; and a Stage 6 probe's
lesson length follows `estimated_duration_minutes` from `course_structure` (5 for course `8baaa75e`,
against the 15 an older baseline used), so every per-lesson counter moves with it.

## Routing and models

Ten live models. Workhorse `deepseek/deepseek-v4-flash-0731` — a **pinned snapshot** — fallback
`openai/gpt-5.6-luna`; prose `z-ai/glm-5.3-flash` with `PROSE_FALLBACK_MODEL_ID` =
`openai/gpt-5.6-luna` (never DeepSeek: it is the model this seat was taken away from);
`z-ai/glm-5.2` for the deciding judge and Stage 6's last chance; plus `google/gemini-3.7-flash`,
`minimax/minimax-m3` and four image models. Four invariants: judges keep three separate vendors,
`emergency` stays off OpenAI, every fallback crosses vendors, and the three escalation phases avoid
the default model on both hops.

**Judges by price** (`mc2-d1d09`): primary `gpt-5.6-luna`, secondary `deepseek-v4-flash-0731`,
tiebreaker `glm-5.2` (fallback `minimax-m3`). `executeSingleJudge` takes `judgeModels.secondary`, the
most frequent judge call. Reasoning is on for `stage_6_complex`, `stage_5_escalation` and
`stage_6_auto_last_chance` only.

**Images, settled 2026-08-27.** Card `openai/gpt-5-image-mini` at `quality: 'medium'`, $0.0091 a
frame, cheapest of all 47 square-capable models. Banner `sourceful/riverflow-v2.5-fast` at $0.013954,
fallback `openai/gpt-image-2`, ratio **16:9**. Image models are a separate catalogue: 26 of 48 charge
per frame and report no tokens (`imagePriceFlatUsd`), and only 7 publish `quality`.

**One table decides which model a phase gets** (`3cb14ffb6`, `mc2-u8kwx`): `llm_model_config`, edited
by the superadmin panel, snapshotted into `config-seed.json`, with `model-defaults.ts` naming the
four roles a snapshot cannot express. Every second answer is gone — `PHASE_FALLBACK_CONFIG`,
pipeline-admin's `DEFAULT_MODEL_CONFIGS`, `shared/llm/model-selector.ts`, Stage 5's `MODEL_FALLBACK`.
The guard is `model-ids-live-in-one-place.test.ts`: a model id spelt out anywhere under `src/`
outside six named registries fails the build. `collectRoutableModelIds()` returns exactly
`LIVE_ROUTING_MODEL_IDS`, asserted by `model-catalog-coverage` — it fails both when a registry goes
silent and when an undeclared one appears. A model id changes **database first, then**
`pnpm generate:config-seed`.

**The cheapest endpoint is the cheapest that can finish** (`263ae6c37`, `mc2-6a1x4`):
`MIN_ENDPOINT_THROUGHPUT_TPS = 30`, from the largest ordinary Stage 6 budget against its 300 s phase
timeout. Price-only sorting had been sending the workhorse to a 9 tok/s endpoint. The floor cannot
refuse every endpoint, ignores an endpoint publishing no figure, and never reaches across service
tiers. `throughput_last_30m` is an **object**; `uptime_last_30m` beside it is a number, and uptime is
deliberately not a criterion (owner, 2026-08-27).

**Phase configs**: Stage 5, metadata generation and `getModelForPhase` all go through
`buildProviderParams` (`phase-config-provider-contract.test.ts`); collision fallback
`LARGE_CONTEXT_MODEL_ID`. `stage_5_escalation` leads `getEscalationChain('generation')`.
`routing-seed-integrity` fails any phase whose model changes with language alone.

**The prose method outlives its ruling:** same input twice, read the artifact, do not trust the
judge. It is how a model that scored 0.92 was found to invent a statistic, and how a whole fabricated
metrics column was caught in the playbook. Also: **never measure a model on a container that has not
been told about it.**

**Where the money goes** (`mc2-4clyr`, remeasured 2026-08-27): a month of real courses came to
$0.9728 — Stage 6 prose 49.6%, the **cover image 25.6%**, judges 13.1%, Stage 4 6.4%, Stage 5 4.9%.
After the prose move the card is the largest single line of a small course.

## Cost accounting

Epic `mc2-qrdkt` is complete and the ledger reconciles. What binds work:

- **The receipt exists.** `GET /api/v1/generation?id=` returns what OpenRouter billed; the id is in
  the body **and** the `x-generation-id` header, which arrives before any abort, so a timed-out call
  is still countable. The record takes ~9.6 s to become readable. A paid call prices itself **at the
  call** and is stamped `input_data.billedCall`; a node-level summary row keeps tokens and carries no
  price. Guard: `tests/unit/shared/metrics/no-anonymous-spend`.
- **The ledger holds two providers** since 2026-08-28. A lesson costs about $0.0004 in Jina beside
  its OpenRouter bill — 8–13%, the reranker being 97% of it. Rates come from
  `GET https://api.jina.ai/v1/models` into `src/shared/jina/pricing.ts`, watched by
  `check:jina-pricing-drift`. Do **not** put Jina in `MODEL_CATALOG`. Jina rows are stamped
  `provider: 'jina'` and stay **out** of the OpenRouter reconciliation, which compares against a
  per-call receipt Jina does not issue.
- **The catalogue is an estimate, not the price.** `MODEL_CATALOG` builds budgets and the
  `provider.max_price` ceiling; every call settles against the provider. The nightly
  `check-model-catalog-drift.ts` is in **no** CI job: it writes published rates and commits to
  `develop`; a 1.5x move and a failed run both go to Telegram. Catalogue the **plain** tier — `/flex`
  is half it, `/priority` double — and never retype a rate in a test.
- **`provider.max_price` below every endpoint is a refusal**, not a cheaper route.
- **One transport, one place**: every OpenRouter client comes from `shared/llm/openrouter-client.ts`,
  held by `one-openrouter-transport.test.ts`, whose exception list may shrink, never grow.
- **A playbook is not a course** — `generation_trace.course_id` is a foreign key into `courses`, so
  playbook money lives in `career_playbooks.cost_breakdown`, and a playbook cannot have a
  `course_override` row. **Stage 6 and Stage 7 run their own workers, queues and containers**:
  anything added to the general processor misses them, and cost was wrong three times for this.
- **Editing is inside the course total**: `generation_trace.stage` accepts `stage_edit` and
  `get_audit_summary` returns it as its own row.
- **Attempt 1 stays on the primary**: `FALLBACK_FROM_ATTEMPT = 2`. `mc2-f1tqd` stays **open** — a
  pinned endpoint that answered with nothing at all, five attempts, no record.

After a paid run, reconcile with `pnpm cost:report --since <T0> --verify-with-provider`.

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
  Graphify is 0.9.45 and **does** refresh: `graphify update .`, no LLM, plus `--force` after a
  release that deletes code, because it refuses to write a smaller graph. Semantic extraction and
  community naming need an external model backend and stay off.
- Dev evidence metrics reach Prometheus labelled `environment="dev"` (`mc2-kim48`): the four rules
  aggregate `by (environment)`, dev writes an instance ending `-dev` and one `metric_relabel_config`
  rewrites it. Install monitoring config with
  `sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh` — a single-file bind mount pins
  the inode, so Prometheus must be restarted. `dev-compose-variables-are-written.test.ts` compares
  every `${VAR:?}` in `docker-compose.dev.yml` against what the deploy writes.

## Owner decisions

Answered: `mc2-jz6y0.13.6` (pull-based off-host snapshots), `mc2-lrav0` (no backfill of dev Qdrant),
`mc2-db696.61` (`career_playbook_sources` has never held a row). `mc2-dgw4u` — Stage 7 audio stays on
its own OpenAI account, **paused, not settled**. `mc2-hqfc3` video stays parked; the job-description
rework stays parked. Migrations approved when necessary, useful and current, one at a time.
2026-08-28: lesson **length is not a criterion**, meaning surviving is; model arithmetic slips are
accepted noise and get no deterministic check.

**Still open:** `mc2-v6fqp` — which third language. "ru and en" stays the test language.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f` or `mc2-1nots`; see §9 of the active
spec for exact reopen gates.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes
the branch it delivered, so a report naming a branch again means something really was left behind.

## Explicit defers

- `mc2-6ye5z.4/.5/.8` — handlers written 2026-08-23; live proof merely unrun, as for `mc2-rmbwo` and
  `mc2-p99f1`. `mc2-db696.106`/`.107` not planned; `mc2-gmab0` held by unit tests.
- `mc2-sv89s` — Jina spend from the two quality gates (`quality-validator.ts`,
  `semantic-matching.ts`) prices itself but is not attributed to a course; neither module mentions
  `courseId`. Both are named in `no-anonymous-spend.test.ts` under `RETRIEVAL_DEFERRED`.
- `mc2-zewto` — Stage 6 grouping costs 22.6pp of recall@5. Owner's trade, measured, not acted on.
- `mc2-cva3o` — the production deploy writes `QDRANT_METRICS_GID` from a secret that does not exist.
  Not burning: the host carries 900 by some other means. It burns when `.env.production` is rewritten
  and the infra stack recreated.
- `mc2-ibzcc` is closed, but its docling-mcp 3.1.0 image is **neither published nor deployed** — that
  is the manual `build-docling-images.yml` workflow and a recorded `image@sha256`, a production
  mutation of its own. `mc2-vlskb` stays open: 3.1.0 still drops
  `service_timeout`/`service_max_retries`.
- `mc2-v6r1p` — two catalogue prices have drifted; the question is whether either model belongs in
  live routing at all. `mc2-z08mv` — revisit `glm-5.3` when it has more than one provider.
- `mc2-pdcb7` — covers drawn without their visual style, fixed; whether to pay to redraw is the
  owner's.

## NotebookLM and languages

**The hop is live** (`mc2-xjykw`): SOCKS5 through `helixa-new` (82.26.152.8, NL), own revocable key,
system unit `megacampus-socks.service`. Judge it by its listener and its egress, never by unit state.
**Cookies are no longer a blocker**: the session is minted from a master token, `/health` reads
`2028-08-24 (730d)` and `notebooks.list()` answers. **Nothing has yet run a real NLM generation
through it** — the one proof still owed, and it now needs only a run.

`mc2-p99f1` has **no gate at all** — every layer already accepts the four types, and
`ON_DEMAND_ENRICHMENT_TYPES` is read by nobody. Three more enum values are applied to the database
and their handlers exist (`dbe094e21`), held by `stage7-new-nlm-types-are-real.test.ts`. `nlm_report`
is `artifacts.generate_report` with a format that is **not** `study_guide`, refused at both bridge
and handler.

**Spanish and Chinese both complete** (`mc2-v6fqp`), read by eye. Chinese never could before: five
thresholds calibrated on Latin script, each invisible until the previous was fixed. Weight by script,
never lower the number.

## Next recommended

Accepted stage id: `mc2-51epl` · Current stage id: none · Next stage id: **owner's call**

`brawny-mellow-quokka.md` is finished and nothing in it is owed. Recommended action: pick the next
track — `mc2-db696` (Career Playbook) and `mc2-uv7n7` (UI redesign, 22 Stitch screens) are the two
standing directions, and `specs/026-post-triage-priorities/spec.md` holds the backlog order.
Use $orchestrator-stage when the next track becomes an epic.

Three small debts can ride any future paid run rather than justify one: `stage_5_escalation` has
never actually escalated, the judge's terminal review path has never fired — both needing a
generation forced to fail — and no real NLM generation has run since the cookies were restored.

## Starter prompt for next orchestrator

Read the section above for what is owed; `snuggly-wiggling-sutton.md` is **done** and
`.codex/next-goal-four-doors.md` is **stale** — ignore both. **Do not ask — act and report**, inside
the standing authorization under Safety boundary.

The Helixa AIOS bridge belongs to another agent — leave it alone. **16 unique commits, 6149 lines**,
reported by three refs; its three blockers are fixed on `fix/helixa-blockers` and handed over, not
merged (`mc2-gxese`). Not covered by re-pinning the manifest: its migrations install six triggers on
`courses`, `career_playbooks` and `file_catalog`, inert while `helixa_knowledge_sync_bindings` is
empty but present at the database level, where the env flag does not reach — and dev and staging
share one database. Both branches are in `.codex/stranded-commit-allowlist.txt`; remove the two
entries together. That agent also broke the root `node_modules` once, so if a pre-commit hook cannot
find `prettier-plugin-tailwindcss`, relink the symlink into `node_modules/.pnpm/...` by hand rather
than running `pnpm install`.

`pnpm test:unit` covers **all three** packages since `mc2-cuk7j.1`.

Read first: `AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/026-post-triage-priorities/spec.md`.
