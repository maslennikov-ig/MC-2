import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Design W2-consistency (co-design docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md
// D3, plan Task 3). On a real run the staged values (real pg_export_snapshot() <exported-id>, the
// generation dir, the recovery-manifest sha + coverage) are NOT reproducible on a recover re-drive —
// the original snapshot coordinator is long gone. But an interrupted-then-resumed journal must stay a
// byte/order twin of an uninterrupted one, so every ordinary command_sha256 the compose froze must be
// recomputable on recover. The run-root authority file <run-root>/staged-values-<run-id>.json is that
// single durable authority (D5J single-authority): run_live persists the resolver's resolved values;
// run_recover loads them into a StagedValueResolver used as the value source, so resolved_command
// recomputes byte-identical argv -> identical command_sha256. Monotonic + resolve-once at rest: a
// rewrite may only ADD placeholders or repeat identical values; a changed value fails closed.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

const HEADER = [
  'import importlib.util, sys, json, pathlib, tempfile',
  's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
  'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
  // a request carrying the resolved_command base substitutions (run-id / catalog / release-sha)
  'RUNID="11111111-1111-4111-8111-111111111111"',
  'REQUEST={"run_id":RUNID,"expected_catalog_sha256":"c"*64,"release_sha":"a"*40}',
  'QM="/opt/megacampus/backups/q12/x/writer-quiesce-x.json"',
  'RRID="22222222-2222-4222-8222-222222222222"',
  'EID="ffffffff-ffffffff-1"',
  'MANIFEST=m.load_manifest()',
];

function run(lines: string[]): { status: number | null; stdout: string; stderr: string } {
  const child = spawnSync('/usr/bin/python3', ['-c', [...HEADER, ...lines].join('\n'), CORE], {
    encoding: 'utf8',
    env: ENV,
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

describe('Q12 W2-consistency: staged-values run-root authority (recover determinism)', () => {
  // ROUND-TRIP: persist the resolver, load it back, and prove resolved_command("pg.backup") — whose
  // argv carries <exported-id> — recomputes the SAME command_sha256 from the reloaded resolver.
  it('persists + reloads staged values so pg.backup command_sha256 is byte-identical on recover', () => {
    const { status, stdout, stderr } = run([
      'root=pathlib.Path(tempfile.mkdtemp())',
      'live=m.StagedValueResolver(QM, RRID); live.on_snapshot_open(EID)',
      'm.persist_staged_values(root, RUNID, live)',
      'p=m.staged_values_authority_path(root, RUNID)',
      'assert p.exists() and (p.stat().st_mode & 0o777)==0o400, oct(p.stat().st_mode)',
      // recover reloads the authority into a fresh resolver (upfront authorities re-supplied)
      'rec=m.load_staged_values(root, RUNID, QM, RRID)',
      'assert dict(rec)==dict(live), (dict(rec), dict(live))',
      // the frozen (compose) and reloaded (recover) command_sha256 for pg.backup are identical
      'live_cmd=m.resolved_command(MANIFEST, "pg.backup", REQUEST, live)',
      'rec_cmd=m.resolved_command(MANIFEST, "pg.backup", REQUEST, rec)',
      'assert live_cmd["command_sha256"]==rec_cmd["command_sha256"], (live_cmd, rec_cmd)',
      // and the argv actually resolved <exported-id> to the real staged value (no <...> left)',
      'assert EID in " ".join(live_cmd["argv"]) and "<exported-id>" not in " ".join(live_cmd["argv"])',
      'print("W2_ROUNDTRIP_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_ROUNDTRIP_OK');
  });

  // LOAD-BINDS: a tampered authority value flows through to a DIFFERENT command_sha256 — proving the
  // authority is load-bearing (recover cannot silently drift the frozen argv).
  it('binds the authority: a corrupted staged value changes the recovered command_sha256', () => {
    const { status, stdout, stderr } = run([
      'root=pathlib.Path(tempfile.mkdtemp())',
      'live=m.StagedValueResolver(QM, RRID); live.on_snapshot_open(EID)',
      'm.persist_staged_values(root, RUNID, live)',
      'good=m.resolved_command(MANIFEST, "pg.backup", REQUEST, live)["command_sha256"]',
      // tamper the persisted authority with a different (still snapshot-shaped) exported id
      'p=m.staged_values_authority_path(root, RUNID)',
      'stored=json.loads(p.read_bytes()); stored["<exported-id>"]="aaaaaaaa-bbbbbbbb-2"',
      'p.chmod(0o600); p.unlink()',
      'p.write_bytes(m.complete_object(dict(sorted(stored.items())))); p.chmod(0o400)',
      'rec=m.load_staged_values(root, RUNID, QM, RRID)',
      'bad=m.resolved_command(MANIFEST, "pg.backup", REQUEST, rec)["command_sha256"]',
      'assert good!=bad, (good, bad)',
      'print("W2_LOADBINDS_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_LOADBINDS_OK');
  });

  // MONOTONIC + RESOLVE-ONCE-AT-REST: a re-persist may only grow (add placeholders) or repeat
  // identical values; changing a previously-persisted value fails closed.
  it('is monotonic: re-persist may grow, a changed persisted value fails closed', () => {
    const { status, stdout, stderr } = run([
      'root=pathlib.Path(tempfile.mkdtemp())',
      'r=m.StagedValueResolver(QM, RRID); r.on_snapshot_open(EID)',
      'm.persist_staged_values(root, RUNID, r)',
      // GROW: resolve one more staged value and re-persist -> allowed
      'r.on_pg_backup_done("q12-generation-abcdef0123456789")',
      'm.persist_staged_values(root, RUNID, r)',
      'stored=json.loads(m.staged_values_authority_path(root, RUNID).read_bytes())',
      'assert stored.get("<immutable-generation>")=="q12-generation-abcdef0123456789", stored',
      // DRIFT: a resolver whose <exported-id> disagrees with the persisted one must refuse to persist
      'r2=m.StagedValueResolver(QM, RRID); r2.on_snapshot_open("aaaaaaaa-bbbbbbbb-2")',
      'refused=False',
      'try:\n m.persist_staged_values(root, RUNID, r2)\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "persisted-value drift was not refused"',
      'print("W2_MONOTONIC_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_MONOTONIC_OK');
  });

  // FAIL-CLOSED: a recover with no persisted authority refuses (never silently re-derives fixture
  // values for a production run).
  it('fails closed when the staged-values authority is missing on recover', () => {
    const { status, stdout, stderr } = run([
      'root=pathlib.Path(tempfile.mkdtemp())',
      'refused=False',
      'try:\n m.load_staged_values(root, RUNID, QM, RRID)\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "missing authority on recover was not refused"',
      'print("W2_MISSING_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_MISSING_OK');
  });

  // FAIL-CLOSED (named): a corrupt/truncated authority file raises LifecycleError (the documented
  // failure type), not a raw json.JSONDecodeError that a LifecycleError-catching caller would miss.
  it('fails closed with LifecycleError on a corrupt (non-JSON) authority file', () => {
    const { status, stdout, stderr } = run([
      'root=pathlib.Path(tempfile.mkdtemp())',
      'p=m.staged_values_authority_path(root, RUNID)',
      'p.write_bytes(b"{ this is not json")',
      'kind=None',
      'try:\n m.load_staged_values(root, RUNID, QM, RRID)\nexcept m.LifecycleError:\n kind="lifecycle"\nexcept Exception as e:\n kind=type(e).__name__',
      'assert kind=="lifecycle", kind',
      'print("W2_CORRUPT_OK")',
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(0);
    expect(stdout).toContain('W2_CORRUPT_OK');
  });
});
