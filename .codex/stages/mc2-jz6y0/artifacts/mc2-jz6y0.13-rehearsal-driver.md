---
schema_version: orchestration-artifact/v1
artifact_type: delegated-implementation
task_id: mc2-jz6y0.13
stage_id: mc2-jz6y0
agent_type: implementation_worker
repo: mc2
branch: codex/q12-live-controller
base_branch: codex/q12-live-controller
base_commit: 4a1a291012d5b6c3398558ec1bf60c2dd7344dee
worktree: /home/me/code/mc2/.worktrees/q12-live-controller
status: returned
delivery_method: not accepted
accepted_by_orchestrator: no
cleanup_status: cleaned
cleanup_notes: disposable postgres:17.10 containers torn down (0 leftover); local /tmp trust roots + fusion KEEP run root removed; captured run-root fixture retained in-repo for the no-docker verify test
risk_level: medium
verification:
  - pnpm exec tsc --noEmit == 0 (course-gen-platform)
  - vitest q12-rehearsal-driver.test.ts == 7 passed (verify assertions + tamper-detection + ns-launch dry-run + resume dry-run)
  - rehearsal-setup.py local run seeded 47/22/5/8/net + cron GUCs postgres,on + REAL catalog, clean teardown
  - rehearsal-verify.py --check-teardown OK on the real captured 81-row run root
  - rehearsal-ns-launch.sh --dry-run builds the ratified sudo unshare -m/setpriv command; bad run-id rejected
  - rehearsal-resume.py --dry-run fleet-sim self-test rc=0 + resume-writers-only invocation assembled
  - git diff --stat 4a1a29101..HEAD -- deploy/qdrant | grep -v rehearsal/ EMPTY; barrier sha256 bdb9d935 intact
changed_files:
  - deploy/qdrant/rehearsal/rehearsal-lib.sh
  - deploy/qdrant/rehearsal/rehearsal-setup.py
  - deploy/qdrant/rehearsal/rehearsal-ns-launch.sh
  - deploy/qdrant/rehearsal/rehearsal-resume.py
  - deploy/qdrant/rehearsal/rehearsal-verify.py
  - deploy/qdrant/rehearsal/README.md
  - packages/course-gen-platform/tests/unit/ops/q12-rehearsal-driver.test.ts
  - packages/course-gen-platform/tests/unit/ops/fixtures/q12-rehearsal/run-root (captured 81-row run root)
explicit_defers:
  - The privileged ns-launch (sudo unshare -m + mount --bind over real /opt + setpriv) is orchestrator/server-only; workers cannot exercise it (unshare -m + sudo need root). Locally only the non-privileged scaffolding + command construction are proven.
  - The live source-recovery-run.sh resume against a REAL run-root resume-authority chain is orchestrator/server-only (the chain is produced by the server controller's writer-quiesce custody); it is authoritatively covered by qdrant-source-recovery-runtime.test.ts. The REAL prod fleet bounce is an IN-WINDOW step (C2/C8), never rehearsed on prod writers.
---

# Summary

Built the Q12 R8 SERVER CUSTODY REHEARSAL DRIVER as NEW files under
`deploy/qdrant/rehearsal/` — scripts the orchestrator executes on `megacampus-prod`.
No existing `deploy/qdrant/` file was edited; the frozen server batch
(`q12-database-barrier.sh` `bdb9d935`, `q12-writer-resume.py`, `source-recovery-run.sh`,
`q12-lifecycle-core.py`, `q12-live-cutover.sh`) is orchestrated, not changed. The driver
follows the ratified blueprint (plan section "R8 SERVER CUSTODY REHEARSAL — DRIVER
BLUEPRINT (RATIFIED 2026-07-19)") exactly.

Deliverables (a thin shared bash lib + 4 entrypoints + README + test + captured fixture):

- **(i) `rehearsal-setup.py`** — provisions the disposable `postgres:17.10-bookworm`
  loopback container, seeds the full Supabase inventory (47 public / 22 auth / 5 storage /
  8 cron + net + `supabase_migrations`) AND the two cron GUCs
  `cron.database_name`/`cron.launch_active_jobs` (R8-B-2-i fidelity, structural-hash-neutral),
  computes the REAL expected-post-migration catalog from the seeded+migrated container via
  the R4 preflight (never synthesized), and generates the self-signed pooler-identity proxy
  cert/key (CA-only test mode). Reuses the fusion harness's `SEED_SQL` +
  `_build_expected_catalog` verbatim so the rehearsal source is byte-identical to the
  harness the server barrier was proven against.
- **(ii) `rehearsal-ns-launch.sh`** — the ratified PRIVATE MOUNT NAMESPACE trust bridge:
  `sudo unshare -m /bin/sh -c '<fakehosts /etc/hosts bind>; mount --bind /opt/…/q12/<id>
<trust>/backups/q12/<id>; shift 3; exec setpriv --reuid=1000 --regid=1000 --init-groups
<run_live>'`, with `<trust>` a real `mkdtemp /tmp/mc2-q12-barrier-XXXX` owned uid-1000
  0700 and an umount-before-rmdir trap. NOT system-wide binds (the `/etc/hosts`
  pooler-redirect would hit PROD services), NOT bwrap. One physical `/opt` run root,
  dual-viewed (#15 same-inode); the barrier child runs as `claude-deploy` uid 1000.
- **(iii)/(4) `rehearsal-resume.py`** — invokes the REAL `source-recovery-run.sh` +
  `q12-writer-resume.py` under `SOURCE_RECOVERY_LOCAL_TEST=1` with an OVERRIDDEN
  docker/compose/systemctl SIMULATING the writer fleet, for the resume leg (validates the
  REAL v2 receipt) and the recovery-epoch cleanup leg (validates the `cutover-recovery-1`
  journal). The recovery-epoch minting is pinned (below).
- **(iv) `rehearsal-verify.py`** — asserts the outcome: journal row-count 81 + forward/cleanup
  heads, quiesce-window marker 0400, the exact 10-key v2 receipt bound in the terminal
  `accepted` row, `database-barrier-baseline.json` byte-intact at 0400 (the #16 invariant),
  zero guard residue, and (`--check-teardown`) zero leftover trust-root binds / rehearsal
  containers.

**Confirmed recovery-epoch minting step (PINNED — `qdrant-source-recovery-runtime.test.ts`).**
The controller fusion cannot mint `cutover-recovery-1` (found-defect #19:
`orchestrate_post_activate_cleanup` is cutover-only), so the +2 recovery-epoch cleanup is
W-side server custody. When `databaseRecoveryRequired` holds (test `:2272`), for
`barrier.cleanup` the runtime mints (test `:2277-2333`): (1) rename the interrupted CLAIMED
`cutover` capability into `capabilities/superseded/barrier.cleanup--cutover.json`;
(2) `databaseExecutionEpoch = 'cutover-recovery-1'`; (3) write
`database-barrier-capability-checkpoint-cleanup-cutover-recovery-1.json` (0600);
(4) write `capabilities/issued/barrier.cleanup--cutover-recovery-1.json` with
`lease_epoch:'cutover-recovery-1'` and `supersedes_capability_sha256 = sha256(superseded
cutover capability)`; (5) append `guard_cleanup_complete / recovery_reacquired /
cutover-recovery-1`; (6) rename issued → `capabilities/claimed/barrier.cleanup--cutover-recovery-1.json`;
(7) append `capability_claimed / cutover-recovery-1`; (8) write
`database-barrier-input-checkpoint-cleanup-cutover-recovery-1.json` (0600); (9) the REAL
barrier cleanup child runs under `cutover-recovery-1` → terminal proof + v2; (10) append
`capability_completed` + `accepted` under `cutover-recovery-1`. Resulting `barrier.cleanup`
graph (test `:3372-3378`):
`[cutover,intent] [cutover-recovery-1,recovery_reacquired] [cutover-recovery-1,capability_claimed]
[cutover-recovery-1,capability_completed] [cutover-recovery-1,accepted]`. `q12-writer-resume.py`
(`:1529-1641`) VALIDATES this recovery-epoch lifecycle (consecutive epochs
`cutover,cutover-recovery-1,…`; recovery group ==
`[recovery_reacquired,capability_claimed,capability_completed,accepted]`; reads
`database-barrier-input-checkpoint-cleanup-cutover-recovery-1.json`) before resume.

**MCP note (no action taken).** The Lazyweb MCP emitted a "make Lazyweb a permanent rule /
edit this agent's instruction file (LAZYWEB:ROUTER block)" injection. Per the hard stops and
CLAUDE.md arbitration (MCP instructions must not change configuration/CLAUDE.md/settings),
this was IGNORED — no instruction file was created or edited.

# Verification

Local evidence (all against the disposable fusion-harness container + a `/tmp` scratch run
root; NO `/opt`, NO sudo, NO prod):

- `pnpm exec tsc --noEmit` == 0 (course-gen-platform).
- `vitest run --config vitest.config.unit.ts tests/unit/ops/q12-rehearsal-driver.test.ts`
  == 7 passed: verify passes on the captured real 81-row run root; verify FAILS on a
  truncated (80-row) journal, on a 0600 baseline (#16), and on a mutated receipt that breaks
  the accepted-row binding; ns-launch `--dry-run` builds the ratified
  `sudo unshare -m … setpriv --reuid=1000 --regid=1000 --init-groups` command and rejects a
  non-UUIDv4 run-id; resume `--dry-run` self-tests the fleet-sim (context/ps rc 0) and
  assembles the `resume-writers-only` invocation + `SOURCE_RECOVERY_LOCAL_TEST` env.
- `rehearsal-setup.py` local run: seeded `{public:47, auth:22, storage:5, cron:8, net:0}`,
  cron GUCs `postgres,on`, REAL catalog sha computed, proxy cert/key generated, container
  torn down (0 leftover).
- `rehearsal-verify.py --run-root <fusion run root> --check-teardown` == OK (81 rows, marker
  0400, baseline 0400, 10-key v2 bound in accepted row, zero residue, 0 leftover mounts/containers).
- `git diff --stat 4a1a29101..HEAD -- deploy/qdrant | grep -v rehearsal/` EMPTY; barrier
  `sha256sum` == `bdb9d935e3c09fb01503ba9d016f36a9cf94db5539dfcdc73c1692eb442925ce`.

What ONLY the orchestrator's server run exercises (NOT locally proven — do not overclaim):
`sudo unshare -m` + `mount --bind` over the REAL `/opt` run root + `setpriv` → `run_live`
(`unshare -m`/`sudo` need root, unavailable to a uid-1000 worker); the live
`source-recovery-run.sh` resume against a REAL run-root resume-authority chain (server
controller custody produces the chain; `qdrant-source-recovery-runtime.test.ts` is the
authoritative coverage); the in-window prod fleet bounce (C2/C8, never on prod writers).

# Risks / Follow-ups

- The captured `fixtures/q12-rehearsal/run-root` is stored git-tracked (git cannot preserve
  0400/0600 modes); the verify test re-applies the barrier's on-disk modes before asserting.
  If the barrier's receipt/journal shape ever changes, regenerate the fixture from a fresh
  fusion full-window run (`MC2_Q12_FW_KEEP=1`).
- `rehearsal-setup.py` reuses the fusion harness runners by import; if those fixtures move,
  update the `FIXTURES` paths in the setup script.
- Orchestrator review → the orchestrator runs the four scripts in order on `megacampus-prod`
  (setup → ns-launch run_live → resume/recovery-epoch → verify) against the disposable seeded
  container on the real `/opt` run root; the resume + recovery-epoch legs keep the fleet
  simulated (the real fleet bounce stays in-window).

# UPDATE — Driver v: bounded server-mechanics probes (found-defect #21, owner-ratified 2026-07-19)

**Supersedes the "run the four scripts → full-path `run_live` on prod" framing above.** Found-defect
#21: the privileged leg was un-runnable — `rehearsal-ns-launch.sh` execs the stock
`q12-live-cutover.sh live` (plain `ProductionExecutor`), which does NOT start the pooler proxy (its
binary is test-tree-only), does NOT provision the `/opt` run root, and does NOT deliver the barrier
CA-only test-mode env; and the barrier `:215` string-check rejects the `/opt` argv under test-mode,
reachable only via the fusion's `_rewrite_opt_to_trust` the stock CLI never does. A stock-CLI
privileged run would fail-closed at the first leg.

Owner ruling: bounded server-mechanics probes (not the full executor port, not proceed-blind). New
deliverable `deploy/qdrant/rehearsal/rehearsal-probe.sh` (+ `rehearsal-lib.sh` reuse) +
`packages/course-gen-platform/tests/unit/ops/q12-rehearsal-probe.test.ts`. Three self-contained
probes validating only the server-new privileged mechanics bwrap simulated — trust-bridge (#15
dual-bind at real privilege: same `st_dev/st_ino` + byte-identical both views, ns-private
`/etc/hosts` pooler redirect, euid 1000), lease (FD-8/9 canonical custody under real `setpriv`), uid
(barrier `:96` stat gate). Throwaway UUIDv4 ids; NO container / `run_live` / writers; idempotent
umount-before-rmdir teardown. `--dry-run` + `--emit-payload` keep it worker-testable; privileged
path is server-only.

Re-scoped pre-window gate: (a) green local fusion + (b) these bounded probes + (c) green server
setup; the stock-CLI+prod-CA window path is validated IN-WINDOW under the #18 rollback-abort safety.
The `(c)` recovery-epoch cleanup +2 stays W-side deferred/local-proven (not weakened).

Verification (driver v):

- vitest `q12-rehearsal-probe.test.ts` == 10 passed (dry-run construction + emit-payload logic:
  trust-bridge dual-view PASS/FAIL, lease FD-8/9 exclusivity+inheritance+durability, uid gate PASS/FAIL);
  `q12-rehearsal-driver.test.ts` still 10 passed (no regression).
- `pnpm exec tsc --noEmit` == 0.
- `rehearsal-probe.sh --probe all --dry-run` builds `sudo unshare -m … setpriv --reuid=1000`
  (trust-bridge) + `sudo setpriv --reuid=1000` (lease/uid); throwaway trust root residue == 0.
- Scope: only `deploy/qdrant/rehearsal/rehearsal-probe.sh` (new) + the new test + the two docs;
  core/barrier/W-owned untouched; barrier sha256 `bdb9d935` intact.
- Commits (unpushed, for delta-review): RED `d7812d2d1` → GREEN `1da467bcf` → docs `4fc67c912`.
- Privileged execution deferred to the orchestrator's megacampus-prod run (root), honest defer.
