# Orchestrator Handoff

Updated: 2026-08-03 — 218 of 234 documents hold vectors, all three backup timers are enabled and
have PASSED for real, and no alert is firing. The 16 that remain are exported diagrams with no text
layer, not scans and not a race; both earlier diagnoses were wrong (`mc2-3gz2m`).

Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion.

## THE WINDOW IS GONE

On the owner's 2026-07-30/31 decision the Q12 live cutover was replaced by an ordinary release, and
the release succeeded: production moved off Qdrant Cloud, pipeline green end to end for the first
time since 2026-07-04. Do not reopen C1..C10.

Retired 2026-07-31, each with its reason and a REOPEN CONDITION on the bead: `mc2-i9h3y`,
`mc2-fxlne`, `mc2-0ie27`, `mc2-zls0f`, `mc2-e21lo`. Retired 2026-08-01 the same way: `mc2-jz6y0.13`
(the cutover itself), `mc2-uha77`, `mc2-dizgy`, `mc2-ivjyb`, `mc2-9vbzp`, `mc2-xssva`, `mc2-evduu`;
`mc2-urw5d` obsolete, `mc2-oa7om` superseded by `mc2-qd12b`. None of the underlying fixes were made
— none is reachable without a barrier install — so each finding is preserved verbatim on its bead.

Q12 beads still OPEN, each for a reason recorded on it, and none window-dependent: `mc2-8m90f`,
`mc2-qd12b`, `mc2-n6szm`.

**The load-bearing rule.** Every piece of Q12 machinery is opt-in. Migrations, reindex, deploy and
source recovery each have an ordinary path, reached by NOT passing the Q12 flags.

## Where the Qdrant reindex stands

**The source recovery is COMPLETE** and `mc2-jz6y0.13.4` is closed on that evidence. Measured
2026-08-01 from `/var/lib/megacampus-source-recovery/state`: 42/42 `copy_states` `published`, 24/24
`disposition_states` `disposition_verified` — 18 `career_playbook_retained_derived`, 6
`eligible_unrecoverable`. Recovery reached `verified` at revision 94; the journal now reads revision
95 / phase `reindex_started`, because the reindex ran after it.

**The 16 that remain are one family, and the diagnosis took three tries.** They are NOT scans and
there is NO race: exported diagrams, one page, 4296pt tall, type converted to curves, so no text
layer exists for any extractor. OCR is installed, loads its models, and returns nothing even with
`force_full_page_ocr` at 3x. Docling converts them to `<!-- image -->` and REPORTS SUCCESS, after
which zero chunks and points are correct on empty input. See `mc2-3gz2m`; both earlier explanations
are marked wrong there rather than deleted.

**The reindex is 218/234.** Measured after the repair:

    VERIFY status=failed expected_documents=234 indexed_documents=218
    expected_points=13650 indexed_points=13712 gaps=21 schema_mismatches=0
    relevance_failures=0 action=repair

The 32 DOCX that were permanent losses are all back; the 16 that remain are ALL PDF (`mc2-3gz2m`).

**How the repair runs.** `qdrant-operator retry-documents --file-ids <path> --confirm`
(`tools/qdrant/retry-failed-documents.ts`). It replays `retryDocument`'s server-side effect in bulk
and keeps its guard — a document is touched only when the catalog calls it `failed` — so it is
idempotent. Two flags are NOT optional here:

    -e BULLMQ_QUEUE_NAME=course-generation
    -e DOCLING_UPLOADS_BASE_PATH=/app

The first because the operator pins `qdrant-reindex-disabled` while production workers consume
`course-generation`. The second because **the job payload carries an absolute path resolved by the
PRODUCER**: the operator sets `/opt/megacampus/data`, the workers mount the same files at
`/app/uploads`, and getting it wrong costs a full round on ENOENT. Do not re-enqueue while a
previous round still retries — the old jobs' failure path overwrites what the new round fixed.

`reindex execute` still cannot repair its own run: it skips whatever its ledger calls completed, a
fresh run id is refused while the journal sits at `reindex_started`, and `plan` demands a `verified`
journal. Rewriting the artifact by hand would falsify the audit record it exists to be.

## Backup guarantees

All three timers ENABLED. Snapshot and Supabase backup have PROVEN THEMSELVES UNATTENDED
(2026-08-02); the Qdrant restore drill is monthly, next 2026-09-01, so its scheduled path is still
unproven. The drill itself PASSED 2026-07-31 20:54 CEST, all seven checks — schema, count, dense,
ru_bm25, en_bm25, formula_priority, tenant_course_isolation — evidence under
`/var/lib/megacampus-qdrant-recovery/restore-evidence/`. Supabase stamps
`megacampus_supabase_last_successful_backup_unixtime_seconds` only after pg_restore validation AND
pointer publication both succeed. Snapshots are `storage_mode local` (`mc2-jz6y0.13.6`).

**`mc2-0tcyw`, 2026-08-03.** The 00:30 run failed past `pg_dump` and paged honestly, and was
UNATTRIBUTABLE: psql's stderr was dropped, leaving `... failed with status 1`. It now carries psql's
words, and a spawn failure names itself. The unit had no `Restart=`; it now retries after 10min,
bounded to 4 starts / 6h, excluding exit 64/75. Install ONLY via
`install-supabase-backup-schedule.sh`, which clears the start-limit first — without that, the night
after repeated failures its own proof fails and the trap DISABLES the timer. **Cause is `mc2-0rj7i`,
a suspect not a finding:** `statement_timeout=120000` inherited by `postgres`, against hash queries
that serialize a whole table to JSON. Idle-in-transaction is FALSIFIED (both timeouts 0, no role
override). Do not raise the timeout before the next occurrence names it in the log.

**All 13 alerting rules are inactive.** Every one was cleared by making it true, never by editing
the rule to stop asking. **`/opt/megacampus/recovery/probe.json` exists** (root:root 0444), from
`deploy/qdrant/generate-recovery-probe.py`, deliberately NOT in the repository because it embeds
real course content. **Regenerate it after anything that rewrites course
`0b3af59d-eeb7-4be6-89fb-5d2abac302bd`, then snapshot before the drill** — it must match.

## What is delivered

Commits `a182df581`..`c85921084` on `develop`, merged to `master` through `40b2a6b70`. Each closes
something that was silently wrong; the full list with evidence is in
`.codex/stages/mc2-jz6y0/summary.md`. Two changed how the host behaves and are stated here because
nothing in the repository shows them: the digest-pinned operator image is held under
`hold/qdrant-operator:pinned`, tagged BEFORE `docker image prune -f`, which would otherwise take an
image no container references and that cannot be re-pulled while the GHCR token is dead
(`mc2-2vtmk`); and Prometheus retention is 30d/20GB in `prometheus.yml` with the CLI flags REMOVED,
because a flag silently overrides the config file.

**A deploy can ship an image that does not contain the commit.** `DEPLOY_API_CHANGED=false` keeps
the CURRENT image even when a new one was built; after the rollback above, the next push did not
restore the new code because its commit touched no api source. `workflow_dispatch` with
`force_deploy=true` sets every `*_changed` and is the supported way out.

## How this repository fails, so you do not rediscover it

**Moved to `.codex/repository-failure-modes.md` on 2026-08-03. READ IT BEFORE YOU START.** It is the
durable half of this file and it does not expire with a stage, which is exactly why it did not
belong under a 200-line current-state cap — four sessions running, a true thing had to be shortened
to fit another true thing. Two traps are repeated here because they cost the most time: host port
6333 is the DEV Qdrant and is empty, production answers on **6335**; and `AGENTS.md` is rewritten by
a `bd` hook, so stage explicit paths and never `git add -A`.

## Verification and Delivery

- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` green (0 errors).
- Known and not a stop: `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*`,
  `q12-barrier-input-checkpoint-publication`, `q12-live-quiesce-deferred`,
  `qdrant-source-recovery-runtime` time out under full-suite parallelism but pass alone. Anything
  else failing in isolation IS a stop.
- Monitoring config drift is a SEPARATE JOB (`monitoring-drift`), never a step of `deploy`. As a
  step it failed the deploy job, and `rollback` triggers on exactly that: on 2026-08-01 a stale rule
  file rolled production back under a green pipeline for twenty minutes. Fix drift with
  `sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh`, which validates with promtool
  first and restarts Prometheus rather than signalling it. EXCEPT for
  `megacampus-supabase-backup.{service,timer}`: it clears their drift while proving nothing about
  the schedule, so use `install-supabase-backup-schedule.sh` instead.
- Regenerate `deploy/qdrant/q12-deployed-asset-manifest.json` whenever a tracked asset changes.
- `/push-dev` for dev, `/push` for releases, `/deploy` for staging; `check_stranded_commits.py`
  before claiming finished work is delivered.

## Explicit defers

- Off-host backup (`mc2-jz6y0.13.6`) — owner decided 2026-08-02 to stay local for now and give it
  its OWN DEDICATED SERVER later. Do NOT go shopping for an S3 bucket: the shape changed. Local
  snapshots genuinely cover a dropped collection, a bad reindex or a corrupting upgrade; they cover
  nothing about losing the machine, because they sit on the same disk as the data.
- **`mc2-bygu1` — the uploads are the only irreplaceable thing on that host, and the smallest.**
  `file_catalog.storage_path` is a RELATIVE FILESYSTEM PATH, not a Supabase Storage key: 261 rows,
  128 distinct paths, none starting with `http`. 206MB / 117 files under
  `/opt/megacampus/data/uploads`, NO second copy anywhere. Qdrant vectors are regenerable — but only
  from these, and six documents already lost their sources permanently. Deferred with the gate
  above; the cheap mitigation needs no credentials, just a scripted copy off the box.
- `mc2-3gz2m` — the 16 remaining PDFs, ONE cause, stated correctly at the top of this file. Ignore
  any older note claiming two causes: neither "scans that only OCR can read" nor "a finalize race
  that discards vectors it just uploaded" survived measurement. Reading these is feature work
  (tile the page before OCR, or rasterise per region at high DPI), not a fix.
- `mc2-8m90f` — the coverage-ledger check for the 6 unrecoverable sources. Its precondition is
  MEASURED as not yet fired: `document_evidence_runs` and `document_evidence_items` are both empty,
  so no Stage-4 generation has minted a card. The 6 ids are on the bead; the join column is
  `document_id`, NOT `file_catalog_id`.
- `mc2-qd12b` — host-gated fixtures rot: `RUN_REAL_CONTROLLER` auto-enables at uid 1000, off on
  GitHub runners (`mc2-oa7om` folded in as option в). Same class as the psql-17 skip in
  `q12-source-manifest-psql-diagnostic.test.ts`, so that file also carries a source guard.
- `mc2-n6szm` — 328 pre-existing findings in the test tree; `tools/` is outside every lint script.
  Review P2 `mc2-af1ay`; HA, quantization, on-disk hot indexes, sharding and JWT RBAC out of scope.
- CLOSED 2026-07-31/08-01, so do not re-open by habit: `mc2-82bt2`, `mc2-lkkcv`, `mc2-ugl5g`,
  `mc2-2i78i`, `mc2-1cxna`, `mc2-y5tgw`, `mc2-x6en2`, `mc2-jz6y0.25`, `mc2-6l2yz`, `mc2-oc83n`.

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: nothing is broken and nothing is half-done, so the next move is to WATCH.

1. Two of three schedules have PROVEN THEMSELVES UNATTENDED (2026-08-02): snapshot fired on its own
   at 04:23 CEST (every 4h, 136MB, 11 kept = under two days of history) and Supabase produced a
   140MB validated dump. The RESTORE DRILL has not — monthly, next 2026-09-01. Watch that one, and
   watch whether the new `Restart=` actually absorbs the next transient (`mc2-0tcyw`).
2. `mc2-3gz2m` is FEATURE work, not a fix: reading those diagrams means tiling the page before OCR
   or rasterising per region at high DPI. Two of the affected courses are test fixtures.
3. `mc2-lkkcv`: Docling restarted three more times during the repair (7 → 10). Blast radius is now
   a delay for DOCX, but PDFs still have no OCR fallback.
4. `mc2-jz6y0` stays open on ONE thing: `mc2-jz6y0.13.6`, parked on the owner's 2026-08-02 decision
   that off-host backup gets its own dedicated server. Nothing is actionable until it exists; when
   it does, do `mc2-bygu1` FIRST — those 206MB are the only unregenerable thing on the host.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/repository-failure-modes.md`,
`.codex/project-index.md`, `graphify-out/GRAPH_REPORT.md`, `.codex/stages/mc2-jz6y0/summary.md`.
Design/plan pairs under
`docs/superpowers/{specs,plans}/`: `2026-07-10-self-hosted-qdrant-platform`,
`2026-07-11-advisory-document-evidence-rag`, `2026-07-12-q12-source-recovery-design`.

## Starter prompt for next orchestrator

`docs/superpowers/prompts/2026-07-31-qdrant-reindex-completion-orchestrator.md` is still accurate on
authority and on this repository's failure modes; its premise that dropping the Q12 flags suffices
is necessary but not sufficient — thirteen defects sat behind it, all fixed. Fallback:
Use $orchestrator-stage from this handoff plus the stage summary.
