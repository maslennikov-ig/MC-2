# Orchestrator Handoff

Updated: 2026-08-01 — 218 of 234 documents hold vectors, all three backup timers are enabled and
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
`mc2-urw5d` closed as obsolete and `mc2-oa7om` as superseded by `mc2-qd12b`. None of the underlying
fixes were made, because none is reachable without a barrier install — the findings are preserved
verbatim on each bead rather than deleted, so reopening restores the evidence with the task.

Q12 beads still OPEN, each for a reason recorded on it, and none window-dependent: `mc2-8m90f`,
`mc2-qd12b`, `mc2-n6szm`.

**The load-bearing rule.** Every piece of Q12 machinery is opt-in. Migrations, reindex, deploy and
source recovery each have an ordinary path, reached by NOT passing the Q12 flags.

## Where the Qdrant reindex stands

**The source recovery is COMPLETE** and `mc2-jz6y0.13.4` is closed on that evidence. Measured
2026-08-01 from `/var/lib/megacampus-source-recovery/state`: 42/42 `copy_states` `published`, 24/24
`disposition_states` `disposition_verified`, of which 18 `career_playbook_retained_derived` and 6
`eligible_unrecoverable`. Recovery reached `verified` at revision 94; the journal now reads
revision 95 / phase `reindex_started`, because the reindex ran after it.

**The 16 that remain are one family, and the diagnosis took three tries.** They are NOT scans and
there is NO race: exported diagrams, one page, 4296pt tall, type converted to curves, so no text
layer exists for any extractor. OCR is installed and loads its models, and returns nothing even with
`force_full_page_ocr` at 3x. Docling converts them to `<!-- image -->` — fourteen characters — and
REPORTS SUCCESS, after which zero chunks, embeddings and points are correct behaviour on empty
input. See `mc2-3gz2m`; both earlier explanations are marked wrong there rather than deleted.

**The reindex is 218/234.** Measured after the repair:

    VERIFY status=failed expected_documents=234 indexed_documents=218
    expected_points=13650 indexed_points=13712 gaps=21 schema_mismatches=0
    relevance_failures=0 action=repair

The 32 DOCX that were permanent losses are all back; the 16 that remain are ALL PDF (`mc2-3gz2m`).

**How the repair runs.** `qdrant-operator retry-documents --file-ids <path> --confirm`
(`tools/qdrant/retry-failed-documents.ts`). It replays `retryDocument`'s server-side effect in bulk
and carries that procedure's guard: a document is touched only when the catalog calls it `failed`,
so it is idempotent and safe to re-run. Two flags are NOT optional in this environment:

    -e BULLMQ_QUEUE_NAME=course-generation
    -e DOCLING_UPLOADS_BASE_PATH=/app

The first because the operator pins `qdrant-reindex-disabled` and the production workers consume
`course-generation`. The second because **the job payload carries an absolute path resolved by the
PRODUCER**, and the operator sets `/opt/megacampus/data` while the workers mount the same files at
`/app/uploads`. Getting it wrong costs a full round: every job dies on ENOENT and marks the document
failed. Do not re-enqueue while a previous round is still retrying — the old jobs' failure path
overwrites documents the new round already fixed.

`reindex execute` still cannot repair its own run: it skips whatever its ledger calls completed, a
fresh run id is refused while the journal sits at `reindex_started`, and `plan` demands a `verified`
journal. Rewriting the artifact by hand would falsify the audit record it exists to be.

## Backup guarantees

All three timers ENABLED. Snapshot and Supabase backup have since PROVEN THEMSELVES UNATTENDED
(2026-08-02); the restore drill is monthly and next runs 2026-09-01, so its scheduled path is still
unproven. The drill itself PASSED on 2026-07-31 20:54 CEST, all seven checks — schema, count, dense,
ru_bm25, en_bm25, formula_priority, tenant_course_isolation — evidence under
`/var/lib/megacampus-qdrant-recovery/restore-evidence/`. Supabase stamps
`megacampus_supabase_last_successful_backup_unixtime_seconds` only after pg_restore validation AND
pointer publication both succeed. Snapshots are `storage_mode local` by owner decision
(`mc2-jz6y0.13.6`).

**All 13 alerting rules are inactive.** Every one was cleared by making it true, never by editing
the rule to stop asking.

**`/opt/megacampus/recovery/probe.json` exists** (root:root 0444), from
`deploy/qdrant/generate-recovery-probe.py`. It is deliberately NOT in the repository: it embeds real
course content. **Regenerate it after anything that rewrites course
`0b3af59d-eeb7-4be6-89fb-5d2abac302bd`, then take a fresh snapshot before the drill** — the probe
must match the snapshot the drill restores.

## What is delivered

Eighteen commits, `a182df581`..`6e3d33eb8` on `develop`, merged to `master` through `85d22daf2`.
Each closes something that was silently wrong; the full list with evidence is in
`.codex/stages/mc2-jz6y0/summary.md`. Two of them changed how the host behaves and are stated here
because nothing in the repository shows them: the digest-pinned operator image is held under
`hold/qdrant-operator:pinned`, tagged BEFORE `docker image prune -f`, which would otherwise take an
image no container references and that cannot be re-pulled while the GHCR token is dead
(`mc2-2vtmk`); and Prometheus retention is 30d/20GB in `prometheus.yml` with the CLI flags REMOVED,
because a flag silently overrides the config file.

**A deploy can ship an image that does not contain the commit.** `DEPLOY_API_CHANGED=false` makes
the deploy keep the CURRENT image even when a new one was built. After the rollback above, the next
push did not restore the new code because its commit touched no api source. `workflow_dispatch` with
`force_deploy=true` sets every `*_changed` and is the supported way out.

## How this repository fails, so you do not rediscover it

- **Delivery is not deployment.** Two directories that production executes had no delivery path.
  Both were found by looking for an observable effect, not by reading the workflow.
- **Completion is not success.** BullMQ completes a job whenever the processor returns, and these
  handlers return `{ success: false }` rather than throwing.
- **The producing container is not the consuming one.** Absolute paths and queue names resolved in
  the operator do not mean what they mean in the worker.
- **Errors get discarded.** Repeatedly. When something fails without a reason, fix the reporting
  first; every time here it paid for itself within the hour.
- **The checked environment gets substituted for the consuming one** — fakes that accept any page
  size, any job result, any container.
- **Prove it on the host as the user that will run it**, and **prove a new guard red first**.
- The primary worktree carries unrelated local edits (`AGENTS.md` is rewritten by a `bd` hook).
  Stage explicit paths; never `git add -A`.
- Host port 6333 is the **dev** Qdrant and is empty. Production answers on **6335**.

## Verification and Delivery

- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` green (0 errors).
- Known and not a stop: `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*`,
  `q12-barrier-input-checkpoint-publication`, `q12-live-quiesce-deferred` and
  `qdrant-source-recovery-runtime` can time out under full-suite parallelism; each passes alone.
  Anything else failing in isolation IS a stop.
- Monitoring config drift is a SEPARATE JOB (`monitoring-drift`), never a step of `deploy`. As a
  step it failed the deploy job, and `rollback` triggers on exactly that: on 2026-08-01 a rule file
  one commit behind rolled production back to the previous image while the pipeline reported
  success. Production then ran stale code with a green pipeline for twenty minutes. Fix drift with
  `sudo /opt/megacampus/deploy/qdrant/install-monitoring-config.sh`, which validates with promtool
  before it replaces anything and restarts Prometheus rather than signalling it.
- Regenerate `deploy/qdrant/q12-deployed-asset-manifest.json` whenever a tracked asset changes.
- `/push-dev` for dev delivery, `/push` for releases, `/deploy` for staging.
  `check_stranded_commits.py` before claiming finished work is delivered.

## Explicit defers

- Off-host backup (`mc2-jz6y0.13.6`) — owner decided 2026-08-02 to stay local for now and to give
  off-host backup its OWN DEDICATED SERVER later. Do NOT go shopping for an S3 bucket: the shape
  changed. Local snapshots genuinely cover a dropped collection, a bad reindex or a corrupting
  upgrade; they cover nothing about losing the machine, because they sit on the same disk as the
  data. `QdrantSnapshotStale` names the gap and does not promise it, so the deferral is silent.
- **`mc2-bygu1` — the uploads are the only irreplaceable thing on that host, and the smallest.**
  `file_catalog.storage_path` is a RELATIVE FILESYSTEM PATH, not a Supabase Storage key: 261 rows,
  128 distinct paths, none starting with `http`. The files are 206MB / 117 files under
  `/opt/megacampus/data/uploads` with NO second copy anywhere. Qdrant vectors are derived and
  regenerable — but only from these. Six documents already lost their sources permanently. Deferred
  with the gate above; the cheap mitigation needs no credentials at all, just a scripted copy off
  the box.
- `mc2-3gz2m` — the 16 remaining PDFs, ONE cause, stated correctly at the top of this file. Ignore
  any older note claiming two causes: neither "scans that only OCR can read" nor "a finalize race
  that discards vectors it just uploaded" survived measurement. Reading these is feature work
  (tile the page before OCR, or rasterise per region at high DPI), not a fix.
- `mc2-8m90f` — the coverage-ledger check for the 6 unrecoverable sources. Its precondition is
  MEASURED as not yet fired: `document_evidence_runs` and `document_evidence_items` are both empty,
  so no Stage-4 generation has minted a card for anyone. The 6 ids are recorded on the bead. Note
  the join column is `document_id`, NOT `file_catalog_id`.
- `mc2-qd12b` — host-gated fixtures rot because `RUN_REAL_CONTROLLER` auto-enables at uid 1000 and
  is off on GitHub runners. `mc2-oa7om` was folded into it as its own option (в).
- `mc2-n6szm` — 328 pre-existing findings in the test tree; `tools/` is outside every lint script.
- Review P2 `mc2-af1ay`; HA, quantization, on-disk hot indexes, sharding and JWT RBAC out of scope.
- CLOSED 2026-07-31/08-01, so do not re-open by habit: `mc2-82bt2`, `mc2-lkkcv`, `mc2-ugl5g`,
  `mc2-2i78i`, `mc2-1cxna`, `mc2-y5tgw`, `mc2-x6en2`, `mc2-jz6y0.25`, `mc2-6l2yz`, `mc2-oc83n`.

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: nothing is broken and nothing is half-done, so the next move is to WATCH.

1. Two of three schedules have PROVEN THEMSELVES UNATTENDED (2026-08-02): the snapshot timer fired
   on its own at 04:23 CEST (every 4h, 136MB, 11 kept locally = under two days of history) and the
   Supabase backup produced a 140MB validated dump. The RESTORE DRILL has not — monthly, next
   2026-09-01. That one is still worth watching.
2. `mc2-3gz2m` is FEATURE work, not a fix: reading those diagrams means tiling the page before OCR
   or rasterising per region at high DPI. Two of the affected courses are test fixtures.
3. `mc2-lkkcv`: Docling restarted three more times during the repair (7 → 10). The blast radius is
   now a delay for DOCX, but PDFs still have no OCR fallback.
4. `mc2-jz6y0` stays open on ONE thing: `mc2-jz6y0.13.6`, now parked on the owner's 2026-08-02
   decision that off-host backup gets its own dedicated server. Nothing is actionable until that
   server exists. When it does, do `mc2-bygu1` FIRST — the 206MB of uploads is the only thing on
   that host that cannot be regenerated, and it is cheaper to move than everything else combined.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/project-index.md`,
`graphify-out/GRAPH_REPORT.md`, and `.codex/stages/mc2-jz6y0/summary.md`. Design/plan pairs under
`docs/superpowers/{specs,plans}/`: `2026-07-10-self-hosted-qdrant-platform`,
`2026-07-11-advisory-document-evidence-rag`, `2026-07-12-q12-source-recovery-design`.

## Starter prompt for next orchestrator

`docs/superpowers/prompts/2026-07-31-qdrant-reindex-completion-orchestrator.md` is still accurate on
authority and on this repository's failure modes. Its premise that dropping the Q12 flags is
sufficient is known to be necessary but not sufficient: thirteen defects sat behind it, all fixed.
Fallback: Use $orchestrator-stage from this handoff plus the stage summary.
