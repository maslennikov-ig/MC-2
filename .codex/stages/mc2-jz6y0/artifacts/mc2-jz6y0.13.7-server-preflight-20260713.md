---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-jz6y0.13.7-server-preflight-20260713
stage_id: mc2-jz6y0
agent_type: deploy_specialist
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: remote backup ownership, installed binaries, disk capacity, cron, secret paths, and restore isolation are high-risk activation boundaries
repo: mc2
branch: codex/self-hosted-qdrant-platform
base_branch: codex/self-hosted-qdrant-platform
base_commit: 71a4b14d433e19729fdb1af646fecd88a80e7827
worktree: /home/me/code/mc2/.worktrees/self-hosted-qdrant-platform
write_zone:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-preflight-20260713.md
selected_docs:
  - docs/operations/qdrant-self-hosted.md
  - docs/operations/document-evidence.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-rereview.md
selected_skills:
  - senior-devops
  - superpowers:verification-before-completion
selected_agents:
  - deploy_specialist
catalog_candidates:
  - none - installed assets cover this bounded read-only preflight
status: blocked
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: read-only SSH commands created no server files, containers, volumes, networks, ports, dumps, database sessions, or local temporary files
risk_level: high
docs_impact: ops-deploy
docs_reviewed: needs-update
docs_review_notes: current host truth supersedes the handoff implication that one substantive historical dump remains retained; the server now has zero usable retained database backups
verification:
  - strict-host-key BatchMode SSH access to the approved megacampus-prod alias returned info511.fvds.ru and the expected claude-deploy identity
  - read-only sudo metadata inventory completed without reading any environment, DSN, token, key, or certificate content on the server
  - PostgreSQL client versions, filesystem capacity, cron metadata, backup metadata, script checksum, expected paths, and temporary residue were independently re-read on 2026-07-13
  - local certificate metadata and checksum were verified without copying it to the server
changed_files:
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-preflight-20260713.md
explicit_defers:
  - do not run the proposed preparation commands until the orchestrator begins the authorized mutation window and captures rollback evidence
  - a current verify-full Session pooler URL is still required; no credential content was read in this stream
  - an approved pinned PostgreSQL 17 restore target is still required because the host has client tools only and no retained PostgreSQL image
  - database size must be measured through the authorized connection before declaring the available local disk sufficient
---

# Summary

## Verdict

**NO-GO for the database backup gate.** SSH access and the required dump client
are available, but the reviewed operator and CA are not installed, both backup
directories still violate the accepted mode contract, the legacy fail-open cron
job is still active, and the server now retains **zero usable database
backups**. A separate compatible isolated restore target is also not present.

This was a strictly read-only audit. It did not change files, modes, owners,
cron, systemd, services, credentials, Docker, PostgreSQL, Supabase, Qdrant, or
any application runtime.

## Current host truth

The approved SSH alias `megacampus-prod` resolves to
`claude-deploy@95.81.98.230`; the remote identity proof returned
`info511.fvds.ru`, UID/GID `1000:1000`, and noninteractive sudo availability.
The host time during the proof was `2026-07-13T08:54:24+02:00`. Strict known-host
checking and BatchMode both succeeded.

| Item                                         | Read-only result                                                                                                                        | Implication                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/opt/megacampus`                            | directory, `claude-deploy:claude-deploy`, `0755`                                                                                        | acceptable parent                                                           |
| `/opt/megacampus/backups`                    | directory, `claude-deploy:claude-deploy`, `0775`                                                                                        | hard stop; group-writable                                                   |
| `/opt/megacampus/backups/supabase`           | directory, `claude-deploy:claude-deploy`, `0775`                                                                                        | hard stop; reviewed operator requires `0700`                                |
| `/opt/megacampus/secrets`                    | directory, `root:root`, `0755`                                                                                                          | safe parent, but individual operator inputs must belong to the runtime user |
| `/opt/megacampus/secrets/prod-ca-2021.crt`   | absent                                                                                                                                  | CA installation required                                                    |
| `/opt/megacampus/secrets/supabase_db_url`    | content deliberately not inspected                                                                                                      | current owner-supplied URL still required by accepted evidence              |
| `/opt/megacampus/scripts/backup_supabase.sh` | regular, `claude-deploy:claude-deploy`, `0775`, 1,163 bytes, SHA-256 `3ad6a9be7a030b3959190fa3eafbba02faf8a7d6a82c654aed162ab6dc9085a4` | legacy fail-open implementation remains installed                           |
| reviewed operator target                     | `/opt/megacampus/deploy/postgres/backup-supabase.sh` absent                                                                             | reviewed implementation is not installed                                    |
| tracked reviewed operator                    | local SHA-256 `4b749f56dbbd1c19bc7a5b053165cd5b58613ff684dd4fa7e3e2950b89f2a52a`                                                        | exact source hash for installation verification                             |

The downloaded local CA is available at
`/mnt/c/Users/masle/Downloads/prod-ca-2021.crt`, 1,367 bytes, SHA-256
`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
Its subject and issuer are `Supabase Root 2021 CA`, its certificate SHA-256
fingerprint is
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`,
and it is valid from 2021-04-28 through 2031-04-26. The Windows-mounted source
reports mode `0777`; installation must normalize ownership and mode rather than
copying that metadata.

## PostgreSQL compatibility and capacity

`/usr/bin/pg_dump` and `/usr/bin/pg_restore` both resolve through
`/usr/share/postgresql-common/pg_wrapper` to PostgreSQL `18.1`. Explicit client
binaries for `17.7` and `18.1` are installed. The reviewed operator's exact
`/usr/bin/pg_dump` client is newer than the Supabase PostgreSQL `17.6` server
and is compatible with that dump direction. No `postgres`, `initdb`, or
`pg_ctl` server binaries exist for either 17 or 18, and Docker contains no
PostgreSQL image, restore container, volume, or network. Therefore archive
creation is locally supported but the mandatory isolated database restore is
not yet provisioned.

`/opt/megacampus` and its backup paths share the root filesystem. It has
158,435,553,280 bytes total, 106,854,436,864 bytes available to the unprivileged
operator (about 99.5 GiB), and 8,934,362 of 9,600,000 inodes available. This is
ample operational headroom only after the live database size and a conservative
dump-plus-restore multiplier are measured; capacity is not proven from disk
free space alone.

## Schedule, retention, and residue

The `claude-deploy` crontab still contains exactly:

```cron
30 0 * * * /opt/megacampus/scripts/backup_supabase.sh >> /opt/megacampus/logs/backup_supabase.log 2>&1
```

It runs daily at 00:30 server time (CEST during this audit). No MegaCampus or
Supabase systemd backup timer exists. The only matching system timer is the
unrelated operating-system `dpkg-db-backup.timer`.

The Supabase backup directory contains exactly 12 regular files, all owned by
`claude-deploy:claude-deploy`, mode `0644`, and exactly 20 bytes. Their UTC
mtimes span `2026-06-28T22:30:34Z` through `2026-07-12T22:30:14Z`. These are the
known fail-open gzip streams, not archives. The previously observed substantive
2026-06-27 dump is no longer retained. Current totals are therefore:

- retained scheduled files: 12;
- valid or substantive retained backups: 0;
- reviewed `supabase-*.dump` files: 0;
- matching dot-temporary, partial, list, or stderr residue: 0.

The still-enabled legacy job can create another invalid file and continue its
legacy retention behavior at the next 00:30 run. It must be suspended as the
first mutation in the controlled window, with the original crontab preserved
for rollback.

## Proposed commands — not executed

The following is the exact preparation packet supported by current host truth.
It is documentation only in this stream. Run it from the integration worktree
only inside the authorized mutation window, capture every exit status, and stop
on any hash, owner, mode, or path mismatch.

First preserve and suspend the single known legacy cron entry:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes megacampus-prod '
set -Eeuo pipefail
readonly legacy="30 0 * * * /opt/megacampus/scripts/backup_supabase.sh >> /opt/megacampus/logs/backup_supabase.log 2>&1"
tmp=$(/usr/bin/mktemp)
trap '\''/usr/bin/rm -f -- "$tmp"'\'' EXIT
/usr/bin/crontab -l >"$tmp"
[[ $(/usr/bin/grep -Fxc -- "$legacy" "$tmp") -eq 1 ]]
sudo /usr/bin/install -o root -g root -m 0600 -- "$tmp" /root/mc2-supabase-crontab-pre-q12-20260713
/usr/bin/grep -Fvx -- "$legacy" "$tmp" | /usr/bin/crontab -
! /usr/bin/crontab -l | /usr/bin/grep -Fqx -- "$legacy"
'
```

Verify the two local public inputs, then upload only those non-secret files:

```bash
test "$(sha256sum deploy/postgres/backup-supabase.sh | cut -d' ' -f1)" = \
  4b749f56dbbd1c19bc7a5b053165cd5b58613ff684dd4fa7e3e2950b89f2a52a
test "$(sha256sum /mnt/c/Users/masle/Downloads/prod-ca-2021.crt | cut -d' ' -f1)" = \
  700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7
scp -- deploy/postgres/backup-supabase.sh \
  /mnt/c/Users/masle/Downloads/prod-ca-2021.crt \
  megacampus-prod:/tmp/
```

Install the reviewed operator and CA, normalize the parent modes, and create an
empty owner-only URL input without placing a credential in command arguments:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes megacampus-prod '
set -Eeuo pipefail
sudo /usr/bin/chown claude-deploy:claude-deploy /opt/megacampus/backups /opt/megacampus/backups/supabase /opt/megacampus/scripts
sudo /usr/bin/chmod 0755 /opt/megacampus/backups /opt/megacampus/scripts
sudo /usr/bin/chmod 0700 /opt/megacampus/backups/supabase
sudo /usr/bin/install -o claude-deploy -g claude-deploy -m 0700 -- \
  /tmp/backup-supabase.sh /opt/megacampus/scripts/backup_supabase.sh
sudo /usr/bin/install -o claude-deploy -g claude-deploy -m 0644 -- \
  /tmp/prod-ca-2021.crt /opt/megacampus/secrets/prod-ca-2021.crt
sudo /usr/bin/install -o claude-deploy -g claude-deploy -m 0600 -- \
  /dev/null /opt/megacampus/secrets/supabase_db_url
sudo /usr/bin/rm -f -- /tmp/backup-supabase.sh /tmp/prod-ca-2021.crt
test "$(sudo sha256sum /opt/megacampus/scripts/backup_supabase.sh | cut -d' ' -f1)" = \
  4b749f56dbbd1c19bc7a5b053165cd5b58613ff684dd4fa7e3e2950b89f2a52a
test "$(sudo sha256sum /opt/megacampus/secrets/prod-ca-2021.crt | cut -d' ' -f1)" = \
  700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7
sudo /usr/bin/stat -c "%U:%G %a %F %n" \
  /opt/megacampus/backups /opt/megacampus/backups/supabase \
  /opt/megacampus/scripts/backup_supabase.sh \
  /opt/megacampus/secrets/prod-ca-2021.crt \
  /opt/megacampus/secrets/supabase_db_url
'
```

Populate the URL file through an interactive standard-input channel, not a
command argument or artifact. Paste exactly one current Session pooler URL with
the exact query parameters `sslmode=verify-full` and
`sslrootcert=/opt/megacampus/secrets/prod-ca-2021.crt`, then send EOF:

```bash
ssh -T megacampus-prod \
  "sudo -u claude-deploy /usr/bin/bash -c 'umask 077; /usr/bin/cat > /opt/megacampus/secrets/supabase_db_url'"
```

After a separate redacted read-only connection proof and database-size check,
the exact backup invocation is:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes megacampus-prod \
  'sudo -u claude-deploy /opt/megacampus/scripts/backup_supabase.sh'
```

Do not restore yet. The host lacks a PostgreSQL server and an approved pinned
PostgreSQL 17 image. A first-party image digest and the isolated disposable
target/cleanup packet must be approved before any `docker pull`, container
creation, archive restore, or database query. Do not substitute the accepted
PostgreSQL 16.14 test image for a PostgreSQL 17.6 source archive.

# Verification

Fresh evidence was gathered with strict-host-key, BatchMode SSH; remote Python
used `lstat`, `statvfs`, bounded filename matching, executable `--version`, and
SHA-256 only. Cron output was limited to the exact backup-script match with
credential-shaped assignments redacted before transmission. No remote
credential or environment file was opened. A second bounded inventory confirmed
the exact 12-file Supabase set and zero certificate files below the relevant
server tree. A final Docker/client-only probe confirmed that no PostgreSQL
server binary, image, restore container, volume, or network is already present.

The artifact itself must pass:

```bash
python3 scripts/orchestration/validate_artifact.py \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-preflight-20260713.md
pnpm exec prettier --check \
  .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13.7-server-preflight-20260713.md
```

# Risks / Follow-ups

1. The current URL remains an external secret gate. Supabase CLI authentication
   alone does not prove that a usable Session pooler password or complete
   verify-full URL has been recovered.
2. The server has no usable retained database backup. Migration, Qdrant
   activation, source recovery, or reindex must not begin before a new archive
   passes both the reviewed operator and an isolated PostgreSQL 17 restore.
3. The next legacy cron run is scheduled for 00:30 CEST. Suspend it first in the
   mutation window; preserve the root-owned crontab snapshot and restore it only
   if rollback intentionally reinstalls the old behavior.
4. Free disk is known, but database size is not. Require enough space for the
   custom archive, the isolated restored cluster, Docker layers, and bounded
   safety headroom before pulling or starting anything.
5. Promote the current zero-usable-backup truth to Beads `.13.7`, the stage
   handoff, and both operations runbooks. The earlier wording about a
   substantive 2026-06-27 dump is now historical rather than retained recovery
   evidence.
6. Production S3 remains deferred under `.13.6`; this local-disk staging gate
   neither requires nor authorizes external object storage.
