# Q12 Live Cutover Window — Operator Runbook v2

- Date: 2026-07-20. **Supersedes** the 2026-07-17 window procedure.
- Applies to: the self-hosted Qdrant cutover controller `deploy/qdrant/q12-lifecycle-core.py`.
- Frozen command-manifest identity: `aaec6fc2…` (`deploy/qdrant/q12-command-manifest.json`). If this
  sha changed, **STOP** — the window is not runnable until the manifest identity is restored.
- Owner-gated: the C9 `barrier.activate` + nginx switch is the point of no return and requires an
  explicit owner "go". This runbook prepares everything up to that gate; the owner presses C9.

## 0. What changed since the 2026-07-17 procedure

- **Real staged values (W2/W3).** The controller now runs `production=True` and resolves the real
  placeholder values as the window advances instead of fixture-derived constants: it opens a real
  source snapshot (`pg_export_snapshot()`, held across `pg.backup`), publishes the pre-maintenance
  `baseline.json`, and persists a run-root **staged-values authority** so a `recover` re-drive is
  byte-deterministic. See `docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md`.
- **Reversible STOP-point (W4).** `live --stop-after <checkpoint>` stops the forward run cleanly
  before the post-activate segment.
- **New required flag:** `--recovery-run-id` (the accepted `.13.4.1` source-recovery run id).
- **Real-run acceptance oracle (D4).** Acceptance no longer keys off fixture byte-parity (that stays
  a separate mechanics check); a real run is accepted iff every child exited 0 **and** the barrier
  receipt reached `guard_cleanup_complete` **and** the coverage authority is bound in the recovery
  journal.
- **file_catalog-only accepted coverage (amendment 2026-07-25).** The acceptance authority is derived
  from the recovered `file_catalog` rows, not from the `document_evidence_*` ledgers (which the C4
  migration creates empty; their zero-evidence cards are minted only by post-window Stage-4 runs —
  re-verified post-window under `mc2-8m90f`). `<accepted-coverage-run>` carries the token
  `catalog:<recovery-run-id>`; the six recovered course scopes come from the sha-bound reviewed
  recovery manifest. The frozen manifest identity `aaec6fc2…` is unchanged.

- **C2-deferred writer-quiesce publication (amendment 2026-07-26, `mc2-y02tz`).** `run_live` used to
  demand the writer-quiesce manifest before journalling anything, while the only producer of that
  file is the group-3 `writers.quiesce` child the same run drives onto a run root that must be
  fresh — so a first window run could never start. An absent manifest is now legal for `live` when
  (and only when) `--quiesce-manifest-sha256` is 64 zeroes; the controller adopts the published
  digest and bytes under the same 0400/non-symlink/ownership envelope. A manifest that IS present
  keeps the old strict behaviour, and `recover` is unchanged.

- **Execution identity and the one privileged command (amendment 2026-07-26, `mc2-1by33`).** The
  controller runs as the controller identity `claude-deploy` (uid/gid 1000) — NEVER as root: its own
  validators require every artifact it creates to be owned by 1000. The frozen writer operations
  (`writers.quiesce`, `writers.resume.*`) also run as that identity, because their child's
  closed-inbound probe requires its scratch to be owned by it. Exactly one frozen command needs root
  — `source.forward`, which reads operator state owned by uid 1001 — and the controller reaches it
  through the root-owned argv-whitelist launcher `deploy/qdrant/q12-privileged-launch.sh` using the
  operator account's existing sudo rights. No sudoers change, no new privilege. The launcher opens the
  window lock as an identity handle and never locks it; the controller holds `LOCK_EX` for the whole
  run, which is what makes the child's liveness proof pass. The wrapper's host lock now lives on the
  controller-owned Q12 backups root (the old `/run` path was root-only and on tmpfs). See
  `docs/superpowers/specs/2026-07-26-q12-window-execution-identity-design.md`.

## 1. Preconditions (before C1)

1. Fresh pre-window `plan` run is green (isolated-restore + migration + catalog capture).
2. Owner "go" recorded for this window.
3. Manifest identity `aaec6fc2…` verified unchanged.
4. Secrets present under `/opt/megacampus/secrets/` (path-only, never printed) and owned by the
   CONTROLLER identity — root ownership is a hard refusal here, not a hardening, because the barrier
   and the migration scripts assert the files belong to the current uid/gid:
   - `supabase_db_url` (the source DSN the controller snapshot connects through over libpq) —
     `claude-deploy:claude-deploy`, mode 0400 or 0600;
   - `prod-ca-2021.crt` (TLS root for the source) — `claude-deploy:claude-deploy`, mode EXACTLY
     `0644` (the barrier at `q12-database-barrier.sh:229` and both migration scripts pin that value;
     an owner-only 0400/0600 CA fails five barrier and two migration commands);
   - plus the per-run-root `secrets/db-capability` the barrier child consumes, 0400 owned by the
     controller identity.
5. The accepted `.13.4.1` source-recovery run id is known (this is `--recovery-run-id`).
6. The writer-quiesce manifest. On the **first** `live` run of a window it does NOT exist yet and
   must not be pre-authored: `<run-root>/writer-quiesce-<run-id>.json` is published in-window by the
   group-3 `writers.quiesce` child, so pass `--quiesce-manifest-sha256` as 64 zeroes and the
   controller adopts the real digest the moment the child publishes it (amendment
   2026-07-26 / `mc2-y02tz`; `run_live` fails closed on an absent manifest with any other declared
   digest). Pass the REAL sha256 only when the manifest already exists at that path — that is the
   `recover` case, and `recover` still requires it.
7. The canonical `cutover.lock` is held exclusively on FD 9 (the controller acquires it in `main()`).
8. The accepted coverage authority is staged at
   `/opt/megacampus/backups/q12/<run-id>/accepted-coverage-run` — controller-owned `0400`, one
   newline-terminated line holding the **file_catalog authority token**
   `catalog:<accepted-.13.4.1-source-recovery-run-id>` (owner-approved amendment 2026-07-25; see
   `docs/superpowers/specs/2026-07-12-q12-source-recovery-design.md` §"Amendment 2026-07-25"). It
   must name the same run id passed as `--recovery-run-id`; the wrapper fails closed on a mismatch,
   on the retired `organization:course:run` ledger triple, and on any extra line. The
   `source.forward` wrapper tail reads it to emit `<run-root>/source-forward-acceptance.json` (the
   authority `read_source_forward_acceptance` consumes); a Q12 forward without it fails closed.
9. `/opt/megacampus/.env.production` defines exactly one non-empty `SUPABASE_URL` and one
   `SUPABASE_SERVICE_KEY` (the emit CLI validates the acceptance against the live `file_catalog`
   rows the recovery just wrote — `vector_status='failed'` plus
   `error_message='source_file_unrecoverable; recovery_run=<run>'` for the exact six eligible
   identities; the wrapper passes these two values only to the emit child).
10. The deployed `/opt/megacampus/deploy/qdrant/` tree carries the current `develop` build of BOTH
    `q12-lifecycle-core.py` (real-read `read_source_forward_acceptance`) and
    `source-recovery-run.sh` (acceptance emit tail), and the frozen manifest sha is re-verified
    after the re-deploy. The emit runtime closure must also be current under `/opt/megacampus`:
    `packages/course-gen-platform/tools/qdrant/emit-source-forward-acceptance.ts` plus its
    relative-import closure, the built `dist/` of `@megacampus/shared-types`, `shared-logger`,
    and `shared-utils`, and the tsconfig chain (`packages/course-gen-platform/tsconfig.json` +
    root `tsconfig.json` — the wrapper passes `--tsconfig` explicitly and fails closed if the
    chain is missing, because tsx path-alias resolution must not depend on the caller's cwd).
    Smoke check from `/opt/megacampus`:
    `packages/course-gen-platform/node_modules/.bin/tsx --tsconfig packages/course-gen-platform/tsconfig.json packages/course-gen-platform/tools/qdrant/emit-source-forward-acceptance.ts`
    must fail with the usage message (not a module-resolution error).
11. `sysctl fs.protected_hardlinks` reports `1` on the host (kernel default; the acceptance-emit
    publish hardening assumes hardlink protection for full root/controller isolation).
12. `deploy/qdrant/q12-privileged-launch.sh` is deployed next to the controller and installed
    **root-owned mode 0555** (`sudo install -o root -g root -m 0555 …`). The controller refuses
    nothing on its absence up front — `source.forward` simply fails at launch — so verify it is there.
13. `.env.blue` and `.env.green` each define `WEB_IMAGE` and `API_IMAGE` as immutable
    `repo@sha256:…` references. `docker-compose.app.yml` marks both required, and q12 mode never
    backfills them (that code lives in the non-q12 path), so an absent key aborts `deploy.prepare`
    before any container exists. Pin the digests the CURRENTLY RUNNING colour uses: this window is a
    Qdrant cutover, not an application release.
14. `/opt/megacampus/backups/q12` is owned by the controller identity and traversable by it. The
    wrapper's host lock now lives there (`source-recovery.lock`, beside `cutover.lock`), so a
    root-owned parent would abort C2 with a bare `install:` error. Verified 2026-07-26:
    `claude-deploy:claude-deploy` 0755. The wrapper creates the directory only when absent and does
    not re-mode an existing one, so nothing else that traverses it is disturbed.
15. The pinned `prometheus`, `node-exporter`, `alertmanager` and `grafana` images are present locally
    (`docker image inspect <repo>@sha256:<digest>` — they do NOT show in a `repo:tag` listing when
    pulled by digest). `deploy.prepare` brings up the shared infra and would otherwise pull them
    mid-window.

### 1a. What the local suites do NOT cover (know this before you open a window)

- The identity-contract and controller suites auto-enable only at uid 1000 (`RUN_REAL_CONTROLLER`), so
  they do not run on a generic CI runner. The launcher's sandboxed cases additionally need
  unprivileged user namespaces (`MC2_Q12_USERNS_SANDBOX`); without them they SKIP, while the
  production-constant and not-root refusal cases still run.
- The real `sudo` → launcher → wrapper chain, and `validate_external_quiesce_lease`'s fresh-`flock`
  probe executed as actual root against the controller-owned lock, are exercised for the first time by
  the DEV rehearsal (`live --stop-after deploy.prepare` on the isolated stack), not by any unit suite.
  Do not open a production window before that rehearsal is green.
- Host facts verified 2026-07-26 that the design leans on: `/usr/bin/sudo` present; `/etc/sudoers` sets
  `Defaults use_pty`, which does NOT corrupt captured child output (`sudo -n /bin/printf 'a\nb\n'`
  through a pipe with stdin closed returns byte-identical output, stderr still separated); `sudo -n
true </dev/null` succeeds.

## 2. Invocation

The controller REQUIRES Python 3.13+ (the D6 descriptor-security path uses the
atomic `os.POSIX_SPAWN_CLOSEFROM` file action with **no fallback**). The server's
default `python3` is 3.12, so invoke the controller explicitly with
`/usr/bin/python3.13` (installed alongside the system interpreter):

```bash
/usr/bin/python3.13 deploy/qdrant/q12-lifecycle-core.py live \
  --run-id <cutover-run-id> \
  --release-sha <release-sha> \
  --operator-digest <operator-digest> \
  --resource-manifest-sha256 <resource-manifest-sha256> \
  --quiesce-manifest-sha256 <quiesce-manifest-sha256> \
  --expected-catalog-sha256 <expected-post-migration-catalog-sha256> \
  --quiesce-manifest-path /opt/megacampus/backups/q12/<run-id>/writer-quiesce-<run-id>.json \
  --recovery-run-id <accepted-.13.4.1-source-recovery-run-id> \
  [--stop-after <checkpoint>]
```

Invoke it **as `claude-deploy` (uid/gid 1000), never under sudo**, and **with `cwd=/opt/megacampus`**:
the two `migration.*` frozen commands are `pnpm --filter …`, which only resolves inside the workspace,
and the controller passes no `cwd` to its children. Argument notes for a FIRST run of a window:
`--quiesce-manifest-sha256` is 64 zeroes (§1 precondition 6), `--resource-manifest-sha256` may be any
64-hex value because the controller overwrites it with its own genesis resource-manifest digest, and
`--operator-digest` is the bare 64-hex GHCR index digest without a `sha256:` prefix.

The controller runs `production=True` with the owner-custody executor, pins the run root to
`/opt/megacampus/backups/q12/<run-id>`, and writes the run-root artifacts:
`baseline.json` (0400), `staged-values-<run-id>.json` (0400), the phase journal, and the barrier
receipts.

## 3. Window sequence (C1..C10)

| Step   | What the controller drives                                                                                                                                                                           | Reversible?                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| C1     | `barrier.install`, operator self-check, `barrier.verify-after-base` prep                                                                                                                             | yes                                       |
| C2     | `writers.quiesce` (W-stream writer pause)                                                                                                                                                            | yes                                       |
| C3     | **snapshot opened** (real `<exported-id>`) + `baseline.json`, then `pg.backup` (fresh four-file generation bound to the snapshot) + isolated restore                                                 | yes                                       |
| C4     | `migration.base.apply` + observability, `barrier.verify-after-base`, catalog capture                                                                                                                 | yes                                       |
| C5     | `source.forward` — execute the `.13.4.1` recovery (42 crash-durable copies, dispositions); the wrapper tail emits `<run-root>/source-forward-acceptance.json` from the staged coverage-run authority | yes                                       |
| C6     | `reindex.plan` → `reindex.worker.create` → `reindex.execute` → `reindex.verify` (behind alias)                                                                                                       | yes                                       |
| C7     | production RE-FREEZE + ratification; **`deploy.prepare`/completed** — the planned-exit checkpoint                                                                                                    | yes (last reversible)                     |
| C8     | `deploy.commit` — blue/green app color prepared/committed                                                                                                                                            | yes                                       |
| **C9** | **nginx switch + `barrier.activate` + resume forward**                                                                                                                                               | **NO — point of no return (owner-gated)** |
| C10    | monitoring live (Prometheus/Grafana/Alertmanager) + secure loopback Web UI                                                                                                                           | —                                         |

The C9 boundary begins Phase D closeout (W7).

## 4. Reversible STOP-point (`--stop-after`)

`--stop-after` stops the forward run cleanly AFTER the named checkpoint and returns the partial
output WITHOUT running the post-activate cleanup+resume segment:

| `--stop-after` value        | Stops after                                           | Relative to point of no return          |
| --------------------------- | ----------------------------------------------------- | --------------------------------------- |
| `writers.quiesce.pre`       | group 2 (barrier.install), before writers.quiesce     | before (reversible)                     |
| `barrier.verify-after-base` | the verify-after-base barrier                         | before (reversible)                     |
| `deploy.prepare`            | the C7 planned-exit head (`deploy.prepare/completed`) | **before — last reversible checkpoint** |
| `final-writer-manifest`     | the group-14 FWM accepted row                         | before (reversible)                     |
| `barrier.activate`          | group 16 (activate + nginx switch)                    | **AFTER — past the point of no return** |

Caveat on `writers.quiesce.pre` for a FIRST run (`mc2-vfjyk`, follow-up to `mc2-y02tz`): stopping there
leaves the window with no published quiesce manifest, and `recover` still requires one, so that head
is currently NOT resumable — re-drive needs a fresh run root. `deploy.prepare` is unaffected (the
manifest is published by then).

Rule of thumb: `--stop-after deploy.prepare` is the safe rehearsal/hold boundary; `#18`
rollback-abort is still available at or before `final-writer-manifest`. Do **not** use
`--stop-after barrier.activate` as a "safe" stop — it stops only after the irreversible switch.

## 5. Recover

If the forward run is interrupted (crash, stop-after, aborted stream), resume with `recover`:

```bash
/usr/bin/python3.13 deploy/qdrant/q12-lifecycle-core.py recover \
  --run-id <cutover-run-id> --recovery-run-id <same-recovery-run-id> \
  --release-sha … --operator-digest … --resource-manifest-sha256 … \
  --quiesce-manifest-sha256 … --expected-catalog-sha256 … \
  --quiesce-manifest-path …
```

- `recover` **always drives to convergence** (it has no `--stop-after`).
- It resumes only from the two supported clean checkpoints (`deploy.prepare/completed` and
  `writers.resume.forward/accepted`); any other durable head is a named fail-closed refusal (follow
  the message — usually re-run the standalone supervisor to advance a mid-barrier head first).
- The production recover **reloads** the persisted `staged-values-<run-id>.json` (the real
  `<exported-id>` and the other staged authorities cannot be re-opened), so the resumed journal
  recomputes byte-identical command bindings. If that authority is missing/corrupt, recover fails
  closed — do not improvise; investigate the run root.

## 6. Acceptance (D4)

A real run is accepted iff ALL hold:

1. every real child exited 0;
2. the barrier receipt v2 reached `state == guard_cleanup_complete`
   (`<run-root>/database-barrier-receipt.json`); and
3. the emitted acceptance authority `<run-root>/source-forward-acceptance.json` carries two 64-hex
   digests and `coverage_run` equal to `catalog:<recovery-run-id>` for THIS run (amendment
   2026-07-25 — there is no `org:course:run` ledger triple and no `coverage` key in the recovery
   journal; the controller, the wrapper forward tail and `accept_real_run` all enforce this token).

Fixture byte-parity is a **separate** mechanics check (the fixture suite), not a gate on the real run.

## 7. Rollback / abort

At or before `final-writer-manifest` (i.e. anytime before C9), the `#18` rollback-abort path is
available: stop the forward run, drive the barrier rollback probes, and confirm zero residue across
every plane before standing the writers back up. Past C9 the switch is irreversible — recovery is
forward-only.

## 8. Owner gate (C9 / W7)

The nginx switch + `barrier.activate` is the point of no return. It is **owner-held**: the operator
must have (a) a fresh green pre-window plan, (b) all of C1..C8 completed and accepted, and (c) an
explicit owner "go" before pressing C9. Do not automate past this gate.
