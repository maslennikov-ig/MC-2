/**
 * Environment gate for the Q12 suites that spawn the REAL Python controller.
 *
 * Those suites drive `deploy/qdrant/q12-lifecycle-core.py` as a real subprocess.
 * The controller enforces two production-representative preconditions that a
 * generic CI runner does not satisfy:
 *
 *  1. Run-root files/directories MUST be owned by uid 1000 — the production
 *     owner (e.g. `claude-deploy`). GitHub-hosted runners execute as uid 1001,
 *     so `mkdtemp` roots are owned by 1001 and the controller fails closed with
 *     `unsafe directory/file identity`.
 *  2. The D6 descriptor-security path requires `os.POSIX_SPAWN_CLOSEFROM`
 *     (Python 3.13+). The generic runner's default `python3` is 3.12.
 *
 * These suites therefore run on uid-1000 developer / prod-representative
 * environments and are skipped on generic CI runners, mirroring the existing
 * `MC2_Q12_REAL_PG17` gating convention. Override explicitly with
 * `MC2_Q12_REAL_CONTROLLER=1` (force run) or `=0` (force skip).
 *
 * Follow-up (tracked in Beads): run these in a dedicated prod-representative CI
 * job (uid 1000 + Python 3.13) so the controller keeps CI coverage there.
 */
import { vi } from 'vitest';

export const RUN_REAL_CONTROLLER: boolean =
  process.env.MC2_Q12_REAL_CONTROLLER !== undefined
    ? process.env.MC2_Q12_REAL_CONTROLLER === '1'
    : typeof process.getuid === 'function' && process.getuid() === 1000;

/**
 * Wall-clock budget for a suite that drives real multi-process chains.
 *
 * Derived from measurement, not chosen. Every file importing this gate spawns
 * Python and bash children with `spawnSync`, so its wall clock is mostly other
 * processes competing for the same CPUs, and the suite runs four such files at
 * once (`maxWorkers: 4`).
 *
 * Measured 2026-08-14 on a 24-CPU host. The slowest of these tests does about
 * **11-15s** of its own work across five consecutive full runs. In the fourth
 * of those runs, with no load beyond the suite itself, the same test took
 * **26.1s** — 3.9s from the 30s default. Adding twenty busy loops took it to
 * **45s** and failed four tests in three files, `q12-live-cutover.test.ts`
 * among them, each with `Test timed out in 30000ms` (mc2-bvynv).
 *
 * So the 30s default was not a budget for these files, it was a coin flip on
 * how busy the machine happened to be, and it produced a failure that pointed
 * at an arbitrary test rather than at the load. 120s is eight times the work
 * these tests actually do and well past the deliberately hostile 45s, while
 * still cutting short a controller that genuinely hangs on a lock — which is
 * what these suites exist to catch.
 *
 * This does not make the suite immune: a hard enough loaded machine will cross
 * any fixed budget. The structural alternative, running these files one at a
 * time, was measured and rejected — 62 files totalling 642s of file time would
 * roughly double a local full run from 5.7 to over 11 minutes, and CI never
 * runs them at all (uid 1001 skips the gate above).
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
