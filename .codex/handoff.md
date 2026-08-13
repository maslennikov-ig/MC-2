# Orchestrator Handoff

Updated: 2026-08-13. Effective kernel: `shared-orchestration/v1`.

Current state only. History lives in commits, `bd` close reasons and
`.codex/stages/<stage_id>/summary.md`; do not re-narrate it here.

## Current stage

The Career Playbook quality track is **accepted**. `mc2-db696.110` closed on an editorial read of
**4.4 / 5** against a 4.0 threshold, up from a 2.6 baseline; the accepting run cost USD 0.352
against a USD 0.60 ceiling. Evidence:
`.codex/stages/mc2-db696.110/evidence/quality-review-v3.md`. Two process rules from it are written
into `06-quality-acceptance.md` and still hold: read the artifact before calling a run accepted, and
clean up **after** the editorial pass.

## RAG retrieval and chunking repaired (2026-08-12/13)

Closed: `mc2-pdmgu`, `mc2-7frdr`, `mc2-5fpaf`, `mc2-18ujf`; `mc2-lrav0` on the owner's "no backfill".
Details in the commits (`54a5c5e44`, `c18e2a9ea`) and stage summaries. What still constrains work:

- Thresholds have one source, `src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6
  ceiling), and a test rejects any literal above that ceiling in the RAG sources. The old `0.7` was
  unreachable against embeddings topping out near 0.58, which made hybrid search BM25-only.
- Degenerate parents no longer reach the index (`selectIndexableChunks`); search drops repeated text
  as a safety net. Production was cleaned 13712 → 6856 points.
- `markdown-chunker.ts` is token-aware on both passes and its heading pass is real. Measured on 25
  production documents: children per parent 1.00 → 3.15, degenerate parents 508 → 29, children with
  siblings 0 → 531. No reindex needed; existing points untouched.
- The native path is healthy: `strategy=docling_hybrid`, zero degenerate parents, siblings
  populated, `refCoverage`/`locationCoverage` both 1.000. `groupIntoParents()` was accused twice and
  is not the cause of either defect.

## Parent context expansion (2026-08-13, `217e3d112`)

`specs/027-parent-context-expansion/spec.md`, implemented. This finishes the design recorded in
`docs/RAG-CHUNKING-STRATEGY.md` in October 2025 — search the small grain, answer with the large one.
Its example separated `uploadChunksToQdrant(child_chunks)` from `storeParentChunks(parent_chunks)`;
the second function was never written, so parents went into the same collection and the system paid
to search a grain it never meant to search. The live A/B is in §7 of the spec: expanded won 3 of 3,
grounding 3.33 → 4.00, on a corpus where every chunk has siblings.

Only children are indexed now, plus any childless parent, the sole carrier of its text. The passage
is rebuilt at retrieval time from siblings already indexed — parents carry no text of their own, 57
of 57 fully reconstructible at word coverage 1.0000. No migration, and it avoids the +91.2%
embedding cost the next processed document would have re-introduced silently.

Expansion runs **after reranking** in the two paths that rerank, because a cross-encoder should judge
the ~160-token chunk that matched, not a 1400-token passage, and four candidates in five are
discarded there. The budget is a ceiling on what expansion adds, never a reason to drop a retrieved
chunk — truncation belongs to the formatter, which counts its own markup and runs last. On for
Stage 5 section RAG, Stage 6 lesson RAG and `search_documents`; off for evidence retrieval, where a
citation must point at the fragment that matched. `getParentChunk` is gone. Expansion is a no-op on
today's collection (`sibling_chunk_ids: []`) and takes effect per document as they are reprocessed.

## Routing and models (2026-08-12, `43ab557d6`)

Twelve models cut to seven against the live OpenRouter catalogue: simple work on
`~deepseek/deepseek-v4-flash-latest` (the `~` is part of the id), complex on `openai/gpt-5.6-luna`,
`z-ai/glm-5.2`. Four invariants to preserve: judges keep three separate vendors, `emergency` stays
off OpenAI, every fallback crosses vendors, and the three escalation phases avoid the default model
on both hops because by the time they run it has already failed.

Reasoning is per-phase and the budget is the load-bearing part — OpenRouter bills reasoning tokens
against `max_tokens`, so the budget is ADDED, and both the database and the seed generator refuse
`reasoning_enabled` without one. On for `stage_6_complex`, `stage_5_escalation`,
`stage_6_auto_last_chance` only.

Models and prices have one source, `MODEL_CATALOG` in shared-types; retired models keep the price
previously recorded, because restating old runs at today's rates would falsify history. The routing
refresh is still unexercised by a real course generation; the last course was created 2026-06-28.

## Phase configs audited (2026-08-13, `7ad421986`)

`mc2-o3s4r` closed. Stored configuration is clean on the checks that matter: no budget exceeds a
model ceiling once the reasoning budget is added, no reasoning on a model that refuses it, no
unbudgeted reasoning, every model catalogued and live, every fallback crossing vendors. The 104 → 57
seed collapse is accounted for: 9 judge rows skipped, the rest keyed by phase name.

What was open was the seam, not the data. Stage 5 read `temperature`/`maxTokens`/`reasoning` from
the database and passed on only the model id, so the generator applied a hardcoded 0.7/30000 to
every tier; metadata generation rebuilt an unconfigured model from an id it had just configured; and
`getModelForPhase` dropped `config.reasoning` entirely. All three now go through
`buildProviderParams`. The collision fallback was a retired model with the smallest ceiling in the
catalogue (16384) and is now `google/gemini-3-flash-preview`.

`tests/unit/phase-config-provider-contract.test.ts` states the provider contract and reads the
configuration into it; it was verified against the defect, not just observed to pass. The 11 rows
carrying both `reasoning_effort` and `reasoning_max_tokens` had the effort cleared on the owner's
decision, and `config-seed.json` was regenerated from the database.

Open from the audit: `mc2-hb8mn` (`fetchStageConfigFromDb` calls `.maybeSingle()` on a filter
matching up to 14 rows; no production caller, so latent), `mc2-s1vg5` (`generate:config-seed` exits
0 reporting success when the database is unreachable), `mc2-9yrgb` (`stage_5_escalation` configured
and shown but requested by nothing — do not delete on that alone), `mc2-p6u8k` (Stage 5 last-resort
constants still name models the routing cut retired).

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
- Qdrant has a daily restricted pull to `helixa-new` with 14-day/14-copy bounds, a 10 GiB free-space
  floor and low CPU/I/O priority; both backup and restore timers are enabled and Prometheus scrapes
  independent timestamps.
- On-host Qdrant snapshots live inside the same docker volume as the live data
  (`megacampus_qdrant/_data/snapshots`), so losing that volume loses both; the daily off-host pull is
  the mitigation and it verified a post-deduplication snapshot on 2026-08-13. Local retention **is**
  bounded — `snapshot.ts` applies `selectRetentionDeletions` at 30 days and it is unit-tested — but
  nothing has aged out yet, so the first real deletion is due around 2026-08-30. Measured 2026-08-13:
  78 snapshots, 78 manifests, 10.93 GB, ~17.7 GB at steady state, disk 109/148 GB. `mc2-hfoh3` closed.
- Uploads have a daily pull-based off-host copy on `helixa-new`; a restore of one file matched
  `file_catalog.hash`. It is a second machine, not full disaster recovery.
- Dev and staging share one Supabase project; CI does not auto-apply migrations.
- Nine source documents are accepted as lost; do not reopen them. They are **not** in the indexed
  set: all 87 distinct source files behind the 218 indexed documents are present under
  `/opt/megacampus/data/uploads` (verified 2026-08-13, missing 0), so a reindex would not drop them.
- Uploads live on the production host, not in Supabase Storage — the only bucket is
  `course-enrichments` with 14 objects.
- Monitoring drift is a separate job and must never become a deploy step, because it can trigger
  rollback on configuration drift.
- `AGENTS.md` is rewritten by a `bd` hook: stage and commit explicit paths, never `git add -A`.
- Deploy/rollback entrypoints exit 75 when `/opt/megacampus/.host-operation.lock` is held; manual
  infrastructure work must use `scripts/with_host_operation_lock.sh`.
- The default backend Vitest command is fail-closed and requires the pinned Qdrant 1.18.2
  precondition; use `vitest.config.unit.ts` for focused unit tests.
- `graph-reviewed: blocked` (2026-08-12) — the graph was read, not refreshed. Graphify 0.9.14 CLI
  exposes `path`, `explain`, `diagnose` and `merge` only; there is no `build`/refresh subcommand, so
  a rebuild runs through the `/graphify` skill flow rather than from closeout. The last recorded
  build holds 61,733 nodes, 88,850 edges and 7,352 communities, local-only, no external backend.

## Owner decisions

- `mc2-jz6y0.13.6` — answered: pull-based off-host snapshots on `helixa-new`, 14-day bounded
  retention, low resource priority.
- `mc2-db696.61` — needs a live run and a cost/quality decision.
- `mc2-lrav0` — answered: do not backfill dev Qdrant embeddings.

## Safety boundary

Do not perform reindex, schema migrations, force-push, or any secrets/access change outside the
explicitly authorized `mc2-2vtmk` GHCR credential repair. Deploy only under the standing
authorization and only on a green pipeline. Do not run live paid work without a specific current
budget/authority.

Do not touch `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`,
`mc2-1nots`, or `mc2-5e4ek.1`; see §9 of the active spec for exact reopen gates.

Before claiming delivery, run `scripts/orchestration/check_stranded_commits.py`.

## Explicit defers

- `mc2-v6fqp` — live Stage 6 multilingual quality matrix, only after the owner approves a concrete
  LLM spend budget and disposable inputs.
- `mc2-wxun`, `mc2-vjbb` — instrumentation complete, disabled and locally accepted; enabling a
  cohort, collecting production traces and deciding whether to change 0.15 are live/owner actions.
- `mc2-r7udy` — worker lifecycle/heartbeat persistence needs a new `metric_event_type` value or a
  new table; both are schema migrations forbidden by the active specification.
- `mc2-6ye5z.4`, `mc2-6ye5z.5`, `mc2-6ye5z.8` — slide deck, report and data-table enrichments
  require new `enrichment_type` enum values; same migration prohibition.
- `mc2-db696.61` — owner decision above.
- `mc2-db696.106`/`.107`/`.108` — PDF fidelity, content grounding, and bounded provider timeouts
  with reliable latency/cost receipts.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, gates already recorded.

## Next recommended

Accepted stage id: `mc2-db696.105` · Current stage id: `mc2-db696.110` · Next stage id:
`mc2-db696.107` when implementation is selected

Recommended action: `mc2-2pplo`, unblocked — `mc2-o3s4r` is closed. Run one small real course end to
end on **dev** (`dev.ai.megacampus.ru`; the host carries a full `-dev` worker set and its own
Qdrant), authorized at USD 1–3, and the only thing that can find the next blocker. `develop` at
`7ad421986` auto-deploys there and the bundle was probed for today's fixes. Start it in a fresh
session: the course pipeline is driven through authenticated tRPC with a document upload and staged
approvals, and an abandoned half-run leaves paid artefacts in the shared dev/staging database. After
that: content grounding, PDF fidelity, timeouts.

## Starter prompt for next orchestrator

Use $orchestrator-stage only after the owner selects an explicit remaining boundary. Do not enable
the cohort, change its threshold, reindex, migrate, force-push, deploy or perform paid work without
separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
