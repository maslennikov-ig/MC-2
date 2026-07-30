# Q12 window execution identity and privilege seam — design

Date: 2026-07-26. Status: proposed (owner authorised the full fix, not a bounded patch).
Blocker beads: `mc2-1by33` (privilege seam), plus the C9 artifact gap recorded below.
Supersedes the privilege assumptions in `.codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0-c0-window-operator-procedure.md`
§C ("which user runs what"), which describes the retired 5-invocation manual route.

## 1. Problem

The Task-9 live controller (`deploy/qdrant/q12-lifecycle-core.py`, `run_live`) drives the whole
cutover window in ONE process and executes the 20 frozen commands itself. Three independent
requirements collide, and the window cannot open until they are reconciled:

1. **The controller must be uid/gid 1000.** Every artifact validator compares ownership against the
   hard constant 1000 (`:452-453`, `:517-518`, `:590-591`, `:3728-3733`) and nothing chowns, so a
   root-run controller would be rejected by its own gates.
2. **`deploy/qdrant/source-recovery-run.sh` refuses non-root** in production (`:115`
   `[[ $EUID -eq 0 ]] || fail 'production source recovery must run as root'`). Four frozen commands
   route through it: `writers.quiesce` (C2), `source.forward` (C5), `writers.resume.forward` (C9),
   `writers.resume.rollback` (rollback).
3. **`ProductionExecutor.execute` passes no descriptors** (`:1247-1256`, `close_fds=True`, no
   `pass_fds`), while the wrapper's forward path requires an inherited, still-held descriptor on the
   canonical window lock (`:388-411`, reached from `:1204-1205`).

Verified empirically on `megacampus-prod` (probe failed closed, nothing mutated): running the exact
frozen C2 argv with the frozen env as `claude-deploy` exits 1 at the EUID gate before touching a
single writer.

## 2. Evidence that reverses the naive fix

**Root is not merely unnecessary for the writer operations — it is a hard blocker for C2.**
`q12-writer-resume.py`'s quiesce path always runs `probe_closed_inbound`, which creates its scratch
with `tempfile.mkdtemp(dir=run_root)` and then requires that directory to be owned by the uid/gid
passed as arguments — 1000/1000 (`:632-640`), with the same assertion on the probe output files
(`Opened(..., 0o600)` → `st_uid == uid`, `:179`). Run as root, the scratch is uid 0 and the child
fails with "closed inbound probe directory identity is invalid". So `writers.quiesce` can only
complete as uid 1000.

**The root gate is a leftover of the retired systemd design.** Production forces
`writer_backend='compose'` (`source-recovery-run.sh:132`) and the systemd branch fails closed unless
`local_test` (`:139`), so no `systemctl` call is reachable in production. The sibling frozen child
`q12-database-barrier.sh`, executed through the same seam, is written to run AS the controller
(`$(id -u)`/`$(id -g)` throughout).

**Exactly one operation genuinely needs root: `source.forward`.** It must read operator state owned
by uid 1001 with modes it pins itself — `state/` and `progress/` 1001:1001 0700, `manifest.json`
0400, `journal.json` 0600, `plan-input.json` 0600 (`:367-372`, `:470-484`, `:493-497`), re-opened at
`:563-586` and re-read by the tsx acceptance emit at `:1390`. Host check: `/var/lib/megacampus-source-recovery`
is `root:root` 0755, `state/` is `megacampus`(1001) 0700, and `state/progress` is not even statable
by uid 1000 (`Permission denied`). Reading another non-root user's 0400 file inside a 0700 directory
requires root; the alternative (relaxing modes/groups on the 1001-owned tree) would weaken a real
isolation boundary and force edits to the wrapper's exact-mode validators.

**The lock lease does not require the child to inherit the holding descriptor.**
`validate_external_quiesce_lease` (`:388-411`) checks that the named descriptor resolves to the
canonical lock by path and dev/ino, that the lock file is `1000:1000` mode 0600, and — for liveness —
closes the descriptor inside a subshell and requires a FRESH `flock -n` to FAIL. That fresh lock
fails because the controller holds `LOCK_EX` on its own descriptor for the whole run
(`q12-lifecycle-core.py:7994-7999` supervisor, `:8041-8046` live/recover; `LOCK_UN` appears only on
two short-lived probe descriptors, never on fd 9). Therefore any read-only descriptor on the same
inode satisfies the identity part, and the holding proof comes from the controller.

Corollary: **a launcher must never try to acquire that lock.** A second open-file-description taking
`LOCK_EX` must fail against the controller's lock — a launcher that "acquires the lock itself" is
self-contradictory and would fail closed.

**Non-issues, checked so they are not carried as risk.** `/opt/megacampus/.env.production` is
`claude-deploy` 0600, so the forward path reads it fine as uid 1000. `HOME=/root` in the frozen env
is harmless at uid 1000: `docker` prints "Error loading config file … permission denied" on stderr
and still exits 0 with `default`, and the wrapper captures stdout only (`:160`, `:163`). No manifest
env change is needed for either.

## 3. A separate, non-privilege blocker on C9

`writer-recovery-state-<run-id>.json` is required by `writers.resume.forward`
(`q12-writer-resume.py:1389-1392`, mode 0400, state `recovery_complete_writers_quiesced`). Its only
producer is `write_recovery_complete_state` (`source-recovery-run.sh:902`), called only from
`finish_compose_recovery` (`:1114`), which is installed as an EXIT trap only on the
`elif [[ $stop_writers -eq 1 ]]` branch (`:1220`). Q12 forbids `--stop-writers` (`:432-433`) and
takes the `if [[ -n $external_quiesce_manifest ]]` branch (`:1208`), which installs no trap. So a Q12
`source.forward` never publishes the artifact and C9 fails closed. This must be fixed in the same
increment or the window stops at C9 exactly as it would have stopped at C2.

## 4. Decisions

**D1 — two explicit identities, asserted, not assumed.** Replace the blanket `EUID -eq 0` gate with
a per-operation contract: `quiesce-writers-only` and `resume-writers-only` MUST run as
`CONTROLLER_UID`; `forward` (and `rollback`) MUST run as root. Both are asserted with named
failures, so a mis-launch fails before any side effect instead of deep inside the run.

**D2 — one host lock, reachable by both identities.** The wrapper's host lock currently lives at
`/run/megacampus-qdrant-source-recovery/source-recovery.lock`, created with
`install -d -o root -g root -m 0700` (`:289`, `:337`, `:513`) and then opened for write — impossible
at uid 1000, and `/run` is tmpfs so any manual pre-creation vanishes on reboot. Relocate the lock to
a controller-owned path under `/opt/megacampus/backups/q12/` (already 1000:1000 0700) and create its
directory as the controller identity. It must stay ONE path for all four operations, otherwise the
uid-1000 and root operations would no longer be mutually exclusive; a 1000:1000 0600 lock is
openable by root too, so a single path serves both.

**D3 — the controller passes the lease descriptor for ordinary commands.** Mirror the existing
precedent `_invoke_resume` (`:1665-1684`, `close_fds=True, pass_fds=(9,)`) — and `launch_claim`
(`:1278`, `pass_fds=(8, 9)`) — in the ordinary-execution seam. `writers.quiesce` already carries
`Q12_EXTERNAL_QUIESCE_LEASE_FD=9` in its frozen env (`LEASE_FD_ENV_COMMAND_IDS` at `:65-67` includes
it), so passing the descriptor is the only missing piece for C2.

**D4 — the lease variable for `source.forward` is defaulted in the wrapper, NOT added to the
manifest.** The frozen manifest identity `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`
is an owner-level invariant. Adding the variable would change the file and also require editing
`LEASE_FD_ENV_COMMAND_IDS` and the env-equality gate at `:713-716`. Instead the wrapper treats the
canonical descriptor 9 as the default when the variable is absent, keeping every other lease check
unchanged. Note the effective contract is already hard 9 in three independent places
(`q12-writer-resume.py:302-303`, its descriptor-surface assertion `:152-155`, and the controller's
`--lease-fd choices=(9,)`).

**D5 — root only for `source.forward`, through a root-owned launcher.** The controller escalates
that single command via the operator account's existing sudo rights to
`deploy/qdrant/q12-privileged-launch.sh`, installed root-owned 0555. The launcher: asserts EUID 0;
whitelists exactly the wrapper path and the `forward` operation, refusing anything else; opens the
canonical window lock on descriptor 9 as an IDENTITY handle without locking it (per §2); reproduces
the frozen env verbatim with `env -i`; and execs the frozen argv unchanged. No descriptor crosses the
privilege boundary, so sudo's `closefrom=3` is irrelevant and **no sudoers change is required**.
Honesty note: this adds no privilege — `/etc/sudoers.d/claude-deploy` already grants
`ALL=(ALL) NOPASSWD: ALL`. The launcher is a fail-closed argv whitelist, not a new trust boundary,
and the design must not claim otherwise while that blanket rule exists (hardening that rule, and the
fact that the wrapper itself is operator-owned 0555, belong to a separate ticket).

**D6 — publish the C9 recovery state on the Q12 path.** `write_recovery_complete_state` must run on
the external-quiesce forward branch, with the same verifications the `--stop-writers` trap performs,
so `writers.resume.forward` finds its authority.

**D7 — what is recorded stays what is frozen.** The journal keeps recording the manifest argv and env;
`command_sha256` covers argv only (`:1039`). The launcher prefix and the descriptor passing are
launch-time mechanics, documented here and in the runbook, not silent rewrites of the binding.

## 5. Rejected alternatives

- **`Defaults closefrom_override` + `sudo -C 10`** — passes the descriptor through sudo but
  permanently weakens host sudo hardening, keeps the whole wrapper at root, and therefore leaves C2
  structurally unable to satisfy its own uid-1000 probe assertions. Fixes the symptom, preserves the
  defect.
- **A root launcher that acquires the window lock itself** — impossible: the controller holds
  `LOCK_EX` for the whole window, so the acquisition must fail, while the child's own proof requires
  the lock to be held. Self-contradictory.
- **Relaxing the 1001-owned operator tree to group-readable** — would let `source.forward` run as
  uid 1000 but weakens the 1000/1001 isolation boundary and forces edits to the wrapper's exact-mode
  validators.
- **Editing the frozen manifest env** — breaks the owner-level freeze invariant (HARD STOP).
- **Reverting to the 2026-07-17 two-user manual route** — blocked by its own unresolved question: the
  privileged child requires journal rows only the controller's ordinary seam writes.

## 6. Verification strategy

- TDD per work item; the infra-free harness is `tests/unit/ops/fixtures/q12-retained-barrier-*` plus
  the shell/python unit suites already covering the wrapper and the writer controller.
- Identity assertions (D1) and the lock relocation (D2) are testable with the existing
  `SOURCE_RECOVERY_LOCAL_TEST=1` seams, which already parameterise the lock path and the controller
  uid/gid.
- The launcher (D5) gets its own argv-whitelist tests: accepted argv, every rejected shape, refusal
  when not root, and the lock-handle behaviour (opened, never locked).
- Frozen manifest sha re-verified before and after every change; the whole-file guard test is part of
  the suite.
- End state before any window attempt: a DEV rehearsal of `live --stop-after deploy.prepare` against
  the isolated dev target, which is the first end-to-end exercise of the real privileged children —
  the gap `mc2-1sns3` still tracks and the reason each window attempt so far found a new blocker.

## 7. The other sixteen commands — audited, and the result narrows the fix

The remaining frozen commands (`operator.self-check`, the four `reindex.*`, `pg.backup`,
`pg.restore`, both `migration.*`, `deploy.prepare`, `deploy.commit`, and the five barrier legs) need
**no privileged launch at all**. The single root-side operation in scope is the C9 nginx switch, and
`scripts/deploy_blue_green.sh` already performs it via `sudo` from inside the uid-1000 process
(`:290` `$Q12_NGINX_TEE` defaulting to `sudo tee` at `:30`, `:291` `sudo nginx -t`, `:292`
`sudo nginx -s reload`). Everything else is docker-group work, owner-mode reads, or writes inside the
controller-owned run root. The barrier legs additionally run through `launch_claim`
(`pass_fds=(8, 9)`), which only hardens the requirement that the controller BE uid/gid 1000.

Notably the secrets requirement runs the OPPOSITE way to privilege: `q12-database-barrier.sh:173,
:228-229` and the migration scripts assert the DSN and CA are owned by the _current_ uid/gid, so root
ownership would be a hard refusal that sudo cannot bridge. Runbook §1.4's "owner-only" wording is
misleading — the CA must be exactly 0644.

Host state verified today (read-only), all already satisfied: `/usr/bin/node` → node 22 and
`/usr/bin/pnpm` present, so the barrier's hardcoded interpreter and the tsx shim resolve on the
frozen PATH; `secrets/prod-ca-2021.crt` `claude-deploy` 0644 and `secrets/supabase_db_url`
`claude-deploy` 0600 (exactly what the eight consumers demand); `active_color` `claude-deploy` 0664
and `nginx.conf.template` present (so the post-switch write at `:344` cannot EPERM past the point of
no return); `backups/supabase` `claude-deploy` 0700; PG17 client binaries installed;
`.env.production` carries all three compose `:?` variables; the pinned operator image is local
(`pull_policy: never` is satisfied). `HOME=/root` is cosmetic for both docker and pnpm at uid 1000 —
each warns on stderr about the unreadable config and succeeds (`pnpm --filter … exec node` returns
its marker), and the controller hashes stdout only.

Two host-state gaps remain, neither a privilege problem, both must be closed before the window:

- **G4 — `deploy.prepare` cannot run:** `docker-compose.app.yml` requires `${WEB_IMAGE:?}` (`:12`) and
  `${API_IMAGE:?}` (`:51`) from `--env-file .env.<target-color>`, and `.env.blue`/`.env.green` carry
  neither key (verified). The only code that backfills them lives in the non-q12 path
  (`write_color_env` `:421-441`, `ensure_color_image_ref` `:480-495`) which q12 mode exits before
  (`:381`). They must be pre-populated with immutable digest references. Decision: pin the digests
  the CURRENTLY RUNNING blue containers use, not the release-sha images — this window is a Qdrant
  cutover, not an application release, so the app code must not change under it.
- **G5 — mid-window registry pull:** `prometheus`, `grafana` and the `node-exporter` that comes with
  prometheus's `depends_on` have no `pull_policy: never` and are absent from the host, so
  `deploy.prepare`'s infra bring-up would pull them mid-window and fail closed without egress.
  Pre-pull them by their pinned digests during pre-window staging.

Recorded, not blocking: `q12-capability-run.sh` execs `/usr/bin/python3` (3.12) while the controller
must be 3.13; the 3.13-only `os.POSIX_SPAWN_CLOSEFROM` dependency sits in the separate D6 probe path,
not in `run_claim`, so the split should work but has never been exercised — the dev rehearsal covers
it. Also recorded: `reindex.*` bind-mounts three run-root files with compose short syntax, so a
missing bind source would have Docker silently create a DIRECTORY inside the 0700 run root; the
barrier ordering that publishes those receipts must stay intact.
