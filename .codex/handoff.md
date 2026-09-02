# Orchestrator Handoff

Updated: 2026-09-02. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons, stage summaries and
`docs/career-playbook/2026-09-02-handoff-history-archive.md`. Durable traps live in
`.codex/repository-failure-modes.md`; this file says what still binds work.

## Current stage

Accepted stage id: `mc2-1786710715922-25-db11a6c5`

The Role Guide stage is accepted; its verification record is
`.codex/stages/mc2-1786710715922-25-db11a6c5/summary.md`. Epic Career Playbook `mc2-db696` is
**closed (2026-09-02)**, and the release it was waiting for is done: `master` is at `7ba758427`, and
production runs that revision — read from `org.opencontainers.image.revision` on
`megacampus-api-green` and `megacampus-worker`, not from a green CI run. `develop` equals
`origin/develop`, `master` contains every commit of `develop`, and `check_stranded_commits.py`
reports nothing left behind. Every Career Playbook issue outside the epic is closed.

What the finished track still binds:

- **Reader views are delivered and enforced** (`3ff023abf`, owner ruling 2026-08-31): employee ⊂
  manager ⊂ HR, 20/26/27 blocks, only `block_12` outside the manager's view. The link is the
  credential, because nothing in the platform knows which of the three a visitor is —
  `share.listViewLinks` issues one link per reader and `share.getViewByToken` resolves the audience
  from an HMAC over (playbook, audience), serving that view **through assembly**, so it carries the
  diagrams, sources and calibration table. No column was added; sharing off revokes all three.
- **`docs/career-playbook/quality-contract.md` is the contract**, and its §6.2 fixes what measuring
  this pipeline costs: a floor of **eight arms per side**, because a critical count at n=1 is noise
  (32 arms recorded). Do not read a run-count table as a measurement.
- **A paid dev run needs no browser and no owner click**: `auth.admin.generateLink` + `verifyOtp`
  mints a real session from code. Step 1 of `docs/career-playbook/live-smoke-dev-run.md` is stale
  where it says otherwise.
- Three dev rows (`d5137bc5`, `638ed691`, `88fc2368`) are kept as A/B baselines and are not cleaned
  up.

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
account, **paused, not settled**. `mc2-hqfc3` video stays parked; the job-description rework stays
parked. Migrations approved when necessary, useful and current, one at a time.

2026-08-28: lesson **length is not a criterion**, meaning surviving is; model arithmetic slips are
accepted noise and get no deterministic check. 2026-08-30 (`mc2-de3vu`, closed with the checkboxes
unchanged): a whole section is too coarse a unit of access, so carrying one line across audiences is
the mechanism, not a workaround — do not reopen by proposing to move an audience checkbox without a
new owner request. 2026-09-02: the live NotebookLM acceptance run is **not needed yet**.

## Safety boundary

**Standing authorization, owner 2026-08-22: do not ask, act and report.** Paid runs inside the USD 5
ceiling, commits, `git push` to `develop`, dev deploys on a green pipeline, edits to
`llm_model_config` and `config-seed.json`, branch/worktree cleanup, the migrations named in the
active plan when necessary, and `RAG_SHADOW_RETRIEVAL_RATE` in production.

Outside it, needing a fresh decision each time: reindex, force-push, secrets or access changes, any
other production mutation, and any migration the plan does not name.

Do not touch `mc2-x72bq`, `mc2-vlskb`, `mc2-hqfc3` or `mc2-8m90f`; see §9 of the active spec for
exact reopen gates. `mc2-gxese` (Helixa, two branches and their worktrees) is parked by the owner
until the Helixa side is ready. Before claiming delivery, run
`scripts/orchestration/check_stranded_commits.py`. `/push-dev` deletes the branch it delivered, so a
report naming a branch again means something really was left behind.

## Explicit defers

- **NotebookLM live acceptance, deferred by the owner on 2026-09-02.** Epic `mc2-6ye5z` and five of
  its tasks — `mc2-6ye5z.4`, `.5`, `.8`, `mc2-p99f1`, `mc2-rmbwo` — stay **open on purpose**. The
  code is written and tested: handlers for `nlm_slide_deck`, `nlm_report` and `nlm_data_table` landed
  2026-08-23 in `dbe094e21`, and the tunnel and cookies were restored 2026-08-28. What is missing is
  a live run of the nine types, and the last NLM generation in the database is **2026-04-15**. Do not
  order generations and do not close these tasks without a new owner request.
- `mc2-sv89s` — Jina spend from the two quality gates (`quality-validator.ts`,
  `semantic-matching.ts`) prices itself but is not attributed to a course; neither module mentions
  `courseId`. Both are named in `no-anonymous-spend.test.ts` under `RETRIEVAL_DEFERRED`.
- `mc2-cva3o` — the production deploy writes `QDRANT_METRICS_GID` from a secret that does not exist.
  Not burning: the host carries 900 by some other means. It burns when `.env.production` is rewritten
  and the infra stack is recreated.
- `mc2-vlskb` — docling-mcp 3.1.0 still drops `service_timeout`/`service_max_retries`, and its image
  is **neither published nor deployed**: that is the manual `build-docling-images.yml` workflow and a
  recorded `image@sha256`, a production mutation of its own.
- `mc2-zxzgf` — the Mermaid fallback text is English, and 123 old lessons still show it.
- `mc2-8m90f` — Q12 post-window evidence-coverage ledgers for the six recovered `file_catalog` ids.
- `mc2-g4fdf` — Batch API beyond Stage 6 (flex-priced batch, shared coordinator, Stage 7 first).
- `mc2-z08mv` — revisit `z-ai/glm-5.3` when it has more than one provider. `mc2-vjbb` (blocked) —
  calibrate `TIER1_SCORE_THRESHOLD` from production data.
- `mc2-x72bq`, `mc2-hqfc3` — owner-gated, listed under Safety boundary.
- The REF issues (`mc2-eiqn8` plus the ten `deferred` ones) are reference documents, intentionally
  open, and are not a backlog tail.

## Next recommended

Next stage id: none selected. The active plan is `docs/plans/melodic-leaping-octopus.md`
(2026-09-02), which closes the tails left after the Career Playbook epic in four streams. A and C are
parallel; E is strictly last.

Recommended action: **work stream A to completion, then C, then E.**

- **A — process and tracker housekeeping** (`chore/audit-housekeeping-2026-09`). This file is A1.
  Remaining: close `mc2-uv7n7` (owner 2026-09-02: the UI Redesign epic is not current; a future
  redesign starts from the Stitch screens as new work), reconcile GitHub Issues with Beads (35 open
  against 21 — one issue at a time, with text, no bulk closes), and settle `mc2-pmrmf.1` and its
  blocked parent `mc2-pmrmf`.
- **C — three P2 bugs**, one branch each: `mc2-kkimo` (seven files excluded from
  `vitest.config.unit.ts`, ~250 cases), `mc2-cva3o` (read the gid with `stat` as dev already does,
  create no secret), `mc2-hpful` (find where a lesson block is duplicated during assembly before
  proposing a near-duplicate detector; ceiling $2).
- **B — `mc2-o7tfu`**, no branch needed if the 2026-09-03 03:20 UTC `Model Catalogue Price Sync` run
  on `master` is green.
- **E — the release loop**, dead since April: `package.json` is 0.31.41 with no tag, the last tag is
  `v0.31.40`, `CHANGELOG.md` ends at 2026-04-10. `/push patch` on `develop`, then `/deploy`, then one
  line in `AGENTS.md` so the loop cannot die again.

No schema migration, reindex, audience-checkbox change, secret/access mutation or force-push has
occurred since the accepted stage.

## Starter prompt for next orchestrator

Use $orchestrator-stage after selecting the next ready Beads goal. Read `AGENTS.md`,
`.codex/orchestrator.toml`, this handoff, `docs/plans/melodic-leaping-octopus.md` and the selected
issue before creating a new stage; do not reopen the accepted Role Guide boundary without a new owner
request or measured regression.
