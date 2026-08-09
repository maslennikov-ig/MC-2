# Off-host Qdrant snapshots

`helixa-new` pulls one already verified production Qdrant snapshot each day. Production never gets
a credential for the backup host. The backup host gets one root-owned SSH key that can only export
the latest snapshot or publish a success timestamp; it gets no Qdrant API key.

This replaces the earlier S3 transport assumption after the owner chose the existing second host.
It preserves the original checksum, retention, exact-version restore, alerting, and rollback gates.
This is not full disaster recovery: losing both VPS providers can still lose this copy.

## Load and storage bounds

- Pull: once daily at 04:20 in the backup host's local timezone, after the 03:20 uploads backup.
- Jitter: up to 20 minutes; `Persistent=true` catches up after downtime.
- Credential staging: systemd `LoadCredential` exposes only the dedicated key to each oneshot;
  `/root` remains hidden from the service.
- Scheduling: `Nice=15`, idle I/O class, CPU/IO weight 10, and a 25% one-core CPU quota.
- Free-space floor: 10 GiB after the incoming snapshot. Its exact manifest size is reserved before
  transfer and the floor is checked again before atomic promotion.
- Retention: no more than 14 daily generations and no generation older than 14 days.
- Restore: monthly, exact Qdrant 1.18.2 image digest, 0.5 CPU, 1.5 GiB memory, 256 processes,
  and a loopback-only port. The temporary container is removed after the probe.

The measured production snapshot on 2026-08-09 is 142,585,344 bytes. Fourteen copies consume about
1.86 GiB, plus the pinned restore image, against 48 GiB currently free on `helixa-new`.

## Stored layout

```text
/opt/backups/megacampus-qdrant/
  latest -> snapshots/<UTC timestamp>
  snapshots/<UTC timestamp>/
    latest-manifest.json
    <physical-collection>-<snapshot-id>.snapshot
    OFFHOST.json
  restore-evidence/<UTC timestamp>.json
```

A generation remains hidden under `.incoming-*` until all of these match:

- manifest schema and successful local source mode;
- logical alias and physical collection names;
- exact server version 1.18.2;
- source age no greater than eight hours;
- snapshot byte length and SHA-256.

Only then is the directory renamed and `latest` replaced atomically. Cleanup only accepts owned,
timestamp-named direct children of `snapshots/`; an unfamiliar directory is left untouched.

## Restricted source credential

Generate a dedicated key on `helixa-new`; never put its private half in this repository:

```bash
sudo ssh-keygen -t ed25519 -N '' \
  -C megacampus-qdrant-offhost-backup@helixa-new \
  -f /root/.ssh/megacampus-qdrant-offhost-backup
sudo chmod 600 /root/.ssh/megacampus-qdrant-offhost-backup

# Copy only the already trusted production entry into a dedicated file. Do not
# replace this with ssh-keyscan or accept-new during an unattended backup.
sudo sh -c 'ssh-keygen -F 95.81.98.230 -f /root/.ssh/known_hosts \
  | sed "/^#/d" > /root/.ssh/megacampus-qdrant-offhost-known_hosts'
sudo test -s /root/.ssh/megacampus-qdrant-offhost-known_hosts
sudo chmod 600 /root/.ssh/megacampus-qdrant-offhost-known_hosts
```

Install `source-command.sh` outside the deployment tree so a normal application deploy cannot
replace the root-owned forced command. Add the public half to the `claude-deploy` account as one
line, replacing `<public-key>`:

```bash
sudo install -o root -g root -m 0755 \
  deploy/qdrant-offhost-backup/source-command.sh \
  /usr/local/sbin/megacampus-qdrant-offhost-source
```

```text
restrict,command="/usr/local/sbin/megacampus-qdrant-offhost-source" <public-key>
```

The wrapper validates `SSH_ORIGINAL_COMMAND` before its fixed sudo transition. The allowed commands
are `metadata`, `export <bytes> <sha256>`, `publish-backup <epoch> <bytes> 14`, and
`publish-restore <epoch> <points>`. It rejects all other commands. The size/digest preflight is
bound to the export, which runs under one nonblocking lock, nice level 15, and idle I/O scheduling.
Export reads the immutable snapshot directly from the Qdrant Docker volume and checks Qdrant's
checksum sidecar against the manifest; it never reads an API credential.

## Installation on helixa-new

Install explicit files, preserving unrelated host state:

```bash
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -o root -g root -m 0700 \
  deploy/qdrant-offhost-backup/megacampus-qdrant-offhost-backup.sh \
  /usr/local/sbin/megacampus-qdrant-offhost-backup
sudo install -o root -g root -m 0700 \
  deploy/qdrant-offhost-backup/qdrant-offhost-validate.py \
  /usr/local/libexec/megacampus-qdrant-offhost-validate
sudo install -o root -g root -m 0644 \
  deploy/qdrant-offhost-backup/megacampus-qdrant-offhost-backup.service \
  deploy/qdrant-offhost-backup/megacampus-qdrant-offhost-backup.timer \
  deploy/qdrant-offhost-backup/megacampus-qdrant-offhost-restore.service \
  deploy/qdrant-offhost-backup/megacampus-qdrant-offhost-restore.timer \
  /etc/systemd/system/
sudo install -d -o root -g root -m 0700 /opt/backups/megacampus-qdrant
sudo systemctl daemon-reload
```

Verify before enabling:

```bash
sudo systemctl start megacampus-qdrant-offhost-backup.service
sudo megacampus-qdrant-offhost-backup verify
sudo systemctl start megacampus-qdrant-offhost-restore.service
sudo systemctl enable --now \
  megacampus-qdrant-offhost-backup.timer \
  megacampus-qdrant-offhost-restore.timer
```

Useful checks:

```bash
sudo megacampus-qdrant-offhost-backup list
sudo megacampus-qdrant-offhost-backup verify
sudo systemctl list-timers --all | grep megacampus-qdrant-offhost
sudo journalctl -u megacampus-qdrant-offhost-backup.service -n 100 --no-pager
```

## Alerts

After a verified backup or restore, the restricted key writes a success-only textfile metric into
production's existing node exporter directory. Prometheus routes these through the existing
Alertmanager Telegram receiver:

The directory is root-owned, group-writable, setgid, and sticky (`root:megacampus-metrics`, mode
`3775`). Application writers retain their own metric files, while the off-host evidence remains
root-owned so an application process cannot unlink or replace it.

- `QdrantOffHostSnapshotStale`: no verified off-host copy for 36 hours, or metric absent;
- `QdrantOffHostRestoreDrillStale`: no exact-version restore for 35 days, or metric absent.

The source-local `QdrantSnapshotStale` and `QdrantRestoreDrillStale` remain separate. A successful
local snapshot cannot silence the off-host alert.

## Rollback

Rollback is intentionally non-destructive. First stop new work but preserve verified generations:

```bash
sudo systemctl disable --now \
  megacampus-qdrant-offhost-backup.timer \
  megacampus-qdrant-offhost-restore.timer
sudo systemctl stop \
  megacampus-qdrant-offhost-backup.service \
  megacampus-qdrant-offhost-restore.service
```

Then remove only the authorized-key line carrying the
`megacampus-qdrant-offhost-backup@helixa-new` comment from production. The private key, units, and
scripts may be removed from `helixa-new` after the data owner confirms the stored generations are no
longer needed. Do not delete `/opt/backups/megacampus-qdrant` as part of routine rollback.

Removing the alert rules is a separate reviewed monitoring configuration change. Otherwise stale
metrics will correctly alert that the off-host protection has been disabled.
