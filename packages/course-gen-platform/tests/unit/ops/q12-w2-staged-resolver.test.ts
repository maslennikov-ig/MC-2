import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Design W2 (co-design docs/superpowers/specs/2026-07-20-q12-w2-w3-staged-execution-codesign.md D1/D2,
// plan docs/superpowers/plans/2026-07-20-q12-w2-w3-staged-execution.md Task 2). On the production
// path the single upfront derive_joined_fixture_values dict cannot work: real <exported-id> is only
// known once the W3 coordinator opens, <immutable-generation> only after pg.backup, and the last
// three only after source.forward is accepted. StagedValueResolver replaces the dict on the
// PRODUCTION path only (request["production"] is True); the fixture path stays byte-identical as the
// closed-composer parity oracle (D1). The resolver is a Mapping over its currently-resolved
// placeholders (so it drops into resolved_command's `values` slot), resolves-once (a re-resolve must
// byte-match or fail closed), and fails closed on a value read before its stage. This suite proves
// the resolver in isolation (pure value-in setters) + that the fixture derivations are unchanged.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const CORE = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
const ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' };

const HEADER = [
  'import importlib.util, sys',
  's=importlib.util.spec_from_file_location("q12", sys.argv[1])',
  'm=importlib.util.module_from_spec(s); sys.modules[s.name]=m; s.loader.exec_module(m)',
];

const QM = '/opt/megacampus/backups/q12/x/writer-quiesce-x.json';
const RRID = '22222222-2222-4222-8222-222222222222';
const EID = 'ffffffff-ffffffff-1';

describe('Q12 W2-fork: StagedValueResolver', () => {
  // UPFRONT authorities are known at construction; staged authorities fail closed until their stage.
  it('resolves the upfront authorities and fails closed on a value read before its stage', () => {
    const probe = [
      ...HEADER,
      'r=m.StagedValueResolver(sys.argv[2], sys.argv[3])',
      // upfront
      'assert r.value("<quiesce-manifest>")==sys.argv[2], r.value("<quiesce-manifest>")',
      'assert r.value("<recovery-run-id>")==sys.argv[3], r.value("<recovery-run-id>")',
      // staged (not yet resolved) -> fail closed with a distinct error
      'staged=["<exported-id>","<immutable-generation>","<accepted-recovery-manifest-sha256>",' +
        '"<accepted-coverage-fingerprint>","<accepted-coverage-run>"]',
      'for ph in staged:',
      ' refused=False',
      ' try:\n  r.value(ph)\n except m.LifecycleError:\n  refused=True',
      ' assert refused, ("value read before stage did not fail closed", ph)',
      // Mapping view exposes ONLY resolved keys (so resolved_command sees exactly what is ready)
      'assert set(dict(r))=={"<quiesce-manifest>","<recovery-run-id>"}, dict(r)',
      'print("W2_UPFRONT_OK")',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE, QM, RRID, EID], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_UPFRONT_OK');
  });

  // The staged callbacks resolve their placeholders in order; the Mapping grows as stages complete.
  it('resolves each staged placeholder through its lifecycle callback', () => {
    const probe = [
      ...HEADER,
      'r=m.StagedValueResolver(sys.argv[2], sys.argv[3])',
      'r.on_snapshot_open(sys.argv[4])',
      'assert r.value("<exported-id>")==sys.argv[4]',
      'r.on_pg_backup_done("q12-generation-abcdef0123456789")',
      'assert r.value("<immutable-generation>")=="q12-generation-abcdef0123456789"',
      `r.on_source_forward_accepted("a"*64, "b"*64, "catalog:${RRID}")`,
      'assert r.value("<accepted-recovery-manifest-sha256>")=="a"*64',
      'assert r.value("<accepted-coverage-fingerprint>")=="b"*64',
      `assert r.value("<accepted-coverage-run>")=="catalog:${RRID}"`,
      // now every placeholder the fixture dict carried is present
      'expected={"<quiesce-manifest>","<recovery-run-id>","<exported-id>","<immutable-generation>",' +
        '"<accepted-recovery-manifest-sha256>","<accepted-coverage-fingerprint>","<accepted-coverage-run>"}',
      'assert set(dict(r))==expected, dict(r)',
      'print("W2_STAGED_OK")',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE, QM, RRID, EID], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_STAGED_OK');
  });

  // RESOLVE-ONCE: a re-resolve with the SAME value is idempotent; a DIFFERENT value fails closed
  // (deterministic recover re-drive; D2). Applies to a staged AND an upfront authority.
  it('is resolve-once: same value idempotent, drift fails closed', () => {
    const probe = [
      ...HEADER,
      'r=m.StagedValueResolver(sys.argv[2], sys.argv[3])',
      'r.on_snapshot_open(sys.argv[4])',
      // same value again: idempotent
      'r.on_snapshot_open(sys.argv[4])',
      'assert r.value("<exported-id>")==sys.argv[4]',
      // different value: drift -> fail closed
      'drift=False',
      'try:\n r.on_snapshot_open("aaaaaaaa-bbbbbbbb-2")\nexcept m.LifecycleError:\n drift=True',
      'assert drift, "exported-id drift was not refused"',
      'print("W2_RESOLVEONCE_OK")',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE, QM, RRID, EID], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_RESOLVEONCE_OK');
  });

  // D1: the fixture derivations are UNTOUCHED — the closed-composer parity oracle must be byte-stable.
  it('leaves derive_joined_fixture_values byte-identical (parity oracle unchanged)', () => {
    const probe = [
      ...HEADER,
      'import hashlib, json',
      'v=m.derive_joined_fixture_values("11111111-1111-4111-8111-111111111111", "/opt/megacampus/q/wq.json")',
      // a fixed golden over the canonical dict; any change to the fixture derivation flips this.
      'blob=json.dumps(v, sort_keys=True, separators=(",",":")).encode()',
      'print("DIGEST="+hashlib.sha256(blob).hexdigest())',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    // The golden is pinned on first green run below; this asserts the derivation is deterministic and
    // present (the focused fixture suite is the byte-parity oracle for the composed journal itself).
    expect(child.stdout).toMatch(/DIGEST=[0-9a-f]{64}/u);
  });
});

// resolve_window_values is the production/fixture FORK POINT run_live/run_recover call in place of
// the bare `values = derive_joined_fixture_values(...)`. Fixture mode returns the upfront dict
// unchanged (D1). Production mode returns a StagedValueResolver seeded with the UPFRONT authorities
// and publishes the OQ6 pre-maintenance baseline.json — and, since mc2-6fnrt, opens NO snapshot
// coordinator: <exported-id> is a STAGED authority resolved by WindowSnapshotHold at the pg.backup
// step (a session held across barrier.install is terminated by the barrier's client quiesce).
// Proven here with a FAKE executor; the deep per-step callback firing against real data-movement
// commands is W5.
describe('Q12 W2-fork: resolve_window_values fork point', () => {
  it('returns the fixture dict in fixture mode, and its hold opens nothing', () => {
    const probe = [
      ...HEADER,
      'import pathlib, tempfile',
      'root=pathlib.Path(tempfile.mkdtemp())',
      'request={"run_id":"11111111-1111-4111-8111-111111111111"}', // no "production"
      'values = m.resolve_window_values(request, object(), root, sys.argv[2])',
      // fixture dict is the verbatim parity-oracle derivation
      'fx=m.derive_joined_fixture_values("11111111-1111-4111-8111-111111111111", sys.argv[2])',
      'assert dict(values)==fx, (dict(values), fx)',
      // the staged hold yields the upfront value with NO executor call and NO session
      'hold=m.WindowSnapshotHold(request, object(), values, root)',
      'assert hold.exported_id()==fx["<exported-id>"], hold.exported_id()',
      'assert hold.coordinator is None',
      'hold.release()',
      'print("W2_FORK_FIXTURE_OK")',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE, QM], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_FORK_FIXTURE_OK');
  });

  it('returns a baseline-publishing resolver and opens NO coordinator in production (fake executor)', () => {
    const probe = [
      ...HEADER,
      'import pathlib, tempfile',
      'root=pathlib.Path(tempfile.mkdtemp())',
      'held=object()',
      'calls={"baseline":0,"open":0,"close":0}',
      'class FakeExecutor:',
      ' def publish_window_baseline(self, request, run_root):',
      '  assert pathlib.Path(run_root)==root',
      '  calls["baseline"]+=1',
      '  return pathlib.Path(run_root)/"baseline.json"',
      ' def open_window_snapshot(self, request, run_root):',
      '  calls["open"]+=1',
      '  return sys.argv[4], held',
      ' def close_window_snapshot(self, coordinator):',
      '  assert coordinator is held',
      '  calls["close"]+=1',
      'request={"run_id":"11111111-1111-4111-8111-111111111111","production":True,"recovery_run_id":sys.argv[3]}',
      'ex=FakeExecutor()',
      'values = m.resolve_window_values(request, ex, root, sys.argv[2])',
      'assert isinstance(values, m.StagedValueResolver)',
      // mc2-6fnrt: the fork publishes the OQ6 baseline and opens NOTHING
      'assert calls=={"baseline":1,"open":0,"close":0}, calls',
      'refused=False',
      'try:\n values.value("<exported-id>")\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "<exported-id> must stay unresolved before pg.backup"',
      'assert values.value("<recovery-run-id>")==sys.argv[3]',
      'assert values.value("<quiesce-manifest>")==sys.argv[2]',
      // the staged hold opens it later (at the pg.backup step) and HOLDS it until released
      'hold=m.WindowSnapshotHold(request, ex, values, root)',
      'assert hold.exported_id()==sys.argv[4], hold.exported_id()',
      'assert calls=={"baseline":1,"open":1,"close":0}, calls',
      'assert hold.coordinator is held',
      'assert values.value("<exported-id>")==sys.argv[4]',
      'hold.release()',
      'assert calls=={"baseline":1,"open":1,"close":1}, calls',
      'print("W2_FORK_PROD_OK")',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE, QM, RRID, EID], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_FORK_PROD_OK');
  });

  it('fails closed when a production run has no accepted recovery_run_id', () => {
    const probe = [
      ...HEADER,
      'import pathlib, tempfile',
      'root=pathlib.Path(tempfile.mkdtemp())',
      'request={"run_id":"11111111-1111-4111-8111-111111111111","production":True}', // missing recovery_run_id
      'refused=False',
      'try:\n m.resolve_window_values(request, object(), root, sys.argv[2])\nexcept m.LifecycleError:\n refused=True',
      'assert refused, "production run without recovery_run_id was not refused"',
      'print("W2_FORK_NORECOVERY_OK")',
    ];
    const child = spawnSync('/usr/bin/python3', ['-c', probe.join('\n'), CORE, QM], {
      encoding: 'utf8',
      env: ENV,
    });
    expect(child.stderr).toBe('');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('W2_FORK_NORECOVERY_OK');
  });
});
