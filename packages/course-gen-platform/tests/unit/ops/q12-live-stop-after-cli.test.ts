import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Design §W4 — the reversible operator STOP-point on the deployed CLI. The internal stop_after seam
// already runs end-to-end (_STOP_AFTER_STEP -> request["stop_after"] -> drive_forward_sequence's
// `stop_step` early-return that skips the post-activate segment), but §2.3 records the gap: the
// `live` subparser exposes no `--stop-after`, so a production live run cannot be told to stop
// cleanly before the point of no return (barrier.activate + nginx switch). W4 exposes `--stop-after`
// on `live` ONLY (recover always drives to convergence, :3817), bound to the exact _STOP_AFTER_STEP
// domain so the CLI and the internal seam validate the SAME checkpoint set, and plumbs it into the
// production live request. The production run-root (/opt/megacampus) is not writable here, so the
// wiring is proven by argparse behaviour (in-process parser()) + main() dispatch source structure,
// exactly like the sibling live/recover CLI wiring suite.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

const LIVE_REQUIRED = [
  '--run-id',
  '11111111-1111-4111-8111-111111111111',
  '--release-sha',
  'a'.repeat(40),
  '--operator-digest',
  'b'.repeat(64),
  '--resource-manifest-sha256',
  'c'.repeat(64),
  '--quiesce-manifest-sha256',
  'd'.repeat(64),
  '--expected-catalog-sha256',
  'e'.repeat(64),
  '--quiesce-manifest-path',
  '/opt/megacampus/x.json',
];

describe('Q12 W4: --stop-after operator STOP-point CLI exposure', () => {
  // ARGPARSE BEHAVIOUR (in-process parser(), never main()): live accepts --stop-after over EXACTLY
  // the _STOP_AFTER_STEP domain and defaults to None; recover has no such flag.
  it('exposes --stop-after on live over the _STOP_AFTER_STEP domain, defaults None, and keeps it off recover', () => {
    const args = JSON.stringify(LIVE_REQUIRED);
    const probe = [
      'import importlib.util, json, os, sys',
      's=importlib.util.spec_from_file_location("q12_w4_probe", sys.argv[1])',
      'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
      'req=json.loads(sys.argv[2])',
      'p=m.parser()',
      // live WITHOUT --stop-after defaults to None
      'base=p.parse_args(["live",*req])',
      'assert base.stop_after is None, base.stop_after',
      // live accepts every _STOP_AFTER_STEP checkpoint and stores it verbatim
      'for ck in m._STOP_AFTER_STEP:',
      ' ns=p.parse_args(["live",*req,"--stop-after",ck])',
      ' assert ns.stop_after==ck, (ck, ns.stop_after)',
      // argparse rejections print usage to stderr — silence it so the probe stderr stays clean
      'devnull=open(os.devnull,"w"); sys.stderr=devnull',
      'def rejects(argv):',
      ' try:\n  p.parse_args(argv); return False\n except SystemExit:\n  return True',
      // live rejects an unknown checkpoint (choices-bound to _STOP_AFTER_STEP)
      'assert rejects(["live",*req,"--stop-after","not-a-checkpoint"])',
      // recover has NO --stop-after at all (unrecognized argument -> exit 2)
      'assert rejects(["recover",*req,"--stop-after","deploy.prepare"])',
      'sys.stderr=sys.__stderr__; devnull.close()',
      'print("W4_PARSER_OK")',
    ].join('\n');
    const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE, args], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W4_PARSER_OK');
  });

  // HELP SURFACE: `live --help` advertises --stop-after; `recover --help` does not.
  it('advertises --stop-after in live --help and never in recover --help', () => {
    const live = spawnSync('/usr/bin/python3', [CORE, 'live', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(live.status).toBe(0);
    expect(live.stdout).toContain('--stop-after');
    // the reversible boundary is operator-visible in the flag help (design §W4 / #18).
    expect(live.stdout).toContain('deploy.prepare');
    const recover = spawnSync('/usr/bin/python3', [CORE, 'recover', '--help'], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(recover.status).toBe(0);
    expect(recover.stdout).not.toContain('--stop-after');
  });

  // DISPATCH WIRING: main() plumbs the parsed stop_after into the production live request so the
  // existing run_live seam (`request.get("stop_after")`) becomes operator-reachable. recover ignores
  // it (it never reads request["stop_after"]). Proven by source structure (production run-root not
  // writable here), mirroring the sibling live/recover dispatch assertions.
  it('wires main() to plumb stop_after into the production live/recover request', () => {
    const source = readFileSync(CORE, 'utf8');
    expect(source).toContain('"stop_after": getattr(arguments, "stop_after", None)');
    // the flag is choices-bound to the internal seam domain (no CLI<->seam divergence).
    expect(source).toContain('choices=tuple(_STOP_AFTER_STEP)');
  });
});
