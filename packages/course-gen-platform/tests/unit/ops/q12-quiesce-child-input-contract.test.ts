import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';

// mc2-awi6q — the C2 blocker window attempt #11 (2026-07-28) surfaced, and the TWELFTH instance of
// the environment-substitution class: `q12-writer-resume.py` was written against fixtures that stood
// in for the production controller, so two of its input expectations had never met a real journal.
//
//  1. It demanded the `writers.quiesce` INTENT row carry 0×64. The controller carries the
//     predecessor command's capability digest forward — the ratified D5J item-6 carry rule. The
//     0×64 intent rule is real but belongs to the `barrier.cleanup` lifecycle alone.
//  2. It reads `writer-quiesce-capability-checkpoint-<run-id>-<epoch>.json` and
//     `writer-quiesce-input-checkpoint-<run-id>-<epoch>.json`, which the controller never published
//     — the same gap mc2-orsez closed for the barrier child.
//
// Both fired only after the barrier had already put production into `maintenance_guarded`. The
// runner therefore drives the REAL `Engine.append_ordinary_lifecycle` and launches the REAL child
// from its `execute_ordinary` seam; the harness publishes neither checkpoint itself, and it re-runs
// the child with the pre-fix expectation restored so the RED stays visible rather than assumed.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const RUNNER = resolve(
  REPO_ROOT,
  'packages/course-gen-platform/tests/unit/ops/fixtures/q12-quiesce-child-input-contract-runner.py'
);
const CORE = resolve(REPO_ROOT, 'deploy/qdrant/q12-lifecycle-core.py');
const WRITER_RESUME = resolve(REPO_ROOT, 'deploy/qdrant/q12-writer-resume.py');

type Child = { returncode: number; reachedInventoryBoundary: boolean; stderr: string };
type Published = {
  exists: boolean;
  mode: string;
  nlink: number;
  aliasesFixedCheckpoint: boolean;
  projectsRow: boolean;
  residue: boolean;
};
type Shape = {
  journal: {
    seq: number;
    phase: string;
    outcome: string;
    command_id: string;
    capability_manifest_sha256: string;
  }[];
  quiesceIntent: { carriesPredecessorDigest: boolean; isZero: boolean };
  publishedCapabilityCheckpoint: Published & { digestMatchesCapability: boolean };
  publishedInputCheckpoint: Published & { byteIdenticalToFixedCheckpoint: boolean };
  child: Child;
  legacyChild: Child;
  childWithoutCapabilityCheckpoint: Child;
  childWithoutInputCheckpoint: Child;
};

let cached: Shape | undefined;

function drive(): Shape {
  if (cached !== undefined) return cached;
  const result = spawnSync('/usr/bin/python3', [RUNNER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  expect(result.status, `runner stderr:\n${result.stderr}`).toBe(0);
  cached = JSON.parse(result.stdout) as Shape;
  return cached;
}

describe.runIf(RUN_REAL_CONTROLLER)('Q12 C2: the real controller satisfies the real child', () => {
  it('drives the real child past every input expectation to the inventory boundary', () => {
    const out = drive();

    // -9 is the pass signal: the child SIGKILLs itself at `before-inventory`, which it reaches only
    // after the journal, checkpoint, capability and residue checks have all succeeded.
    expect(`${out.child.returncode} ${out.child.stderr}`).toBe('-9 ');
    expect(out.child.reachedInventoryBoundary).toBe(true);
  });

  it('carries the predecessor capability digest into the quiesce intent row', () => {
    const out = drive();

    expect(out.quiesceIntent.carriesPredecessorDigest).toBe(true);
    expect(out.quiesceIntent.isZero).toBe(false);
    const intent = out.journal.find(row => row.phase === 'quiesced' && row.outcome === 'intent');
    const predecessor = out.journal[(intent?.seq ?? 0) - 2];
    expect(intent?.command_id).toBe('writers.quiesce');
    expect(predecessor.outcome).toBe('completed');
    expect(intent?.capability_manifest_sha256).toBe(predecessor.capability_manifest_sha256);
  });

  // The RED. A child demanding 0×64 for the quiesce intent row refuses this journal with the exact
  // production message, so the green above cannot be an artefact of never reaching the check.
  it('a child restored to the 0×64 intent expectation refuses the same real journal', () => {
    const out = drive();

    expect(out.legacyChild.reachedInventoryBoundary).toBe(false);
    expect(out.legacyChild.stderr).toContain('writer quiesce journal graph is invalid');
  });

  it('publishes the capability checkpoint the child binds the capability digest to', () => {
    const out = drive();
    const published = out.publishedCapabilityCheckpoint;

    expect(published.exists).toBe(true);
    expect(published.mode).toBe('0o600');
    expect(published.nlink).toBe(1);
    expect(published.aliasesFixedCheckpoint).toBe(false);
    expect(published.residue).toBe(false);
    // The intent row, because that is the position the capability's own
    // capability_input_checkpoint_sha256 was taken at.
    expect(published.projectsRow).toBe(true);
    expect(published.digestMatchesCapability).toBe(true);
  });

  it('publishes the claimed-boundary input checkpoint byte-identically to the fixed checkpoint', () => {
    const out = drive();
    const published = out.publishedInputCheckpoint;

    expect(published.exists).toBe(true);
    expect(published.mode).toBe('0o600');
    expect(published.nlink).toBe(1);
    expect(published.aliasesFixedCheckpoint).toBe(false);
    expect(published.residue).toBe(false);
    expect(published.projectsRow).toBe(true);
    expect(published.byteIdenticalToFixedCheckpoint).toBe(true);
  });

  // Each publication is load-bearing: withdraw one and the child must refuse. Without this the
  // positive case could pass for reasons unrelated to the controller publishing anything.
  it('the child refuses when either controller publication is withdrawn', () => {
    const out = drive();

    expect(out.childWithoutCapabilityCheckpoint.reachedInventoryBoundary).toBe(false);
    expect(out.childWithoutCapabilityCheckpoint.stderr).toContain(
      'writer-quiesce-capability-checkpoint-'
    );
    expect(out.childWithoutInputCheckpoint.reachedInventoryBoundary).toBe(false);
    expect(out.childWithoutInputCheckpoint.stderr).toContain('writer-quiesce-input-checkpoint-');
  });
});

// Ungated drift guard: the two sides must keep naming the same files. If either name moves without
// the other, C2 breaks in the window rather than here.
describe('Q12 C2 checkpoint names are shared by the controller and the child', () => {
  it('names the same two writer-quiesce checkpoint files on both sides', () => {
    const core = readFileSync(CORE, 'utf8');
    const child = readFileSync(WRITER_RESUME, 'utf8');

    expect(core).toContain(
      'f"writer-quiesce-{kind}-checkpoint-{self.request[\'run_id\']}-{epoch}.json"'
    );
    expect(core).toContain('publish_writer_quiesce_child_checkpoint("capability", "intent"');
    expect(core).toContain('publish_writer_quiesce_child_checkpoint("input", "capability_claimed"');
    expect(child).toContain('writer-quiesce-capability-checkpoint-{run_id}-{capability[');
    expect(child).toContain('writer-quiesce-input-checkpoint-{run_id}-{capability[');
  });
});
