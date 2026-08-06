# Orchestrator Handoff

Updated: 2026-08-06 — Stage A accepted; Stage B (selective enrichments) delivered on `develop` and
blocked on one owner decision. Production conversion behaviour is unchanged by both.

Current stage id: `mc2-1sobq.2`
Stage: selective Docling enrichments; router built and tested, not yet called from the live phase.

## Docling Stage B: enrichments are wired, and one candidate is rejected

Advanced enrichments live in a SEPARATE Serve image (`mc2/docling-serve-advanced`, 30.6 GB) behind
compose `--profile advanced` on loopback 5002; the baseline 4 GiB service is untouched. MEASURED
2026-08-06: baseline peaked 1.82 GiB, advanced 4.34 GiB of 12 GiB, zero restarts; the advanced pass
costs 134s against 4s. Full account: `.codex/stages/mc2-1sobq.2/summary.md`.

**The router is three-tiered.** Baseline (MCP) → a CHEAP classification pass on the BASELINE
service, whose classifier is already in that image → the advanced service, only for capabilities a
concrete item asks for. Without the middle step a photograph and a bar chart look identical and the
8 GB model gets spent on a guess. A PPTX asks for NOTHING: it declares its series in embedded XML
and the baseline conversion already returns them plus `classification: bar_chart`.

**`picture_description` is REJECTED on evidence.** SmolVLM-256M described a chart labelled
Альфа/Бета/Гамма as "Bemma"/"BeTa"/"Rammma" under an invented title; FR-014 makes invented labels
blocking. The model stays in the image so Stage D can retry a bigger VLM on the same fixture.
Chart extraction uses granite-vision-**4.1-4b**: this Serve build hardcodes V4 and has no preset
registry, and shipping only the 3.3-2b model made it fetch V4 mid-request despite `artifacts_path`.

## Docling Intelligence: Stage A is in, and it is opt-in

Native Docling structure reaches chunking, enrichment and the Qdrant payload behind
`DOCLING_CHUNK_STRATEGY`; native chunks resolve 100% of children to Docling refs with page/bbox in
all six chunkable cases. **`docling_hybrid` is selected, `legacy_markdown` is still the default** —
selection is not activation; the flip is Stage E under separate authorization.

The A/B ran the production ranker (one late-chunking call over every chunk, real Jina v3 vectors,
hybrid search with the production schema and payload indexes), 7/7 in both profiles. Full account
and the atom-gate rules: `.codex/stages/mc2-1sobq.1/summary.md` and `docs/DOCLING-MCP-REFERENCE.md`.

**Two production fixes came out of it.** The embedding cache key now covers model, width, task,
`late_chunking` and — under late chunking — the whole ordered batch; a partial hit re-embeds the
batch, and old keys expire on their 1-hour TTL, so a document's first re-processing after deploy
re-embeds it. And a 429 is now retried by waiting out Jina's per-minute TOKEN window (`Retry-After`
wins); it was fatal, so one large document could permanently fail its job.

Native chunking does NOT reconvert: it posts the accepted DoclingDocument JSON back to
`/v1/chunk/{hierarchical|hybrid}/source` with `from_formats: [json_docling]`; bad refs fail early.
**Two upstream fields are accepted and dropped by the pinned stack, both measured, both wrapped by
`docker/docling-{serve,mcp}/runtime.py` with a build-time test that asserts the gap red first:**
`docling_jobkit._parse_standard_pdf_opts` never assigns `heading_hierarchy_options`, and
`docling_mcp.docling_cache.get_cache_key` hashes only source+OCR flags. Remove at `mc2-ibzcc`.
**All images were rebuilt locally, so their digests differ from production**; publishing is Stage E.

## Docling migration is live

Production has `DOCLING_STACK_V2_ENABLED=true`; Serve and MCP 3 are healthy on immutable digests, the
exact MCP 1.x rollback image remains pullable, and no reindex was run. Follow-up `mc2-vlskb` removes
the upstream timeout wrapper. Evidence: `.codex/stages/mc2-nxd3g/summary.md`.

## THE WINDOW IS GONE

On the owner's 2026-07-30/31 decision the Q12 live cutover was replaced by an ordinary release, and
the release succeeded: production moved off Qdrant Cloud, pipeline green end to end for the first
time since 2026-07-04. Do not reopen C1..C10, nor the beads retired 2026-07-31/08-01 — each carries
its reason, a REOPEN CONDITION and its unmade fix verbatim in `.codex/stages/mc2-jz6y0/summary.md`.
Q12 beads still OPEN, none window-dependent: `mc2-8m90f`, `mc2-qd12b`, `mc2-n6szm`.

**The load-bearing rule.** Every piece of Q12 machinery is opt-in: migrations, reindex, deploy and
source recovery each have an ordinary path, reached by NOT passing the Q12 flags.

## Where the Qdrant reindex stands

**The source recovery is COMPLETE** and `mc2-jz6y0.13.4` is closed on that evidence: 42/42
`copy_states` `published`, 24/24 `disposition_states` `disposition_verified`, measured 2026-08-01
from `/var/lib/megacampus-source-recovery/state`; journal at revision 95 / `reindex_started`.

**The 16 that remain are one family, and the diagnosis took three tries.** NOT scans, NO race:
exported diagrams, one page, 4296pt tall, type converted to curves, so no text layer exists for any
extractor. OCR returns nothing even with `force_full_page_ocr` at 3x, and Docling converts them to
`<!-- image -->` and REPORTS SUCCESS (`mc2-3gz2m`, where both earlier explanations are kept wrong).

**The reindex is 218/234.** Measured after the repair: `VERIFY status=failed
expected_documents=234 indexed_documents=218 expected_points=13650 indexed_points=13712 gaps=21
schema_mismatches=0 relevance_failures=0 action=repair`. The 32 DOCX permanent losses are all back;
the 16 that remain are ALL PDF (`mc2-3gz2m`).

**How the repair runs.** `qdrant-operator retry-documents --file-ids <path> --confirm`
(`tools/qdrant/retry-failed-documents.ts`), idempotent because it only touches documents the catalog
calls `failed`. Two flags are NOT optional: `-e BULLMQ_QUEUE_NAME=course-generation` (the operator
otherwise pins `qdrant-reindex-disabled` while production workers consume `course-generation`) and
`-e DOCLING_UPLOADS_BASE_PATH=/app` (the payload path is resolved by the PRODUCER; see
`.codex/repository-failure-modes.md`). Do not re-enqueue while a previous round still retries — the
old jobs' failure path overwrites what the new round fixed. `reindex execute` cannot repair its own
run, and rewriting the artifact by hand would falsify the audit record it exists to be.

## Backup guarantees

All three timers ENABLED. Snapshot and Supabase backup have PROVEN THEMSELVES UNATTENDED
(2026-08-02); the Qdrant restore drill is monthly, next 2026-09-01, so its scheduled path is still
unproven. The drill itself PASSED 2026-07-31 20:54 CEST, all seven checks, evidence under
`/var/lib/megacampus-qdrant-recovery/restore-evidence/`. Supabase stamps
`megacampus_supabase_last_successful_backup_unixtime_seconds` only after pg_restore validation AND
pointer publication both succeed. Snapshots are `storage_mode local` (`mc2-jz6y0.13.6`).

**`mc2-0tcyw`, 2026-08-03.** A failure past `pg_dump` was UNATTRIBUTABLE because psql's stderr was
dropped; it now carries psql's words and a spawn failure names itself. The unit retries after 10min,
bounded to 4 starts / 6h, excluding exit 64/75. Install ONLY via
`install-supabase-backup-schedule.sh`, which clears the start-limit first — without that, the night
after repeated failures its own proof fails and the trap DISABLES the timer.

**`mc2-0rj7i` — FINISHED 2026-08-03; still NOT proven to be the cause of that night.** All four
manifest transactions `SET LOCAL statement_timeout = '10min'`, and the hash stopped being O(table
bytes) — it digests each row and sorts 64-byte digests, so nothing spills and `work_mem` stopped
being a lever. Manifest schema is **v2**: a generation captured before this drills to `source
manifest schema mismatch` rather than reporting every relation as drifted, and stays restorable.
Idle-in-transaction FALSIFIED. Measurements: `.codex/stages/mc2-jz6y0/summary.md`.

**All 13 alerting rules are inactive.** Every one was cleared by making it true, never by editing
the rule to stop asking. **`/opt/megacampus/recovery/probe.json` exists** (root:root 0444), from
`deploy/qdrant/generate-recovery-probe.py`, deliberately NOT in the repository because it embeds real
course content. **Regenerate it after anything that rewrites course
`0b3af59d-eeb7-4be6-89fb-5d2abac302bd`, then snapshot before the drill** — it must match.

## What is delivered

Commits `a182df581`..`c85921084` on `develop`, merged to `master` through `40b2a6b70`; full list with
evidence in `.codex/stages/mc2-jz6y0/summary.md`. Two changed how the HOST behaves and nothing in the
repository shows them: the digest-pinned operator image is held under `hold/qdrant-operator:pinned`,
tagged BEFORE `docker image prune -f` (`mc2-2vtmk`, the GHCR token is dead so a pruned digest cannot
be re-pulled); and Prometheus retention is 30d/20GB in `prometheus.yml` with the CLI flags REMOVED,
because a flag silently overrides the config file.

## How this repository fails, so you do not rediscover it

**Moved to `.codex/repository-failure-modes.md` on 2026-08-03. READ IT BEFORE YOU START.** It is the
durable half of this file and does not expire with a stage. Two traps repeated here because they
cost the most time: host port 6333 is the DEV Qdrant and is empty, production answers on **6335**;
and `AGENTS.md` is rewritten by a `bd` hook, so stage explicit paths and never `git add -A`.

## Verification and Delivery

- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` green (0 errors).
- Known and not a stop: `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*`,
  `q12-barrier-input-checkpoint-publication`, `q12-live-quiesce-deferred` and
  `qdrant-source-recovery-runtime` time out under full-suite parallelism but pass alone; anything
  else failing in isolation IS a stop.
- Monitoring config drift is a SEPARATE JOB (`monitoring-drift`), never a step of `deploy`: as a
  step it failed the deploy job and `rollback` triggers on exactly that — on 2026-08-01 a stale rule
  file rolled production back under a green pipeline for twenty minutes. Fix with `sudo
/opt/megacampus/deploy/qdrant/install-monitoring-config.sh` (promtool-validated, restarts
  Prometheus). EXCEPT `megacampus-supabase-backup.{service,timer}`: it clears their drift while
  proving nothing about the schedule — use `install-supabase-backup-schedule.sh`.
- Regenerate `deploy/qdrant/q12-deployed-asset-manifest.json` whenever a tracked asset changes.
- `/push-dev` dev, `/push` releases, `/deploy` staging; `check_stranded_commits.py` before delivery.

## Explicit defers

- Off-host backup (`mc2-jz6y0.13.6`) — owner decided 2026-08-02 to stay local and give it its OWN
  DEDICATED SERVER later. Do NOT go shopping for an S3 bucket: the shape changed. Local snapshots
  cover a dropped collection, a bad reindex or a corrupting upgrade — never losing the machine.
- **`mc2-bygu1` — the uploads are the only irreplaceable thing on that host, and the smallest.**
  `file_catalog.storage_path` is a RELATIVE FILESYSTEM PATH, not a Supabase Storage key: 261 rows,
  128 distinct paths, none starting with `http`. 206MB / 117 files under
  `/opt/megacampus/data/uploads`, NO second copy anywhere. Qdrant vectors regenerate only from
  these, six documents already lost their sources, and the mitigation needs no credentials.
- `mc2-3gz2m` — the 16 remaining PDFs, ONE cause, stated above. Ignore any older note claiming two:
  neither "scans only OCR can read" nor "a finalize race" survived measurement. Reading them is
  feature work (tile before OCR, or rasterise per region at high DPI), not a fix. `mc2-1sobq.4`
  evaluates OCR candidates on fixed controls; it does not promise these 16 become readable.
- `mc2-8m90f` — coverage ledger for the 6 unrecoverable sources. Precondition MEASURED as not yet
  fired: `document_evidence_runs`/`document_evidence_items` are empty. Ids are on the bead; the join
  column is `document_id`, NOT `file_catalog_id`.
- `mc2-qd12b` — host-gated fixtures rot: `RUN_REAL_CONTROLLER` auto-enables at uid 1000, off on
  GitHub runners (`mc2-oa7om` folded in). Same class as the psql-17 skip in
  `q12-source-manifest-psql-diagnostic.test.ts`.
- `mc2-n6szm` — 328 pre-existing findings in the test tree; `tools/` is outside every lint script.
  Review P2 `mc2-af1ay`. HA, quantization, on-disk hot indexes, sharding and JWT RBAC: out of scope.
- CLOSED 2026-07-31/08-01, so do not re-open by habit: `mc2-82bt2`, `mc2-lkkcv`, `mc2-ugl5g`,
  `mc2-2i78i`, `mc2-1cxna`, `mc2-y5tgw`, `mc2-x6en2`, `mc2-jz6y0.25`, `mc2-6l2yz`, `mc2-oc83n`.

## Next recommended

Next stage id: `mc2-1sobq.2` — enrichment router wiring into the live Stage 2 phase is the one piece
left; `mc2-1sobq.3` is unblocked.
Recommended action: keep one active implementation stage; do not reindex existing data.

## Starter prompt for next orchestrator

Use $orchestrator-stage for `mc2-1sobq.2` under `specs/024-docling-intelligence/`. Treat the Docling
split stack as live and Stage A as accepted: chunking strategy and PDF heading inference are
feature-flagged and off in production; `docling_hybrid` is selected but not activated. Preserve the
immutable production image references and the MCP 1.x rollback digest, publish no digests outside
Stage E, and reindex nothing without a separate task and authority.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/024-docling-intelligence/`, stage
summaries `mc2-1sobq.1`, `mc2-nxd3g`, `mc2-jz6y0`, and under `docs/superpowers/{specs,plans}/`:
`2026-07-10-self-hosted-qdrant-platform`, `2026-07-11-advisory-document-evidence-rag`,
`2026-07-12-q12-source-recovery-design`.
