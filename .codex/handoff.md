# Orchestrator Handoff

Updated: 2026-08-13. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and
`.codex/stages/<stage_id>/summary.md`; do not re-narrate it here.

## Current stage

The Career Playbook quality track is **accepted** (`mc2-db696.110`, editorial read 4.4 / 5 against a
4.0 threshold, run cost USD 0.352; evidence in `.codex/stages/mc2-db696.110/evidence/`). Its two
process rules are in `06-quality-acceptance.md` and still hold: read the artifact before calling a
run accepted, and clean up **after** the editorial pass. Active work is now epic `mc2-qrdkt`.

## RAG retrieval and chunking repaired (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`; `mc2-lrav0` on the owner's "no backfill".
Details in `54a5c5e44`, `c18e2a9ea` and the stage summaries. What still constrains work:

- Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
  ceiling), and a test rejects any literal above that ceiling. The old `0.7` was unreachable against
  embeddings topping out near 0.58, which made hybrid search BM25-only.
- Degenerate parents no longer reach the index (`selectIndexableChunks`); search drops repeated text
  as a safety net. Production was cleaned 13712 → 6856 points.
- Both chunking paths are healthy and were measured, `markdown-chunker.ts` on 25 production documents
  and `docling_hybrid` on a fresh one. `groupIntoParents()` was accused twice and caused neither
  defect.

## Parent context expansion (2026-08-13, `217e3d112`)

`specs/027-parent-context-expansion/spec.md`, implemented. Only children are indexed, plus any
childless parent; the passage is rebuilt at retrieval time from siblings. Expansion runs **after
reranking** in the two paths that rerank, and the budget is a ceiling on what it adds, never a reason
to drop a retrieved chunk. On for Stage 5 section RAG, Stage 6 lesson RAG and `search_documents`; off
for evidence retrieval, where a citation must point at the fragment that matched. `getParentChunk` is
gone. It is a no-op on points indexed before it and takes effect per document as they are reprocessed.

**Measured on ordinary teaching material (2026-08-13, the `mc2-2pplo` run).** A 33707-character
Russian article as DOCX through `docling_hybrid`: 30 parents, 110 indexed children, siblings on
**105 of 110 (95.5%)**, average expansion 5.5×, median rebuilt passage 529 tokens against 180 for the
chunk that matched, 0 broken and 0 one-sided sibling links. So ordinary material sits near the legal
corpus (100%), not near the schedule document (2 of 9). Resulting quality on this material is **not**
measured: Stage 5-6 never ran.

## Routing and models (2026-08-12, `43ab557d6`)

Twelve models cut to seven against the live OpenRouter catalogue: simple work on
`~deepseek/deepseek-v4-flash-latest` (the `~` is part of the id), complex on `openai/gpt-5.6-luna`,
`z-ai/glm-5.2`. Four invariants to preserve: judges keep three separate vendors, `emergency` stays
off OpenAI, every fallback crosses vendors, and the three escalation phases avoid the default model
on both hops because by the time they run it has already failed.

Reasoning is per-phase and the budget is the load-bearing part — OpenRouter bills reasoning tokens
against `max_tokens`, so the budget is ADDED, and both the database and the seed generator refuse
`reasoning_enabled` without one. On for `stage_6_complex`, `stage_5_escalation`,
`stage_6_auto_last_chance` only. Models and prices have one source, `MODEL_CATALOG` in shared-types.

Still unexercised end to end: Stage 5, the judge panel, the refinement loops and the full Stage 6
graph. Worth a look while doing `mc2-qrdkt`: `stage_6_simple` and `stage_6_normal` both point at
`openai/gpt-5.6-luna`, so the cheap tier is not cheaper, and the priciest output in the catalogue
(`z-ai/glm-5.2`, 5× luna) sits in the judges, which are 30% of all tokens.

## Phase configs audited (2026-08-13, `7ad421986`)

`mc2-o3s4r` closed. Stored configuration is clean on the checks that matter: no budget exceeds a
model ceiling once the reasoning budget is added, no reasoning on a model that refuses it, every
model catalogued and live, every fallback crossing vendors.

What was open was the seam, not the data: Stage 5 passed on only the model id, metadata generation
rebuilt an unconfigured model, and `getModelForPhase` dropped `config.reasoning`. All three now go
through `buildProviderParams`, and `tests/unit/phase-config-provider-contract.test.ts` states that
contract against the defect. The collision fallback is now `google/gemini-3-flash-preview`.

Open from the audit: `mc2-hb8mn` (`fetchStageConfigFromDb` calls `.maybeSingle()` on a filter
matching up to 14 rows; no production caller, so latent), `mc2-s1vg5` (`generate:config-seed` exits
0 reporting success when the database is unreachable), `mc2-9yrgb` (`stage_5_escalation` configured
and shown but requested by nothing — do not delete on that alone), `mc2-p6u8k` (Stage 5 last-resort
constants still name models the routing cut retired).

## Live course run (2026-08-13, `mc2-2pplo` — reached Stage 4, blocked)

The first live run since 2026-06-28 went Stage 1 → Stage 4 on dev against image `2c4487b86` and cost
**USD 0.0146** (read off the OpenRouter key counter; see below for why not from the database). It did
not reach Stage 5, the judge panel, the refinement loops or the full Stage 6 graph — those remain
unexercised. Plan and owner decisions: `docs/plans/humble-floating-widget.md`; epic `mc2-qrdkt`.

Fixed and committed (`3351378c5`, not yet delivered to `develop`): a Stage 2 call ran **620s against
a 60s timeout** because the SDK's `timeout` stops at the response headers and leaves the body read
unbounded — an explicit `AbortSignal` is the only thing that bounds a provider call here, so apply
that shape wherever a budget is claimed; documents shorter than one summarization window were
chunked twice, the second chunk being the overlap; course cleanup resolved uploads through
`UPLOADS_DIR`, which no deployment sets, so it deleted nothing and reported success.

Open, all under `mc2-qrdkt`: `mc2-ufpko` (a course with document evidence cannot be deleted at all —
`reject_document_evidence_conflict_checkpoint_mutation` lacks the `pg_trigger_depth() > 1` cascade
exemption every sibling trigger has), `mc2-fqbrj` (a course can stick in `stage_4_clarifying`
forever: `input_fingerprint` is computed partly from an LLM output, so a job retry never reuses the
accepted evidence run and the answer stays keyed to the older one), `mc2-s2x84` (structured evidence
failed on an ordinary Russian DOCX and both catch blocks discard the cause), `mc2-o7740` (cost is
recorded nowhere: `costTracker.recordStageCost` has zero production callers, `model_used` is null on
89.8M of 118M traced tokens), `mc2-43c75` (prod and dev share `worker:readiness:status` in one Redis).

Where the money goes, by tokens (the only measure available): **Stage 6 is ~90%** — 37.9% lesson
generation, 30.0% the judge panel, 20.2% section generation. Stage 5 ~5.5%, Stage 4 ~1.9%.

Course `08912e3b-4010-4719-89c8-e9c8e19d133e` could not be deleted (that is `mc2-ufpko`) and survives
on the shared database marked `[ТЕСТ mc2-2pplo, удалить]`, `archived`; it is the acceptance case for
that task. Its vectors, Redis keys and uploaded file are gone.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority. Tier 1 complete through `mc2-sznhi`; Tier 2
through `mc2-3sz3d`; Tier 3 through `mc2-jz6y0.13.6`; Tier 4 through `mc2-iioip`; accessible Tier 5
work through the `mc2-wxun`/`mc2-vjbb` instrumentation boundary. Live, migration, research and
owner-decision items remain explicitly deferred.

## Live operational facts

- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- `course_embeddings_v1` holds **6856 points** after the 2026-08-12 deduplication. Any restore of a
  snapshot older than that returns 13712 and is not evidence of a fault — half of those are copies.
- Qdrant has a daily restricted pull to `helixa-new` (14-day/14-copy bounds, 10 GiB free-space floor,
  low I/O priority); both timers enabled, Prometheus scrapes independent timestamps. On-host
  snapshots share the docker volume with live data, so the off-host pull is the only real mitigation.
  Local retention is bounded at 30 days by `selectRetentionDeletions`; nothing has aged out yet, so
  the first real deletion is due around 2026-08-30. `mc2-hfoh3` closed.
- Uploads have a daily pull-based off-host copy on `helixa-new`. A second machine, not disaster
  recovery.
- Dev and staging share one Supabase project; CI does not auto-apply migrations. Dev has its own
  Qdrant (host port 6333) and a full `-dev` worker set, but shares Redis with production.
- Nine source documents are accepted as lost; do not reopen them. They are **not** in the indexed
  set (all 87 files behind the 218 indexed documents are present on disk, verified 2026-08-13).
- Uploads live on the production host, not in Supabase Storage — the only bucket is
  `course-enrichments` with 14 objects.
- Monitoring drift is a separate job and must never become a deploy step: it can trigger rollback.
- `AGENTS.md` is rewritten by a `bd` hook: stage and commit explicit paths, never `git add -A`.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infrastructure work must use `scripts/with_host_operation_lock.sh`.
- The default backend Vitest command is fail-closed and needs Qdrant 1.18.2; use
  `vitest.config.unit.ts` for focused unit tests.
- `graph-reviewed: blocked` (2026-08-13) — the graph was read, not refreshed. Graphify 0.9.14 has no
  `build`/refresh subcommand, so a rebuild runs through the `/graphify` skill flow, not from closeout.

## Owner decisions

- `mc2-jz6y0.13.6` — answered: pull-based off-host snapshots on `helixa-new`, 14-day bounded
  retention, low resource priority.
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
- `mc2-db696.106`/`.107` — PDF fidelity and content grounding. `.108` (bounded provider timeouts) is
  partly overtaken: the transport is now bounded by an explicit signal, receipts are not.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, gates already recorded.

## Next recommended

Accepted stage id: `mc2-db696.105` · Current stage id: `mc2-db696.110` · Next stage id: epic
`mc2-qrdkt`

Recommended action: work `mc2-qrdkt` from `docs/plans/humble-floating-widget.md`, starting with
`mc2-ufpko` — it is the only unblocked task and it unlocks the rest. The plan carries the owner's
2026-08-13 decisions, the order of work, the verification and the exact reproduction of the run.

## Starter prompt for next orchestrator

The starter prompt lives at the end of `docs/plans/humble-floating-widget.md`.
Use $orchestrator-stage for the epic itself; single tasks are ordinary local work. Do not enable the
cohort, change its threshold, reindex, force-push, deploy, or migrate beyond the one approved for
`mc2-ufpko`, and do not spend beyond the USD 5 ceiling, without separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
