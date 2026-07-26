# Q12 window execution identity — implementation plan

> **For agentic workers:** authority is `docs/superpowers/specs/2026-07-26-q12-window-execution-identity-design.md`.
> Read it before touching anything. TDD per task: RED first, show the failure, then GREEN.

**Goal:** make the Task-9 live controller able to drive the real frozen window commands end to end,
without changing the frozen command manifest and without adding privilege to the host.

**Architecture:** two identities — the controller and the writer operations run as uid/gid 1000; only
`source.forward` runs as root, reached through a root-owned argv-whitelist launcher via the operator
account's existing sudo rights. The window lock stays held by the controller; children receive an
identity handle, never an acquisition.

## Global constraints

- `deploy/qdrant/q12-command-manifest.json` sha256 MUST remain
  `aaec6fc25a6996facbf6f07f579239ba0a2aa53fd5521c83cb3c87d12087a841`. Verify before and after every
  task. Any change is a HARD STOP.
- No `/etc/sudoers.d` change, no new setuid binary, no relaxation of the 1000/1001 isolation on
  `/var/lib/megacampus-source-recovery`.
- No production/host mutation from these tasks; they are local code + tests only. Host staging is
  Task 6 and happens under the window procedure.
- Recorded journal bindings stay the manifest's argv and env; launch-time mechanics (the launcher
  prefix, descriptor passing) are documented, never silent.

---

### Task 1 — wrapper identity contract, single controller-owned host lock, lease default

**Files:** modify `deploy/qdrant/source-recovery-run.sh`; tests under
`packages/course-gen-platform/tests/unit/ops/` covering the wrapper (extend the existing
`SOURCE_RECOVERY_LOCAL_TEST=1` suites).

1. Replace the blanket `[[ $EUID -eq 0 ]]` production gate (`:115`) with a per-operation contract:
   `quiesce-writers-only` and `resume-writers-only` require `$EUID -eq $CONTROLLER_UID`;
   `forward` and `rollback` require `$EUID -eq 0`. Named failures for both directions.
2. Relocate `DEFAULT_LOCK_FILE` from `/run/megacampus-qdrant-source-recovery/source-recovery.lock` to
   a controller-owned path under `/opt/megacampus/backups/q12/` and change the three
   `install -d -o root -g root -m 0700` sites (`:289`, `:337`, `:513`) to the controller identity.
   ONE path for all four operations — root can open a 1000:1000 0600 lock, so mutual exclusion holds
   across both identities. `/run` is tmpfs, so the old location could not survive a reboot anyway.
3. In `validate_external_quiesce_lease` (`:388-411`), default the descriptor to 9 when
   `Q12_EXTERNAL_QUIESCE_LEASE_FD` is unset, keeping every other check byte-identical. This is what
   lets `source.forward` pass without touching the frozen manifest env.

**Tests:** each identity accepted and each mis-identity refused by name; the lock is created and
locked at the new path as the controller identity; the lease default is used when the variable is
absent and the explicit value still wins when present; every existing wrapper test stays green.

### Task 2 — controller passes the lease descriptor to ordinary commands

**Files:** modify `deploy/qdrant/q12-lifecycle-core.py`; tests in
`packages/course-gen-platform/tests/unit/ops/q12-production-ordinary-execution.test.ts` and its
runner fixture.

Mirror the existing precedent `_invoke_resume` (`:1665-1684`, `close_fds=True, pass_fds=(9,)`) in the
ordinary-execution path so `writers.quiesce` — whose frozen env already declares
`Q12_EXTERNAL_QUIESCE_LEASE_FD=9` — actually receives the descriptor. Keep `close_fds=True`.

**Tests:** a child that inspects its descriptor surface sees fd 9 and nothing else beyond 0/1/2; the
recorded command and env are unchanged; the existing marker test stays green.

### Task 3 — root-owned launcher for `source.forward`

**Files:** create `deploy/qdrant/q12-privileged-launch.sh`; modify
`deploy/qdrant/q12-lifecycle-core.py` to route exactly that command through it; new test file.

The launcher: asserts EUID 0; accepts ONLY argv whose first element is the exact absolute
`source-recovery-run.sh` path with `--operation forward`, refusing every other shape by name; opens
the canonical window lock on descriptor 9 as an identity handle and **never** flocks it (the
controller holds `LOCK_EX`; an acquisition attempt must fail); rebuilds the frozen env with `env -i`;
execs the frozen argv unchanged. Installed root-owned 0555.

**Tests:** accepted argv; each rejected shape; refusal when not root; the lock handle is opened and
not locked; the exec'd argv is byte-identical to the input.

### Task 4 — publish the C9 recovery state on the Q12 forward path

**Files:** modify `deploy/qdrant/source-recovery-run.sh`; extend the wrapper tests.

`writers.resume.forward` requires `<run-root>/writer-recovery-state-<run-id>.json`
(`q12-writer-resume.py:1389-1392`), whose only producer runs from an EXIT trap installed solely on the
forbidden `--stop-writers` branch (`:1220`). Make the external-quiesce forward branch publish it with
the same verifications the trap performs (`assert_all_stopped_with_no_restart`, both
`verify_controller_file_unchanged` calls, then `write_recovery_complete_state`).

**Tests:** a Q12 forward run publishes the artifact 0400 owned by the controller identity with the
expected schema, run id, state and bound digests; a failed forward does not publish it.

### Task 5 — runbook and procedure update

**Files:** `docs/qdrant/q12-window-operator-runbook-v2.md`, and correct the misleading "owner-only"
secrets wording in §1.4 (the CA must be exactly 0644, both secrets owned by the controller identity).
Record: the two identities, `cwd=/opt/megacampus` as a hard invocation requirement (the migration
commands are `pnpm --filter …`), the pre-window host staging from Task 6, and the descriptor/launcher
mechanics.

### Task 6 — pre-window host staging (no code; runs under the window procedure)

1. Backfill `WEB_IMAGE` and `API_IMAGE` in `.env.blue` and `.env.green` with the immutable digests the
   CURRENTLY RUNNING blue containers use — this window must not change application code.
2. Pre-pull `prometheus`, `grafana` and `node-exporter` by the digests pinned in
   `docker-compose.infra.yml` so `deploy.prepare` does not pull mid-window.
3. Re-verify the frozen manifest sha and re-run the pre-window `plan`.

### Task 7 — privileged-chain smoke on the host (REVISED 2026-07-26)

The original wording of this task — "rehearse `live --stop-after deploy.prepare` against the isolated
dev target" — is NOT achievable and was wrong to plan. The frozen commands are production by
construction: `writers.quiesce` stops the production writers, `pg.backup` takes a real backup, and the
`migration.*` commands apply to the real database. Their paths cannot be redirected without editing
the frozen manifest, which is forbidden. The only other mode of `run_live` is the non-production
fixture mode, which is exactly what the unit suites already drive. There is no middle ground, so no
end-to-end rehearsal of `live` exists outside the window itself.

What IS achievable, and what this task now means: exercise the real
`sudo` → `q12-privileged-launch.sh` → `source-recovery-run.sh` hop on the host so that it stops at a
legitimate fail-closed gate before touching anything.

1. With the window lock NOT held, invoke the launcher via sudo with the frozen `source.forward` argv.
   Expected: the hop succeeds (sudo passes, the env is rebuilt, descriptor 9 resolves to the canonical
   lock) and the wrapper refuses at the lease liveness probe, because no process holds `LOCK_EX`. This
   proves everything the unit suites cannot: real sudo under `Defaults use_pty`, the root identity, the
   read-only handle, and the frozen env crossing the privilege boundary.
2. Exercise the launcher's refusals for real: not-root, wrong argv[0], a non-`forward` operation,
   `--stop-writers` present.
3. Confirm the controller's launcher preflight (Task 3) reports the installed launcher as
   root-owned 0555 and `sudo -n` as available.

Everything past that gate — the real forward, the barrier legs, the reindex chain — is first exercised
in the window itself, held at `--stop-after deploy.prepare`, with the `#18` rollback path available if
C5 or C6 refuses after C2 has quiesced the writers. Record that as an accepted risk rather than
pretending a rehearsal covered it.

---

## Verification (every task)

- `/usr/bin/python3 -m py_compile` on changed Python, `bash -n` on changed shell.
- `npx vitest run --config vitest.config.unit.ts tests/unit/ops` from `packages/course-gen-platform`
  with dummy `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` and `NODE_OPTIONS=--max-old-space-size=8192`
  (`supabase-restore-drill`'s PG-guard failure is pre-existing).
- `pnpm type-check` at the repo root; eslint + prettier on touched files.
- `sha256sum deploy/qdrant/q12-command-manifest.json` unchanged.
- Independent correctness review before delivery: privileged execution and window integrity are risk
  triggers.
