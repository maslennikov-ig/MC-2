# Orchestrator Handoff

Updated: 2026-08-07 — Stages A, B, C and D accepted on `develop`. Production conversion behaviour
is unchanged by all four.

Current stage id: `mc2-1sobq.4`
Stage: OCR/VLM evaluation — both candidates measured and REJECTED, defaults unchanged.

## Docling Stage D: both candidates lost, and that is the result

**EasyOCR stays default**, 0.9496 mean phrase similarity against RapidOCR `cyrillic` 0.7168 on three
deterministically degraded Russian scans. RapidOCR loses on large type and wins on table cells
(1.000 vs 0.917) and the homoglyph line (0.744 vs 0.395). Constraints on any retry: it REJECTS `ru`
and takes the script name `cyrillic`, it is SINGLE-LANGUAGE, and its Cyrillic checkpoint is NOT in
the shipped image — Docling refuses to fetch it at request time, correctly. The A/B ran against a
throwaway probe image; the shipped baseline was never modified.

**VLM stays off**: NEITHER image carries VLM weights and the host cannot hold one.
`force_backend_text` is a PdfPipelineOptions field Serve does not expose, and it could not help the
vector-outline PDFs anyway. `EmptyConversionError` re-verified. Account:
`.codex/stages/mc2-1sobq.4/summary.md`.

## Docling Stage C: seven Premium formats, and an extension-checked upload

XLSX, CSV, ODT, ODS, ODP, EPUB and LaTeX convert on the PINNED image with their own backends,
Premium-only: 7/7 live cases, 100% ref coverage, atom coverage 1.00.

**Sheet, slide and chapter boundaries exist ONLY in the native document** — Markdown flattens a
two-sheet workbook into two anonymous tables. `buildDoclingProvenanceIndex` walks parent chains and
records `containers` on every native chunk, optional and additive. Only XLSX and ODS carry
page/bbox. **An XLSX formula is its CACHED VALUE, never its expression**; merged cells do NOT
survive as spans.

**`file_catalog.mime_type` is no longer the client's word.** The declared type must match the
extension, and the CANONICAL type for that extension is stored — that is what makes a `.csv`
announced as `text/plain` reach Docling. Aliases (`htm`→`html`, `markdown`→`md`, `jfif`→`jpeg`) keep
the gate from refusing spellings that always worked. See `.codex/stages/mc2-1sobq.3/summary.md`.

## Docling Stages A and B, compressed

**Stage A.** Native structure reaches chunking, enrichment and the Qdrant payload behind
`DOCLING_CHUNK_STRATEGY`; 100% ref coverage with page/bbox in all six chunkable cases.
`docling_hybrid` is SELECTED, not activated. Two production fixes came from it: the embedding cache
key now covers model, width, task, `late_chunking` and the whole ordered batch, so a document's
first re-processing after deploy re-embeds it; and a Jina 429 is retried by waiting out the
per-minute TOKEN window, where it used to be fatal. **Two upstream fields are accepted and dropped
by the pinned stack**, wrapped by `docker/docling-{serve,mcp}/runtime.py` with a build-time test
asserting the gap red first: `_parse_standard_pdf_opts` never assigns `heading_hierarchy_options`,
`get_cache_key` hashes only source+OCR flags. Remove at `mc2-ibzcc`.

**Stage B.** Advanced enrichments live in a SEPARATE image (`mc2/docling-serve-advanced`, 10.5 GB)
behind compose `--profile advanced` on loopback 5002; the baseline 4 GiB service is untouched, both
peak 1.82 GiB. **Chart extraction is built and NOT shipped**: `granite-vision-4.1-4b` costs 30.6 GB
and a 4.34 GiB peak against an 11 GiB host whose compose limits already sum to ~2x that
(`mc2-x72bq`). The router is THREE-TIERED and a PPTX asks for nothing.
**`picture_description` is REJECTED on evidence** and its model is NOT in the image — Stage D
corrects the earlier note claiming it stays for a retry.

## Docling Stage E: images deployed, the chunk flip is NOT done

Production runs images built from the CURRENT tree, 2026-08-07: `docling-serve@sha256:459f995d…`,
`docling-mcp-v3@sha256:d6610a7c…`, digest-pinned, recreated and healthy, rollback not triggered. The
digests before this were from 2026-08-05 10:53 and PREDATED Stage A, so production had been running
without both runtime wrappers and without the baked `ru`/`en` EasyOCR and RapidOCR model sets.

**`DOCLING_CHUNK_STRATEGY` is still `legacy_markdown`.** It now reaches `.env.production` from a
repository variable defaulting to the safe value, so the flip is one variable edit plus a redeploy
and the rollback is the same edit backwards. It was deliberately NOT flipped in the same deploy as
the images: two changes at once cannot be attributed. Flipping it changes NEW documents only; the
collection becomes mixed by design, and making it uniform would need a reindex, which is a separate
decision and a separate authorization.

**`DOCLING_PREVIOUS_MCP_IMAGE` is new and load-bearing.** The rollout gate proves it knows what the
host runs before switching; after one cutover the host runs the previous candidate, which is neither
the 1.x rollback nor the new one, so every image change after the first was blocked — `mc2-h89lo`
one step out. Move it to the OLD `DOCLING_MCP_IMAGE` whenever that changes. `DOCLING_ROLLBACK_IMAGE`
must stay MCP **1.x**: the rollback path stops Serve, and MCP 3 cannot serve a request without it.

## THE WINDOW IS GONE, and where the reindex stands

On the owner's 2026-07-30/31 decision the Q12 live cutover became an ordinary release, and it
succeeded: production moved off Qdrant Cloud. Do not reopen C1..C10 nor the beads retired
2026-07-31/08-01 — each carries its reason, a REOPEN CONDITION and its unmade fix in
`.codex/stages/mc2-jz6y0/summary.md`. Still OPEN, none window-dependent: `mc2-8m90f`, `mc2-qd12b`,
`mc2-n6szm`. **Every piece of Q12 machinery is opt-in**: migrations, reindex, deploy and source
recovery each have an ordinary path, reached by NOT passing the Q12 flags.

**Source recovery is COMPLETE** (`mc2-jz6y0.13.4`): 42/42 published, 24/24 verified, 2026-08-01.
**The reindex is 218/234**: `expected_points=13650 indexed_points=13712 gaps=21
schema_mismatches=0 relevance_failures=0`. The 32 DOCX losses are back.

**The 16 that remain are one family, and the diagnosis took three tries.** NOT scans, NO race:
exported diagrams, one page, 4296pt tall, type converted to curves, so no text layer exists for any
extractor. OCR returns nothing even at 3x, and Docling converts them to `<!-- image -->` and REPORTS
SUCCESS (`mc2-3gz2m`).

**How the repair runs.** `qdrant-operator retry-documents --file-ids <path> --confirm`, idempotent:
it only touches documents the catalog calls `failed`. Two flags are NOT optional —
`-e BULLMQ_QUEUE_NAME=course-generation` and `-e DOCLING_UPLOADS_BASE_PATH=/app`. Do not re-enqueue
while a previous round still retries: the old jobs' failure path overwrites what the new round
fixed. `reindex execute` cannot repair its own run.

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

## What is delivered, and how this repository fails

Q12 release: commits `a182df581`..`c85921084`, merged through `40b2a6b70`. Two changed how the HOST
behaves and the repository does not show them: the digest-pinned operator image is held under
`hold/qdrant-operator:pinned`, tagged BEFORE `docker image prune -f` (`mc2-2vtmk`); and Prometheus
retention is 30d/20GB in `prometheus.yml` with the CLI flags REMOVED, because a flag silently
overrides the config file.

**Failure modes moved to `.codex/repository-failure-modes.md` on 2026-08-03. READ IT BEFORE YOU
START.** Two traps repeated here because they cost the most time: host port 6333 is the DEV Qdrant
and is empty, production answers on **6335**; and `AGENTS.md` is rewritten by a `bd` hook, so stage
explicit paths and never `git add -A`.

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
- CLOSED 2026-07-31/08-01, so do not re-open by habit: `mc2-82bt2`, `mc2-lkkcv`, `mc2-ugl5g`,
  `mc2-2i78i`, `mc2-1cxna`, `mc2-y5tgw`, `mc2-x6en2`, `mc2-jz6y0.25`, `mc2-6l2yz`, `mc2-oc83n`.

## Next recommended

Next stage id: `mc2-1sobq.5` — set `DOCLING_CHUNK_STRATEGY=docling_hybrid`, redeploy, then live-smoke
ONE new control document. Owner authorized the flip and digest publication on 2026-08-07; reindex,
migrations, secrets and force-push are NOT covered and need their own ask.
Recommended action: flip and verify in one step by itself; do not reindex existing data.

## Starter prompt for next orchestrator

Use $orchestrator-stage for `mc2-1sobq.5` under `specs/024-docling-intelligence/`. Stages A-D are
accepted and the images are deployed. The only remaining change is the chunk-strategy flip, which
affects NEW documents only. Preserve the MCP 1.x rollback digest and move
`DOCLING_PREVIOUS_MCP_IMAGE` whenever `DOCLING_MCP_IMAGE` changes.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `specs/024-docling-intelligence/`, stage
summaries `mc2-1sobq.{1,2,3}`, `mc2-nxd3g`, `mc2-jz6y0`, and under `docs/superpowers/{specs,plans}/`:
`2026-07-10-self-hosted-qdrant-platform`, `2026-07-11-advisory-document-evidence-rag`,
`2026-07-12-q12-source-recovery-design`.
