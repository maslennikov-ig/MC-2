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
graph. Cost, by tokens (the only measure there is until `mc2-o7740`): **Stage 6 is ~90%** — 37.9%
lesson generation, 30.0% judging, 20.2% section generation; Stage 5 ~5.5%, Stage 4 ~1.9%. Epic
`mc2-4clyr` holds what follows from that.

## Phase configs audited (2026-08-13, `7ad421986`)

`mc2-o3s4r` closed. Stored configuration is clean on the checks that matter: no budget exceeds a
model ceiling once the reasoning budget is added, no reasoning on a model that refuses it, every
model catalogued and live, every fallback crossing vendors.

What was open was the seam, not the data: Stage 5 passed on only the model id, metadata generation
rebuilt an unconfigured model, and `getModelForPhase` dropped `config.reasoning`. All three now go
through `buildProviderParams`, and `tests/unit/phase-config-provider-contract.test.ts` states that
contract against the defect. The collision fallback is now `google/gemini-3-flash-preview`.

Open from the audit, none in the current epics: `mc2-hb8mn` (`.maybeSingle()` on a filter matching up
to 14 rows; latent, no production caller), `mc2-s1vg5` (`generate:config-seed` exits 0 on an
unreachable database), `mc2-9yrgb` (`stage_5_escalation` configured but requested by nothing — do not
delete on that alone), `mc2-p6u8k` (Stage 5 last-resort constants name retired models).

## Live course run (2026-08-14, `mc2-2pplo` — reached Stage 4 twice, blocked)

Epic `mc2-qrdkt` is five of six done. Five fixes shipped and are live on dev;
the run itself is blocked on one measured decision. Plan and owner decisions:
`docs/plans/humble-floating-widget.md`.

**Closed.** `mc2-ufpko` — the conflict-checkpoint immutability trigger got the
`pg_trigger_depth() > 1` cascade exemption its four siblings already had
(migration `20260813140000`, applied to the shared dev/staging database).
Deleting a course works; the leftover was removed leaving no row, vector, file
or key. `mc2-s2x84` — both evidence failure paths now record their cause,
without the document's content. `mc2-fqbrj` — run identity no longer reads the
classifier's own output, and an answer carries onto an equivalent subject of a
later run while the sources are unchanged. `mc2-o7740` — cost is priced from
`MODEL_CATALOG` at the two call sites and summed into
`courses.estimated_cost_usd`. `mc2-43c75` — both worker readiness keys are
scoped by queue name; every other cache key is course-scoped.

**Found by the run and fixed.** `mc2-5gdzw`: several catalogued models
deliberate by default and OpenRouter bills that against `max_tokens`. The code
only ever _added_ a reasoning block and never turned it off, so silence read as
consent. Measured live: the same 20-token request to DeepSeek V4 Flash returned
19 reasoning tokens and no content in 11.1s unsaid, and "Париж" in 4 tokens and
3.7s with `{enabled: false}`. Both request builders now say it.

**Open, and the blocker.** `mc2-wg60c`: the 60s per-call budget is smaller than
the default model's real answer time. Measured through the same SDK from the
same worker container, reasoning already off: a realistic Stage 4 request (8204
input tokens, `max_tokens` 16000) took **119.0s** and returned 1050 tokens with
`reasoning_tokens: 0`. A short request to the same model takes 1.1s;
`google/gemini-3-flash-preview` answers the same 33k-character body in 2.4-3.2s.
So every Stage 2 and Stage 4 call burns its retries and then escalates or fails.
The abort bound is not the defect — it is what turned the 2026-08-13 620s hang
into an honest failure. Owner decision: raise the budget off a measurement, or
route Stage 2 and Stage 4 to a fast model (that changes database routing rows,
outside the current scope).

**Proven live on 2026-08-14, not only in tests.** Cost lands in the trace
(`stage_4_classification`, 14007 tokens, USD 0.001695). The new evidence logging
named its cause on the first failure. Course cleanup deleted the `phase1_cache`
and `idempotency` keys the old patterns missed, 106 vectors and a 27057-byte
upload. `delete_course_cascade` runs and leaves nothing.

Spend: **USD 0.2836** against a USD 2 ceiling the owner set today, below the
plan's USD 5, because the shared key had only USD 10.04 of its USD 150 limit
left. USD 9.758 remains. Both test courses are fully deleted: 0 rows, 0 vectors,
0 files, 0 Redis keys.

**A deploy can be skipped on a green pipeline.** Run 31775079909 carried the
`src` reasoning fix and failed Unit Tests, so it never deployed; run 31776031693
was fully green but contained only a test file, so `Detect Deploy-Relevant
Changes` skipped `Deploy to Dev`. The pipeline read green and dev ran old code.
Confirm the `Deploy to Dev` job's own conclusion, not the run's.

**Two tests pinned broken shapes and were replaced, not worked around.**
`preflight.test.ts` required a changed semantic classification to produce a new
run — the shape that stranded a live course. `reasoning-request.test.ts`
required the request to stay silent about reasoning.

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
- Qdrant has a daily restricted pull to `helixa-new` (14-day/14-copy bounds, 10 GiB floor); on-host
  snapshots share the docker volume with live data, so that pull is the only real mitigation. Local
  retention is bounded at 30 days; the first deletion is due around 2026-08-30. `mc2-hfoh3` closed.
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

Accepted stage id: `mc2-db696.110` · Current stage id: epic `mc2-qrdkt` · Next
stage id: `mc2-wg60c`

Recommended action: answer `mc2-wg60c` — it is the only thing between the
repository and a course that reaches Stage 6, and the measurement it needs is
already taken. Then rerun `mc2-2pplo`; the driver is
`live-run.mjs`, reproduced in the plan. After that, epic `mc2-4clyr`. Its
headline number needs correcting first: measured on 2026-08-14 across all 1589
judged lessons rather than the 490 that reached a judge, 69.2% are settled free
by heuristics, 6.3% take one judge, 17.6% two and 6.9% three — so the full panel
runs _below_ its 15-20% design target, not four times above it. The lever is
real but smaller: the single-judge acceptance band decides 24.5% of lessons, not
80%. `mc2-r31fw` step 1 cannot be done from history — `singleJudge` is null in
every stored cascade row, so the score distribution has to come from a live run.

## Starter prompt for next orchestrator

The starter prompt lives at the end of `docs/plans/humble-floating-widget.md`.
Use $orchestrator-stage for the epic itself; single tasks are ordinary local work. Do not enable the
cohort, change its threshold, reindex, force-push, deploy, or migrate beyond the one approved for
`mc2-ufpko`, and do not spend beyond the USD 5 ceiling, without separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
