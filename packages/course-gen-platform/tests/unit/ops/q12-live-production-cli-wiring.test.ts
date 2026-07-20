import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Design W2 CLI wiring (mc2 W2 follow-up). main() runs live/recover with production=True + the
// owner-custody executor, so the W2/W3 staged production path is what the CLI actually drives. That
// path needs three request inputs main() did not yet provide: the accepted .13.4.1 source-recovery
// run id (StagedValueResolver's <recovery-run-id> UPFRONT authority, and load_staged_values' upfront
// re-supply on recover) and the source-connection secret PATHS (_source_service_env reads
// request['db_url_file'] + request['ca_file'] to open the window snapshot over libpq). This suite
// pins the new --recovery-run-id flag (live AND recover) and that main() plumbs recovery_run_id plus
// the fixed production secret paths — the same paths prepare_barrier_cleanup already uses — into the
// request. The production run-root (/opt/megacampus) is not writable here, so the wiring is proven by
// argparse behaviour + main() dispatch source structure, exactly like the sibling live/recover suite.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

const REQUIRED = [
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
  '--recovery-run-id',
  '22222222-2222-4222-8222-222222222222',
];

describe('Q12 W2 CLI wiring: --recovery-run-id + production source inputs', () => {
  it('requires --recovery-run-id on both live and recover and stores it', () => {
    const args = JSON.stringify(REQUIRED);
    const probe = [
      'import importlib.util, json, os, sys',
      's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
      'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
      'req=json.loads(sys.argv[2])',
      'p=m.parser()',
      // live + recover parse --recovery-run-id and store it verbatim
      'for mode in ("live","recover"):',
      ' ns=p.parse_args([mode,*req])',
      ' assert ns.recovery_run_id=="22222222-2222-4222-8222-222222222222", (mode, ns.recovery_run_id)',
      // without it, argparse exits 2 (silence usage on stderr)
      'devnull=open(os.devnull,"w"); sys.stderr=devnull',
      'def rejects(argv):',
      ' try:\n  p.parse_args(argv); return False\n except SystemExit:\n  return True',
      'base=[a for a in req if a not in ("--recovery-run-id","22222222-2222-4222-8222-222222222222")]',
      'assert rejects(["live",*base])',
      'assert rejects(["recover",*base])',
      'sys.stderr=sys.__stderr__; devnull.close()',
      'print("W2_CLI_PARSER_OK")',
    ].join('\n');
    const child = spawnSync('/usr/bin/python3', ['-c', probe, CORE, args], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_CLI_PARSER_OK');
  });

  it('plumbs recovery_run_id + the fixed production source secret paths into the live/recover request', () => {
    const source = readFileSync(CORE, 'utf8');
    // recovery_run_id threaded from the parsed flag
    expect(source).toContain('"recovery_run_id": arguments.recovery_run_id');
    // the source-connection secret PATHS the controller snapshot uses over libpq — the SAME fixed
    // production paths prepare_barrier_cleanup shells (single source of truth, path-only).
    expect(source).toContain('"db_url_file": "/opt/megacampus/secrets/supabase_db_url"');
    expect(source).toContain('"ca_file": "/opt/megacampus/secrets/prod-ca-2021.crt"');
  });
});
