import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeJoinedRetainedBarrierFixture,
} from './fixtures/q12-retained-barrier-contract.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync('/tmp/mc2-q12-d5-root-');
  roots.push(value);
  return value;
}
describe('Ordinary-row journal grammar', () => {
  const CORE_PATH = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
  const REAL = 'c'.repeat(64);
  const ZERO = '0'.repeat(64);
  const HEX = 'a'.repeat(64);

  interface GrammarCase {
    command: string;
    outcome: string;
    phase: string;
    hash: string;
    kind?: string;
    accepted?: string | null;
    expect: 'accepted' | 'rejected';
  }

  function lifecycle(
    command: string,
    selector: string,
    target: string,
    expected: 'accepted' | 'rejected' = 'accepted'
  ): GrammarCase[] {
    return [
      { command, outcome: 'intent', phase: selector, hash: REAL, expect: expected },
      { command, outcome: 'capability_issued', phase: target, hash: REAL, expect: expected },
      { command, outcome: 'capability_claimed', phase: target, hash: REAL, expect: expected },
      { command, outcome: 'completed', phase: target, hash: REAL, expect: expected },
    ];
  }

  const CASES: GrammarCase[] = [
    ...lifecycle('operator.self-check', 'preflight', 'preflight'),
    {
      command: 'writers.quiesce',
      outcome: 'intent',
      phase: 'quiesced',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'writers.quiesce',
      outcome: 'capability_issued',
      phase: 'quiesced',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'writers.quiesce',
      outcome: 'capability_claimed',
      phase: 'quiesced',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'writers.quiesce',
      outcome: 'capability_completed',
      phase: 'quiesced',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'writers.quiesce',
      outcome: 'accepted',
      phase: 'quiesced',
      hash: REAL,
      kind: 'writer_quiesce_manifest',
      accepted: HEX,
      expect: 'accepted',
    },
    ...lifecycle('pg.backup', 'snapshot_exported', 'backup_committed'),
    ...lifecycle('pg.restore', 'restore_verified', 'restore_verified'),
    ...lifecycle('migration.base.apply', 'restore_verified', 'restore_verified'),
    ...lifecycle(
      'migration.observability.apply',
      'base_migration_guarded',
      'base_migration_guarded'
    ),
    {
      command: 'migration.observability.apply',
      outcome: 'completed',
      phase: 'migrations_applied',
      hash: REAL,
      expect: 'accepted',
    },
    ...lifecycle('source.forward', 'source_recovered', 'source_recovered'),
    ...lifecycle('reindex.plan', 'reindex_started', 'reindex_started'),
    ...lifecycle('reindex.worker.create', 'reindex_started', 'reindex_started'),
    ...lifecycle('reindex.execute', 'reindex_started', 'reindex_started'),
    ...lifecycle('reindex.verify', 'qdrant_verified', 'qdrant_verified'),
    ...lifecycle('deploy.prepare', 'qdrant_verified', 'qdrant_verified'),
    ...lifecycle('deploy.commit', 'activation_ready', 'activation_ready'),
    {
      command: 'writers.resume.forward',
      outcome: 'intent',
      phase: 'prepared_quiesced',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'writers.resume.forward',
      outcome: 'accepted',
      phase: 'prepared_quiesced',
      hash: REAL,
      kind: 'final_writer_manifest',
      accepted: HEX,
      expect: 'accepted',
    },
    {
      command: 'writers.resume.rollback',
      outcome: 'intent',
      phase: 'rollback_preparing',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'writers.resume.rollback',
      outcome: 'accepted',
      phase: 'rollback_preparing',
      hash: REAL,
      kind: 'final_writer_manifest',
      accepted: HEX,
      expect: 'accepted',
    },
    {
      command: 'root.advance',
      outcome: 'accepted',
      phase: 'preflight',
      hash: ZERO,
      expect: 'accepted',
    },
    {
      command: 'barrier.install',
      outcome: 'completed',
      phase: 'maintenance_guarded',
      hash: REAL,
      expect: 'accepted',
    },
    {
      command: 'pg.backup',
      outcome: 'intent',
      phase: 'backup_committed',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'pg.backup',
      outcome: 'completed',
      phase: 'snapshot_exported',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'pg.backup',
      outcome: 'accepted',
      phase: 'backup_committed',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'pg.backup',
      outcome: 'capability_completed',
      phase: 'backup_committed',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'pg.backup',
      outcome: 'completed',
      phase: 'backup_committed',
      hash: ZERO,
      expect: 'rejected',
    },
    {
      command: 'pg.backup',
      outcome: 'completed',
      phase: 'backup_committed',
      hash: REAL,
      kind: 'final_writer_manifest',
      accepted: HEX,
      expect: 'rejected',
    },
    {
      command: 'operator.self-check',
      outcome: 'completed',
      phase: 'maintenance_guarded',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'migration.base.apply',
      outcome: 'completed',
      phase: 'migrations_applied',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'barrier.verify-after-observability',
      outcome: 'completed',
      phase: 'migrations_applied',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'writers.quiesce',
      outcome: 'completed',
      phase: 'quiesced',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'writers.quiesce',
      outcome: 'accepted',
      phase: 'quiesced',
      hash: REAL,
      kind: 'none',
      accepted: null,
      expect: 'rejected',
    },
    {
      command: 'writers.quiesce',
      outcome: 'accepted',
      phase: 'quiesced',
      hash: ZERO,
      kind: 'writer_quiesce_manifest',
      accepted: HEX,
      expect: 'rejected',
    },
    {
      command: 'writers.resume.rollback',
      outcome: 'intent',
      phase: 'rollback_preparing',
      hash: ZERO,
      expect: 'rejected',
    },
    {
      command: 'writers.resume.rollback',
      outcome: 'accepted',
      phase: 'rollback_preparing',
      hash: ZERO,
      kind: 'final_writer_manifest',
      accepted: HEX,
      expect: 'rejected',
    },
    {
      command: 'writers.resume.forward',
      outcome: 'accepted',
      phase: 'prepared_quiesced',
      hash: REAL,
      kind: 'none',
      accepted: null,
      expect: 'rejected',
    },
    {
      command: 'writers.resume.forward',
      outcome: 'intent',
      phase: 'rollback_preparing',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'writers.resume.forward',
      outcome: 'completed',
      phase: 'prepared_quiesced',
      hash: REAL,
      expect: 'rejected',
    },
    {
      command: 'unknown.command',
      outcome: 'completed',
      phase: 'preflight',
      hash: REAL,
      expect: 'rejected',
    },
  ];

  it('accepts exactly the amendment ordinary-row table and rejects every deviation', () => {
    const script = [
      'import importlib.util, json, sys',
      `spec = importlib.util.spec_from_file_location('q12core', ${JSON.stringify(CORE_PATH)})`,
      'core = importlib.util.module_from_spec(spec)',
      "sys.modules['q12core'] = core",
      'spec.loader.exec_module(core)',
      'cases = json.load(sys.stdin)',
      'verdicts = []',
      'for case in cases:',
      '    entry = {',
      "        'schema': 'megacampus.q12.cutover-journal/v1',",
      "        'run_id': '3b241101-e2bb-4255-8caf-4136c566a962',",
      "        'seq': 1,",
      "        'phase': case['phase'],",
      "        'outcome': case['outcome'],",
      "        'timestamp': '2026-07-14T00:00:00.000Z',",
      "        'release_sha': '0123456789abcdef0123456789abcdef01234567',",
      "        'operator_digest': '1' * 64,",
      "        'command_id': case['command'],",
      "        'command_sha256': case['hash'],",
      "        'lease_epoch': 'cutover',",
      "        'previous_hash': '0' * 64,",
      "        'entry_hash': '2' * 64,",
      "        'rotation_required': False,",
      "        'resource_manifest_sha256': '3' * 64,",
      "        'quiesce_manifest_sha256': '4' * 64,",
      "        'capability_manifest_sha256': '5' * 64,",
      "        'accepted_object_kind': case.get('kind', 'none'),",
      "        'accepted_object_sha256': case.get('accepted'),",
      '    }',
      '    try:',
      '        core.validate_journal_entry_grammar(entry)',
      "        verdicts.append('accepted')",
      '    except core.LifecycleError:',
      "        verdicts.append('rejected')",
      'print(json.dumps(verdicts))',
    ].join('\n');
    const probe = spawnSync('/usr/bin/python3', ['-c', script], {
      encoding: 'utf8',
      input: JSON.stringify(CASES),
    });
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const verdicts = JSON.parse(probe.stdout) as string[];
    for (const [index, grammarCase] of CASES.entries()) {
      expect(
        verdicts[index],
        `${grammarCase.command} ${grammarCase.outcome} ${grammarCase.phase} hash=${grammarCase.hash === ZERO ? 'ZERO' : 'real'} kind=${grammarCase.kind ?? 'none'}`
      ).toBe(grammarCase.expect);
    }
  });
});

describe('Segment-aware stable bindings', () => {
  const CORE_PATH = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
  const REQ_QUIESCE = 'e'.repeat(64);
  const REQ_RESOURCE = '3'.repeat(64);
  const STEPPED = 'd'.repeat(64);
  const ZERO64 = '0'.repeat(64);

  interface WalkRow {
    command: string;
    outcome: string;
    quiesce: string;
    resource: string;
  }

  function walkProbe(rows: WalkRow[]): string {
    const script = [
      'import importlib.util, json, sys',
      `spec = importlib.util.spec_from_file_location('q12core', ${JSON.stringify(CORE_PATH)})`,
      'core = importlib.util.module_from_spec(spec)',
      "sys.modules['q12core'] = core",
      'spec.loader.exec_module(core)',
      'rows = json.load(sys.stdin)',
      'request = {',
      "    'run_id': '3b241101-e2bb-4255-8caf-4136c566a962',",
      "    'release_sha': '0123456789abcdef0123456789abcdef01234567',",
      "    'operator_digest': '1' * 64,",
      `    'resource_manifest_sha256': ${JSON.stringify(REQ_RESOURCE)},`,
      `    'quiesce_manifest_sha256': ${JSON.stringify(REQ_QUIESCE)},`,
      "    'rotation_required': False,",
      '}',
      'entries = [',
      '    {',
      "        'run_id': request['run_id'],",
      "        'release_sha': request['release_sha'],",
      "        'operator_digest': request['operator_digest'],",
      "        'rotation_required': False,",
      "        'command_id': row['command'],",
      "        'outcome': row['outcome'],",
      "        'quiesce_manifest_sha256': row['quiesce'],",
      "        'resource_manifest_sha256': row['resource'],",
      '    }',
      '    for row in rows',
      ']',
      'try:',
      '    core.validate_stable_binding_walk(entries, request)',
      "    print('accepted')",
      'except core.LifecycleError as error:',
      "    print(f'rejected: {error}')",
    ].join('\n');
    const probe = spawnSync('/usr/bin/python3', ['-c', script], {
      encoding: 'utf8',
      input: JSON.stringify(rows),
    });
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    return probe.stdout.trim();
  }

  function row(overrides: Partial<WalkRow>): WalkRow {
    return {
      command: 'barrier.install',
      outcome: 'completed',
      quiesce: REQ_QUIESCE,
      resource: REQ_RESOURCE,
      ...overrides,
    };
  }

  it('accepts the isolated request-global shape without any quiesced row', () => {
    expect(walkProbe([row({}), row({}), row({})])).toBe('accepted');
  });

  it('accepts the joined two-segment quiesce shape and rejects deviations', () => {
    const joined = [
      row({ quiesce: ZERO64 }),
      row({ command: 'writers.quiesce', outcome: 'intent', quiesce: ZERO64 }),
      row({ command: 'writers.quiesce', outcome: 'accepted', quiesce: REQ_QUIESCE }),
      row({ quiesce: REQ_QUIESCE }),
    ];
    expect(walkProbe(joined)).toBe('accepted');
    const zeroAfterSwitch = [
      row({ quiesce: ZERO64 }),
      row({ command: 'writers.quiesce', outcome: 'accepted', quiesce: REQ_QUIESCE }),
      row({ quiesce: ZERO64 }),
    ];
    expect(walkProbe(zeroAfterSwitch)).toContain('rejected');
    const zeroAcceptanceRow = [
      row({ quiesce: ZERO64 }),
      row({ command: 'writers.quiesce', outcome: 'accepted', quiesce: ZERO64 }),
    ];
    expect(walkProbe(zeroAcceptanceRow)).toContain('rejected');
    const foreignBeforeSwitch = [row({ quiesce: 'f'.repeat(64) })];
    expect(walkProbe(foreignBeforeSwitch)).toContain('rejected');
  });

  it('accepts resource-manifest steps only at the two frozen evidence rows', () => {
    const stepped = [
      row({}),
      row({ command: 'pg.backup', outcome: 'intent', resource: STEPPED }),
      row({ resource: STEPPED }),
      row({ command: 'deploy.prepare', outcome: 'completed', resource: 'b'.repeat(64) }),
      row({ resource: 'b'.repeat(64) }),
    ];
    expect(walkProbe(stepped)).toBe('accepted');
    expect(walkProbe([row({ resource: STEPPED })])).toContain('rejected');
    expect(walkProbe([row({}), row({ resource: STEPPED })])).toContain('rejected');
    expect(
      walkProbe([row({}), row({ command: 'pg.backup', outcome: 'completed', resource: STEPPED })])
    ).toContain('rejected');
  });
});

describe('Serializer primitives for joined composition', () => {
  const CORE_PATH = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');

  function enginePreamble(quiesceInit: 'request' | 'zero'): string {
    return [
      'import importlib.util, json, sys, tempfile, uuid, pathlib',
      `spec = importlib.util.spec_from_file_location('q12core', ${JSON.stringify(CORE_PATH)})`,
      'core = importlib.util.module_from_spec(spec)',
      "sys.modules['q12core'] = core",
      'spec.loader.exec_module(core)',
      "root = tempfile.mkdtemp(prefix='mc2-q12-d5-root-', dir='/tmp')",
      'run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, root))',
      'request = {',
      "    'run_root': root,",
      "    'run_id': run_id,",
      "    'release_sha': '0123456789abcdef0123456789abcdef01234567',",
      "    'operator_digest': '1' * 64,",
      "    'resource_manifest_sha256': '2' * 64,",
      "    'quiesce_manifest_sha256': 'e' * 64,",
      "    'expected_catalog_sha256': 'a' * 64,",
      "    'rotation_required': False,",
      '}',
      'engine = core.Engine(request, object())',
      quiesceInit === 'zero' ? "engine.current_quiesce_manifest_sha256 = '0' * 64" : 'pass',
      'manifest = core.load_manifest()',
      "values = core.derive_joined_fixture_values(run_id, root + '/w.json')",
      'rows = lambda: [(entry["phase"], entry["outcome"], entry["command_id"], entry["quiesce_manifest_sha256"]) for entry in engine.journal]',
      'import atexit, shutil',
      'atexit.register(shutil.rmtree, root, ignore_errors=True)',
    ].join('\n');
  }

  function primitiveProbe(script: string): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    return spawnSync('/usr/bin/python3', ['-c', script], { encoding: 'utf8' });
  }

  it('emits one complete ordinary lifecycle through the production serializer', () => {
    const probe = primitiveProbe(
      [
        enginePreamble('request'),
        "engine.append_ordinary_lifecycle(manifest, 'pg.restore', values)",
        'engine.reload_durable()',
        'capability_states = sorted(p.name for p in pathlib.Path(root, "capabilities", "completed").iterdir())',
        'result_files = sorted(p.name for p in pathlib.Path(root).glob("ordinary-command-result-*.json"))',
        'print(json.dumps({"rows": rows(), "completed": capability_states, "results": result_files}))',
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const output = JSON.parse(probe.stdout) as {
      rows: [string, string, string, string][];
      completed: string[];
      results: string[];
    };
    expect(output.rows.map(row => row.slice(0, 3))).toEqual([
      ['restore_verified', 'intent', 'pg.restore'],
      ['restore_verified', 'capability_issued', 'pg.restore'],
      ['restore_verified', 'capability_claimed', 'pg.restore'],
      ['restore_verified', 'completed', 'pg.restore'],
    ]);
    expect(output.completed).toEqual(['pg.restore--cutover.json']);
    expect(output.results).toEqual(['ordinary-command-result-pg.restore-cutover.json']);
  });

  it('switches the quiesce binding exactly at the accepted quiesce row', () => {
    const probe = primitiveProbe(
      [
        enginePreamble('zero'),
        "engine.append_ordinary_lifecycle(manifest, 'writers.quiesce', values, quiesce_object_sha256='b' * 64)",
        'engine.reload_durable()',
        'print(json.dumps({"rows": rows()}))',
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const output = JSON.parse(probe.stdout) as { rows: [string, string, string, string][] };
    expect(output.rows.map(row => [row[1], row[3]])).toEqual([
      ['intent', '0'.repeat(64)],
      ['capability_issued', '0'.repeat(64)],
      ['capability_claimed', '0'.repeat(64)],
      ['capability_completed', '0'.repeat(64)],
      ['accepted', 'e'.repeat(64)],
    ]);
  });

  it('appends a controller milestone only over its durable witness', () => {
    const withWitness = primitiveProbe(
      [
        enginePreamble('request'),
        "engine.append_ordinary_lifecycle(manifest, 'migration.observability.apply', values)",
        "engine.append_controller_milestone(manifest, 'migrations_applied', 'migration.observability.apply', values)",
        'engine.reload_durable()',
        'witness = [entry for entry in engine.journal if entry["outcome"] == "completed"][0]',
        'milestone = engine.journal[-1]',
        'print(json.dumps({"phase": milestone["phase"], "command": milestone["command_id"], "carried": milestone["capability_manifest_sha256"] == witness["capability_manifest_sha256"]}))',
      ].join('\n')
    );
    expect(withWitness.stderr).toBe('');
    expect(withWitness.status).toBe(0);
    expect(JSON.parse(withWitness.stdout)).toEqual({
      phase: 'migrations_applied',
      command: 'migration.observability.apply',
      carried: true,
    });
    const withoutWitness = primitiveProbe(
      [
        enginePreamble('request'),
        'try:',
        "    engine.append_controller_milestone(manifest, 'migrations_applied', 'migration.observability.apply', values)",
        "    print('accepted')",
        'except core.LifecycleError as error:',
        "    print(f'rejected: {error}')",
      ].join('\n')
    );
    expect(withoutWitness.status).toBe(0);
    expect(withoutWitness.stdout).toContain('rejected');
  });

  it('appends a retained selector only from a matching current head', () => {
    const probe = primitiveProbe(
      [
        enginePreamble('request'),
        "command = core.resolved_command(manifest, 'barrier.install', request)",
        'try:',
        "    engine.append_retained_selector_from_current_head('install', command)",
        "    print('accepted-empty')",
        'except core.LifecycleError:',
        "    print('rejected-empty')",
        "engine.append_ordinary_lifecycle(manifest, 'operator.self-check', values)",
        "entry = engine.append_retained_selector_from_current_head('install', command)",
        'anchors = [row for row in engine.journal if row["command_id"] == "root.advance"]',
        'print(json.dumps({"phase": entry["phase"], "outcome": entry["outcome"], "anchors": len(anchors)}))',
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const lines = probe.stdout.trim().split('\n');
    expect(lines[0]).toBe('rejected-empty');
    expect(JSON.parse(lines[1])).toEqual({
      phase: 'maintenance_guarded',
      outcome: 'intent',
      anchors: 0,
    });
  });
});

describe('Dual-path final-writer manifests with Root inventory', () => {
  const CORE_PATH = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');

  function fwmProbe(body: string): { status: number | null; stdout: string; stderr: string } {
    const script = [
      'import importlib.util, json, sys, tempfile, uuid, pathlib',
      `spec = importlib.util.spec_from_file_location('q12core', ${JSON.stringify(CORE_PATH)})`,
      'core = importlib.util.module_from_spec(spec)',
      "sys.modules['q12core'] = core",
      'spec.loader.exec_module(core)',
      "root = tempfile.mkdtemp(prefix='mc2-q12-d5-root-', dir='/tmp')",
      'run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, root))',
      'def quiesce_writer(klass, service, index):',
      '    digit = str(index % 10)',
      '    return {',
      "        'class': klass,",
      "        'id': (digit * 64)[:64],",
      "        'name': 'megacampus-' + service,",
      "        'project': 'megacampus-blue' if klass in ('production-api', 'production-web') else 'megacampus',",
      "        'service': service,",
      "        'config_files': '/opt/megacampus/docker-compose.production.yml',",
      "        'working_dir': '/opt/megacampus',",
      "        'image_id': 'sha256:' + (digit * 64)[:64],",
      "        'image_ref': 'ghcr.io/megacampus/' + service + '@sha256:' + (digit * 64)[:64],",
      "        'prior_running': True,",
      "        'prior_status': 'running',",
      "        'healthcheck_present': service in ('api', 'web'),",
      "        'prior_health_status': 'healthy' if service in ('api', 'web') else None,",
      "        'prior_restart_policy': {'name': 'unless-stopped', 'maximum_retry_count': 0},",
      "        'temporary_restart_policy': {'name': 'no', 'maximum_retry_count': 0},",
      '    }',
      "services = ['api', 'web', 'worker', 'worker-stage6', 'worker-stage7']",
      'writers = []',
      'for index, service in enumerate(services):',
      "    kind = 'api' if service == 'api' else ('web' if service == 'web' else 'worker')",
      "    writers.append(quiesce_writer('production-' + kind, service, index + 1))",
      'for index, service in enumerate(services):',
      "    kind = 'api' if service == 'api' else ('web' if service == 'web' else 'worker')",
      "    writers.append(quiesce_writer('development-' + kind, service + '-dev', index + 6))",
      'quiesce = {',
      "    'schema_version': 'megacampus.q12.writer-quiesce/v1',",
      "    'run_id': run_id,",
      "    'status': 'quiesced',",
      "    'barrier': {'state': 'recovery_ready_guarded', 'zero_guard_residue': False, 'expected_catalog_sha256': 'a' * 64, 'probe_receipt_sha256': 'b' * 64},",
      "    'writers': writers,",
      '}',
      'quiesce_bytes = core.complete_object(quiesce)',
      'import atexit, shutil',
      'atexit.register(shutil.rmtree, root, ignore_errors=True)',
      "request = {'run_root': root, 'run_id': run_id, 'release_sha': '0123456789abcdef0123456789abcdef01234567', 'operator_digest': '1' * 64, 'resource_manifest_sha256': '2' * 64, 'quiesce_manifest_sha256': core.sha256(quiesce_bytes), 'expected_catalog_sha256': 'a' * 64, 'rotation_required': False}",
      'engine = core.Engine(request, object())',
      'manifest = core.load_manifest()',
      "values = core.derive_joined_fixture_values(run_id, root + '/w.json')",
      body,
    ].join('\n');
    return spawnSync('/usr/bin/python3', ['-c', script], { encoding: 'utf8' });
  }

  it('publishes the eleven-key forward manifest at the forward path from Root authority only', () => {
    const probe = fwmProbe(
      [
        "engine.append_ordinary_lifecycle(manifest, 'operator.self-check', values)",
        'inventory = engine.derive_root_writer_inventory(quiesce_bytes, include_targets=True)',
        "command = core.resolved_command(manifest, 'writers.resume.forward', request)",
        "entry = engine.publish_final_writer_manifest('forward', inventory, command)",
        'engine.reload_durable()',
        "path = pathlib.Path(root, 'final-writer-manifest-forward-' + run_id + '.json')",
        'value = json.loads(path.read_bytes())',
        'rows = [(e["phase"], e["outcome"], e["command_id"], e["command_sha256"]) for e in engine.journal[-2:]]',
        'print(json.dumps({"keys": sorted(value), "mode": value["mode"], "final": [(w["class"], w["service"], w["intended_running"], w["intended_restart_policy"]["name"]) for w in value["final_writers"]], "held": [(w["class"], w["intended_running"]) for w in value["held_writers"]], "target_ids": [w["id"] for w in value["final_writers"] if w["name"].endswith("-q12fixture")], "target_projects": [w["project"] for w in value["final_writers"][:5]], "rows": rows, "expected_hash": command["command_sha256"]}))',
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const output = JSON.parse(probe.stdout) as {
      keys: string[];
      mode: string;
      final: [string, string, boolean, string][];
      held: [string, boolean][];
      target_ids: string[];
      target_projects: string[];
      rows: [string, string, string, string][];
      expected_hash: string;
    };
    expect(output.keys).toEqual(
      [
        'expected_catalog_sha256',
        'final_writers',
        'held_writers',
        'input_checkpoint_sha256',
        'lease_epoch',
        'mode',
        'publication_intent_journal_entry_hash',
        'release_sha',
        'run_id',
        'schema_version',
        'writer_quiesce_manifest_sha256',
      ].sort()
    );
    expect(output.mode).toBe('forward');
    expect(output.final).toHaveLength(10);
    expect(output.final.filter(([klass]) => klass.startsWith('development-'))).toHaveLength(5);
    expect(
      output.final.filter(([, , running, policy]) => running && policy === 'unless-stopped')
    ).toHaveLength(10);
    expect(output.held).toEqual([
      ['production-worker', false],
      ['production-worker', false],
      ['production-worker', false],
      ['production-api', false],
      ['production-web', false],
    ]);
    expect(output.target_ids).toHaveLength(5);
    expect(output.target_projects).toEqual([
      'megacampus-green',
      'megacampus-green',
      'megacampus',
      'megacampus',
      'megacampus',
    ]);
    expect(output.final.slice(0, 5)).toEqual([
      ['production-api', 'api', true, 'unless-stopped'],
      ['production-web', 'web', true, 'unless-stopped'],
      ['production-worker', 'worker', true, 'unless-stopped'],
      ['production-worker', 'worker-stage6', true, 'unless-stopped'],
      ['production-worker', 'worker-stage7', true, 'unless-stopped'],
    ]);
    expect(output.rows).toEqual([
      ['prepared_quiesced', 'intent', 'writers.resume.forward', output.expected_hash],
      ['prepared_quiesced', 'accepted', 'writers.resume.forward', output.expected_hash],
    ]);
  });

  it('refuses a second publication at either mode path and wrong-mode reuse', () => {
    const probe = fwmProbe(
      [
        "engine.append_ordinary_lifecycle(manifest, 'operator.self-check', values)",
        'inventory = engine.derive_root_writer_inventory(quiesce_bytes, include_targets=True)',
        "forward_command = core.resolved_command(manifest, 'writers.resume.forward', request)",
        "engine.publish_final_writer_manifest('forward', inventory, forward_command)",
        'try:',
        "    engine.publish_final_writer_manifest('forward', inventory, forward_command)",
        "    print('duplicate-accepted')",
        'except core.LifecycleError:',
        "    print('duplicate-rejected')",
        "rollback_command = core.resolved_command(manifest, 'writers.resume.rollback', request)",
        "engine.publish_final_writer_manifest('rollback', inventory, rollback_command)",
        "forward_path = pathlib.Path(root, 'final-writer-manifest-forward-' + run_id + '.json')",
        "rollback_path = pathlib.Path(root, 'final-writer-manifest-rollback-' + run_id + '.json')",
        'forward_value = json.loads(forward_path.read_bytes())',
        'rollback_value = json.loads(rollback_path.read_bytes())',
        'forward_targets = [w for w in forward_value["final_writers"] if w["name"].endswith("-q12fixture")]',
        'held_targets = rollback_value["held_writers"]',
        'held_projection = [dict(w, intended_running=False, intended_restart_policy={"name": "no", "maximum_retry_count": 0}) for w in forward_targets]',
        'print(json.dumps({"both_exist": forward_path.exists() and rollback_path.exists(), "held_equal_targets": held_targets == held_projection, "held_never_resumable": all((not w["intended_running"]) and w["intended_restart_policy"] == {"name": "no", "maximum_retry_count": 0} for w in held_targets), "rollback_final": [(w["class"], w["intended_running"], w["intended_restart_policy"]["name"]) for w in rollback_value["final_writers"]]}))',
      ].join('\n')
    );
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const lines = probe.stdout.trim().split('\n');
    expect(lines[0]).toBe('duplicate-rejected');
    const output = JSON.parse(lines[1]) as {
      both_exist: boolean;
      held_equal_targets: boolean;
      held_never_resumable: boolean;
      rollback_final: [string, boolean, string][];
    };
    expect(output.both_exist).toBe(true);
    expect(output.held_equal_targets).toBe(true);
    expect(output.held_never_resumable).toBe(true);
    expect(output.rollback_final).toHaveLength(10);
    expect(
      output.rollback_final.every(([, running, policy]) => running && policy === 'unless-stopped')
    ).toBe(true);
  });
});

describe('Joined forward composition', () => {
  const MANIFEST_PATH = join(repoRoot, 'deploy/qdrant/q12-command-manifest.json');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    commands: Record<string, { argv: string[] }>;
  };
  const CATALOG_SHA = createHash('sha256')
    .update('{"schema_version":"fixture/v1"}\n', 'utf8')
    .digest('hex');
  const RELEASE = '0123456789abcdef0123456789abcdef01234567';
  const ZERO64 = '0'.repeat(64);

  function sha256Hex(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  function uuid5(namespace: string, name: string): string {
    const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
    const hash = createHash('sha1')
      .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
      .digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function substitutions(runId: string, quiescePath: string): Record<string, string> {
    const digest = (salt: string) => sha256Hex(`q12:${salt}:${runId}`);
    const snapshot = digest('snapshot-export');
    return {
      '<run-id>': runId,
      '<expected-post-migration-catalog-sha256>': CATALOG_SHA,
      '<release-sha>': RELEASE,
      '<quiesce-manifest>': quiescePath,
      '<exported-id>': `${snapshot.slice(0, 8)}-${snapshot.slice(8, 16)}-1`,
      '<immutable-generation>': `q12fixture-generation-${digest('backup-generation').slice(0, 16)}`,
      '<recovery-run-id>': uuid5(runId, 'q12-source-recovery'),
      '<accepted-recovery-manifest-sha256>': digest('recovery-manifest'),
      '<accepted-coverage-fingerprint>': digest('coverage-fingerprint'),
      '<accepted-coverage-run>': [
        uuid5(runId, 'q12-coverage-org'),
        uuid5(runId, 'q12-coverage-course'),
        uuid5(runId, 'q12-coverage-run'),
      ].join(':'),
    };
  }

  function resolvedHash(commandId: string, subs: Record<string, string>): string {
    const argv = manifest.commands[commandId].argv.map(value => {
      let rendered = value;
      for (const [token, replacement] of Object.entries(subs)) {
        rendered = rendered.split(token).join(replacement);
      }
      return rendered;
    });
    return createHash('sha256').update(JSON.stringify(argv)).digest('hex');
  }

  function quiesceWriter(klass: string, service: string, index: number): Record<string, unknown> {
    const digit = String(index % 10);
    return {
      class: klass,
      id: digit.repeat(64),
      name: `megacampus-${service}`,
      project:
        klass === 'production-api' || klass === 'production-web' ? 'megacampus-blue' : 'megacampus',
      service,
      config_files: '/opt/megacampus/docker-compose.production.yml',
      working_dir: '/opt/megacampus',
      image_id: `sha256:${digit.repeat(64)}`,
      image_ref: `ghcr.io/megacampus/${service}@sha256:${digit.repeat(64)}`,
      prior_running: true,
      prior_status: 'running',
      healthcheck_present: service === 'api' || service === 'web',
      prior_health_status: service === 'api' || service === 'web' ? 'healthy' : null,
      prior_restart_policy: { name: 'unless-stopped', maximum_retry_count: 0 },
      temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
    };
  }

  function writeQuiesceManifest(runRoot: string, runId: string): string {
    const services = ['api', 'web', 'worker', 'worker-stage6', 'worker-stage7'];
    const kind = (service: string) =>
      service === 'api' ? 'api' : service === 'web' ? 'web' : 'worker';
    const writers = [
      ...services.map((service, index) =>
        quiesceWriter(`production-${kind(service)}`, service, index + 1)
      ),
      ...services.map((service, index) =>
        quiesceWriter(`development-${kind(service)}`, `${service}-dev`, index + 6)
      ),
    ];
    const value = {
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: runId,
      status: 'quiesced',
      barrier: {
        state: 'recovery_ready_guarded',
        zero_guard_residue: false,
        expected_catalog_sha256: 'a'.repeat(64),
        probe_receipt_sha256: 'b'.repeat(64),
      },
      writers,
    };
    const path = join(runRoot, `writer-quiesce-${runId}.json`);
    writeFileSync(path, `${canonical(value)}\n`, { mode: 0o400 });
    return path;
  }

  function lifecycle4(
    command: string,
    selector: string,
    target: string
  ): [string, string, string][] {
    return [
      [selector, 'intent', command],
      [target, 'capability_issued', command],
      [target, 'capability_claimed', command],
      [target, 'completed', command],
    ];
  }

  it('emits the exact amendment forward chronology through one canonical journal', async () => {
    const runRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
    const quiescePath = writeQuiesceManifest(runRoot, runId);
    const fixture = await materializeJoinedRetainedBarrierFixture({
      runRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const quiesceSha = createHash('sha256').update(readFileSync(quiescePath)).digest('hex');
    const subs = substitutions(runId, quiescePath);
    const expected: [string, string, string][] = [
      ...lifecycle4('operator.self-check', 'preflight', 'preflight'),
      ...lifecycle4('barrier.install', 'maintenance_guarded', 'maintenance_guarded'),
      ['quiesced', 'intent', 'writers.quiesce'],
      ['quiesced', 'capability_issued', 'writers.quiesce'],
      ['quiesced', 'capability_claimed', 'writers.quiesce'],
      ['quiesced', 'capability_completed', 'writers.quiesce'],
      ['quiesced', 'accepted', 'writers.quiesce'],
      ['snapshot_exported', 'intent', 'pg.backup'],
      ['backup_committed', 'capability_issued', 'pg.backup'],
      ['backup_committed', 'capability_claimed', 'pg.backup'],
      ['backup_committed', 'completed', 'pg.backup'],
      ...lifecycle4('pg.restore', 'restore_verified', 'restore_verified'),
      ...lifecycle4('migration.base.apply', 'restore_verified', 'restore_verified'),
      ...lifecycle4(
        'barrier.verify-after-base',
        'base_migration_guarded',
        'base_migration_guarded'
      ),
      ...lifecycle4(
        'migration.observability.apply',
        'base_migration_guarded',
        'base_migration_guarded'
      ),
      ...lifecycle4(
        'barrier.verify-after-observability',
        'observability_migration_guarded',
        'observability_migration_guarded'
      ),
      ['migrations_applied', 'completed', 'migration.observability.apply'],
      ...lifecycle4('barrier.prepare-recovery', 'recovery_ready_guarded', 'recovery_ready_guarded'),
      ...lifecycle4('source.forward', 'source_recovered', 'source_recovered'),
      ...lifecycle4('reindex.plan', 'reindex_started', 'reindex_started'),
      ...lifecycle4('reindex.worker.create', 'reindex_started', 'reindex_started'),
      ...lifecycle4('reindex.execute', 'reindex_started', 'reindex_started'),
      ...lifecycle4('reindex.verify', 'qdrant_verified', 'qdrant_verified'),
      ...lifecycle4('deploy.prepare', 'qdrant_verified', 'qdrant_verified'),
      ['prepared_quiesced', 'intent', 'writers.resume.forward'],
      ['prepared_quiesced', 'accepted', 'writers.resume.forward'],
      ...lifecycle4('deploy.commit', 'activation_ready', 'activation_ready'),
      ['activation_committing', 'intent', 'barrier.activate'],
      ['activated', 'capability_issued', 'barrier.activate'],
      ['activated', 'capability_claimed', 'barrier.activate'],
      ['activated', 'completed', 'barrier.activate'],
    ];
    expect(
      fixture.journalEntries.map(entry => [entry.phase, entry.outcome, entry.command_id])
    ).toEqual(expected);
    for (const entry of fixture.journalEntries) {
      expect(entry.command_id, `${entry.seq}`).not.toBe('root.advance');
      expect(entry.command_sha256, `${entry.seq} ${entry.command_id}`).toBe(
        resolvedHash(String(entry.command_id), subs)
      );
    }
    const acceptedIndex = fixture.journalEntries.findIndex(
      entry => entry.command_id === 'writers.quiesce' && entry.outcome === 'accepted'
    );
    for (const [index, entry] of fixture.journalEntries.entries()) {
      expect(entry.quiesce_manifest_sha256, `${index}`).toBe(
        index < acceptedIndex ? ZERO64 : quiesceSha
      );
    }
    const step1 = sha256Hex(`q12:resource-step:snapshot:${runId}`);
    const step2 = sha256Hex(`q12:resource-step:targets:${runId}`);
    const backupIntent = fixture.journalEntries.findIndex(
      entry => entry.command_id === 'pg.backup' && entry.outcome === 'intent'
    );
    const prepareCompleted = fixture.journalEntries.findIndex(
      entry => entry.command_id === 'deploy.prepare' && entry.outcome === 'completed'
    );
    for (const [index, entry] of fixture.journalEntries.entries()) {
      const expectedResource =
        index < backupIntent ? '2'.repeat(64) : index < prepareCompleted ? step1 : step2;
      expect(entry.resource_manifest_sha256, `${index}`).toBe(expectedResource);
    }
    expect(fixture.forwardFinalWriterManifestPath).toBe(
      join(runRoot, `final-writer-manifest-forward-${runId}.json`)
    );
    expect(fixture.rollbackFinalWriterManifestPath).toBeNull();
    const fwm = JSON.parse(readFileSync(fixture.forwardFinalWriterManifestPath!, 'utf8')) as {
      final_writers: { id: string }[];
      held_writers: unknown[];
      writer_quiesce_manifest_sha256: string;
    };
    expect(fwm.final_writers).toHaveLength(10);
    expect(fwm.held_writers).toHaveLength(5);
    expect(fwm.writer_quiesce_manifest_sha256).toBe(quiesceSha);
    expect(fixture.ordinaryHeadEntryHashes.get('migrations_applied')).toBeDefined();
  });

  it('fails closed before producer state on unknown keys, caller authority, and a missing quiesce path', async () => {
    const runRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
    const quiescePath = writeQuiesceManifest(runRoot, runId);
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'forward',
        quiesceManifestPath: quiescePath,
        commandSha256: 'f'.repeat(64),
      } as never)
    ).rejects.toThrow(/unknown joined fixture key/);
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'forward',
      } as never)
    ).rejects.toThrow(/requires the W quiesce manifest path/);
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'forward',
        quiesceManifestPath: quiescePath,
        quiesce_manifest_sha256: 'f'.repeat(64),
      } as never)
    ).rejects.toThrow(/caller quiesce digest override is forbidden/);
    expect(existsSync(join(runRoot, 'phase.jsonl'))).toBe(false);
  });
});

describe('Joined rollback profiles', () => {
  function quiesceWriterR(klass: string, service: string, index: number): Record<string, unknown> {
    const digit = String(index % 10);
    return {
      class: klass,
      id: digit.repeat(64),
      name: `megacampus-${service}`,
      project:
        klass === 'production-api' || klass === 'production-web' ? 'megacampus-blue' : 'megacampus',
      service,
      config_files: '/opt/megacampus/docker-compose.production.yml',
      working_dir: '/opt/megacampus',
      image_id: `sha256:${digit.repeat(64)}`,
      image_ref: `ghcr.io/megacampus/${service}@sha256:${digit.repeat(64)}`,
      prior_running: true,
      prior_status: 'running',
      healthcheck_present: service === 'api' || service === 'web',
      prior_health_status: service === 'api' || service === 'web' ? 'healthy' : null,
      prior_restart_policy: { name: 'unless-stopped', maximum_retry_count: 0 },
      temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
    };
  }

  function writeQuiesce(runRoot: string, runId: string): string {
    const services = ['api', 'web', 'worker', 'worker-stage6', 'worker-stage7'];
    const kind = (service: string) =>
      service === 'api' ? 'api' : service === 'web' ? 'web' : 'worker';
    const writers = [
      ...services.map((service, index) =>
        quiesceWriterR(`production-${kind(service)}`, service, index + 1)
      ),
      ...services.map((service, index) =>
        quiesceWriterR(`development-${kind(service)}`, `${service}-dev`, index + 6)
      ),
    ];
    const value = {
      schema_version: 'megacampus.q12.writer-quiesce/v1',
      run_id: runId,
      status: 'quiesced',
      barrier: {
        state: 'recovery_ready_guarded',
        zero_guard_residue: false,
        expected_catalog_sha256: 'a'.repeat(64),
        probe_receipt_sha256: 'b'.repeat(64),
      },
      writers,
    };
    const path = join(runRoot, `writer-quiesce-${runId}.json`);
    writeFileSync(path, `${canonical(value)}\n`, { mode: 0o400 });
    return path;
  }

  const NEXT: Record<number, string> = {
    1: 'verify-after-base',
    2: 'verify-after-observability',
    3: 'prepare-recovery',
    4: 'activate',
  };

  function frontierFor(prefix: number): Record<string, unknown> {
    return {
      operation: NEXT[prefix],
      form: 'issued',
      history: 'initial',
      lease: 'continuous',
      copySet: 'cutover',
      exactSuccessBeforeDisposition: false,
      activationCommitRace: 'none',
    };
  }

  async function materializeRollback(prefix: number, withFrontier: boolean) {
    const runRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
    const quiescePath = writeQuiesce(runRoot, runId);
    const spec = {
      runRoot,
      joinedProfile: 'rollback' as const,
      completedPrefixLength: prefix as 1 | 2 | 3 | 4,
      quiesceManifestPath: quiescePath,
      ...(withFrontier ? { frontier: frontierFor(prefix) } : {}),
    };
    const fixture = await materializeJoinedRetainedBarrierFixture(spec as never);
    return { fixture, runRoot, runId };
  }

  const D5_ORDER = [
    'install',
    'verify-after-base',
    'verify-after-observability',
    'prepare-recovery',
  ];

  it.each([1, 2, 3, 4] as const)('composes the clean rollback prefix %s', async prefix => {
    const { fixture, runRoot, runId } = await materializeRollback(prefix, false);
    const rows = fixture.journalEntries;
    const completedD5 = rows
      .filter(
        entry => String(entry.command_id).startsWith('barrier.') && entry.outcome === 'completed'
      )
      .map(entry => String(entry.command_id).replace('barrier.', ''));
    expect(completedD5).toEqual(D5_ORDER.slice(0, prefix));
    expect(rows.some(entry => entry.outcome === 'retained_attempt_abandoning')).toBe(false);
    expect(rows.some(entry => entry.command_id === 'root.advance')).toBe(false);
    const tail = rows.slice(-2);
    expect(tail.map(entry => [entry.phase, entry.outcome, entry.command_id])).toEqual([
      ['rollback_preparing', 'intent', 'writers.resume.rollback'],
      ['rollback_preparing', 'accepted', 'writers.resume.rollback'],
    ]);
    expect(fixture.forwardFinalWriterManifestPath).toBeNull();
    expect(fixture.rollbackFinalWriterManifestPath).toBe(
      join(runRoot, `final-writer-manifest-rollback-${runId}.json`)
    );
    const fwm = JSON.parse(readFileSync(fixture.rollbackFinalWriterManifestPath!, 'utf8')) as {
      final_writers: unknown[];
      held_writers: unknown[];
      mode: string;
    };
    expect(fwm.mode).toBe('rollback');
    expect(fwm.final_writers).toHaveLength(10);
    expect(fwm.held_writers).toHaveLength(0);
    const hasMigrationBase = rows.some(
      entry => entry.command_id === 'migration.base.apply' && entry.outcome === 'completed'
    );
    const hasMigrationObs = rows.some(
      entry =>
        entry.command_id === 'migration.observability.apply' &&
        entry.outcome === 'completed' &&
        entry.phase === 'base_migration_guarded'
    );
    expect(hasMigrationBase).toBe(prefix >= 2);
    expect(hasMigrationObs).toBe(prefix >= 3);
    const hasMilestone = rows.some(entry => entry.phase === 'migrations_applied');
    expect(hasMilestone).toBe(prefix >= 4);
  });

  it.each([1, 2, 3] as const)(
    'composes rollback prefix %s with its exact next frontier and immediate FWM ancestry',
    async prefix => {
      const { fixture, runRoot, runId } = await materializeRollback(prefix, true);
      const rows = fixture.journalEntries;
      const rIndex = rows.findIndex(entry => entry.outcome === 'retained_attempt_abandoning');
      expect(rIndex).toBeGreaterThan(0);
      expect(rows[rIndex].command_id).toBe(`barrier.${NEXT[prefix]}`);
      const after = rows.slice(rIndex + 1);
      expect(after.map(entry => [entry.phase, entry.outcome, entry.command_id])).toEqual([
        ['rollback_preparing', 'intent', 'writers.resume.rollback'],
        ['rollback_preparing', 'accepted', 'writers.resume.rollback'],
      ]);
      expect(fixture.forwardFinalWriterManifestPath).toBeNull();
      const fwm = JSON.parse(
        readFileSync(join(runRoot, `final-writer-manifest-rollback-${runId}.json`), 'utf8')
      ) as { final_writers: unknown[]; held_writers: unknown[] };
      expect(fwm.final_writers).toHaveLength(10);
      expect(fwm.held_writers).toHaveLength(0);
    }
  );

  it('composes the activation frontier with both manifests at distinct immutable paths', async () => {
    const { fixture, runRoot, runId } = await materializeRollback(4, true);
    const rows = fixture.journalEntries;
    expect(
      rows.some(
        entry => entry.command_id === 'writers.resume.forward' && entry.outcome === 'accepted'
      )
    ).toBe(true);
    expect(
      rows.some(entry => entry.command_id === 'deploy.commit' && entry.outcome === 'completed')
    ).toBe(true);
    const rIndex = rows.findIndex(entry => entry.outcome === 'retained_attempt_abandoning');
    expect(rows[rIndex].command_id).toBe('barrier.activate');
    const after = rows.slice(rIndex + 1);
    expect(after.map(entry => [entry.phase, entry.outcome, entry.command_id])).toEqual([
      ['rollback_preparing', 'intent', 'writers.resume.rollback'],
      ['rollback_preparing', 'accepted', 'writers.resume.rollback'],
    ]);
    const forwardPath = join(runRoot, `final-writer-manifest-forward-${runId}.json`);
    const rollbackPath = join(runRoot, `final-writer-manifest-rollback-${runId}.json`);
    expect(fixture.forwardFinalWriterManifestPath).toBe(forwardPath);
    expect(fixture.rollbackFinalWriterManifestPath).toBe(rollbackPath);
    const forward = JSON.parse(readFileSync(forwardPath, 'utf8')) as {
      final_writers: { name: string }[];
    };
    const rollback = JSON.parse(readFileSync(rollbackPath, 'utf8')) as {
      final_writers: unknown[];
      held_writers: { name: string }[];
    };
    const forwardTargets = forward.final_writers.filter(writer =>
      writer.name.endsWith('-q12fixture')
    );
    expect(rollback.held_writers).toEqual(
      forwardTargets.map(writer => ({
        ...writer,
        intended_running: false,
        intended_restart_policy: { name: 'no', maximum_retry_count: 0 },
      }))
    );
    expect(rollback.final_writers).toHaveLength(10);
  });

  it('rejects a wrong or non-next frontier and an install frontier', async () => {
    const runRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
    const quiescePath = writeQuiesce(runRoot, runId);
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'rollback',
        completedPrefixLength: 1,
        quiesceManifestPath: quiescePath,
        frontier: { ...frontierFor(2) },
      } as never)
    ).rejects.toThrow();
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'rollback',
        completedPrefixLength: 1,
        quiesceManifestPath: quiescePath,
        frontier: { ...frontierFor(1), operation: 'install' },
      } as never)
    ).rejects.toThrow();
    expect(existsSync(join(runRoot, 'phase.jsonl'))).toBe(false);
  });

  const CAPTURE_SERVICES = ['api', 'web', 'worker', 'worker-stage6', 'worker-stage7'] as const;

  function captureSha(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  it.each([1, 2, 3, 4, 5] as const)(
    'composes the sanctioned partial-capture rollback with held prefix %s',
    async k => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      const quiescePath = writeQuiesce(runRoot, runId);
      const fixture = await materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'rollback',
        completedPrefixLength: 4,
        quiesceManifestPath: quiescePath,
        partialCaptureTargets: k,
      } as never);
      const rows = fixture.journalEntries;
      const completedD5 = rows
        .filter(
          entry => String(entry.command_id).startsWith('barrier.') && entry.outcome === 'completed'
        )
        .map(entry => String(entry.command_id).replace('barrier.', ''));
      expect(completedD5).toEqual(D5_ORDER);
      expect(
        rows.some(entry => entry.command_id === 'deploy.prepare' && entry.outcome === 'completed')
      ).toBe(true);
      expect(rows.some(entry => entry.command_id === 'deploy.commit')).toBe(false);
      expect(rows.some(entry => entry.command_id === 'writers.resume.forward')).toBe(false);
      const acceptances = rows.filter(
        entry => entry.accepted_object_kind === 'final_writer_manifest'
      );
      expect(acceptances).toHaveLength(1);
      expect(acceptances[0].command_id).toBe('writers.resume.rollback');
      const targetsStep = captureSha(`q12:resource-step:targets:${runId}`);
      const prepare = rows.find(
        entry => entry.command_id === 'deploy.prepare' && entry.outcome === 'completed'
      );
      expect(prepare?.resource_manifest_sha256).toBe(targetsStep);
      expect(rows[rows.length - 1].resource_manifest_sha256).toBe(targetsStep);
      expect(fixture.forwardFinalWriterManifestPath).toBeNull();
      const fwm = JSON.parse(readFileSync(fixture.rollbackFinalWriterManifestPath!, 'utf8')) as {
        mode: string;
        final_writers: unknown[];
        held_writers: Array<Record<string, unknown>>;
      };
      expect(fwm.mode).toBe('rollback');
      expect(fwm.final_writers).toHaveLength(10);
      expect(fwm.held_writers).toHaveLength(k);
      fwm.held_writers.forEach((held, index) => {
        const service = CAPTURE_SERVICES[index];
        const image = captureSha(`q12:fixture-target-image:${runId}:${service}`);
        expect(held).toMatchObject({
          id: captureSha(`q12:fixture-target:${runId}:${service}`),
          name: `megacampus-${service}-q12fixture`,
          service,
          project: service === 'api' || service === 'web' ? 'megacampus-green' : 'megacampus',
          image_id: `sha256:${image}`,
          intended_running: false,
          intended_restart_policy: { name: 'no', maximum_retry_count: 0 },
          temporary_restart_policy: { name: 'no', maximum_retry_count: 0 },
        });
      });
    }
  );

  it('fails the partial-capture lever closed outside its exact validity window', async () => {
    const runRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
    const quiescePath = writeQuiesce(runRoot, runId);
    const reject = (spec: Record<string, unknown>) =>
      expect(
        materializeJoinedRetainedBarrierFixture({
          runRoot,
          quiesceManifestPath: quiescePath,
          ...spec,
        } as never)
      ).rejects.toThrow(/partial capture/i);
    await reject({ joinedProfile: 'rollback', completedPrefixLength: 4, partialCaptureTargets: 0 });
    await reject({ joinedProfile: 'rollback', completedPrefixLength: 4, partialCaptureTargets: 6 });
    await reject({ joinedProfile: 'rollback', completedPrefixLength: 3, partialCaptureTargets: 2 });
    await reject({ joinedProfile: 'forward', partialCaptureTargets: 2 });
    await reject({
      joinedProfile: 'rollback',
      completedPrefixLength: 4,
      partialCaptureTargets: 2,
      frontier: frontierFor(4),
    });
    expect(existsSync(join(runRoot, 'phase.jsonl'))).toBe(false);
  });
});

describe('Closure coverage', () => {
  const CORE_PATH = join(repoRoot, 'deploy/qdrant/q12-lifecycle-core.py');
  const SUPERVISOR = join(repoRoot, 'deploy/qdrant/q12-live-cutover.sh');
  const LAUNCHER = join(repoRoot, 'deploy/qdrant/q12-capability-run.sh');

  it('deployed wrappers and the core parser reject every joined/profile switch', () => {
    for (const wrapper of [SUPERVISOR, LAUNCHER]) {
      for (const flag of ['--joined', '--joined-profile', '--profile', '--fixture']) {
        const rejected = spawnSync('/usr/bin/bash', [wrapper, flag, 'forward'], {
          encoding: 'utf8',
          env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C' },
        });
        expect(rejected.status, `${wrapper} ${flag}`).not.toBe(0);
      }
      const source = readFileSync(wrapper, 'utf8');
      expect(source).not.toMatch(/joined|profile/i);
    }
    const help = spawnSync('/usr/bin/python3', [CORE_PATH, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    expect(help.stdout).not.toMatch(/joined|profile|fixture/i);
  });

  it('fails composition before any producer state when a manifest entry is missing', () => {
    const script = [
      'import importlib.util, json, sys, tempfile, uuid, pathlib',
      `spec = importlib.util.spec_from_file_location('q12core', ${JSON.stringify(CORE_PATH)})`,
      'core = importlib.util.module_from_spec(spec)',
      "sys.modules['q12core'] = core",
      'spec.loader.exec_module(core)',
      "root = tempfile.mkdtemp(prefix='mc2-q12-d5-root-', dir='/tmp')",
      'import atexit, shutil',
      'atexit.register(shutil.rmtree, root, ignore_errors=True)',
      'manifest = json.loads(core.MANIFEST_PATH.read_text())',
      "del manifest['commands']['pg.backup']",
      "tampered = pathlib.Path(root, 'tampered-manifest.json')",
      'tampered.write_text(json.dumps(manifest))',
      'core.MANIFEST_PATH = tampered',
      'run_id = str(uuid.uuid5(uuid.NAMESPACE_URL, root))',
      "quiesce_path = pathlib.Path(root, 'w.json')",
      "quiesce_path.write_bytes(b'{}\\n')",
      'quiesce_path.chmod(0o400)',
      "request = {'run_root': root, 'run_id': run_id, 'release_sha': '0123456789abcdef0123456789abcdef01234567', 'operator_digest': '1' * 64, 'resource_manifest_sha256': '2' * 64, 'quiesce_manifest_sha256': core.sha256(quiesce_path.read_bytes()), 'expected_catalog_sha256': 'a' * 64, 'rotation_required': False, 'joined_profile': 'forward', 'quiesce_manifest_path': str(quiesce_path)}",
      'try:',
      '    core.run_joined_composer(request, object())',
      "    print('accepted')",
      'except core.LifecycleError as error:',
      "    print(f'rejected: {error}')",
      "print(json.dumps({'journal_exists': pathlib.Path(root, 'phase.jsonl').exists()}))",
    ].join('\n');
    const probe = spawnSync('/usr/bin/python3', ['-c', script], { encoding: 'utf8' });
    expect(probe.stderr).toBe('');
    expect(probe.status).toBe(0);
    const lines = probe.stdout.trim().split('\n');
    expect(lines[0]).toContain('rejected: command manifest exact set/order mismatch');
    expect(JSON.parse(lines[1])).toEqual({ journal_exists: false });
  });

  it('rejects a non-fresh run root and a missing quiesce manifest before producer state', async () => {
    const runRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'forward',
        quiesceManifestPath: join(runRoot, 'missing.json'),
      })
    ).rejects.toThrow();
    expect(existsSync(join(runRoot, 'phase.jsonl'))).toBe(false);
    writeFileSync(join(runRoot, 'phase.jsonl'), '', { mode: 0o600 });
    const quiescePath = join(runRoot, `writer-quiesce-${runId}.json`);
    writeFileSync(quiescePath, '{}\n', { mode: 0o400 });
    await expect(
      materializeJoinedRetainedBarrierFixture({
        runRoot,
        joinedProfile: 'forward',
        quiesceManifestPath: quiescePath,
      })
    ).rejects.toThrow();
  });
});
