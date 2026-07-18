import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeJoinedRetainedBarrierFixture,
  materializeLiveController,
} from './fixtures/q12-retained-barrier-contract.js';

// Task-9 live cutover controller (run_live), amendment §10 / design
// docs/superpowers/specs/2026-07-17-q12-live-controller-design.md. R1: the controller
// is the production twin of the closed composer (run_joined_composer) — it drives the SAME
// Engine and serializer primitives, so its journal must be byte/order-identical to the
// composer's on the shared row fields (§10 parity duty). This round journals only the
// group-1 genesis (operator.self-check), which is substitution- and quiesce-independent.

const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync('/tmp/mc2-q12-d5-root-');
  roots.push(value);
  return value;
}

// Minimal valid W-owned quiesce manifest so the composer forward profile can run as the
// parity oracle (copied from the accepted composition-seam harness shape).
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

describe('Q12 live cutover controller (Task-9) — R1 genesis + production seam', () => {
  it('journals the group-1 operator.self-check genesis byte-identical to the closed composer', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
    const quiescePath = writeQuiesceManifest(composerRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: composerRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });

    // The live controller runs on its own fresh root, pinned to the composer's run id so the
    // rows (which carry run_id but no run-root path) are directly comparable.
    const live = await materializeLiveController({ runRoot: root(), runId });

    expect(live.journalEntries.length).toBe(4);
    expect(live.journalEntries.map(r => [r.phase, r.outcome, r.command_id])).toEqual([
      ['preflight', 'intent', 'operator.self-check'],
      ['preflight', 'capability_issued', 'operator.self-check'],
      ['preflight', 'capability_claimed', 'operator.self-check'],
      ['preflight', 'completed', 'operator.self-check'],
    ]);
    // §10 parity: every root-INDEPENDENT field (command bindings, phases, outcomes, run/
    // release/operator/resource/quiesce bindings, accepted-object, epoch, seq) equals the
    // composer's first four rows. The checkpoint binds the physical journal file's
    // device+inode (checkpoint_bytes journal_device/journal_inode, anti-tamper), so the
    // three fields that transitively carry it — capability_manifest_sha256, entry_hash,
    // previous_hash — are inherently per-run-root and are excluded from cross-root parity.
    const rootIndependent = (row: Record<string, unknown>) => {
      const { capability_manifest_sha256, entry_hash, previous_hash, ...rest } = row;
      void capability_manifest_sha256;
      void entry_hash;
      void previous_hash;
      return rest;
    };
    expect(live.journalEntries.map(rootIndependent)).toEqual(
      composer.journalEntries.slice(0, 4).map(rootIndependent)
    );
  });

  it('fails closed when a production request targets a non-production run root', async () => {
    await expect(materializeLiveController({ runRoot: root(), production: true })).rejects.toThrow(
      /production run root mismatch/u
    );
  });
});
