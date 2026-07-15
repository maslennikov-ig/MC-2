import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
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
