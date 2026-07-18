import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// R5 Sub-round F (operator-reachable live/recover CLI wiring). The operator shell
// `q12-live-cutover.sh` routes `live`/`recover` to the new core subcommands while keeping the
// `plan`/`supervisor` routing byte-identical; `main()` dispatches `live`->run_live and
// `recover`->run_recover with a production request (run-root shape /opt/megacampus/backups/q12/
// <run-id>, canonical `cutover.lock` FD9 lease, `production: True`) mirroring the supervisor
// branch. The production run-root is NOT writable here (/opt/megacampus), so routing/dispatch are
// proven by argparse-usage + source structure, and the production fail-closed post-activate gate is
// proven at the exact seam both controllers funnel through (orchestrate_post_activate_cleanup).
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const SHELL = join(repoRoot, 'deploy/qdrant/q12-live-cutover.sh');
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

describe('Q12 live/recover CLI wiring (R5 Sub-round F)', () => {
  // SHELL ROUTING: `<mode> --help` through the REAL shell reaches that exact core subparser and
  // exits 0 in argparse BEFORE main() touches /opt/megacampus, so exit-0 + the subparser's own
  // option surface proves the shell routed `live`/`recover` to the new modes.
  it('routes live through the shell to the core live subcommand', () => {
    const result = spawnSync('/usr/bin/bash', [SHELL, 'live', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('live');
    expect(result.stdout).toContain('--quiesce-manifest-path');
    expect(result.stdout).toContain('--expected-catalog-sha256');
  });

  it('routes recover through the shell to the core recover subcommand', () => {
    const result = spawnSync('/usr/bin/bash', [SHELL, 'recover', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('recover');
    expect(result.stdout).toContain('--run-id');
    expect(result.stdout).toContain('--quiesce-manifest-path');
  });

  it('keeps plan/supervisor shell routing byte-identical and still routing', () => {
    const source = readFileSync(SHELL, 'utf8');
    // the supervisor default + the plan decision/action + the exec line are the R5-E bytes verbatim.
    expect(source).toContain('mode=supervisor\n');
    expect(source).toContain(
      'if [[ ${1:-} == plan || ${1:-} == --plan ]]; then\n  mode=plan\n  shift\n'
    );
    expect(source).toContain(
      'exec /usr/bin/python3 "${SCRIPT_DIR}/q12-lifecycle-core.py" "$mode" "$@"\n'
    );
    // plan still route-tests to the core plan subparser (byte-unchanged behaviour).
    const plan = spawnSync('/usr/bin/bash', [SHELL, 'plan', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(plan.status).toBe(0);
    expect(plan.stdout).toContain('--db-url-file');
    // a bare supervisor invocation still routes to the core supervisor subparser (default mode).
    const supervisor = spawnSync('/usr/bin/bash', [SHELL, '--fixture'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(supervisor.status).not.toBe(0);
    expect(supervisor.stderr).toMatch(/supervisor|invalid choice|the following arguments/u);
  });

  // ARGPARSE: the two subparsers exist (help exits 0), and an unknown mode still errors.
  it('exposes live and recover argparse subparsers and rejects an unknown mode', () => {
    const live = spawnSync('/usr/bin/python3', [CORE, 'live', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(live.status).toBe(0);
    const recover = spawnSync('/usr/bin/python3', [CORE, 'recover', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(recover.status).toBe(0);
    const bogus = spawnSync('/usr/bin/python3', [CORE, 'definitely-not-a-mode'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(bogus.status).not.toBe(0);
  });

  // DISPATCH WIRING: main() routes live->run_live and recover->run_recover with ProductionExecutor
  // and the production seam (run-root shape + production flag), and the plan/supervisor/claim/smoke
  // dispatch is unchanged.
  it('wires main() live->run_live and recover->run_recover through the production seam', () => {
    const source = readFileSync(CORE, 'utf8');
    expect(source).toContain('arguments.mode in ("live", "recover")');
    expect(source).toContain('controller = run_live if arguments.mode == "live" else run_recover');
    expect(source).toContain('controller(request, ProductionExecutor())');
    // same run-root shape + canonical lock + production flag as the supervisor branch.
    expect(source).toContain('/opt/megacampus/backups/q12/{arguments.run_id}');
    expect(source).toContain('"quiesce_manifest_path": arguments.quiesce_manifest_path');
    expect(source).toContain('"production": True');
    // plan/supervisor/claim/smoke dispatch is byte-unchanged.
    expect(source).toContain('output = run_supervisor(request, ProductionExecutor())');
    expect(source).toContain('output = run_claim(arguments, ProductionExecutor())');
    expect(source).toContain('output = run_plan(arguments, LivePlanExecutor())');
    expect(source).toContain('output = run_smoke(arguments)');
  });

  // SAFETY GATE: a PRODUCTION run that ACTIVATES (76th row) and then silently skips the
  // post-activate cleanup+resume would leave the paused writers NEVER RESUMED. Since
  // ProductionExecutor does NOT yet expose the R8 hooks, a production post-activate MUST FAIL CLOSED
  // with a NAMED error instead of degrading to None. Both run_live and run_recover funnel through
  // orchestrate_post_activate_cleanup (via drive_forward_tail -> finalize_forward_output), so the
  // gate is proven at that exact seam (the production run-root /opt/megacampus is not writable here).
  it('fails a production post-activate closed when the R8 executor hooks are absent', () => {
    const probe = [
      'import importlib.util, pathlib, sys, types',
      's=importlib.util.spec_from_file_location("q12_gate_probe", sys.argv[1])',
      'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
      // a stub engine whose executor lacks execute_barrier_cleanup/execute_forward_resume.
      'engine=types.SimpleNamespace(executor=object(), run_root=pathlib.Path("/tmp"))',
      'raised=None',
      'try:\n m.orchestrate_post_activate_cleanup(engine, {"production": True, "expected_catalog_sha256": "a"*64}, "run")\nexcept m.LifecycleError as e:\n raised=str(e)',
      'assert raised is not None, "production post-activate did NOT fail closed"',
      'assert raised == "post-activate cleanup/resume executor not wired (deferred to R8)", raised',
      // the non-production path is unchanged: absent hooks degrade safely to None.
      'assert m.orchestrate_post_activate_cleanup(engine, {"expected_catalog_sha256": "a"*64}, "run") is None',
      'print("GATE_OK")',
    ].join('\n');
    const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('GATE_OK');
  });

  // PRE-FLIGHT GATE (the material fix): the late post-activate gate above fires only AFTER the
  // 76th row (activate — the point of no return); in production that would journal all the way
  // through activate and only THEN refuse, stranding an ACTIVATED barrier with writers quiesced
  // and post-activate unrun. So run_live AND run_recover fail closed at the TOP — BEFORE the
  // genesis row / any run-root mutation / Engine construction — when a production run's executor
  // lacks the R8 post-activate hooks. The late gate stays as defense-in-depth.
  it('refuses a production live/recover BEFORE any journal row when the post-activate hooks are absent', () => {
    const probe = [
      'import importlib.util, pathlib, sys, tempfile',
      's=importlib.util.spec_from_file_location("q12_preflight_probe", sys.argv[1])',
      'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
      'for entry in ("run_live", "run_recover"):',
      ' root=pathlib.Path(tempfile.mkdtemp())',
      ' raised=None',
      ' try:\n  getattr(m, entry)({"production": True, "run_root": str(root)}, object())\n except m.LifecycleError as e:\n  raised=str(e)',
      ' assert raised == "post-activate cleanup/resume executor not wired (deferred to R8)", (entry, raised)',
      // zero side effects: the run never started — the run root is completely empty (no phase.jsonl,
      // no capabilities dir), so nothing was journaled and no barrier was activated.
      ' assert list(root.iterdir()) == [], (entry, "run-root mutated before pre-flight refusal", list(root.iterdir()))',
      // the pre-flight is production-gated only: a non-production run is unaffected.
      'assert m.require_post_activate_executor({"production": False}, object()) is None',
      'assert m.require_post_activate_executor({}, object()) is None',
      'print("PREFLIGHT_OK")',
    ].join('\n');
    const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('PREFLIGHT_OK');
  });
});
