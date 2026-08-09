# Off-host backup of uploaded source documents

The files under `/opt/megacampus/data/uploads` on `megacampus-prod` are the only
irreplaceable data the product holds. Qdrant vectors and generated courses are
rebuilt from them; nothing rebuilds them. `file_catalog.storage_path` is a
relative filesystem path, not a Supabase Storage key, so the bytes live on one
disk and nowhere else.

Until 2026-08-08 there was no second copy anywhere. There is now.

## Shape

`helixa-new` (82.26.152.8) **pulls** from `megacampus-prod` (95.81.98.230) once a
day and keeps dated snapshots.

Pull rather than push, deliberately: production holds no credential to the
backup host, so a compromised or mistaken production box cannot reach in and
damage the copy. The reverse arrangement would let one bad `rm` propagate.

Neither host has `rsync` — checked, not assumed — so the transfer is `tar` over
ssh. No package was installed on either machine.

## The key can do exactly one thing

The source side is a single line in `claude-deploy`'s `authorized_keys`:

```
restrict,command="/usr/bin/tar --numeric-owner -C /opt/megacampus/data -cf - uploads" ssh-ed25519 AAAA… megacampus-uploads-backup@helixa-new
```

`restrict` plus a forced command means the key cannot open a shell, forward a
port, or run anything else. Verified by asking it to run `whoami; rm -rf /`: it
returned the tar stream and nothing else happened.

The private half lives only at `/root/.ssh/megacampus-uploads-backup` on
`helixa-new`, mode 600. It is not in this repository and must never be.

The whole uploads tree is world-readable (`o+rx` all the way down), so the pull
needs no `sudo` on production.

## Layout on helixa-new

```
/opt/backups/megacampus-uploads/
  latest -> snapshots/<UTC timestamp>
  snapshots/<UTC timestamp>/
    uploads.tar.zst    tar of `uploads/…`, paths identical to file_catalog.storage_path
    SHA256SUMS         checksum of the archive
    MANIFEST.json      taken_at, source, entry/file counts, size, sha256
```

Archive paths match `file_catalog.storage_path` byte for byte, so a restore is a
drop-in — no path translation, no guessing.

## Commands

Installed as `/usr/local/sbin/megacampus-uploads-backup` on `helixa-new`.

```bash
megacampus-uploads-backup run                       # pull a new snapshot (the timer does this)
megacampus-uploads-backup list                      # snapshots and their file counts
megacampus-uploads-backup verify [snapshot]         # re-check the stored archive against its checksum
megacampus-uploads-backup restore-one <path> <dir>  # extract one file and print its sha256
```

Schedule: `megacampus-uploads-backup.timer`, daily at 03:20 UTC with up to 20
minutes of jitter, `Persistent=true` so a host that was off still catches up.

## Two guards that matter

**Shrink floor.** If the source suddenly holds fewer than 90% of the previous
entry count, the run fails instead of recording it. A backup that faithfully
copies an accidental deletion is not a backup. Override deliberately with
`SHRINK_FLOOR_PCT=0` when a deletion really was intended.

**Disk floor.** The run refuses to start with less than 5 GB free. A backup that
fills the disk takes the host down with it.

Snapshots are full copies, not incrementals — 195 MB each, 14 kept. At the
current corpus that is under 3 GB against 50 GB free. **When the corpus outgrows
this**, the answer is `rsync` with `--link-dest` hardlinks, which needs `rsync`
installed on both hosts. The script does not pretend to scale past that.

## Proof, not assumption

Run on 2026-08-08, and the reason this is a backup rather than a belief:

- pulled 117 files / 190 entries, 204,689,467 bytes, in 17 seconds;
- `sha256sum -c` on the stored archive: OK;
- extracted `uploads/9b98a7d5-…/3ec1e8fe-…/11c6b391-….docx` and hashed it:
  `22c0a1cb881fd54556bb040e2c8137706e4a69d9cb6e757fb046b3bc8febfec3`;
- that is exactly `file_catalog.hash` for the same row.

Re-prove it after any change with `verify` plus one `restore-one` compared
against the database.

## What this does not cover

`helixa-new` is a single VPS whose own backups are server-local; its runbook
records that total VPS or provider loss is an accepted risk. So the uploads now
survive one machine dying, an operator mistake, or a bad deploy — they do not
survive losing both providers. That is a real improvement over one copy, and it
is not disaster recovery. Do not describe it as such.

The two `test-embedding-validation.txt` rows in `file_catalog` sit outside the
uploads root and are test fixtures, not user data; they are not backed up.

## Known gap in the source itself

126 distinct `storage_path` values under `uploads/` exist in `file_catalog`, but
only 117 files exist on disk. **Nine documents have already lost their bytes**
and no backup can bring them back. `.codex/handoff.md` recorded six; the
measured number on 2026-08-08 is nine.
