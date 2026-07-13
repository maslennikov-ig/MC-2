---
schema_version: orchestration-artifact/v1
artifact_type: execution-packet
task_id: mc2-jz6y0.13.7
stage_id: mc2-jz6y0
agent_type: root_orchestrator
subagent_model: inherit_orchestrator
reasoning_effort: high
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: origin/codex/self-hosted-qdrant-platform
base_commit: 321199d26b6477c28f8c6289dc1ce22ce4dbf534
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-execution-packet-pg17.md
selected_skills:
  - senior-devops
  - orchestration-closeout
  - superpowers:verification-before-completion
selected_agents:
  - root orchestrator - joins accepted backup, preflight, image-pin, correction, and rereview evidence
catalog_candidates:
  - none - accepted repo operators, runbooks, first-party pins, and current host evidence fully define the packet
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: packet creation changed documentation only; no SSH, Supabase, secret, image, container, volume, network, port, database, service, cron, Qdrant, staging, or production operation was performed
risk_level: high
docs_impact: ops-deploy
docs_reviewed: pending
docs_review_notes: requires targeted independent docs review against both operations runbooks before acceptance
graph_reviewed: blocked
graph_review_notes: durable operations truth changed; integration closeout must refresh the local graph after docs acceptance
verification:
  - current server inventory, browser-login contract, PostgreSQL 17 client correction, image-pin finding/correction/rereview, both operations runbooks, and immutable hashes were reconciled
  - operator and certificate SHA-256 values were recomputed locally
  - no command in this packet was executed against Supabase or the approved server
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-execution-packet-pg17.md
explicit_defers:
  - execution remains blocked on an owner-supplied permanent verify-full Session pooler DSN; browser CLI login and temporary login roles are not substitutes
  - no partial server preparation, image pull, dump, restore, migration, source recovery, reindex, or cutover may begin before that input exists and the mutation window is observed
  - production off-host S3 remains deferred under mc2-jz6y0.13.6 and is not part of this staging packet
---

# Summary

This file is the sole executable `.13.7` backup/restore packet. It explicitly
supersedes the executable restore snippet in `mc2-jz6y0.13.7.md`, the fixed
`/usr/bin` client claims and restore example in
`mc2-jz6y0.13.7-supabase-cli-login-role.md`, and the proposed command section of
`mc2-jz6y0.13.7-server-preflight-20260713.md`. Those files remain immutable
historical implementation, research, and host-observation evidence only. None
of their `/usr/bin/pg_dump` or `/usr/bin/pg_restore` instructions is executable.

Every dump, TOC validation, full offline archive traversal, and real isolated
restore in this packet must use only
`/usr/lib/postgresql/17/bin/pg_dump` or
`/usr/lib/postgresql/17/bin/pg_restore`, as applicable. No PATH or `/usr/bin`
fallback is allowed.

The packet is locally prepared but **NO-GO**. The missing input is one current,
password-bearing Supabase **Session pooler** URI that passes `verify-full` with
the downloaded project CA. Browser CLI authentication is complete, but its
short-lived `cli_login_postgres` role does not expose this durable credential.

## Immutable local inputs

| Input                 | Accepted identity                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Backup operator       | `deploy/postgres/backup-supabase.sh` SHA-256 `4e89ac6e6e93b16885f449ae8f1ff05eee8082e96b722da159b108f3940d9526` |
| Supabase Root 2021 CA | SHA-256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`                                      |
| Dump client           | `/usr/lib/postgresql/17/bin/pg_dump`; current host observation `17.7`                                           |
| Restore client        | `/usr/lib/postgresql/17/bin/pg_restore`; current host observation `17.7`                                        |
| Restore image tag     | drift detection only: `postgres:17.10-bookworm`                                                                 |
| Restore OCI index     | `sha256:5530681ea5d3e2ed4ce396f9b5cb443efbac6baf2a8a19c0c0635e40ae7eadce`                                       |
| Restore runtime image | `linux/amd64` `postgres@sha256:9cc09bb9a1b9da469658a6fab7bbced9ece6ca99174e1b93c1c4cc1a12f741cf`                |

PostgreSQL `17.10` is a current minor in supported major 17, not an LTS label.
Do not silently update any pin or server package inside this packet.

## Exact remaining secret input

Obtain the URI from Supabase Dashboard **Connect -> Session pooler**. It must be
written through an interactive standard-input channel to owner-only
`/opt/megacampus/secrets/supabase_db_url`; never place it in argv, shell history,
logs, tracked files, artifacts, or chat output. The effective connection must
use `sslmode=verify-full` and
`sslrootcert=/opt/megacampus/secrets/prod-ca-2021.crt`.

If the current password is unknown, stop. Rotating the database password can
invalidate existing connections and requires separate explicit confirmation.

## Observed mutation sequence

Run these phases serially in one recorded window. Capture exit codes, UTC
timestamps, hashes, modes, versions, resource IDs, and redacted observations.
Stop on the first mismatch.

1. **Revalidate before mutation.** Prove the two explicit PostgreSQL 17 clients
   exist and each reports major 17; recompute the operator/CA hashes; prove the
   tag still maps to the accepted OCI index and `linux/amd64` manifest; recheck
   free space, backup path identity/modes, the one legacy cron entry, and zero
   owned restore residue. Measure database size through a redacted read-only
   verify-full session. Do not use `/usr/bin/pg_dump` or `/usr/bin/pg_restore`.
2. **Preserve and suspend the broken scheduler.** Save the exact current
   crontab as root-owned mode 0600 rollback evidence, then remove only the
   single known `00:30 CEST` legacy `backup_supabase.sh` entry. Prove it is
   absent. Do not delete any historical 20-byte files.
3. **Install public inputs and safe paths.** Correct
   `/opt/megacampus/backups` and `/opt/megacampus/backups/supabase` to the
   accepted non-group/world-writable parent and mode-0700 leaf contract. Install
   only the hash-verified operator and CA, then prove canonical path, owner,
   mode, non-symlink type, and hashes. Create the URL file owner-only and ingest
   the URI through standard input without echo.
4. **Prove source connectivity without mutation.** Use the installed CA and
   permanent URI for `SELECT 1`, server/database identity, size, and migration
   frontier reads. Require PostgreSQL `17.6`, the expected project, no TLS
   downgrade, and no unknown migration frontier. Record no credential value.
5. **Create the fresh archive.** Run only the reviewed operator as
   `claude-deploy`. Require explicit PG17 client checks, direct `pg_dump` status,
   minimum size, TOC, full offline traversal, fsync, atomic no-replace publish,
   checksum, exact owner/mode, and retention evidence. The existing 12 files are
   invalid and usable-backup count remains zero until this phase succeeds.
6. **Pull and create the isolated restore target.** Pull only the accepted
   `linux/amd64` manifest digest. Before Docker create, install cleanup traps and
   record a unique run ID. Create one named volume mounted exactly at
   `/var/lib/postgresql/data`; bind the canonical mode-0600 password file
   read-only at `/run/secrets/mc2_pg_password` and set
   `POSTGRES_PASSWORD_FILE` to that path. Bind the server only to a
   kernel-assigned `127.0.0.1` port. Inspect and require the exact data/secret
   mount identities and no wildcard port before any production archive is read.
7. **Restore and verify.** Require readiness and server major 17, then restore
   the exact fresh archive with `/usr/lib/postgresql/17/bin/pg_restore`,
   `--exit-on-error`, and `--single-transaction` to the loopback target only.
   An ownership, extension, ACL, role, checksum, log, schema/table, row-count,
   or database-size failure is a hard stop; do not weaken flags to manufacture
   success. No command may name or write to the Supabase source during restore.
8. **Teardown and prove zero residue.** On success, failure, or signal, remove
   the container with anonymous volumes, then the captured network, named data
   volume, password file, port, and owned temporary directory. Prove every
   recorded container/mount/resource ID and path is absent. Cleanup failure
   overrides restore success.
9. **Release the database gate.** Only after the fresh archive and isolated
   restore both pass may the already authorized migration/source-recovery/
   reindex/cutover packet begin. Do not partially install Qdrant or apply a
   migration before this point.

## External effects and observation

Phases 2-8 change only the backup scheduler/files, owner-only database secret,
public CA/operator, Docker image cache, and disposable restore resources on the
approved server. The source database receives read traffic for the backup and
inventory; the restore targets only loopback disposable PostgreSQL. No source
write is expected. Application traffic need not pause for backup/restore, but
read I/O may increase; observe database load and abort on material impact.

The later guarded migration window has its separately documented writer pause
and rollback boundary. This packet does not broaden that authorization.

## Rollback state

Before migrations, rollback means: stop the packet; complete zero-residue
restore cleanup; remove the unaccepted URI/CA/operator only if their validation
failed; restore saved path metadata where safe; retain hashes/logs and every
historical backup file. Keep the known fail-open cron entry suspended unless an
owner explicitly chooses to reinstate the broken behavior from the saved
crontab. No source database rollback is needed because this packet performs no
source write.

If the fresh archive passed but a later gate failed, retain it owner-only as
rollback evidence and do not activate Qdrant. If any migration has begun, use
the separate guarded migration rollback and blue/green procedures; do not use
this pre-migration cleanup packet as a substitute.

# Verification

The packet joins current host facts (zero usable retained backups, `0775` paths,
PG18 `/usr/bin` wrappers, installed PG17 clients), the accepted fail-closed
operator, four matching registry resolutions, the image-pin P1 correction, and
zero-finding rereviews. Operator and CA SHA-256 values were recomputed from the
current local files.

No packet command was executed. Supabase migrations remain unchanged, the
approved server retains its old files/services/cron/modes, no image or layer was
pulled, and no restore resource exists.

# Risks / Follow-ups

The permanent Session pooler URI is the exact external blocker. Browser login
does not satisfy it, and password rotation is intentionally not implied. Once
the URI is supplied securely, revalidate every mutable observation immediately
before the first server change.

Production off-host S3 remains deferred under `mc2-jz6y0.13.6`. This staging
packet intentionally uses local disk and an isolated local restore target; it
must not be reported as production disaster recovery.
