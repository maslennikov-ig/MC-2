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
export const RUN_REAL_CONTROLLER: boolean =
  process.env.MC2_Q12_REAL_CONTROLLER !== undefined
    ? process.env.MC2_Q12_REAL_CONTROLLER === '1'
    : typeof process.getuid === 'function' && process.getuid() === 1000;
