# Orchestrator Handoff

Updated: 2026-08-06 — Docling Intelligence Stage A is OPEN: the dense A/B was withdrawn and no
chunking candidate is selected. Production chunking unchanged; embedding cache identity fixed.

Current stage id: `mc2-1sobq.1`
Stage: structure-aware Docling RAG with provenance, in progress; AC-2 blocked on `mc2-j1axa`.

## Docling Intelligence: Stage A structure is in, the A/B is not

Native Docling structure now reaches chunking, enrichment and the Qdrant payload behind
`DOCLING_CHUNK_STRATEGY` (`legacy_markdown` | `docling_hierarchical` | `docling_hybrid`). Native
chunks resolve 100% of children to Docling refs with page/bbox in all six chunkable cases; heading
path coverage is in the stage summary. **No candidate is selected**, `legacy_markdown` is default.

**The `docling_hybrid` selection was withdrawn on 2026-08-06.** Its dense run split parents and
children into two embedding calls with different `late_chunking` flags, while `phase-5-embedding.ts`
makes ONE call with it on — and under late chunking the request input IS the context. Worse, all 36
records billed 0 tokens: every vector came from a cache keyed `sha256(text:task)` — no
`late_chunking`, model or batch — so children were served the non-contextual vectors the parents
pass had just written. Re-running `--dense` corrected is paid and needs fresh authorization.

**The cache fix is production-affecting.** Keys now cover model, width, task, `late_chunking` and —
under late chunking — the whole ordered batch, and a partial late-chunking hit re-embeds the batch.
Old keys expire on their 1-hour TTL, so a document's first re-processing after deploy re-embeds it.

**The gate counts EVIDENCE ATOMS**, never chunks: coverage over the facts the manifest declares,
plus `1/rank` and `1/log2(rank+1)` over that same fixed denominator, at a 1e-9 epsilon. Chunk-level
Recall/MRR/nDCG are printed, not gated — a ratio penalises a finer cut, a count rewards one. Scored
top-5s are written out as chunk ids, so ranking claims stay checkable.

Native chunking does NOT reconvert: it posts the accepted DoclingDocument JSON back to
`/v1/chunk/{hierarchical|hybrid}/source` with `from_formats: [json_docling]`, so chunks and the
accepted document are one by construction. Unresolvable refs fail before upload.

**Two upstream fields are accepted and dropped by the pinned stack, both measured, both wrapped by
`docker/docling-{serve,mcp}/runtime.py` with a build-time test that asserts the gap red first:**
`docling_jobkit._parse_standard_pdf_opts` never assigns `heading_hierarchy_options`, and
`docling_mcp.docling_cache.get_cache_key` hashes only source+OCR flags, so a profile change returned
the previous artifact. Remove at `mc2-ibzcc`. **Both images were rebuilt locally, so their digests
differ from production**; publishing and pinning is Stage E. Evidence: `.codex/stages/mc2-1sobq.1/`.

## Docling migration is live

Production has `DOCLING_STACK_V2_ENABLED=true`; Serve and MCP 3 are healthy on immutable digests, the
exact MCP 1.x rollback image remains pullable, and no reindex was run. Follow-up `mc2-vlskb` removes
the upstream timeout wrapper. Evidence: `.codex/stages/mc2-nxd3g/summary.md`.

## THE WINDOW IS GONE

On the owner's 2026-07-30/31 decision the Q12 live cutover was replaced by an ordinary release, and
the release succeeded: production moved off Qdrant Cloud, pipeline green end to end for the first
time since 2026-07-04. Do not reopen C1..C10, and do not re-open the beads retired 2026-07-31/08-01 —
each carries its reason, a REOPEN CONDITION and its unmade fix verbatim; full list in
`.codex/stages/mc2-jz6y0/summary.md`. Q12 beads still OPEN, none window-dependent: `mc2-8m90f`,
`mc2-qd12b`, `mc2-n6szm`.

**The load-bearing rule.** Every piece of Q12 machinery is opt-in: migrations, reindex, deploy and
source recovery each have an ordinary path, reached by NOT passing the Q12 flags.

## Where the Qdrant reindex stands

**The source recovery is COMPLETE** and `mc2-jz6y0.13.4` is closed on that evidence: 42/42
`copy_states` `published`, 24/24 `disposition_states` `disposition_verified` (18
`career_playbook_retained_derived`, 6 `eligible_unrecoverable`) measured 2026-08-01 from
`/var/lib/megacampus-source-recovery/state`; journal at revision 95 / `reindex_started`.

**The 16 that remain are one family, and the diagnosis took three tries.** NOT scans, NO race:
exported diagrams, one page, 4296pt tall, type converted to curves, so no text layer exists for any
extractor. OCR loads its models and returns nothing even with `force_full_page_ocr` at 3x. Docling
converts them to `<!-- image -->` and REPORTS SUCCESS (`mc2-3gz2m`, where both earlier explanations
are marked wrong rather than deleted).

**The reindex is 218/234.** Measured after the repair: `VERIFY status=failed
expected_documents=234 indexed_documents=218 expected_points=13650 indexed_points=13712 gaps=21
schema_mismatches=0 relevance_failures=0 action=repair`. The 32 DOCX permanent losses are all back;
the 16 that remain are ALL PDF (`mc2-3gz2m`).

**How the repair runs.** `qdrant-operator retry-documents --file-ids <path> --confirm`
(`tools/qdrant/retry-failed-documents.ts`). It replays `retryDocument`'s server-side effect in bulk
and keeps its guard — a document is touched only when the catalog calls it `failed` — so it is
idempotent. Two flags are NOT optional here:

    -e BULLMQ_QUEUE_NAME=course-generation
    -e DOCLING_UPLOADS_BASE_PATH=/app

The first because the operator pins `qdrant-reindex-disabled` while production workers consume
`course-generation`; the second because the job payload carries a path resolved by the PRODUCER (see
`.codex/repository-failure-modes.md`). Do not re-enqueue while a previous round still retries — the
old jobs' failure path overwrites what the new round fixed. `reindex execute` cannot repair its own
run: it skips whatever its ledger calls completed, a fresh run id is refused while the journal sits
at `reindex_started`, and `plan` demands a `verified` journal. Rewriting the artifact by hand would
falsify the audit record it exists to be.

## Backup guarantees

All three timers ENABLED. Snapshot and Supabase backup have PROVEN THEMSELVES UNATTENDED
(2026-08-02); the Qdrant restore drill is monthly, next 2026-09-01, so its scheduled path is still
unproven. The drill itself PASSED 2026-07-31 20:54 CEST, all seven checks (schema, count, dense,
ru_bm25, en_bm25, formula_priority, tenant_course_isolation), evidence under
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

Next stage id: `mc2-1sobq.1` — still open; `mc2-1sobq.2` waits on it.
Recommended action: `mc2-j1axa`, re-run the dense A/B corrected. Bills `api.jina.ai`, needs fresh authorization.

## Starter prompt for next orchestrator

Use $orchestrator-stage for `mc2-1sobq.1` under `specs/024-docling-intelligence/`. Treat the Docling
split stack as live and Stage A as OPEN: chunking strategy and PDF heading inference are
feature-flagged and off in production, and no chunking candidate is selected. Preserve the immutable
production image references and the MCP 1.x rollback digest, publish no digests outside Stage E, and
reindex nothing without a separate task and authority.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/024-docling-intelligence/`, stage
summaries `mc2-1sobq.1`, `mc2-nxd3g`, `mc2-jz6y0`, and under `docs/superpowers/{specs,plans}/`:
`2026-07-10-self-hosted-qdrant-platform`, `2026-07-11-advisory-document-evidence-rag`,
`2026-07-12-q12-source-recovery-design`.
