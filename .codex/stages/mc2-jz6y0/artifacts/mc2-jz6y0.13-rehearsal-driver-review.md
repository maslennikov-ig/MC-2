---
schema_version: orchestration-artifact/v1
artifact_type: review
task_id: mc2-jz6y0.13-rehearsal-driver-review
stage_id: mc2-jz6y0
repo: https://github.com/maslennikov-ig/MC-2.git
branch: codex/q12-live-controller
base_branch: master
base_commit: 471e312a5
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: n/a
accepted_by_orchestrator: no
cleanup_status: not_applicable
cleanup_notes: 'Read-only review; single write is THIS artifact, into the self-hosted-qdrant-platform STAGE worktree per policy. I did NOT execute the privileged ns-launch path or any sudo/unshare/mount/docker/server action; the only local command I ran was a harmless /bin/sh echo to confirm shift-positional semantics for finding P1.'
risk_level: medium
verification:
  - "Reviewed range 9d7c00ac0..471e312a5 (4 commits: blueprint 4a1a29101, driver feat 42ee12df0, test d3521d9df, docs 471e312a5) via git show/diff. Execution claims (vitest 7/7) relied on the team-lead's re-runs; I did NOT run the privileged path or any server/docker/sudo action per the constraint."
  - 'NEW-FILES-ONLY (Duty 1): git diff --stat over deploy/qdrant EXCLUDING deploy/qdrant/rehearsal/** is EMPTY (re-verified); git diff --name-status shows all six driver files are ADDITIONS (A) under deploy/qdrant/rehearsal/ (README.md, rehearsal-lib.sh, rehearsal-ns-launch.sh, rehearsal-resume.py, rehearsal-setup.py, rehearsal-verify.py). Barrier q12-database-barrier.sh = bdb9d935… at tip; q12-lifecycle-core.py / q12-writer-resume.py / source-recovery-run.sh / q12-source-manifest.ts / command-manifest / structural-catalog all byte-identical base↔tip. No core/barrier/W-owned/manifest/catalog edit.'
  - '*** P1 — rehearsal-ns-launch.sh privileged inner `shift 3` DROPS the run_live entrypoint arg. *** The command is `sudo unshare -m /bin/sh -c "$inner" "$fakehosts" "$run_root" "$trust_view" "${launch_argv[@]}"`, so inside `sh -c`: $0=fakehosts, $1=run_root, $2=trust_view, $3=launch_argv[0], $4=launch_argv[1]… The inner runs `mount --bind "$0" /etc/hosts; mount --bind "$1" "$2"; shift 3; exec setpriv … "$@"`. `shift` NEVER touches $0, so `shift 3` removes $1,$2,$3 = run_root, trust_view, AND launch_argv[0]. EMPIRICALLY CONFIRMED with a harmless echo: `/bin/sh -c ''shift 3; echo "[$*]"'' FAKEHOSTS RUN_ROOT TRUST_VIEW argv0 argv1 argv2` prints `[argv1 argv2]` — argv0 is gone. With the documented invocation (test :148 launch_argv[0] = /opt/megacampus/deploy/qdrant/q12-live-cutover.sh), the server exec becomes `setpriv --reuid=1000 --regid=1000 --init-groups --run-id <UUID>` — setpriv tries to exec `--run-id` as the program and fails; the real run_live entrypoint NEVER runs. FIX: `shift 3` → `shift 2` (drop only run_root=$1 and trust_view=$2; $0=fakehosts is not a positional to shift). NOT a safety escape (both /opt-root guards + the ns isolation hold; it fails rather than mutating prod) but it BREAKS the driver''s sole privileged function and would waste the sanctioned pre-window rehearsal. The dry-run-only tests structurally CANNOT catch it (the inner sh -c is never executed locally; the dry-run merely %q-prints the outer command array), and the artifact honestly notes the privileged path is not locally exercised — so byte-review is the only line of defense.'
  - 'NS-LAUNCH GUARDS + DRY-RUN (Duty 2, otherwise sound): the privileged path is DOUBLE-guarded — an arg-parse-time gate (run_root == /opt/megacampus/backups/q12/$run_id, with $run_id validated by the barrier :72 UUIDv4 regex) AND a second identical gate immediately before `exec`. Since $run_id is a strict hex/dash UUID (no glob metacharacters), the [[ == ]] RHS is a literal exact-match — no arg-injection escape via --run-root. --dry-run builds only the non-privileged scaffolding (trust root, fakehosts, run-id, argv), logs it, %q-prints the exact WOULD-RUN command, and `exit 0`s BEFORE any sudo/unshare/mount/prod action. launch_argv is passed as POSITIONAL args (quoted "$@"), never re-evaluated by a shell — no injection through the run_live argv. NOTE: the same shift-3 defect means the %q WOULD-RUN string, if copy-pasted and run, also drops argv0.'
  - 'NAMESPACE PRIVACY + TEARDOWN (Duty 2 safety core — CORRECT): both `mount --bind fakehosts /etc/hosts` (the pooler-host→127.0.0.1 redirect) and `mount --bind run_root trust_view` execute INSIDE `sudo unshare -m` (a private mount namespace, a child process), so NEITHER touches the host /etc/hosts nor binds anything over the host /opt — the system-wide-pooler-redirect hazard this design exists to avoid is genuinely averted. Note also the run_root→trust_view bind exposes /opt content at a /tmp path (read-through); it does NOT shadow /opt. rehearsal_teardown (rehearsal-lib.sh) runs in the PARENT (outside the ns), reads /proc/self/mountinfo for mounts under the trust root, reverse-sorts (children first), umounts (with -l lazy fallback) before rmdir — leak-free because the ns-private binds are auto-unmounted on ns exit and are invisible to the parent, so the umount loop finds nothing and only removes the /tmp scaffolding. rehearsal_make_trust_root = mktemp -d /tmp/mc2-q12-barrier-XXXXXXXX + chmod 0700 (barrier :94-98). No leaked bind over /opt.'
  - "RESUME FLEET-SIM CANNOT TOUCH PROD (Duty 3): rehearsal-resume.py runs the REAL source-recovery-run.sh → q12-writer-resume.py under SOURCE_RECOVERY_LOCAL_TEST=1 with SOURCE_RECOVERY_DOCKER_BIN / _COMPOSE_BIN / _SYSTEMCTL_BIN ALL overridden to fake bash binaries operating on a local docker-records.json (default '[]') + a service-state dir — so compose-label discovery (`docker ps --filter label=com.docker.compose.project=megacampus`) returns entries from the EMPTY records file, never the real megacampus fleet; it CANNOT discover or bounce the live prod writer fleet. --dry-run is the DEFAULT (self-tests the fake docker context/ps, prints the secret-free resume-writers-only invocation + env, takes NO source-recovery-run.sh / prod action); the live invocation requires an explicit --run and runs only on the server against the real run-root authority chain. Secrets (db-url/capability) are stdin-only, never on argv/logged."
  - "(c)-PIN MINTING MATCHES THE W-SIDE TEST (Duty 4, spot-verified at bytes): the resume.py docstring pins the 10-step cutover-recovery-1 minting sequence and the resulting barrier.cleanup graph; qdrant-source-recovery-runtime.test.ts:3372-3378 asserts EXACTLY [['cutover','intent'],['cutover-recovery-1','recovery_reacquired'],['cutover-recovery-1','capability_claimed'],['cutover-recovery-1','capability_completed'],['cutover-recovery-1','accepted']] — byte-identical to the pinned graph — and :3379 asserts completedCapability.supersedes_capability_sha256 == fileSha256(superseded) (pinned step 4). The minting steps (:2272 databaseRecoveryRequired, :2277 rename claimed→superseded, :2278 databaseExecutionEpoch='cutover-recovery-1', the recovery-epoch capability_claimed append :2325-2333) match the pinned steps 1-2/6-7."
  - "VERIFY ASSERTIONS + TAMPER (Duty 5): rehearsal-verify.py reads on-disk artifacts only (no docker/prod) and asserts (1) 81 rows + barrier.install/maintenance_guarded/intent head + the exact 5-row cleanup tail all under cutover; (2) quiesce marker mode 0400 + schema; (3) the exact 10-key v2 (state guard_cleanup_complete, zero_guard_residue, database_capability_deleted) BOUND in the terminal accepted row (accepted_object_kind==database_barrier_receipt, accepted_object_sha256==sha256(receipt bytes)); (4) the #16 baseline invariant (0400 + database-barrier-baseline/v1 + full-structural nested `baseline` dict, failing on a 0600 controller-minimal baseline); (5) zero terminal-proof guard_residue; (6) --check-teardown zero leftover binds/containers. The test drives a CAPTURED real 81-row run-root.tar fixture and its three tamper cases correctly FAIL closed: 80-row drift → 'row-count 80'; 0600 baseline → 'baseline mode 600'; mutated receipt (zero_guard_residue=false → sha changes) → 'accepted_object_sha256'. Team-lead re-ran vitest 7/7."
  - "HONEST DEFERS — NO OVERCLAIM (Duty 6): the artifact explicit_defers + body record that the privileged ns-launch (sudo unshare -m + mount --bind over real /opt + setpriv) is orchestrator/server-only ('Locally only the non-privileged scaffolding + command construction are proven'), the live source-recovery resume is server-only (authoritatively covered by qdrant-source-recovery-runtime.test.ts), and the REAL prod fleet bounce is the IN-WINDOW C2/C8 step NEVER rehearsed on prod writers ('do not overclaim'). Accurate — no local-coverage overclaim. (This same honest boundary is why the P1 shift defect is invisible to CI.)"
changed_files:
  - deploy/qdrant/rehearsal/README.md
  - deploy/qdrant/rehearsal/rehearsal-lib.sh
  - deploy/qdrant/rehearsal/rehearsal-ns-launch.sh
  - deploy/qdrant/rehearsal/rehearsal-resume.py
  - deploy/qdrant/rehearsal/rehearsal-setup.py
  - deploy/qdrant/rehearsal/rehearsal-verify.py
  - packages/course-gen-platform/tests/unit/ops/q12-rehearsal-driver.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-rehearsal/run-root.tar
  - docs/superpowers/plans/2026-07-17-q12-live-controller.md
  - .codex/stages/mc2-jz6y0/artifacts/mc2-jz6y0.13-rehearsal-driver.md
explicit_defers:
  - "P1 (confidence HIGH) — rehearsal-ns-launch.sh privileged inner `shift 3` must be `shift 2`. It drops launch_argv[0] (the run_live entrypoint, e.g. /opt/megacampus/deploy/qdrant/q12-live-cutover.sh), so the server exec becomes `setpriv … --run-id <UUID>` and fails to launch run_live. Empirically confirmed (echo repro). BLOCKS the deliverable's core function; must be fixed before the server rehearsal. NOT a safety escape (guards + ns isolation hold; fails closed). Recommend also adding a test that actually executes the inner `sh -c` with a stub in place of `setpriv` (e.g. `setpriv`→`printf`), so the post-shift argv is asserted and this class of defect is caught locally without any privileged action."
  - 'P3 (confidence medium, informational — cosmetic, not a safety issue): on the privileged SUCCESS path, `exec "${command[@]}"` replaces the bash process, so the `trap … EXIT` (rehearsal_teardown) does NOT fire; the /tmp trust-root scaffolding dir is left behind. The ns-private binds are still auto-unmounted on ns exit (no /opt bind leak, no host /etc/hosts change), and rehearsal_assert_no_residue / verify --check-teardown check binds+containers (which stay clean), so this is a harmless /tmp residue that can accumulate across runs and is arguably intended as post-mortem retention (knob 5). Consider a note that /tmp trust-root cleanup is a separate step on the privileged path (the EXIT trap only covers the dry-run / pre-exec / error paths).'
  - "Informational: this round is NEW rehearsal-tooling only (barrier bdb9d935 + core/W-owned untouched). Program-level, the deployed SERVER barrier remains 3673ee49 vs repo bdb9d935 — the byte-verified pre-rehearsal server reinstall + the full-path server run_live rehearsal (which per the ratified (c) pin MUST exercise the recovery-epoch cleanup leg) remain the team-lead's pre-window gates; this driver is the toolkit for that rehearsal and must have the P1 fixed first."
---

# Summary

**Correctness / compliance verdict: FAIL (one P1 blocks merge).**
**Quality / improvement verdict: PASS.**
**P0=0, P1=1, P2=0, P3=1.** The rehearsal driver's SAFETY posture is sound — it cannot
touch production out of its disposable scope — but it carries one **P1 functional defect**
that breaks its sole privileged function and must be fixed before the server rehearsal.

**The P1:** `rehearsal-ns-launch.sh`'s privileged inner script does `shift 3`, but with
`$0=fakehosts, $1=run_root, $2=trust_view, $3=launch_argv[0]`, `shift` never touches `$0`,
so `shift 3` drops **launch_argv[0] — the run_live entrypoint**. Empirically confirmed
(`/bin/sh -c 'shift 3; echo "[$*]"' FAKEHOSTS RUN_ROOT TRUST_VIEW argv0 argv1 argv2` →
`[argv1 argv2]`). On the server this makes the exec `setpriv … --run-id <UUID>` (dropping
`/opt/…/q12-live-cutover.sh`), which fails to launch run_live. It is **not a safety escape**
(both `/opt`-root guards and the private-mount-namespace isolation hold; it fails closed),
but it defeats the deliverable. **Fix: `shift 3` → `shift 2`.** The dry-run-only tests
structurally cannot catch it (the inner `sh -c` is never executed locally), which the
artifact's honest "privileged path not locally exercised" defer confirms — so byte-review is
the only line of defense here.

Everything else verified and PASSES:

- **New-files-only** (Duty 1): six additions under `deploy/qdrant/rehearsal/`; barrier `bdb9d935`,
  core/W-owned/manifest/catalog byte-identical.
- **NS-launch safety** (Duty 2): double `/opt`-root guard + UUIDv4 run-id gate; `--dry-run` takes
  zero privileged action; the `/etc/hosts` pooler-redirect and the `/opt`→trust bind are genuinely
  namespace-private (the system-wide-redirect hazard is averted); teardown is leak-free with no
  `/opt` bind leak.
- **Resume fleet-sim** (Duty 3): fake docker/compose/systemctl over an empty records file — cannot
  discover or bounce the live prod fleet; dry-run default; live requires `--run`.
- **(c)-pin minting** (Duty 4): the pinned cutover-recovery-1 graph + `supersedes_capability_sha256`
  match qdrant-source-recovery-runtime.test.ts:3372-3379 byte-for-byte.
- **Verify + tamper** (Duty 5): genuine 81-row/marker/exact-v2-bound/#16-baseline/zero-residue
  assertions; the 80-row, 0600-baseline, and mutated-receipt tampers fail closed (7/7).
- **Honest defers** (Duty 6): privileged ns-launch + live resume are server-only; the real fleet
  bounce is the in-window C2/C8 step never rehearsed — no overclaim.

# Verification

See the structured `verification:` block — each item is an independent check (new-files-only
name-status + frozen-sha recompute; the empirical shift-semantics repro for P1; the double-guard
and namespace-privacy reasoning; the fleet-sim override + dry-run default; the (c)-pin graph
cross-read at the W-side test bytes; the verify assertions + tamper failures; the artifact
defer wording). I did NOT execute the privileged path or any sudo/unshare/mount/docker/server
action; the only command I ran locally was a harmless `/bin/sh` echo to confirm the shift.

# Risks / Follow-ups

- **P1 (blocks merge):** `shift 3` → `shift 2` in `rehearsal-ns-launch.sh`; add a test that
  executes the inner `sh -c` with `setpriv` stubbed by `printf` and asserts the post-shift argv
  equals the full run_live invocation. Without this fix the sanctioned server rehearsal will not
  launch run_live.
- **P3 (cosmetic):** on the privileged success path `exec` bypasses the EXIT trap, leaving the
  `/tmp` trust-root scaffolding (ns-private binds still auto-unmount; no `/opt`/host-hosts leak).
  Note that `/tmp` cleanup is a separate step there.
- **Program-level (team-lead-owned):** server barrier still `3673ee49` vs repo `bdb9d935`; the
  reinstall + the full-path server `run_live` rehearsal (which MUST exercise the recovery-epoch
  cleanup leg per the (c) pin) remain the pre-window gates — and this driver is that rehearsal's
  toolkit, so the P1 must land first.
