# Orchestrator Handoff

Updated: 2026-07-31 — the Q12 live-cutover track is RETIRED; the ordinary source-recovery route is
reopened and one blocker remains before the Qdrant reindex.

Stage: `mc2-jz6y0` — self-hosted Qdrant plus approved document-evidence expansion.

## THE WINDOW IS GONE

On the owner's 2026-07-30/31 decision the Q12 live cutover was replaced by an ordinary release, and
the release succeeded: five migrations applied, 161 commits deployed, production moved off Qdrant
Cloud, pipeline green end to end for the first time since 2026-07-04. Do not reopen C1..C10.

Retired 2026-07-31, each with its reason on the bead: `mc2-i9h3y` (the window), `mc2-fxlne` (C4
compare on a guarded generation), `mc2-0ie27` (plan perishability), `mc2-zls0f`
(`q12-live-cutover.sh` interpreter), `mc2-e21lo` (barrier restore sweep). Each carries a REOPEN
CONDITION; none of the underlying fixes were made, because none of them is reachable without a
barrier install.

Deliberately NOT retired: `mc2-y5tgw` — the dev deploy's `docker image prune -f` removes the
digest-pinned operator image, which is referenced by no running container and is now load-bearing
for ordinary work. `mc2-1cxna` — re-scoped to its ordinary-path half: `backup-supabase.sh` discards
the stderr of every failing dump step, and the ENABLED `megacampus-supabase-backup.timer` failed at
00:30 today with a message that was not true of the file it named.

**The load-bearing rule.** Every piece of Q12 machinery is opt-in. Migrations, reindex, deploy and
source recovery each have an ordinary path, reached by NOT passing the Q12 flags. Look for it before
concluding anything needs a window. For source recovery that is
`source-recovery-run.sh --operation forward` without `--q12-db-capability-file`; the argv is
`q12-command-manifest.json`'s `source.forward` argv[0..20], i.e. everything up to but not including
`--q12-db-capability-file`.

## Product Truth

- Qdrant Cloud data was test-only and is lost. Do not recover or mutate it; rebuild the derived
  index from authoritative sources.
- Target remains private self-hosted Qdrant `1.18.2`, native multilingual BM25/IDF, server RRF /
  Formula priority, strict indexes, aliases, source reindex, Prometheus/Grafana/alerts, and a secure
  loopback Web UI. Development staging uses persistent local-volume snapshots; off-host S3 is the
  production gate `mc2-jz6y0.13.6`.
- Documents are optional but important advisory evidence. A course without documents is fully
  supported.
- Every uploaded document must receive a durable `assessed`, `degraded` or `failed` coverage
  outcome; none may disappear through context truncation.
- Documents supplement the baseline structure. They may add facts, terminology, constraints,
  examples and source-backed topics but cannot silently replace baseline curriculum requirements.
- Material document conflicts use a distinct required-question block. Manual mode pauses at the
  existing Phase 0.5 boundary. Automatic mode selects the recommendation and appends
  `resolved_by: system` / `answer_source: system` with rationale.

## Current State, measured 2026-07-31

- Qdrant: physical `course_embeddings_v1`, alias `course_embeddings` → it, **0 points**, status
  green, dense + sparse vectors and the full 12-key payload schema present.
- `file_catalog`: 185 `indexed`, 43 `failed`, 25 `pending`, 8 `indexing` = 261. The `indexed` column
  refers to Qdrant Cloud vectors that no longer exist; it lies.
- Live inventory equals the audited pre-copy totals EXACTLY — `total 261, eligible 240,
recoverable 109, missing 129, invalid 2, unsupported 21` — so the frozen
  `/var/lib/megacampus-source-recovery/plan-input.json` (run `a417a99c-…`) is still valid. Its 42
  copies restore 125 rows and take `missing` from 129 to 4.
- `/var/lib/megacampus-source-recovery/state/` and `progress/`: still empty. No manifest, no
  journal, so a fresh `plan` is still the correct first command.
- Both `megacampus-qdrant-snapshot.timer` and `megacampus-qdrant-restore-drill.timer` remain
  `disabled / inactive`; `/var/lib/megacampus/qdrant-metrics` is empty. Deliberate: a snapshot of an
  empty collection proves nothing.
- `megacampus-supabase-backup.timer` is enabled; its 00:30 run FAILED and the last good generation
  is `generation-20260730T150719Z-9b5e7a9c`.

## What the ordinary route cost, in defects

Four independent defects sat between "drop the Q12 flags" and a completed
`source.forward`. Each was found on the host, and each had never been reachable before because
sixteen window attempts died at or before C4, the command right before it.

1. Health asserted on a stopped container (`inspect_writer`, `current_writer_record`) — FIXED.
2. The operator image created both mount parents at 0555 while the code demands 0700 — FIXED.
3. CI wrote container paths into four Compose bind sources — FIXED.
4. The manifest had no mode both sides accepted: the publisher never applied one and produced 0600,
   the wrapper requires 0400, and the operator's reader demanded 0600 — FIXED.

Three of the four were kept green by a fixture that supplied what the code did not: the fake
`docker stop` left `Health` at `healthy`, and the fake planner did the `chmod 0400` the real one
omits. When a suite models the convenience instead of the constraint, it certifies the defect.

## Where the Qdrant reindex stands

The source recovery is COMPLETE. `forward exited 0`, journal phase `verified`, revision 94, all 42
copies `published`, all 24 dispositions `disposition_verified`. `/opt/megacampus/data/uploads` went
from 75 files to 117, and the live inventory moved from `recoverable 109 / missing 129` to
`recoverable 234 / missing 4` — exactly the reviewed `expected_post_counts`.

`reindex plan` against `course_embeddings_v1` then returned `status=ok eligible=240 recoverable=234
audited_failed=6 unresolved=0`. Exit 0 means something here: `getReindexPlanExitCode` returns 2
whenever any unresolved gap remains, and there are none.

`reindex execute` is RUNNING, detached, run id in
`/var/tmp/mc2-reindex-execute.log`, against the dedicated queue
`qdrant-reindex-<run-id>` with a `megacampus-qdrant-reindex-worker` container consuming it. It
enqueues 234 ordinary DOCUMENT_PROCESSING jobs at concurrency 4, about one document per minute, so
roughly four hours end to end. Progress is visible three ways: the collection's `points_count`, the
Redis keys `bull:qdrant-reindex-<run-id>:{completed,failed,active}`, and the worker's logs.

WHEN IT FINISHES: run `reindex verify` with the same six values, then read its
`expected_documents`/`indexed_documents` and `relevance_failures`. Only then enable
`megacampus-qdrant-snapshot.timer` and `megacampus-qdrant-restore-drill.timer` — a snapshot or drill
taken while the collection is still filling measures a moving target. The three acceptance values
come from `emit-source-forward-acceptance.ts`, which the ordinary forward does NOT publish (it has
no consumer outside Q12); run it yourself in the planner service with `--entrypoint tsx`.

Two host prerequisites were created by hand and are NOT produced by any code: the 24 course
directories under the production upload root (`mc2-vhr79`) and
`/var/lib/megacampus-qdrant-recovery/reindex` at `1001:1001` mode 0700, which the operator uid
cannot create because its parent is root-owned 0755.

## How this repository fails, so you do not rediscover it

- **Errors get discarded.** Two more instances today, both fixed:
  `writer identity/state/policy is invalid` named only itself, and `source_recovery_failed` threw
  its cause away in a bare `catch {}`. The second cost a production writer window to learn a message
  the process already had. When something fails without a reason, fix the reporting first.
- **The checked environment gets substituted for the consuming one.** The suite's fake `docker stop`
  left `Health` at `healthy`, which no real stopped container reports, and that alone kept a clause
  no quiesced writer could satisfy green through every run.
- **CI overwrites good server values.** It wrote container paths into four variables Compose
  interpolates as bind sources. Check what a deploy will write before running it; prefer deriving a
  value from the host that owns it.
- **Prove it on the host as the user that will run it**, and **prove a new guard red before trusting
  it**.
- The primary worktree carries unrelated local edits (`AGENTS.md` is rewritten by a `bd` hook).
  Stage explicit paths; never `git add -A`.

## Alert truth — read before enabling the snapshot timer

`QdrantSnapshotStale` is **critical** and its text says "No successful off-host Qdrant snapshot has
been recorded within eight hours". It fires on `absent(...)`, and it is TRUE: there is no off-host
snapshot, because `QDRANT_SNAPSHOT_STORAGE_MODE=local` and `QDRANT_S3_BUCKET`/`_REGION` are unset
(`mc2-jz6y0.13.6`, owner-gated, needs credentials). `snapshot.ts` stamps
`lastSuccessfulSnapshotEpochSeconds` regardless of storage mode, so simply enabling the timer in
local mode would clear a critical alert without making its claim true. Split the metric or retitle
the alert first; an alert that has stopped being true is worse than one that is firing.
`QdrantRestoreDrillStale` (warning) has no such problem — a local restore drill is exactly what it
claims to measure.

## Verification and Delivery

- Do not weaken RU/EN relevance, strict-mode, restore, resume, coverage or tenant-isolation tests.
- Gates at the delivered HEAD: `pnpm type-check`, `pnpm build`, `pnpm lint` all green;
  `qdrant-source-recovery-runtime` 205/205; `q12-live-cutover` 248/248 IN ISOLATION.
- Known and not a stop: `q12-live-controller`, `q12-live-cutover`, `q12-retained-barrier-*` and
  `qdrant-source-recovery-runtime` can time out under full-suite parallelism; each passes alone.
- `/push-dev` for dev delivery, `/push` for releases, `/deploy` for staging. `check_stranded_commits.py`
  before claiming finished work is delivered.

## Explicit defers

- Off-host S3 stays the production readiness defer `mc2-jz6y0.13.6`; it gates the honest form of
  `QdrantSnapshotStale`.
- `mc2-jz6y0.13.8` (rotate the exposed Supabase password) remains open and owner-gated; retiring the
  window changed nothing about it.
- The recovery publisher creates no target directory. The 24 that its 42 copies need were created by
  hand on 2026-07-31 with Stage 1's own identity (`1001:1001`, 0755, empty). Whether the recovery
  should create them itself is unresolved and untracked in code.
- `mc2-x6en2`: `pnpm lint` and lint-staged now agree, but the 328 pre-existing test-tree findings
  are untouched and the `tools/` tree (6 errors, 77 warnings) is outside every lint script, so the
  operator CLIs are unlinted.
- Review P2 `mc2-af1ay` on the `.13.4.1` amendment (duplicate operator-side `DispositionSchema`,
  `CATALOG_HASH_PATTERN`) stays deferred.
- Seventeen post-window residuals stay open on their own beads (`bd list --status open`); several
  are now window-only and can be retired the way `mc2-fxlne` was. None was mass-closed.
- Prometheus retention YAML (`mc2-jz6y0.25`); `codex/self-hosted-qdrant-platform` retained; HA,
  quantization, on-disk hot indexes, custom sharding and JWT RBAC out of scope.

## Next recommended

Next stage id: `mc2-jz6y0`

Recommended action: deploy `develop` into `master` so the operator image ships its mount parents at
mode 0700, then re-verify that `.env.production` still resolves an operator image locally
(`mc2-y5tgw`: the dev deploy prunes it). Then the ordinary forward with the ten writers stopped by
hand, then `reindex plan|execute|verify` against `course_embeddings_v1`. Read § "The one blocker
before the reindex" for the exact argv and what is already proven. Do NOT enable the snapshot timer
until § "Alert truth" is settled.

## Starter prompt for next orchestrator

`docs/superpowers/prompts/2026-07-31-qdrant-reindex-completion-orchestrator.md` remains accurate on
goal and authority; its §1 premise that a plain forward run only needs the Q12 flags dropped is now
known to be necessary but not sufficient — three further defects sat behind it, two fixed here and
one waiting on a deploy. Fallback: Use $orchestrator-stage from this handoff plus the stage summary.

## Read First

`AGENTS.md`, `.codex/orchestrator.toml`, this file, `.codex/project-index.md`,
`graphify-out/GRAPH_REPORT.md`, and `.codex/stages/mc2-jz6y0/summary.md` § "2026-07-31 — the Q12
window track is retired". Design/plan pairs under `docs/superpowers/{specs,plans}/`:
`2026-07-10-self-hosted-qdrant-platform`, `2026-07-11-advisory-document-evidence-rag`,
`2026-07-12-q12-source-recovery-design`.
