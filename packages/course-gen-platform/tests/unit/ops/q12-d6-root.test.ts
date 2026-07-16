import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// D6 activation-truth Root coordinator (Tasks 16-19) RED/GREEN gates.
//
// Every scenario runs against the production deploy/qdrant/q12-lifecycle-core.py
// through the synthetic driver fixtures/q12-d6-root-runner.py. No live/remote
// action occurs: secrets, descriptors, and epochs are synthetic. Pinned-server
// capability observations (atomic POSIX_SPAWN_CLOSEFROM on the server, real
// pidfd/ptrace/Yama policy) stay behind the separately authorized remote gate and
// are asserted here only as local capability presence, never faked green.

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = join(
  repoRoot,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-d6-root-runner.py'
);

interface RunnerResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

function runScenario(payload: Record<string, unknown>): RunnerResult {
  const probe = spawnSync('/usr/bin/python3', [RUNNER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8', HOME: '/var/empty' },
  });
  expect(probe.status, probe.stderr).toBe(0);
  return JSON.parse(probe.stdout) as RunnerResult;
}

describe('Task 16 — D6 posix_spawn boundary + FD map/close-from', () => {
  const mapped = { 1: 21, 2: 22, 3: 23, 4: 24, 5: 25, 6: 26, 7: 27, 9: 9, 10: 30, 11: 31 };

  it('builds the exact ordered posix_spawn file-action sequence', () => {
    const result = runScenario({ scenario: 'spawn_file_actions', sources: mapped });
    expect(result.ok, result.error).toBe(true);
    expect(result.closefrom_capability).toBe(true);
    expect(result.actions).toEqual([
      ['open', 0, '/dev/null', 0, 0],
      ['dup2', 21, 1],
      ['close', 21],
      ['dup2', 22, 2],
      ['close', 22],
      ['dup2', 23, 3],
      ['close', 23],
      ['dup2', 24, 4],
      ['close', 24],
      ['dup2', 25, 5],
      ['close', 25],
      ['dup2', 26, 6],
      ['close', 26],
      ['dup2', 27, 7],
      ['close', 27],
      ['dup2', 30, 10],
      ['close', 30],
      ['dup2', 31, 11],
      ['close', 31],
      ['close', 8],
      ['closefrom', 12],
    ]);
  });

  it('refuses a mapped source descriptor below the close-from line (no silent fallback)', () => {
    const result = runScenario({
      scenario: 'spawn_file_actions',
      sources: { ...mapped, 3: 5 },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/close-from|below|source descriptor/i);
  });

  it('rejects an incomplete descriptor map', () => {
    const result = runScenario({
      scenario: 'spawn_file_actions',
      sources: { 1: 21, 2: 22, 3: 23 },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/target|descriptor|map/i);
  });

  it('maps and close-froms descriptors under pressure leaving nothing above 11', () => {
    const result = runScenario({ scenario: 'spawn_under_pressure', pressure: 96 });
    expect(result.ok, result.error).toBe(true);
    expect(result.closefrom_capability).toBe(true);
    expect(result.exit_status).toBe(0);
    // FD 8 explicitly closed; every runtime descriptor above 11 close-from'd.
    expect(result.child_fds).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11]);
  });

  it('accepts a correctly-owned 0400 or 0600 secret source', () => {
    for (const mode of ['0400', '0600']) {
      const result = runScenario({
        scenario: 'validate_secret',
        mode,
        accept_modes: ['0400', '0600'],
        owner: 'self',
      });
      expect(result.ok, result.error).toBe(true);
      expect(typeof result.ino).toBe('number');
    }
  });

  it('rejects wrong owner, wrong mode, and a symlinked secret source', () => {
    const wrongOwner = runScenario({
      scenario: 'validate_secret',
      mode: '0400',
      accept_modes: ['0400', '0600'],
      owner: 'other',
    });
    expect(wrongOwner.ok).toBe(false);
    expect(wrongOwner.error).toMatch(/unsafe file identity/i);

    const wrongMode = runScenario({
      scenario: 'validate_secret',
      mode: '0644',
      accept_modes: ['0400', '0600'],
      owner: 'self',
    });
    expect(wrongMode.ok).toBe(false);
    expect(wrongMode.error).toMatch(/unsafe file identity/i);

    const symlinked = runScenario({
      scenario: 'validate_secret',
      mode: '0400',
      accept_modes: ['0400', '0600'],
      owner: 'self',
      symlink: true,
    });
    expect(symlinked.ok).toBe(false);
    expect(symlinked.error).toMatch(/symbolic|symlink|ELOOP|NOFOLLOW|unsafe/i);
  });
});

describe('Task 17 — D6 pidfd / ptrace / proc / OFD gates', () => {
  it('opens a pidfd, retrieves FD9, and proves OFD contention + proc identity', () => {
    const result = runScenario({ scenario: 'pidfd_gates' });
    expect(result.ok, result.error).toBe(true);
    expect(result.pidfd_capability).toBe(true);
    // child FD9 refers to the same held-lock open-file description (contention preserved)
    expect(result.fd9_ofd_contention).toBe(true);
    expect(result.exe_is_sleep).toBe(true);
    // /proc/<pid>/random/boot_id is a 36-char UUID
    expect(result.boot_id_len).toBe(36);
    // close-from left nothing above 11 to retrieve
    expect(result.no_leak_above_11).toBe(true);
    // pid-reuse / start-time drift is rejected
    expect(result.continuity_rejects_mismatch).toBe(true);
  });

  it('fails the FD9 OFD contention gate when the exclusive lock is not held', () => {
    const result = runScenario({ scenario: 'ofd_contention_unlocked' });
    expect(result.ok, result.error).toBe(true);
    expect(result.contention).toBe(false);
  });
});

const PREDECISION_KEYS = [
  'abandoned_predecision_sha256',
  'action',
  'bound_database_projection_sha256',
  'classification',
  'host_projection_sha256',
  'initial_database_projection_sha256',
  'lease_epoch',
  'planned_r_checkpoint_sha256',
  'planned_r_journal_entry_hash',
  'predecessor_checkpoint_sha256',
  'predecessor_journal_entry_hash',
  'previous_terminal_seal_sha256',
  'request_sha256',
  'run_id',
  'schema_version',
  'transcript_head_before_predecision_sha256',
];

const TERMINAL_SEAL_KEYS = [
  'activation_evidence_state',
  'activation_process_projection_sha256',
  'activation_result_sha256',
  'actual_r_checkpoint_sha256',
  'actual_r_journal_entry_hash',
  'barrier_receipt_sha256',
  'connection_closed',
  'fd9_identity_sha256',
  'final_database_projection_sha256',
  'final_transcript_head_sha256',
  'host_projection_sha256',
  'initial_database_projection_sha256',
  'lease_epoch',
  'outcome',
  'predecision_sha256',
  'prepared_quiesced_predecessor_sha256',
  'probe_exit_status',
  'probe_pidfd_identity_sha256',
  'probe_receipt_sha256',
  'process_manifest_sha256',
  'request_sha256',
  'run_id',
  'schema_version',
  'spawn_capability_sha256',
  'transaction_end',
  'writer_quiesce_manifest_sha256',
];

describe('Task 18 — D6 predecision / optional-R / terminal-seal authority', () => {
  it('builds the exact 16-key predecision with the exact classification/action pair', () => {
    for (const [classification, action] of [
      ['precommit_rollback', 'append_r_then_seal'],
      ['committed_finish_forward', 'seal_finish_forward'],
      ['drift_incident', 'abort_incident'],
    ] as const) {
      const result = runScenario({ scenario: 'predecision', classification });
      expect(result.ok, result.error).toBe(true);
      expect(result.keys).toEqual(PREDECISION_KEYS);
      const predecision = result.predecision as Record<string, unknown>;
      expect(predecision.action).toBe(action);
      if (classification === 'precommit_rollback') {
        expect(predecision.planned_r_journal_entry_hash).not.toBeNull();
        expect(predecision.planned_r_checkpoint_sha256).not.toBeNull();
      } else {
        expect(predecision.planned_r_journal_entry_hash).toBeNull();
        expect(predecision.planned_r_checkpoint_sha256).toBeNull();
      }
    }
  });

  it('rejects an unknown classification, a wrong action, and illegal planned-R nullability', () => {
    expect(runScenario({ scenario: 'predecision', classification: 'made_up' }).ok).toBe(false);
    expect(
      runScenario({
        scenario: 'predecision',
        classification: 'precommit_rollback',
        overrides: { action: 'seal_finish_forward' },
      }).ok
    ).toBe(false);
    // finish-forward must have null planned R
    expect(
      runScenario({
        scenario: 'predecision',
        classification: 'committed_finish_forward',
        overrides: { planned_r_journal_entry_hash: 'a'.repeat(64) },
      }).ok
    ).toBe(false);
  });

  it('builds the exact 26-key terminal seal with the correct outcome and authority', () => {
    for (const [classification, outcome, authority] of [
      ['precommit_rollback', 'precommit_rollback_sealed', 'task9_retirement_rollback_preparation'],
      ['committed_finish_forward', 'committed_finish_forward_sealed', 'finish_forward'],
      ['drift_incident', 'drift_incident_sealed', 'none'],
    ] as const) {
      const result = runScenario({ scenario: 'terminal_seal', classification });
      expect(result.ok, result.error).toBe(true);
      expect(result.keys).toEqual(TERMINAL_SEAL_KEYS);
      expect(result.outcome).toBe(outcome);
      expect(result.authority).toBe(authority);
    }
  });

  it('rejects a terminal seal with a non-zero exit, wrong end literals, or bad actual-R nullability', () => {
    const bad = (overrides: Record<string, unknown>) =>
      runScenario({ scenario: 'terminal_seal', classification: 'precommit_rollback', overrides })
        .ok;
    expect(bad({ probe_exit_status: 1 })).toBe(false);
    expect(bad({ transaction_end: 'rollback' })).toBe(false);
    expect(bad({ connection_closed: false })).toBe(false);
    // committed outcome must carry null actual R
    expect(
      runScenario({
        scenario: 'terminal_seal',
        classification: 'committed_finish_forward',
        overrides: { actual_r_journal_entry_hash: 'a'.repeat(64) },
      }).ok
    ).toBe(false);
    // evidence state must match the classification
    expect(
      runScenario({
        scenario: 'terminal_seal',
        classification: 'drift_incident',
        overrides: { activation_evidence_state: 'complete_receipt' },
      }).ok
    ).toBe(false);
  });

  it('publishes request/predecision/seal 0400 and transcript 0600 with seal-last, incident-only R', () => {
    const result = runScenario({
      scenario: 'publish_authority',
      classification: 'precommit_rollback',
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.request_mode).toBe('0o400');
    expect(result.predecision_mode).toBe('0o400');
    expect(result.seal_mode).toBe('0o400');
    expect(result.transcript_mode).toBe('0o600');
    const trace = result.trace as string[];
    const req = trace.indexOf('request:published');
    const pre = trace.indexOf('predecision:published');
    const seal = trace.indexOf('terminal-seal:published');
    const fsync = trace.lastIndexOf('transcript:fsynced');
    expect(req).toBeGreaterThanOrEqual(0);
    expect(pre).toBeGreaterThan(req);
    expect(seal).toBeGreaterThan(pre);
    // the append-only transcript is fsynced before the terminal seal is published
    expect(fsync).toBeGreaterThan(-1);
    expect(fsync).toBeLessThan(seal);
    // a durable R with no valid terminal seal is incident-only, never finish-forward
    expect(result.authority_without_seal).toBe('incident_only');
    expect(result.authority_with_seal).toBe('task9_retirement_rollback_preparation');
  });
});

describe('Task 19 — D6 post-R narrowing + race closure + restart authority', () => {
  it('permits only the narrowed post-R probe and Root operations', () => {
    const checks: Array<[string, string]> = [
      ['probe', 'emit_sealed'],
      ['probe', 'receive_release'],
      ['probe', 'read_only_commit'],
      ['probe', 'close_connection'],
      ['probe', 'emit_closed'],
      ['probe', 'exit'],
      ['probe', 'spawn_child'],
      ['probe', 'open_mutation_connection'],
      ['probe', 'write_journal'],
      ['root', 'append_transcript'],
      ['root', 'fsync_transcript'],
      ['root', 'publish_terminal_seal'],
      ['root', 'prove_probe_exit'],
      ['root', 'permit_task9_retirement'],
      ['root', 'append_journal_row'],
      ['root', 'mutate_rollback'],
      ['root', 'open_new_session'],
    ];
    const result = runScenario({ scenario: 'post_r_narrowing', checks });
    expect(result.ok, result.error).toBe(true);
    const allowed = result.allowed as Record<string, boolean>;
    for (const key of [
      'probe:emit_sealed',
      'probe:receive_release',
      'probe:read_only_commit',
      'probe:close_connection',
      'probe:emit_closed',
      'probe:exit',
      'root:append_transcript',
      'root:fsync_transcript',
      'root:publish_terminal_seal',
      'root:prove_probe_exit',
      'root:permit_task9_retirement',
    ]) {
      expect(allowed[key], key).toBe(true);
    }
    for (const key of [
      'probe:spawn_child',
      'probe:open_mutation_connection',
      'probe:write_journal',
      'root:append_journal_row',
      'root:mutate_rollback',
      'root:open_new_session',
    ]) {
      expect(allowed[key], key).toBe(false);
    }
  });

  it('emits the exact precommit race-closure Root ordering', () => {
    const result = runScenario({ scenario: 'race_order' });
    expect(result.ok, result.error).toBe(true);
    expect(result.order).toEqual([
      'publish_predecision',
      'append_r',
      'fsync_r',
      'obtain_sealed',
      'release',
      'receive_closed',
      'observe_clean_exit',
      'fsync_transcript',
      'publish_terminal_seal',
    ]);
  });

  it('maps the exact crash-rule authority table', () => {
    const authority = (state: Record<string, unknown>) =>
      runScenario({ scenario: 'crash_authority', state }).authority;
    // predecision, no R, continuous original transaction -> may continue
    expect(authority({ has_predecision: true, has_durable_r: false, continuity: true })).toBe(
      'continue'
    );
    // predecision, no R, not continuous -> abandoned, no authority
    expect(authority({ has_predecision: true, has_durable_r: false, continuity: false })).toBe(
      'abandoned'
    );
    // durable R, no valid terminal seal -> incident-only
    expect(authority({ has_predecision: true, has_durable_r: true })).toBe('incident_only');
    // terminal seal, no R, committed, unique tip -> finish-forward
    expect(
      authority({
        has_terminal_seal: true,
        seal_outcome: 'committed_finish_forward_sealed',
        has_durable_r: false,
        unique_chain_tip: true,
      })
    ).toBe('finish_forward');
    // terminal seal with exact R -> Task 9 retirement only
    expect(
      authority({
        has_terminal_seal: true,
        seal_outcome: 'precommit_rollback_sealed',
        has_durable_r: true,
      })
    ).toBe('task9_retirement_rollback_preparation');
    // incident terminal seal authorizes no mutation
    expect(authority({ has_terminal_seal: true, seal_outcome: 'drift_incident_sealed' })).toBe(
      'none'
    );
  });

  it('rejects a committed finish-forward seal that is not the unique chain tip', () => {
    const result = runScenario({
      scenario: 'crash_authority',
      state: {
        has_terminal_seal: true,
        seal_outcome: 'committed_finish_forward_sealed',
        has_durable_r: false,
        unique_chain_tip: false,
      },
    });
    expect(result.ok).toBe(false);
  });

  it('selects the unique terminal-seal chain tip matching the canonical head', () => {
    const epochs = [
      {
        lease_epoch: 'cutover',
        chain_ok: true,
        terminal_seal: true,
        seal_outcome: 'precommit_rollback_sealed',
        previous_terminal_seal: null,
        predecessor_head: 'headA',
        actual_r_head: 'rA',
      },
      {
        lease_epoch: 'cutover-recovery-1',
        chain_ok: true,
        terminal_seal: true,
        seal_outcome: 'committed_finish_forward_sealed',
        previous_terminal_seal: 'sealA',
        predecessor_head: 'HEAD',
        actual_r_head: null,
      },
    ];
    const result = runScenario({ scenario: 'restart_authority', epochs, canonical_head: 'HEAD' });
    expect(result.ok, result.error).toBe(true);
    expect(result.lease_epoch).toBe('cutover-recovery-1');
    expect(result.authority).toBe('finish_forward');
  });

  it('treats forks, multiple tips, reused epochs, unbound chains, and a stale head as incidents', () => {
    const tip = (epoch: string, prev: string | null, head: string) => ({
      lease_epoch: epoch,
      chain_ok: true,
      terminal_seal: true,
      seal_outcome: 'committed_finish_forward_sealed',
      previous_terminal_seal: prev,
      predecessor_head: head,
      actual_r_head: null,
    });
    // multiple tips both matching the head
    expect(
      runScenario({
        scenario: 'restart_authority',
        epochs: [tip('cutover', null, 'HEAD'), tip('cutover-recovery-1', 'sealA', 'HEAD')],
        canonical_head: 'HEAD',
      }).ok
    ).toBe(false);
    // forked lineage: two seals share the same previous_terminal_seal
    expect(
      runScenario({
        scenario: 'restart_authority',
        epochs: [tip('cutover', 'sameprev', 'x'), tip('cutover-recovery-1', 'sameprev', 'HEAD')],
        canonical_head: 'HEAD',
      }).ok
    ).toBe(false);
    // reused lease epoch
    expect(
      runScenario({
        scenario: 'restart_authority',
        epochs: [tip('cutover', null, 'HEAD'), tip('cutover', 'sealA', 'y')],
        canonical_head: 'HEAD',
      }).ok
    ).toBe(false);
    // unbound / broken chain
    expect(
      runScenario({
        scenario: 'restart_authority',
        epochs: [{ ...tip('cutover', null, 'HEAD'), chain_ok: false }],
        canonical_head: 'HEAD',
      }).ok
    ).toBe(false);
    // stale head: no tip matches
    expect(
      runScenario({
        scenario: 'restart_authority',
        epochs: [tip('cutover', null, 'other')],
        canonical_head: 'HEAD',
      }).ok
    ).toBe(false);
  });
});

describe('Correction — canonical() NFC normalization (cross-stream hash parity)', () => {
  it('hashes decomposed Unicode identically to its NFC-composed form, with no trailing LF', () => {
    // composed "\u00e9" vs decomposed "e" + U+0301
    const composed = String.fromCodePoint(0x00e9);
    const decomposed = `e${String.fromCodePoint(0x0301)}`;
    expect(composed).not.toBe(decomposed); // genuinely distinct pre-normalization
    const result = runScenario({ scenario: 'canonical_nfc', composed, decomposed });
    expect(result.ok, result.error).toBe(true);
    expect(result.value_equal).toBe(true);
    expect(result.key_equal).toBe(true);
    expect(result.no_trailing_lf).toBe(true);
  });
});

describe('Correction — secret identity re-proven after the bytes are read', () => {
  it('accepts an unchanged descriptor after read', () => {
    const result = runScenario({ scenario: 'secret_after_read' });
    expect(result.ok, result.error).toBe(true);
    expect(result.stable).toBe(true);
  });

  it('fails closed when owner/mode change (chmod) between open and the post-read check', () => {
    const result = runScenario({ scenario: 'secret_after_read', mutation: 'chmod' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsafe file identity|changed/i);
  });

  it('fails closed when the inode is swapped between open and the post-read check', () => {
    const result = runScenario({ scenario: 'secret_after_read', mutation: 'swap' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsafe file identity|changed/i);
  });
});

describe('Correction — terminal seal binds the hash of its own predecision', () => {
  it('accepts a seal whose predecision_sha256 hashes the canonical predecision', () => {
    const result = runScenario({ scenario: 'seal_binding', classification: 'precommit_rollback' });
    expect(result.ok, result.error).toBe(true);
    expect(result.bound).toBe(true);
  });

  it('rejects a seal that binds a mismatched predecision', () => {
    const result = runScenario({
      scenario: 'seal_binding',
      classification: 'precommit_rollback',
      tamper: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/predecision|bind/i);
  });
});

describe('Correction — validated secret descriptor is rewound for the child read', () => {
  it('returns a descriptor a sequential read sees in full (not EOF after revalidation)', () => {
    const result = runScenario({ scenario: 'secret_read_bytes' });
    expect(result.ok, result.error).toBe(true);
    expect(result.read_len).toBeGreaterThan(0);
    expect(result.matches).toBe(true);
  });
});
