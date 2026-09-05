# Orchestrator Handoff

Updated: 2026-09-05. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons, stage summaries and
`docs/career-playbook/2026-09-02-handoff-history-archive.md`. Durable traps live in
`.codex/repository-failure-modes.md`; this file says what still binds work.

## Current stage

Accepted stage id: `mc2-sdjy8`

Debt closeout 2026-09-05, level release, accepted the same day; record in
`.codex/stages/mc2-sdjy8/summary.md`. Release **`v0.31.44`** on `eeb056d9c`; `master` at
`726ddf1c2` after `/deploy`. Owner instruction for the day: act as orchestrator, delegate to
Opus, finish everything the audit found, full authorization including deploy and paid actions.

What it closed, each with its evidence in the Beads close reason:

- **Nightly price sync** was red again two nights after its 2026-09-03 fix: the full unit suite
  launches Playwright Chromium the job never installed, and a 10-minute timeout cancelled the
  night before with no Telegram, because `failure()` is false for a cancelled job. Chromium
  step, 25 minutes, `failure() || cancelled()`. A scheduled run reads the workflow from
  `master`, so the proof is the first run after `726ddf1c2` (dispatched: `33961951365`).
- **Cost holes**: section regeneration read back its recorded price instead of writing 0
  (`recordLlmCallCost` now returns it; a collector drains LangChain's background callbacks);
  Jina spend in the quality gates is charged to the course (mc2-sv89s closed,
  `RETRIEVAL_DEFERRED` empty). Stage 5 permanent failures now reach the error log with their
  `organizationId` (five producers enqueued only the snake_case payload;
  `buildStructureGenerationJobData` is the one mapping).
- **Six February leftover markers** gone: three implemented, three recorded decisions.
- **Advisories**: `qs` 6.16.0, `@xmldom/xmldom` 0.8.15 — pinned inside the major after `>=0.8.15`
  resolved to 0.9.12 and broke mammoth's DOCX fallback on CI only (see failure modes).
- **docling-mcp #134** → upstream PR `docling-project/docling-mcp#135`; `mc2-vlskb` now waits on
  that PR, not on a version number.
- **Helixa AIOS bridge (mc2-gxese, parked since 2026-08-26) landed.** Blockers merged, six
  triggers on live tables reviewed and three database defects repaired (`extensions.digest`,
  `SECURITY DEFINER` on the `file_catalog` guard, three indexes), inbound HTTP transport built
  at `POST /api/integrations/helixa/generation/{dispatch,lookup}` (HMAC over the raw body, same
  shared secret as outbound, nginx locations in both configs), a `CREATE_JOB_INSTRUCTION`
  scheduler that had never existed, `live` mode, and **eight migrations applied to the one
  shared Supabase project** (7 tables, 6 triggers, 32 functions, 0 bindings). Data-gated off:
  no binding row, `HELIXA_KNOWLEDGE_SYNC_SCHEDULER_ENABLED` and
  `HELIXA_MEGACAMPUS_GENERATION_MODE` unset. Contract, trigger review, rollback SQL and the
  go-live recipe: `docs/helixa/megacampus-side.md`. Prompt for the Helixa side:
  `docs/helixa/handoff-for-helixa.md` — the owner sends it when Helixa's current work ends.

The earlier Role Guide stage (`mc2-1786710715922-25-db11a6c5`) stays accepted; what it binds is
unchanged: reader views employee ⊂ manager ⊂ HR with the link as credential,
`docs/career-playbook/quality-contract.md` §6.2 (eight arms per side), paid dev runs from code
via `auth.admin.generateLink` + `verifyOtp`, three dev rows kept as A/B baselines.

**The release loop is alive**: `/push` before `/deploy`, every production deploy carries a tag.
Production revision is read from `org.opencontainers.image.revision` on the running containers,
never from a green CI run.

## Archived history

Moved out of this file on 2026-09-02, **verbatim**, into
`docs/career-playbook/2026-09-02-handoff-history-archive.md`. The durable lessons they taught are in
`.codex/repository-failure-modes.md`; go there first, and to the archive only for the evidence.

- `Current stage`, long form — the accepted Role Guide narrative and the five measured arms.
- `RAG retrieval, chunking and parent expansion (measured 2026-08-26/28)` — recall@5 per path, the
  prefetch-limit fix, parent expansion at 1.00x on the live corpus.
- `Career Playbook verification runs, 2026-09-01 night` — two paid runs and four defects.
- `Jina key replaced (2026-09-02, mc2-7lp0u closed)` — where the credential lives, how it was proven.
- `Six open defects closed (2026-09-02, 0ab834bd3)` — the last six non-epic issues.

## Routing and models

Ten live models. Workhorse `deepseek/deepseek-v4-flash-0731` — a **pinned snapshot**, not an alias —
fallback `openai/gpt-5.6-luna`; prose `z-ai/glm-5.3-flash` with `PROSE_FALLBACK_MODEL_ID` =
`openai/gpt-5.6-luna` (never DeepSeek: it is the model this seat was taken away from); `z-ai/glm-5.2`
for the deciding judge and Stage 6's last chance; plus `google/gemini-3.7-flash`,
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
four roles a snapshot cannot express. Every second answer is gone. The guard is
`model-ids-live-in-one-place.test.ts`: a model id spelt out anywhere under `src/` outside six named
registries fails the build. `collectRoutableModelIds()` returns exactly `LIVE_ROUTING_MODEL_IDS`,
asserted by `model-catalog-coverage` — it fails both when a registry goes silent and when an
undeclared one appears. A model id changes **database first, then** `pnpm generate:config-seed`.

**The cheapest endpoint is the cheapest that can finish** (`263ae6c37`, `mc2-6a1x4`):
`MIN_ENDPOINT_THROUGHPUT_TPS = 30`. The floor cannot refuse every endpoint, ignores an endpoint
publishing no figure, and never reaches across service tiers. `throughput_last_30m` is an **object**;
uptime is deliberately not a criterion (owner, 2026-08-27).

**Phase configs**: Stage 5, metadata generation and `getModelForPhase` all go through
`buildProviderParams` (`phase-config-provider-contract.test.ts`); collision fallback
`LARGE_CONTEXT_MODEL_ID`. `stage_5_escalation` leads `getEscalationChain('generation')`.
`routing-seed-integrity` fails any phase whose model changes with language alone.

**The prose method outlives its ruling:** same input twice, read the artifact, do not trust the
judge. And **never measure a model on a container that has not been told about it.**

**Where the money goes** (`mc2-4clyr`, remeasured 2026-08-27): a month of real courses came to
$0.9728 — Stage 6 prose 49.6%, the **cover image 25.6%**, judges 13.1%, Stage 4 6.4%, Stage 5 4.9%.

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
- **One transport, one place**: every OpenRouter client comes from `shared/llm/openrouter-client.ts`,
  held by `one-openrouter-transport.test.ts`, whose exception list may shrink, never grow.
- **A playbook is not a course** — `generation_trace.course_id` is a foreign key into `courses`, so
  playbook money lives in `career_playbooks.cost_breakdown`, and a playbook cannot have a
  `course_override` row. **Stage 6 and Stage 7 run their own workers, queues and containers**:
  anything added to the general processor misses them, and cost was wrong three times for this.
- **Editing is inside the course total**: `generation_trace.stage` accepts `stage_edit` and
  `get_audit_summary` returns it as its own row. **Attempt 1 stays on the primary**:
  `FALLBACK_FROM_ATTEMPT = 2`.

After a paid run, reconcile with `pnpm cost:report --since <T0> --verify-with-provider`.

## Stage 6 Batch API, and backlog order

`FEATURE_STAGE6_BATCH_GENERATION` (off) sends a course's initial lesson generation as one
asynchronous OpenRouter batch; a coordinator polls, and each lesson is also enqueued with a
`STAGE6_BATCH_MAX_WAIT_MS` delay so it generates synchronously if the batch never lands. Turning it
on is not a config switch — see `:batch` in `.codex/repository-failure-modes.md`. Widening it beyond
Stage 6 is `mc2-g4fdf`, open.

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order; do not re-open the 27
already closed with a commit or a measurement, and do not re-rank by tracker priority. Complete
through T5.

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
- The Jina key was replaced 2026-09-02 (`mc2-7lp0u`) and is installed everywhere the value is read.
  `megacampus-api-blue` and `megacampus-web-blue` deliberately still hold the old one — they have no
  embedding or rerank call site — and pick it up at the next production deploy.

## NotebookLM and languages

**The hop is live** (`mc2-xjykw`): SOCKS5 through `helixa-new` (82.26.152.8, NL), own revocable key,
system unit `megacampus-socks.service`. Judge it by its listener and its egress, never by unit state.
**Cookies are no longer a blocker**: the session is minted from a master token, `/health` reads
`2028-08-24 (730d)` and `notebooks.list()` answers. Every layer already accepts the four enrichment
types and `ON_DEMAND_ENRICHMENT_TYPES` is read by nobody; three more enum values are applied to the
database and their handlers exist (`dbe094e21`, 2026-08-23), held by
`stage7-new-nlm-types-are-real.test.ts`. `nlm_report` is `artifacts.generate_report` with a format
that is **not** `study_guide`, refused at both bridge and handler. **Nothing has yet run a real NLM
generation through any of it** — the last one in the database is 2026-04-15, and the owner deferred
that proof on 2026-09-02. See Explicit defers.

**Spanish and Chinese both complete** (`mc2-v6fqp`, closed), read by eye. Chinese never could before:
five thresholds calibrated on Latin script, each invisible until the previous was fixed. Weight by
script, never lower the number.

## Owner decisions

Answered: `mc2-jz6y0.13.6` (pull-based off-host snapshots), `mc2-lrav0` (no backfill of dev Qdrant),
`mc2-db696.61` (`career_playbook_sources` has never held a row), `mc2-v6fqp` (ru and en stay the test
languages; Spanish and Chinese are proven). `mc2-dgw4u` — Stage 7 audio stays on its own OpenAI
account, **paused, not settled**. The February video pipeline is closed and its branch deleted
(`mc2-hqfc3`, owner 2026-09-03); the job-description rework stays parked. Migrations approved when necessary, useful and current, one at a time.

2026-08-28: lesson **length is not a criterion**, meaning surviving is; model arithmetic slips are
accepted noise and get no deterministic check. 2026-08-30 (`mc2-de3vu`, closed with the checkboxes
unchanged): a whole section is too coarse a unit of access, so carrying one line across audiences is
the mechanism, not a workaround — do not reopen by proposing to move an audience checkbox without a
new owner request. 2026-09-02: the live NotebookLM acceptance run is **not needed yet**.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production. On 2026-09-05 the
owner additionally authorized deploy and paid actions for the debt closeout; that grant was
consumed by the stage and is not standing.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, any migration the plan does not name, **and turning the Helixa bridge
on** (a binding row with `enabled = true`, the two mode variables, the shared HMAC secret).

Do not touch `mc2-x72bq`; see §9 of the active spec for its reopen gate. Before claiming delivery,
run `scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes the branch it
delivered, so a report naming a branch again means something really was left behind.

## Explicit defers

- `mc2-vlskb` — the Docling timeout wrapper stays until `docling-project/docling-mcp#135` is
  merged and released; then delete only the timeout half of `runtime.py`.
- `mc2-zxzgf` — 105 visible lessons still carry the English Mermaid fallback paragraph; the code
  is fixed, the data is not, and clearing it is paid regeneration on published courses the owner
  declined on 2026-08-28. The 2026-09-05 blanket grant was not read as overriding that ruling.
- `mc2-z08mv`, `mc2-x72bq`, `mc2-vjbb` — unchanged, each names what would end it.
- The Helixa bridge is delivered, not provisioned: §9 of `docs/helixa/megacampus-side.md` is the
  sequence, and the two values only the owner can mint or name are §4 of the handoff prompt.
- Eleven REF documents stay `deferred` on purpose and are not a backlog tail.
- The primary tree cannot run `pnpm install`: `node_modules/.modules.yaml` still points its virtual
  store at an August sibling worktree, so pnpm demands a purge. Local suites run on whatever was
  installed on 2026-08-23; a lockfile change is first proven by the CI unit job. Fix when the
  tree is otherwise idle: remove `node_modules` and reinstall once, with no worktree running.

## Next recommended

Next stage id: none selected. Nothing in `mc2-sdjy8` blocks the queue.

Recommended action: **read run `33961945370` (master) and the first scheduled price sync, then
wait for the owner's Helixa values.**

1. **Read the first scheduled price sync after 2026-09-06 03:20 UTC** (`gh run list --workflow
"Model Catalogue Price Sync" --limit 3`). Green, or a delivered failure message, proves AC-1
   on the workflow `master` now carries; the dispatched run `33961951365` is the same proof.
2. **Confirm production revision** on `megacampus-api-green`/`blue` after run `33961951365`'s
   deploy job: `org.opencontainers.image.revision` must read `726ddf1c2`.
3. When the owner returns with the Helixa values, follow §9 of `docs/helixa/megacampus-side.md`
   on dev first, then production.
4. Then pick any ready Beads goal.

No reindex, audience-checkbox change, secret/access mutation or force-push has occurred since the
accepted stage. Eight schema migrations and one production deploy occurred under the owner's
2026-09-05 authorization.

## Starter prompt for next orchestrator

Use $orchestrator-stage after selecting the next ready Beads goal. Read `AGENTS.md`,
`.codex/orchestrator.toml`, this handoff, `.codex/repository-failure-modes.md` and the selected
issue before creating a new stage; do not reopen the accepted Role Guide boundary or the Helixa
go-live without a new owner request.
