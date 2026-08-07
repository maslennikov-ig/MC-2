# Orchestrator Handoff

Updated: 2026-08-07 — Stages A and B accepted; Stage C (Premium input formats) delivered on
`develop`. Production conversion behaviour is unchanged by all three.

Current stage id: `mc2-1sobq.3`
Stage: Premium input formats — XLSX, CSV, ODT, ODS, ODP, EPUB, LaTeX, delivered.

## Docling Stage C: seven Premium formats, and an upload contract that checks the extension

All seven convert on the PINNED image with their own backends — no new model, no new service, no
download — and are Premium-only (FR-016). One live case per family passed end to end: 100% ref
coverage, atom coverage 1.00. Full account: `.codex/stages/mc2-1sobq.3/summary.md`.

**Sheet, slide and chapter boundaries exist ONLY in the native document** — Markdown flattens a
two-sheet workbook into two anonymous tables. `buildDoclingProvenanceIndex` walks parent chains and
records `containers` (outermost first) on every native chunk; optional and additive. Only XLSX and
ODS carry page/bbox, so location coverage is not an acceptance signal for the other five, as for
DOCX. **An XLSX formula is its CACHED VALUE, never its expression**, and merged cells do NOT survive
as spans; the generator patches a real cached value in and asserts merged TEXT.

**`file_catalog.mime_type` is no longer the client's word.** `validateFileExtension` requires the
declared type to be one the extension permits, and the platform STORES the canonical type for that
extension — that is what makes a `.csv` announced as `text/plain` reach Docling instead of the
plain-text extractor. `SUPPORTED_FORMATS` stays narrower than Docling's own list on purpose: audio,
video, email, boxnote and ebcdic remain non-goals.

## Docling Stage B: enrichments are wired, and one candidate is rejected

Advanced enrichments live in a SEPARATE Serve image (`mc2/docling-serve-advanced`, **10.5 GB**)
behind compose `--profile advanced` on loopback 5002; the baseline 4 GiB service is untouched.
MEASURED 2026-08-06: both peak 1.82 GiB, zero restarts, advanced pass 77s against 4s. **Chart
extraction is built and NOT shipped**: `granite-vision-4.1-4b` makes the image 30.6 GB and the peak
4.34 GiB, against a host at 11 GiB whose compose limits already sum to ~2x that. The model set is a
build arg, `DOCLING_ENRICHMENT_CAPABILITIES` defaults to `code,formula,picture_classification`, and
the router SUPPRESSES chart with a reason. Condition and command: `mc2-x72bq`.

**The router is three-tiered.** Baseline (MCP) → a CHEAP classification pass on the BASELINE
service → the advanced service, only for what a concrete item asks for. A PPTX asks for NOTHING: its
series come from embedded XML in the baseline pass. **`picture_description` is REJECTED on
evidence**, its model out of the image: SmolVLM-256M described a chart labelled Альфа/Бета/Гамма as
"Bemma"/"BeTa"/"Rammma" under an invented title. Chart extraction needs granite-vision-**4.1-4b**:
this build hardcodes V4, and shipping only the 3.3-2b model made it fetch V4 mid-request.

## Docling Intelligence: Stage A is in, and it is opt-in

Native Docling structure reaches chunking, enrichment and the Qdrant payload behind
`DOCLING_CHUNK_STRATEGY`; native chunks resolve 100% of children to Docling refs with page/bbox in
all six chunkable cases. **`docling_hybrid` is selected, `legacy_markdown` is still the default** —
selection is not activation; the flip is Stage E under separate authorization. The A/B ran the
production ranker, 7/7 in both profiles; account and atom-gate rules in
`.codex/stages/mc2-1sobq.1/summary.md` and `docs/DOCLING-MCP-REFERENCE.md`.

**Two production fixes came out of it.** The embedding cache key now covers model, width, task,
`late_chunking` and the whole ordered batch, so a document's first re-processing after deploy
re-embeds it. And a Jina 429 is retried by waiting out the per-minute TOKEN window; it was fatal.

Native chunking does NOT reconvert: it posts the accepted DoclingDocument JSON back to
`/v1/chunk/{hierarchical|hybrid}/source` with `from_formats: [json_docling]`. **Two upstream fields
are accepted and dropped by the pinned stack, both wrapped by `docker/docling-{serve,mcp}/runtime.py`
with a build-time test that asserts the gap red first:** `_parse_standard_pdf_opts` never assigns
`heading_hierarchy_options`, and `get_cache_key` hashes only source+OCR flags. Remove at
`mc2-ibzcc`. **All images were rebuilt locally, so their digests differ from production**; publishing
is Stage E.

**The Docling migration is live.** Production has `DOCLING_STACK_V2_ENABLED=true`; Serve and MCP 3 are healthy on immutable digests, the
exact MCP 1.x rollback image remains pullable, and no reindex was run. Follow-up `mc2-vlskb` removes
the upstream timeout wrapper. Evidence: `.codex/stages/mc2-nxd3g/summary.md`. The deploy gate accepts
the running MCP image as either the rollback OR the candidate digest — demanding the rollback forever
made one successful cutover block every later deploy (`mc2-h89lo`).

## THE WINDOW IS GONE

On the owner's 2026-07-30/31 decision the Q12 live cutover was replaced by an ordinary release, and
the release succeeded: production moved off Qdrant Cloud. Do not reopen C1..C10, nor the beads
retired 2026-07-31/08-01 — each carries its reason, a REOPEN CONDITION and its unmade fix verbatim in
`.codex/stages/mc2-jz6y0/summary.md`. Q12 beads still OPEN, none window-dependent: `mc2-8m90f`,
`mc2-qd12b`, `mc2-n6szm`. **The load-bearing rule:** every piece of Q12 machinery is opt-in —
migrations, reindex, deploy and source recovery each have an ordinary path, reached by NOT passing
the Q12 flags.

## Where the Qdrant reindex stands

**Source recovery is COMPLETE** (`mc2-jz6y0.13.4`): 42/42 published, 24/24 verified, 2026-08-01.
**The reindex is 218/234**: `expected_points=13650 indexed_points=13712 gaps=21
schema_mismatches=0 relevance_failures=0`. The 32 DOCX losses are back.

**The 16 that remain are one family, and the diagnosis took three tries.** NOT scans, NO race:
exported diagrams, one page, 4296pt tall, type converted to curves, so no text layer exists for any
extractor. OCR returns nothing even with `force_full_page_ocr` at 3x, and Docling converts them to
`<!-- image -->` and REPORTS SUCCESS (`mc2-3gz2m`).

**How the repair runs.** `qdrant-operator retry-documents --file-ids <path> --confirm`, idempotent:
it only touches documents the catalog calls `failed`. Two flags are NOT optional —
`-e BULLMQ_QUEUE_NAME=course-generation` and `-e DOCLING_UPLOADS_BASE_PATH=/app`. Do not re-enqueue
while a previous round still retries: the old jobs' failure path overwrites what the new round fixed.
`reindex execute` cannot repair its own run.

## Backup guarantees

All three timers ENABLED. Snapshot and Supabase backup have PROVEN THEMSELVES UNATTENDED
(2026-08-02); the Qdrant restore drill is monthly, next 2026-09-01, so its scheduled path is still
unproven. The drill PASSED 2026-07-31, all seven checks, evidence under
`/var/lib/megacampus-qdrant-recovery/restore-evidence/`. Supabase stamps its success metric only
after pg_restore validation AND pointer publication succeed. Snapshots are `storage_mode local`.

**`mc2-0tcyw`, 2026-08-03.** A failure past `pg_dump` was UNATTRIBUTABLE because psql's stderr was
dropped; it now carries psql's words. The unit retries after 10min, bounded to 4 starts / 6h,
excluding exit 64/75. Install ONLY via `install-supabase-backup-schedule.sh`, which clears the
start-limit first — without that, the trap DISABLES the timer after repeated failures.

**`mc2-0rj7i` — FINISHED 2026-08-03; still NOT proven to be the cause of that night.** All four
manifest transactions `SET LOCAL statement_timeout = '10min'`, and the hash digests each row, so
nothing spills and `work_mem` stopped being a lever. Manifest schema is **v2**: an older generation
drills to `source manifest schema mismatch` instead of reporting every relation as drifted.
Idle-in-transaction FALSIFIED. Measurements: `.codex/stages/mc2-jz6y0/summary.md`.

**All 13 alerting rules are inactive**, every one cleared by making it true.
**`/opt/megacampus/recovery/probe.json` exists** (root:root 0444), from
`deploy/qdrant/generate-recovery-probe.py`, NOT in the repository because it embeds real course
content. **Regenerate it after anything that rewrites course
`0b3af59d-eeb7-4be6-89fb-5d2abac302bd`, then snapshot before the drill** — it must match.

## What is delivered

Q12 release: commits `a182df581`..`c85921084`, merged through `40b2a6b70`; list in
`.codex/stages/mc2-jz6y0/summary.md`. Two changed how the HOST behaves and the repository does not
show them: the digest-pinned operator image is held under `hold/qdrant-operator:pinned`, tagged
BEFORE `docker image prune -f` (`mc2-2vtmk`); and Prometheus retention is 30d/20GB in
`prometheus.yml` with the CLI flags REMOVED, because a flag silently overrides the config file.

## How this repository fails, so you do not rediscover it

**Moved to `.codex/repository-failure-modes.md` on 2026-08-03. READ IT BEFORE YOU START.** Two traps
repeated here because they cost the most time: host port 6333 is the DEV Qdrant and is empty,
production answers on **6335**; and `AGENTS.md` is rewritten by a `bd` hook, so stage explicit paths
and never `git add -A`.

## Verification and Delivery

- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` green (0 errors);
  unit suite 400 files / 6773 tests green.
- Known and not a stop, all timing out under full-suite parallelism yet passing alone:
  `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*`,
  `q12-barrier-input-checkpoint-publication`, `q12-live-quiesce-deferred`,
  `qdrant-source-recovery-runtime`, `stage4-analysis/evidence/downstream-context`. Re-run the failed
  jobs. Anything else failing in isolation IS a stop.
- Monitoring config drift is a SEPARATE JOB (`monitoring-drift`), never a step of `deploy`: as a
  step it failed the deploy job and `rollback` triggers on exactly that — on 2026-08-01 a stale rule
  file rolled production back under a green pipeline for twenty minutes. Fix with `sudo
/opt/megacampus/deploy/qdrant/install-monitoring-config.sh`. EXCEPT
  `megacampus-supabase-backup.{service,timer}`: use `install-supabase-backup-schedule.sh`.
- Regenerate `deploy/qdrant/q12-deployed-asset-manifest.json` whenever a tracked asset changes.
  `/push-dev` dev, `/push` releases, `/deploy` staging; `check_stranded_commits.py` before delivery.

## Explicit defers

- Off-host backup (`mc2-jz6y0.13.6`) — owner decided 2026-08-02 to stay local and give it its OWN
  DEDICATED SERVER later. Do NOT go shopping for an S3 bucket. Local snapshots cover a dropped
  collection, a bad reindex or a corrupting upgrade — never losing the machine.
- **`mc2-bygu1` — the uploads are the only irreplaceable thing on that host, and the smallest.**
  `file_catalog.storage_path` is a RELATIVE FILESYSTEM PATH, not a Supabase Storage key: 261 rows,
  128 distinct paths. 206MB / 117 files under `/opt/megacampus/data/uploads`, NO second copy
  anywhere. Qdrant vectors regenerate only from these, six documents already lost their sources.
- `mc2-3gz2m` — the 16 remaining PDFs, ONE cause, stated above; ignore older notes claiming two.
  Reading them is feature work (tile before OCR, or rasterise per region at high DPI), not a fix.
  `mc2-1sobq.4` evaluates OCR candidates on fixed controls; it does not promise these become readable.
- `mc2-8m90f` — coverage ledger for the 6 unrecoverable sources. Precondition MEASURED as not yet
  fired: `document_evidence_runs`/`document_evidence_items` are empty. The join column is
  `document_id`, NOT `file_catalog_id`.
- `mc2-qd12b` — host-gated fixtures rot: `RUN_REAL_CONTROLLER` auto-enables at uid 1000, off on
  GitHub runners. Same class as the psql-17 skip in `q12-source-manifest-psql-diagnostic.test.ts`.
- `mc2-n6szm` — 328 pre-existing findings in the test tree; `tools/` is outside every lint script.
  Review P2 `mc2-af1ay`. HA, quantization, on-disk indexes, sharding, JWT RBAC: out of scope.
- `mc2-gtooz` — `tests/file-validator.test.ts` uses a tier key `basic_plus` that no longer exists;
  25/56 failed before Stage C, 24 after. Full-suite only, so it does not gate delivery.
- CLOSED 2026-07-31/08-01, so do not re-open by habit: `mc2-82bt2`, `mc2-lkkcv`, `mc2-ugl5g`,
  `mc2-2i78i`, `mc2-1cxna`, `mc2-y5tgw`, `mc2-x6en2`, `mc2-jz6y0.25`, `mc2-6l2yz`, `mc2-oc83n`.

## Next recommended

Next stage id: `mc2-1sobq.4` — OCR/VLM A/B on a harder Russian corpus. Unblocked by Stage B.
Recommended action: keep one active implementation stage; do not reindex existing data.

## Starter prompt for next orchestrator

Use $orchestrator-stage for `mc2-1sobq.4` under `specs/024-docling-intelligence/`. Stages A/B/C are
accepted: chunking strategy, PDF heading inference and enrichment are feature-flagged and off in
production; `docling_hybrid` is selected but not activated. A failed OCR or VLM candidate is a VALID
result — record why and keep EasyOCR. Preserve the immutable production image references and the MCP
1.x rollback digest, publish no digests outside Stage E, and reindex nothing without authority.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/024-docling-intelligence/`, stage
summaries `mc2-1sobq.{1,2,3}`, `mc2-nxd3g`, `mc2-jz6y0`, and under `docs/superpowers/{specs,plans}/`:
`2026-07-10-self-hosted-qdrant-platform`, `2026-07-11-advisory-document-evidence-rag`,
`2026-07-12-q12-source-recovery-design`.
