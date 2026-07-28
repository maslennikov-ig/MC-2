# Q12 R8 Server Custody Rehearsal — Driver

Scripts the **orchestrator** executes on `megacampus-prod` to rehearse the full-path
`run_live` cutover window as `claude-deploy` (uid 1000) on the REAL `/opt` run root
against a disposable seeded `postgres:17.10-bookworm`. **Workers/agents never touch prod**
— they only run the local `--dry-run` / LOCAL_TEST paths against the fusion-harness
disposable container and a `/tmp` scratch trust root.

These are NEW driver files only. They do NOT modify the frozen server batch
(`q12-database-barrier.sh` `f4f90361`, `q12-writer-resume.py`, `source-recovery-run.sh`,
`q12-lifecycle-core.py`, `q12-live-cutover.sh`); they orchestrate them.

## Deliverables

| Script                   | Blueprint | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rehearsal-setup.py`     | (i)       | Stands up the disposable `postgres:17.10` loopback container, seeds the full Supabase inventory (47 public / 22 auth / 5 storage / 8 cron + net + `supabase_migrations`) **and** the two cron GUCs `cron.database_name` / `cron.launch_active_jobs` (R8-B-2-i fidelity, structural-hash-neutral), computes the **REAL** expected-post-migration catalog from the seeded+migrated container (R4 preflight, never synthesized), and generates the self-signed pooler-identity proxy cert/key (CA-only test mode). |
| `rehearsal-ns-launch.sh` | (ii)      | The ratified trust bridge: `sudo unshare -m /bin/sh -c '<fakehosts /etc/hosts bind>; mount --bind /opt/…/q12/<id> <trust>/backups/q12/<id>; exec setpriv --reuid=1000 --regid=1000 --init-groups <run_live>'`. `<trust>` is a real `mkdtemp /tmp/mc2-q12-barrier-XXXX` owned uid-1000 0700. One physical `/opt` run root, dual-viewed (#15 same-inode). umount-before-rmdir trap.                                                                                                                               |
| `rehearsal-resume.py`    | (iii)/(4) | Invokes the REAL `source-recovery-run.sh` + `q12-writer-resume.py` under `SOURCE_RECOVERY_LOCAL_TEST=1` with an OVERRIDDEN docker/compose/systemctl SIMULATING the writer fleet, for the resume leg (validates the REAL v2 receipt) and the recovery-epoch cleanup leg (validates the `cutover-recovery-1` journal).                                                                                                                                                                                            |
| `rehearsal-verify.py`    | (iv)      | Asserts the outcome against the run root: journal row-count 81 + heads, quiesce-window marker 0400, the exact 10-key v2 receipt bound in the terminal `accepted` row, `database-barrier-baseline.json` byte-intact at 0400 (the #16 invariant), zero guard residue, and (with `--check-teardown`) zero leftover trust-root binds / rehearsal containers.                                                                                                                                                        |
| `rehearsal-lib.sh`       | —         | Shared bash: secret-safe logging, UUIDv4 run-id mint/validation (barrier `:72`), the uid-1000 0700 trust-root maker, and the umount-before-rmdir teardown trap.                                                                                                                                                                                                                                                                                                                                                 |

## Trust bridge (ratified — private mount namespace, variant (c))

NOT system-wide binds (a system-wide `/etc/hosts` pooler-redirect would hit PROD services —
forbidden), NOT bwrap. The `/etc/hosts` override (`pooler-host → 127.0.0.1`) and the
`/opt → /tmp` trust bind are **private to the namespace**; both auto-unmount on ns exit
(the trap is a belt). `run_claim` keeps the `/opt` custody argv verbatim; the barrier
child's own argv resolves through the `/tmp` trust view — one physical dir. The barrier
child runs as `claude-deploy` uid 1000 (`run_claim` `ProductionExecutor`). The
pooler-identity TLS proxy listens on `127.0.0.1:5432` INSIDE the ns, presents the frozen
pooler identity (`aws-1-us-east-2.pooler.supabase.com:5432`, user
`postgres.diqooqbuchsliypgwksu`; barrier `:1921` is NOT test-mode-gated), and bridges to the
disposable container. Test mode relaxes ONLY the CA (self-signed accepted); NEVER a
DB-command relaxation; the db-url file is the verbatim pooler URL.

**Post-run `/tmp` cleanup (P3).** On the privileged path `rehearsal-ns-launch.sh` `exec`s into
`run_live` (so it inherits the FD-8/9 custody), which means its EXIT umount-before-rmdir trap does
NOT fire. The private-namespace `/etc/hosts` + `/opt → /tmp` binds still auto-unmount on ns exit
(no `/opt` or `/etc/hosts` leak — the whole point of variant (c)), but the empty
`/tmp/mc2-q12-barrier-XXXX` scaffolding dir is left behind. The orchestrator's server run therefore
does one explicit post-window step: `rm -rf /tmp/mc2-q12-barrier-*` (uid-1000-owned); the
`rehearsal-verify.py --check-teardown` gate flags any leftover so it is not silently skipped.

## Local (worker) vs server (orchestrator)

| Leg                               | Local `--dry-run` / LOCAL_TEST proves                                                                                     | Only the orchestrator's server run exercises                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| setup (i)                         | disposable container seed + REAL catalog + cron GUCs + proxy cert generate; clean teardown                                | (same, but feeding the in-ns proxy of a real `/opt` run)                                                                                                                                                                                |
| ns-launch (ii)                    | run-id gate, uid-1000 0700 trust root + fakehosts scaffolding, the exact `sudo unshare -m … setpriv` command construction | `sudo unshare -m` + `mount --bind` over the REAL `/opt` run root + `setpriv` → real `run_live` (root, prod)                                                                                                                             |
| resume + recovery-epoch (iii)/(4) | fleet-sim binaries + self-test; the `source-recovery-run.sh` invocation + `SOURCE_RECOVERY_LOCAL_TEST` env assembly       | the live `source-recovery-run.sh` against the REAL run-root resume-authority chain (also covered by `qdrant-source-recovery-runtime.test.ts`); the REAL prod fleet bounce is an IN-WINDOW step (C2/C8), NEVER rehearsed on prod writers |
| verify (iv)                       | ALL outcome file-assertions against a captured/fusion run root (no docker)                                                | `--check-teardown` against the live server mounts/containers                                                                                                                                                                            |

`unshare -m` and `sudo` require root, so the privileged ns-launch is orchestrator/server-only.
The fusion full-window harness (`bwrap --unshare-net`) is the local end-to-end oracle for the
run_live window; `rehearsal-verify.py` runs identically against its output and the server's.

## Recovery-epoch minting (pinned)

The controller fusion cannot mint `cutover-recovery-1` (found-defect #19:
`orchestrate_post_activate_cleanup` is cutover-only), so the +2 recovery-epoch cleanup is
W-side server custody. The minting step and the resulting `barrier.cleanup` journal graph
(`[cutover,intent] [cutover-recovery-1,recovery_reacquired] [cutover-recovery-1,capability_claimed]
[cutover-recovery-1,capability_completed] [cutover-recovery-1,accepted]`) are pinned in
`rehearsal-resume.py`'s module docstring against `qdrant-source-recovery-runtime.test.ts`
(`databaseRecoveryEpoch` path, `:2272-2333` / `:3372-3378`); `q12-writer-resume.py`
(`:1529-1641`) validates it before resuming writers.
