# Orchestrator Handoff

Updated: 2026-07-31 — Qdrant holds real vectors for the first time since the Cloud loss. The Q12
window track is retired. The reindex is partial and cannot repair itself; both backup timers are
enabled.

Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion.

## THE WINDOW IS GONE

On the owner's 2026-07-30/31 decision the Q12 live cutover was replaced by an ordinary release, and
the release succeeded: five migrations applied, 161 commits deployed, production moved off Qdrant
Cloud, pipeline green end to end for the first time since 2026-07-04. Do not reopen C1..C10.

Retired 2026-07-31, each with its reason on the bead: `mc2-i9h3y` (the window), `mc2-fxlne` (C4
compare on a guarded generation), `mc2-0ie27` (plan perishability), `mc2-zls0f`
(`q12-live-cutover.sh` interpreter), `mc2-e21lo` (barrier restore sweep). Each carries a REOPEN
CONDITION; none of the underlying fixes were made, because none is reachable without a barrier
install.

Deliberately NOT retired: `mc2-y5tgw` — the dev deploy's `docker image prune -f` removes the
digest-pinned operator image, which is referenced by no running container and is load-bearing for
ordinary work. `mc2-1cxna` — re-scoped to its ordinary-path half: `backup-supabase.sh` discards the
stderr of every failing dump step, and the ENABLED `megacampus-supabase-backup.timer` failed at
00:30 on 2026-07-31 with a message that was not true of the file it named. Last good generation:
`generation-20260730T150719Z-9b5e7a9c`.

**The load-bearing rule.** Every piece of Q12 machinery is opt-in. Migrations, reindex, deploy and
source recovery each have an ordinary path, reached by NOT passing the Q12 flags. Look for it before
concluding anything needs a window. For source recovery that is
`source-recovery-run.sh --operation forward` without `--q12-db-capability-file`.

## Where the Qdrant reindex actually stands

**The source recovery is COMPLETE.** `forward exited 0`, journal phase `verified` at revision 94,
all 42 copies `published`, all 24 dispositions `disposition_verified`. Uploads went 75 → 117 files;
the inventory moved `recoverable 109 / missing 129` → `recoverable 234 / missing 4`, exactly the
reviewed `expected_post_counts`.

**The reindex is PARTIAL.** Run `6bf8051d-6b13-41e5-a735-f4e6f3b87add`:

    VERIFY status=failed expected_documents=234 indexed_documents=186
    expected_points=13382 indexed_points=11714 missing_documents=48
    count_mismatches=28 schema_mismatches=0 relevance_failures=2 action=repair

Execute had claimed `enqueued=234 completed=234 failed=0` and exited 0. It was wrong, and the reason
is now fixed (below). The 48, from the worker's own log: 35 Docling conversion failures and 13
documents that lost a finalize race on `vector_status`. The 35 are environmental —
`megacampus-docling-mcp-internal` restarted seven times during the run and every conversion failure
falls before its last restart, none after (`mc2-lkkcv`).

**This run cannot repair itself** (`mc2-q3ju4`). Execute skips any file whose job the durable ledger
records as completed, a fresh run id is refused while the journal sits at `reindex_started`, and
`plan` demands a `verified` journal. Rewriting the artifact or journal by hand would falsify the
audit record they exist to be, so it was not done. The supported repair is the product's own
`retryDocument({courseId, fileId})` tRPC procedure, which those 48 rows are already in the right
state for — it runs as a signed-in user of the owning organization, from the app.

Two host prerequisites were created by hand and are NOT produced by any code: the 24 course
directories under the production upload root, and `/var/lib/megacampus-qdrant-recovery/reindex` at
`1001:1001` mode 0700. The first now fails legibly instead of with a bare ENOENT (`mc2-vhr79`).

## Backup guarantees

`megacampus-qdrant-snapshot.timer` and `megacampus-qdrant-restore-drill.timer` are ENABLED as of
2026-07-31. They had been installed on 2026-07-17 and never enabled, and the first enable proved why
that mattered: both died instantly on `/run/qdrant-operator/qdrant_api_key: Permission denied`. The
operator services run as root with `cap_drop: ALL`, so they have no DAC_OVERRIDE, and the entrypoint
handed the staging directory to uid 1001 before root wrote the secret into it. Fixed at all three
staging sites; a unit test cannot reproduce it, so the proof is on the host.

**Alert honesty.** `QdrantSnapshotStale` is critical and used to promise off-host retention that
does not exist — production is `QDRANT_SNAPSHOT_STORAGE_MODE=local` with no bucket
(`mc2-jz6y0.13.6`, owner-deferred to the production launch). `snapshot.ts` stamps its metric on
every successful run regardless of storage mode, so enabling the timer would have cleared that alert
by making its text false. The text now describes what the metric proves and names the open gate.

That correction had to be installed by hand: CI deliberately does not deploy `ops/qdrant`, so a
green master deploy left production serving the old rules (`mc2-ugl5g`). Backup at
`alerts.yml.bak-20260731`. Note for any other single-file bind mount on this host: SIGHUP was not
enough, because `install` replaces the inode and the container keeps the old one — only
`docker restart megacampus-prometheus` re-resolved it.

## What the ordinary route cost, in defects

Nine, each reachable only after the previous one was cleared.

1. Health asserted on a stopped container (`inspect_writer`, `current_writer_record`).
2. The operator image created both mount parents at 0555 while the code demands 0700.
3. CI wrote container paths into four Compose bind sources.
4. The manifest had no mode both sides accepted: publisher 0600, wrapper 0400, reader 0600.
5. Three operator services could not reach what their own commands need (upload root, recovery
   state, a Redis alias that does not exist).
6. The entrypoint pinned the durable run artifact for `execute` and not for `verify`, so verify
   reached for a relative default inside a `--rm` container that no longer existed.
7. The indexed-document walker scrolled at 256 against a collection this repo creates with
   `max_query_limit` 100 — a restriction the same verify asserts is in force.
8. Execute counted a returned BullMQ job as an indexed document, so 48 failures reported as 0.
9. Secrets were staged into a directory already handed to the tool uid, which capability-dropped
   root cannot write.

Five of the nine were kept green by a fixture that supplied what the code did not: a fake
`docker stop` leaving `Health` at `healthy`, a fake planner doing the `chmod 0400` the real one
omits, fake queue jobs that never return `success: false`, fake scrolls that accept any page size.
When a suite models the convenience instead of the constraint, it certifies the defect.

## How this repository fails, so you do not rediscover it

- **Errors get discarded.** Three instances in this stage, all fixed: `writer identity/state/policy
is invalid` named only itself; `source_recovery_failed` threw its cause away in a bare `catch {}`;
  and `detail=Bad Request` hid `Limit exceeded 256 > 100 for "limit"` inside an HTTP client's
  `data.status.error` while its `message` carried only the status text. When something fails without
  a reason, fix the reporting first — every one of these paid for itself within the hour.
- **Completion is not success.** BullMQ completes a job whenever the processor returns, and these
  handlers return `{ success: false }` rather than throwing.
- **The checked environment gets substituted for the consuming one.** See the five fixtures above.
- **CI overwrites good server values, and silently declines to write others.** It wrote container
  paths into four bind sources, and it does not deploy `ops/qdrant` at all.
- **Prove it on the host as the user that will run it**, and **prove a new guard red before trusting
  it**.
- The primary worktree carries unrelated local edits (`AGENTS.md` is rewritten by a `bd` hook).
  Stage explicit paths; never `git add -A`.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage or tenant-isolation tests.
- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` green (0 errors).
- Known and not a stop: `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*`,
  `q12-barrier-input-checkpoint-publication`, `q12-live-quiesce-deferred` and
  `qdrant-source-recovery-runtime` can time out under full-suite parallelism; each passes alone.
  Anything else failing in isolation IS a stop.
- Regenerate `deploy/qdrant/q12-deployed-asset-manifest.json` whenever a tracked asset changes, or
  the window pre-flight's H2 and lockstep checks fail in isolation. `docker-compose.infra.yml` was
  left stale by `a95582715` and caught here.
- `/push-dev` for dev delivery, `/push` for releases, `/deploy` for staging.
  `check_stranded_commits.py` before claiming finished work is delivered.

## Explicit defers

- Off-host S3 (`mc2-jz6y0.13.6`) — owner deferred 2026-07-31 to the production launch. Needs bucket,
  region and credentials; nothing else.
- `mc2-jz6y0.13.8` (Supabase password rotation) — CLOSED 2026-07-31 on the owner's decision that the
  credential was never exposed. The 2026-07-13 record says otherwise and is preserved unedited in a
  comment; the owner's current instruction governs.
- `mc2-q3ju4` — the 48 unindexed documents. Repair runs through the app, not the reindex tool.
- `mc2-82bt2` — course duplication scrolls 10000 points against the same strict-mode cap of 100. Not
  a constant swap: it needs pagination, or it turns a loud failure into quiet data loss.
- `mc2-n6szm` — 328 pre-existing findings in the course-gen-platform test tree, and the `tools/` tree
  is outside every lint script, so the operator CLIs are unlinted.
- Review P2 `mc2-af1ay` on the `.13.4.1` amendment stays deferred.
- Prometheus retention YAML (`mc2-jz6y0.25`); HA, quantization, on-disk hot indexes, custom sharding
  and JWT RBAC out of scope.

## Next recommended

Next stage id: `mc2-jz6y0`

1. Watch the first scheduled snapshot and the first restore drill land their `.prom` files in
   `/var/lib/megacampus/qdrant-metrics` and both alerts clear on their own.
2. Repair the 48 through `retryDocument`, then re-run `reindex verify` with the six binding values —
   verify reads Qdrant, so it will pass once the vectors exist, whoever wrote them.
3. Decide `mc2-lkkcv`: Docling backed off nothing and docx has no fallback extractor, so a service
   restart cost 35 documents.
4. `mc2-ugl5g`: give monitoring config a delivery path, or a check that fails the deploy on drift.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/project-index.md`,
`graphify-out/GRAPH_REPORT.md`, and `.codex/stages/mc2-jz6y0/summary.md`. Design/plan pairs under
`docs/superpowers/{specs,plans}/`: `2026-07-10-self-hosted-qdrant-platform`,
`2026-07-11-advisory-document-evidence-rag`, `2026-07-12-q12-source-recovery-design`.
