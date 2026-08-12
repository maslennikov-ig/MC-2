# Orchestrator Handoff

Updated: 2026-08-12. Effective kernel: `shared-orchestration/v1`.
Current stage id: `mc2-db696.110`

Current state only. History lives in commits, `bd` close reasons and
`.codex/stages/<stage_id>/summary.md`; do not re-narrate it here.

## Current stage

The Career Playbook quality track is **accepted**. `mc2-db696.110` closed on an editorial read of
**4.4 / 5** against a 4.0 threshold, up from a 2.6 baseline. Evidence:
`.codex/stages/mc2-db696.110/evidence/quality-review-v3.md`. Cost of the accepting run was USD 0.352
against a USD 0.60 ceiling.

Two process rules from it are written into `06-quality-acceptance.md` and still hold: read the
artifact before calling a run accepted, and clean up **after** the editorial pass.

## RAG retrieval repaired (2026-08-12, `54a5c5e44`)

Two defects, both silent, both measured on the live production collection before and after.
`mc2-pdmgu` and `mc2-7frdr` are closed; `mc2-lrav0` is closed on the owner's "no backfill".

**The score threshold was unreachable.** Every RAG entry point carried its own `0.7` while the
embeddings top out near 0.58 on this corpus. The threshold gates the dense branch of a hybrid query,
so with it in place hybrid search was byte-for-byte identical to BM25-only — measured
`hybridIsJustSparse=true` on three queries, `false` after. One source now:
`src/shared/qdrant/retrieval-thresholds.ts` (0.25 / 0.15 widened / 0.6 measured ceiling), and a test
reads the RAG sources to reject any literal above that ceiling.

**Half the index was a copy of the other half.** Not reprocessing: point ids are deterministic and
document-scoped, so a repeat inside a document is impossible. Hierarchical chunking is degenerate —
parent groups break on every heading-path change and Docling already merges peers within a section,
so all 6856 parents had exactly one child and therefore that child's exact text. Degenerate parents
no longer reach the index (`selectIndexableChunks`), and search drops repeated text as a safety net.
Follow-up `mc2-5fpaf`: decide whether to make the parent tier work or remove it, since it cannot
work as written.

Production data was cleaned separately: **13712 → 6856 points**, snapshot taken first, deletion
conditional on a point with the same text provably remaining, and `file_catalog.chunk_count`
corrected for 218 documents. The 50% drop fired `QdrantPointCountUnexpectedDrop`, correctly; it
resolved on its own.

**Delivered to production** on `c18e2a9ea` (25 commits, run `31627877149`, Blue/Green onto blue,
Monitoring Config Drift green, rollback skipped). A probe inside the deployed `megacampus-worker`
confirms `DENSE_SCORE_THRESHOLD 0.25` in the running bundle and hybrid top scores of 0.750 and 0.553
— above the 0.500 ceiling that a single-source fusion produces — with five unique passages and no
parent-level results.

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

Models and prices have one source, `MODEL_CATALOG` in shared-types. Live models carry the current
price; retired models keep the price previously recorded, because restating old runs at today's
rates would falsify history.

The routing refresh is still unexercised by a real course generation; the last course was created
2026-06-28.

## Backlog truth and order

`specs/026-post-triage-priorities/spec.md` supersedes the older stage order. The checked backlog
contains 49 work items plus 5 epics; do not re-open the 27 already closed with a commit or a
measurement, and do not re-rank by tracker priority.

Tier 1 complete through `mc2-sznhi`; Tier 2 through `mc2-3sz3d`; Tier 3 through `mc2-jz6y0.13.6`;
Tier 4 through `mc2-iioip`. All accessible Tier 5 repository work is complete through the
`mc2-wxun`/`mc2-vjbb` instrumentation boundary; live, migration, research and owner-decision items
remain explicitly deferred.

## Live operational facts

- Production Qdrant answers on host port 6335; 6333 is the empty dev instance.
- `course_embeddings_v1` holds **6856 points** after the 2026-08-12 deduplication. Any restore of a
  snapshot older than that returns 13712 and is not evidence of a fault — half of those are copies.
- Qdrant has a daily restricted pull to `helixa-new` with 14-day/14-copy bounds, a 10 GiB free-space
  floor and low CPU/I/O priority; both backup and restore timers are enabled and Prometheus scrapes
  independent timestamps.
- On-host Qdrant snapshots are **10 GB, 75 files, unbounded**, and they live inside the same docker
  volume as the live data (`megacampus_qdrant/_data/snapshots`). Losing that volume loses both.
  Real rollback depth is the off-host pull, not the file count. Host disk is at 77%. `mc2-hfoh3`.
- Uploads have a daily pull-based off-host copy on `helixa-new`; a restore of one file matched
  `file_catalog.hash`. It is a second machine, not full disaster recovery.
- Dev and staging share one Supabase project; CI does not auto-apply migrations.
- Nine source documents are accepted as lost; do not reopen them.
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
- `mc2-5fpaf` — parent chunk tier: make it work or remove it. Either choice reindexes.
- Separate deploy accounts and narrower sudoers — intentionally not planned after `mc2-q1ggs`.
- `mc2-x72bq`, `mc2-ibzcc`, `mc2-vlskb`, `mc2-hqfc3`, `mc2-8m90f`, `mc2-qd12b`, `mc2-1nots`,
  `mc2-5e4ek.1` — excluded by §9, with repository or owner gates already recorded.

## Next recommended

Accepted stage id: `mc2-db696.105`
Current stage id: `mc2-db696.110`
Next stage id: `mc2-db696.107` when implementation is selected

Recommended action: decide whether to deploy the RAG threshold fix to production — the data half is
already live there and the code half is not. Then fix content grounding, then PDF fidelity and
timeouts. Do not run another paid generation before deterministic coverage and a new explicit budget.

## Starter prompt for next orchestrator

Use $orchestrator-stage only after the owner selects an explicit remaining boundary. Do not enable
the cohort, change its threshold, reindex, migrate, force-push, deploy or perform paid work without
separate current authorization.

## Read first

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, and
`specs/026-post-triage-priorities/spec.md`.
