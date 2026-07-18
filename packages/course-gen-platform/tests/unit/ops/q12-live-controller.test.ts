import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeJoinedRetainedBarrierFixture,
  materializeLiveController,
  sha,
  validateStableBindingWalk,
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

// The blessed parity exclusion set (design §6a ruling 4; plan "R3 constraint 2026-07-18").
// The checkpoint binds the physical journal file's device+inode (checkpoint_bytes
// journal_device/journal_inode, anti-tamper), so capability_manifest_sha256 / entry_hash /
// previous_hash are inherently per-run-root. resource_manifest_sha256 joins them VALUE-only:
// the controller carries the digest of a REAL checkpoint-bound resource-manifest artifact,
// which cannot equal the composer's fixture step derivation on any row that carries one
// (genesis segment + the two stepped segments = every row). Its VALUE is excluded; its
// step TOPOLOGY is asserted separately and must match exactly.
const BLESSED_EXCLUSIONS = [
  'capability_manifest_sha256',
  'entry_hash',
  'previous_hash',
  'resource_manifest_sha256',
] as const;

function withoutBlessedExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  for (const key of BLESSED_EXCLUSIONS) delete rest[key];
  return rest;
}

function resourceAt(rows: readonly Record<string, unknown>[], index: number): string {
  return String(rows[index].resource_manifest_sha256);
}

function witnessIndex(
  rows: readonly Record<string, unknown>[],
  commandId: string,
  outcome: string
): number {
  const index = rows.findIndex(r => r.command_id === commandId && r.outcome === outcome);
  if (index < 0) throw new Error(`missing witness ${commandId}/${outcome}`);
  return index;
}

describe('Q12 live cutover controller (Task-9) — R3 resource-manifest 2-step binding', () => {
  it('journals the full forward window as a byte-parity twin of the composer with a real 2-step resource binding', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
    // The parity proof feeds the SAME quiesce manifest path to both drivers so every
    // <quiesce-manifest> substitution (and each command_sha256 that carries it) is identical.
    const quiescePath = writeQuiesceManifest(composerRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: composerRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const live = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });

    // Twin through group 13 (deploy.prepare/completed = the design §6a C7 planned-exit
    // checkpoint): same row count and same rows on every shared binding versus the composer's
    // forward prefix. seq is NOT excluded (the exclusion set is blessed and closed), so the
    // controller must reproduce the composer's exact interleave of ordinary lifecycles and
    // in-process barrier chains. The group-14 FWM, deploy.commit and activate are later rounds
    // (the FWM's accepted_object_sha256 is itself per-run-root — it embeds the checkpoint
    // digest — and is out of scope until the FWM round).
    const c7End = witnessIndex(composer.journalEntries, 'deploy.prepare', 'completed') + 1;
    expect(live.journalEntries.length).toBe(c7End);
    expect(live.journalEntries.map(withoutBlessedExclusions)).toEqual(
      composer.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)
    );

    // --- Resource step TOPOLOGY (asserted despite the value exclusion) ---
    const backupIntent = witnessIndex(live.journalEntries, 'pg.backup', 'intent');
    const prepareCompleted = witnessIndex(live.journalEntries, 'deploy.prepare', 'completed');
    const genesisDigest = resourceAt(live.journalEntries, 0);
    const snapshotDigest = resourceAt(live.journalEntries, backupIntent);
    const targetsDigest = resourceAt(live.journalEntries, prepareCompleted);

    // three distinct real-artifact digests, none equal to the composer's fixture derivations
    expect(new Set([genesisDigest, snapshotDigest, targetsDigest]).size).toBe(3);
    expect(genesisDigest).not.toBe(resourceAt(composer.journalEntries, 0));
    expect(snapshotDigest).not.toBe(resourceAt(composer.journalEntries, backupIntent));
    expect(targetsDigest).not.toBe(resourceAt(composer.journalEntries, c7End - 1));

    // the field changes EXACTLY at the two witnesses and is carried unchanged elsewhere
    live.journalEntries.forEach((row, index) => {
      const value = String(row.resource_manifest_sha256);
      if (index === 0) {
        expect(value).toBe(genesisDigest);
      } else if (index === backupIntent) {
        expect(value).toBe(snapshotDigest);
        expect(value).not.toBe(resourceAt(live.journalEntries, index - 1));
      } else if (index === prepareCompleted) {
        expect(value).toBe(targetsDigest);
        expect(value).not.toBe(resourceAt(live.journalEntries, index - 1));
      } else {
        // every non-witness row equals its predecessor (no off-witness step)
        expect(value).toBe(resourceAt(live.journalEntries, index - 1));
      }
    });
    // first/last request-global pins (validate_stable_binding_walk :357-368)
    expect(resourceAt(live.journalEntries, 0)).toBe(genesisDigest);
    expect(resourceAt(live.journalEntries, live.journalEntries.length - 1)).toBe(targetsDigest);

    // --- P3-2: each in-process barrier invocation carries the then-current stepped value ---
    const segmentOf = (commandId: string) => {
      const rows = live.journalEntries.filter(r => r.command_id === commandId);
      expect(rows.length).toBeGreaterThan(0);
      return new Set(rows.map(r => String(r.resource_manifest_sha256)));
    };
    expect(segmentOf('barrier.install')).toEqual(new Set([genesisDigest]));
    expect(segmentOf('barrier.verify-after-base')).toEqual(new Set([snapshotDigest]));
    expect(segmentOf('barrier.verify-after-observability')).toEqual(new Set([snapshotDigest]));
    expect(segmentOf('barrier.prepare-recovery')).toEqual(new Set([snapshotDigest]));

    // --- the three artifacts are real, fsynced, 0400, and their digests ARE the row values ---
    for (const [stage, digest] of [
      ['genesis', genesisDigest],
      ['snapshot', snapshotDigest],
      ['targets', targetsDigest],
    ] as const) {
      const path = live.resourceManifestPaths[stage];
      expect(path, `resource manifest ${stage} path`).toBeTruthy();
      const bytes = readFileSync(path);
      expect(sha(bytes)).toBe(digest);
      expect(statSync(path).mode & 0o777).toBe(0o400);
    }
  });

  it('rejects an off-witness resource step through the real validate_stable_binding_walk', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
    const quiescePath = writeQuiesceManifest(composerRoot, runId);
    const live = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });

    const head = live.journalEntries[0];
    const tail = live.journalEntries[live.journalEntries.length - 1];
    const request = {
      run_id: runId,
      release_sha: head.release_sha,
      operator_digest: head.operator_digest,
      rotation_required: head.rotation_required,
      quiesce_manifest_sha256: tail.quiesce_manifest_sha256,
      resource_manifest_sha256: head.resource_manifest_sha256,
    };

    // positive control: the real controller journal passes the production walk unchanged
    expect(await validateStableBindingWalk(live.journalEntries, request)).toEqual({
      ok: true,
      error: '',
    });

    // mutate a NON-witness mid-segment row so the resource value steps off a witness
    const offWitness = live.journalEntries.findIndex(
      r => r.command_id === 'migration.base.apply' && r.outcome === 'completed'
    );
    expect(offWitness).toBeGreaterThan(0);
    const mutated = live.journalEntries.map((r, i) =>
      i === offWitness ? { ...r, resource_manifest_sha256: 'c'.repeat(64) } : { ...r }
    );
    const rejected = await validateStableBindingWalk(mutated, request);
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/resource_manifest_sha256/u);
  });

  it('fails closed when a production request targets a non-production run root', async () => {
    await expect(materializeLiveController({ runRoot: root(), production: true })).rejects.toThrow(
      /production run root mismatch/u
    );
  });
});

// R4 Sub-round A (design docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §3/§6.4):
// an injectable, PARITY-NEUTRAL ordinary-execution seam. run_live's ordinary command
// lifecycles now execute a real child through the executor; the journal stays byte/order
// identical to the closed composer (the result object is written ONLY to the per-command
// side file and never consumes the journal, a capability digest, a checkpoint, or an
// accepted_object_sha256).
describe('Q12 live cutover controller (Task-9) — R4 Sub-round A: injectable ordinary execution seam', () => {
  it('executes a real child per ordinary lifecycle without perturbing the journal twin', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
    const quiescePath = writeQuiesceManifest(composerRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: composerRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const liveRoot = root();
    const live = await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });

    // (a) regression guard: the groups-1-13 journal twin still holds under the blessed
    // exclusions — the seam must stay parity-neutral (unchanged assertion from the R3 test).
    const c7End = witnessIndex(composer.journalEntries, 'deploy.prepare', 'completed') + 1;
    expect(live.journalEntries.length).toBe(c7End);
    expect(live.journalEntries.map(withoutBlessedExclusions)).toEqual(
      composer.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)
    );

    // (b) each ordinary lifecycle's side result file (ordinary-command-result-<id>-cutover.json)
    // now parses to the real-child projection, NOT the composer's "q12-joined-fixture"
    // projection — while the journal's capability_claimed row for the same command still binds
    // to the SAME capability digest the side file carries (proving the seam never forked the
    // capability binding, only the result payload).
    const ordinaryKeys = Object.keys(live.resultPaths).filter(key => key.startsWith('ordinary:'));
    expect(ordinaryKeys.length).toBe(12);
    for (const key of ordinaryKeys) {
      const commandId = key.split(':')[1];
      const liveResult = JSON.parse(readFileSync(live.resultPaths[key], 'utf8')) as Record<
        string,
        unknown
      >;
      const composerResultPath = composer.resultPaths.get(key);
      expect(composerResultPath, `composer side file for ${key}`).toBeTruthy();
      const composerResult = JSON.parse(readFileSync(composerResultPath!, 'utf8')) as Record<
        string,
        unknown
      >;
      const expectedRealDigest = sha(
        Buffer.from(`q12-live-real-child:${commandId}:${runId}`, 'utf8')
      );
      expect(liveResult.result_sha256).toBe(expectedRealDigest);
      expect(liveResult.result_sha256).not.toBe(composerResult.result_sha256);

      const claimedRow = live.journalEntries.find(
        row => row.command_id === commandId && row.outcome === 'capability_claimed'
      );
      expect(claimedRow, `capability_claimed row for ${commandId}`).toBeTruthy();
      expect(liveResult.capability_sha256).toBe(claimedRow!.capability_manifest_sha256);
    }

    // (c) the run_live executor audit shows exactly one real child execution per ordinary
    // lifecycle journaled, ADDED ON TOP OF the pre-existing D5 barrier-chain claim
    // delegations (install/verify-after-base/verify-after-observability/prepare-recovery —
    // the 4 in-process groups the forward window reaches through the C7 planned exit), which
    // already crossed a real sandboxed claim-launcher boundary before this round and are
    // unrelated to the ordinary-execution seam.
    const D5_CLAIM_DELEGATIONS_THROUGH_C7 = 4;
    expect(live.childExecutions).toBe(ordinaryKeys.length + D5_CLAIM_DELEGATIONS_THROUGH_C7);
    expect(live.childExecutions).toBe(16);
  });
});
