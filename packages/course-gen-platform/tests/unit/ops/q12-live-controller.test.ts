import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeJoinedRetainedBarrierFixture,
  materializeLiveController,
  materializeRecover,
  materializeRootRetainedBarrierFixture,
  materializeSupervisor,
  parseLeaseEpoch,
  runFwmNegative,
  runRecoverExpectingRefusal,
  sha,
  validateStableBindingWalk,
  type RetainedBarrierOperation,
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

// R5 Sub-round A row-scoped exclusion (design docs/superpowers/specs/2026-07-17-
// q12-live-controller-design.md §6a; ratified 3-part FWM parity split). The blessed set stays
// CLOSED for every row; only the group-14 FWM accepted row (writers.resume.forward/accepted)
// ALSO drops accepted_object_sha256 — that digest hashes the whole FWM file, which carries the
// two per-run-root physical fields (publication_intent_journal_entry_hash,
// input_checkpoint_sha256, both binding the journal's device+inode), so the row's digest itself
// is per-run-root. Every other row (1-67, 69+) keeps exactly the 4-field blessed set.
function withParityExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = withoutBlessedExclusions(row);
  if (row.command_id === 'writers.resume.forward' && row.outcome === 'accepted') {
    delete rest.accepted_object_sha256;
  }
  return rest;
}

// The forward cutover window is 76 journal rows ending at barrier.activate. Since R8-I-A the live
// controller journals a 5-row guard_cleanup_complete/barrier.cleanup segment AFTER it (§6b.1); the
// forward twin parity stays scoped to this 76-row PREFIX (§6a item 4 / §6b.3), never the full length.
const FORWARD_PREFIX = 76;

// R8-I-B (§6b.2) CONVERGENCE exclusion: the whole 81-row journal of a recover-resumed run must be
// byte/order-equivalent to an uninterrupted twin under the blessed exclusions PLUS a row-scoped drop
// of command_sha256 + accepted_object_sha256 on the barrier.cleanup rows. The cleanup rows'
// command_sha256 is the FROZEN cleanup argv digest, which references a random per-invocation /tmp
// sandbox path (RealBarrierCleanupChild), and the accepted row's accepted_object_sha256 binds the v2
// receipt whose terminal_proof_sha256 comes from the barrier child's proof (journal-identity-bound):
// both are inherently per-run, exactly the physical-binding class the blessed set already excludes
// (same row-scoping shape the FWM accepted row already uses). Every other cleanup-row field
// (schema/run_id/seq/phase/outcome/timestamp/release_sha/operator_digest/command_id/lease_epoch/
// rotation_required/quiesce_manifest_sha256/accepted_object_kind) is deterministic and IS compared.
function withConvergenceExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = withParityExclusions(row);
  if (row.command_id === 'barrier.cleanup') {
    delete rest.command_sha256;
    delete rest.accepted_object_sha256;
  }
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
    // checkpoint): same rows on every shared binding versus the composer's forward PREFIX
    // through that boundary. seq is NOT excluded (the exclusion set is blessed and closed), so
    // the controller must reproduce the composer's exact interleave of ordinary lifecycles and
    // in-process barrier chains. Since R5 Sub-round A, run_live continues past this boundary
    // to journal the group-14 FWM (see the dedicated R5 Sub-round A describe block below for
    // that parity proof), so this is now a PREFIX comparison rather than a full-length one.
    const c7End = witnessIndex(composer.journalEntries, 'deploy.prepare', 'completed') + 1;
    expect(live.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)).toEqual(
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
    // exclusions (a PREFIX comparison since R5 Sub-round A extends run_live past this
    // boundary to the group-14 FWM) — the seam must stay parity-neutral.
    const c7End = witnessIndex(composer.journalEntries, 'deploy.prepare', 'completed') + 1;
    expect(live.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)).toEqual(
      composer.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)
    );

    // (b) each ordinary lifecycle's side result file (ordinary-command-result-<id>-cutover.json)
    // now parses to the real-child projection, NOT the composer's "q12-joined-fixture"
    // projection — while the journal's capability_claimed row for the same command still binds
    // to the SAME capability digest the side file carries (proving the seam never forked the
    // capability binding, only the result payload).
    const ordinaryKeys = Object.keys(live.resultPaths).filter(key => key.startsWith('ordinary:'));
    expect(ordinaryKeys.length).toBe(13);
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
    // delegations. Since R5 Sub-round B run_live drives the full forward window, so the
    // in-process barriers are install/verify-after-base/verify-after-observability/
    // prepare-recovery AND the group-16 activate barrier (5 groups), each of which crosses a
    // real sandboxed claim-launcher boundary and is unrelated to the ordinary-execution seam.
    const D5_CLAIM_DELEGATIONS = 5;
    expect(live.childExecutions).toBe(ordinaryKeys.length + D5_CLAIM_DELEGATIONS);
    expect(live.childExecutions).toBe(18);
  });
});

// R4 Sub-round B (design docs/superpowers/specs/2026-07-17-q12-live-controller-design.md
// §3/§6.4): ORCHESTRATOR-REQUIRED, NO-DOCKER proof that run_live's in-process barrier chain
// (barrier.install/verify-after-base/verify-after-observability/prepare-recovery) crosses the
// REAL deployed claim wrapper deploy/qdrant/q12-capability-run.sh — unmodified, only its
// DB-barrier child sandbox-faked (the real-PG17/DB transition is a separate later round). The
// journal itself stays a byte/order composer twin regardless of which barrier executor variant
// runs (the barrier claim result lands only in the per-barrier retained-result side file).
describe('Q12 live cutover controller (Task-9) — R4 Sub-round B: real deployed wrapper barrier claims', () => {
  it('drives every in-process barrier claim through the REAL deployed q12-capability-run.sh wrapper without perturbing the journal twin', async () => {
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
      executeActualWrapper: true,
    });

    // (a) regression guard: the groups-1-13 journal twin still holds under the blessed
    // exclusions (a PREFIX comparison since R5 Sub-round A extends run_live past this
    // boundary to the group-14 FWM) — routing the barrier claims through the real wrapper
    // must stay parity-neutral, exactly like the ordinary-execution seam (R4 Sub-round A).
    const c7End = witnessIndex(composer.journalEntries, 'deploy.prepare', 'completed') + 1;
    expect(live.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)).toEqual(
      composer.journalEntries.slice(0, c7End).map(withoutBlessedExclusions)
    );

    // (b) the executor audit reports the barrier.install chain actually entered the real
    // deployed wrapper (not the fixture-only --claim-noio launcher).
    const audit = JSON.parse(readFileSync(join(liveRoot, 'executor-audit.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(audit.actualDeployedWrapper).toBe(true);
    expect(audit.claimProcessBoundary).toBe(true);
    expect(audit.launcherOwnedClaimMutation).toBe(true);

    // (c) each of the 5 in-process barrier claims in the full forward window
    // (install/verify-after-base/verify-after-observability/prepare-recovery from groups 1-13,
    // plus the group-16 activate barrier) produced a retained barrier result THROUGH the real
    // wrapper (Engine.finish's per-barrier side file — distinct from the "ordinary:" side files
    // asserted in Sub-round A).
    const barrierKeys = [
      'install:cutover',
      'verify-after-base:cutover',
      'verify-after-observability:cutover',
      'prepare-recovery:cutover',
      'activate:cutover',
    ];
    for (const key of barrierKeys) {
      const path = live.resultPaths[key];
      expect(path, `barrier result path for ${key}`).toBeTruthy();
      const result = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      expect(result.status).toBe('accepted');
      expect(result.schema_version).toBe('megacampus.q12.retained-command-result/v1');
    }
  });
});

// R5 Sub-round A (design docs/superpowers/specs/2026-07-17-q12-live-controller-design.md §6a):
// run_live now journals amendment section 5 group 14 — the forward final-writer manifest
// (FWM) — as a byte/order twin of run_joined_composer's
// publish_final_writer_manifest("forward", inventory, ...) call. The FWM inventory stays the
// FIXTURE derivation (derive_root_writer_inventory, deterministic from run_id + quiesce bytes)
// exactly like the composer. This round proves the ratified 3-part parity split: (1) the two
// new rows' structure, (2) the full 68-row journal twin under the blessed exclusions PLUS a
// row-scoped exclusion for the FWM accepted row's accepted_object_sha256 (a per-run-root
// digest of the whole FWM file), and (3) a SEPARATE byte parity of the FWM file content itself
// once its two per-run-root physical fields are stripped.
describe('Q12 live cutover controller (Task-9) — R5 Sub-round A: forward final-writer manifest (FWM) parity', () => {
  it('journals groups 14-16 (FWM, deploy.commit, barrier.activate) as a full 76-row byte/order twin of the composer with root-independent FWM-content byte parity', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
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

    // --- Part 1: ROW STRUCTURE — rows 67 (intent) and 68 (accepted) exist in that order ---
    const fwmIntentIndex = witnessIndex(live.journalEntries, 'writers.resume.forward', 'intent');
    const fwmAcceptedIndex = witnessIndex(
      live.journalEntries,
      'writers.resume.forward',
      'accepted'
    );
    expect(fwmIntentIndex).toBe(66); // row 67
    expect(fwmAcceptedIndex).toBe(67); // row 68
    // Since R8-I-A the live journal continues past the 76-row forward window into the journaled
    // cleanup segment; the FWM/deploy.commit/activate rows all live inside the untouched prefix.
    expect(live.journalEntries.length).toBe(FORWARD_PREFIX + 5);

    // --- Part 1b: groups 15-16 — deploy.commit (rows 69-72) + barrier.activate (73-76) ---
    expect(live.journalEntries.slice(68, 76).map(r => [r.phase, r.outcome, r.command_id])).toEqual([
      ['activation_ready', 'intent', 'deploy.commit'],
      ['activation_ready', 'capability_issued', 'deploy.commit'],
      ['activation_ready', 'capability_claimed', 'deploy.commit'],
      ['activation_ready', 'completed', 'deploy.commit'],
      ['activation_committing', 'intent', 'barrier.activate'],
      ['activated', 'capability_issued', 'barrier.activate'],
      ['activated', 'capability_claimed', 'barrier.activate'],
      ['activated', 'completed', 'barrier.activate'],
    ]);
    expect(live.journalEntries[fwmIntentIndex].phase).toBe('prepared_quiesced');
    expect(live.journalEntries[fwmAcceptedIndex].phase).toBe('prepared_quiesced');
    expect(live.journalEntries[fwmAcceptedIndex].accepted_object_kind).toBe(
      'final_writer_manifest'
    );
    expect(live.journalEntries[fwmIntentIndex].command_sha256).toBe(
      composer.journalEntries[fwmIntentIndex].command_sha256
    );
    expect(live.journalEntries[fwmAcceptedIndex].command_sha256).toBe(
      composer.journalEntries[fwmAcceptedIndex].command_sha256
    );

    // --- Part 2: FULL-JOURNAL TWIN across all 76 forward rows, row-scoped exclusion on the
    // FWM accepted row only (every other row keeps the closed 4-field blessed set). The twin is
    // scoped to the 76-row forward PREFIX (§6b.3); the cleanup segment has its own R8-I-A proof. ---
    expect(live.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );

    // --- Part 3: SEPARATE FWM-content byte parity on the root-independent fields ---
    expect(live.forwardFinalWriterManifestPath).toBeTruthy();
    expect(composer.forwardFinalWriterManifestPath).toBeTruthy();
    const stripPhysicalFields = (value: Record<string, unknown>): Record<string, unknown> => {
      const rest = { ...value };
      delete rest.publication_intent_journal_entry_hash;
      delete rest.input_checkpoint_sha256;
      return rest;
    };
    const liveFwm = JSON.parse(
      readFileSync(live.forwardFinalWriterManifestPath!, 'utf8')
    ) as Record<string, unknown>;
    const composerFwm = JSON.parse(
      readFileSync(composer.forwardFinalWriterManifestPath!, 'utf8')
    ) as Record<string, unknown>;
    // both physical fields are actually present (proves the strip is meaningful, not a no-op)
    expect(liveFwm.publication_intent_journal_entry_hash).toBeTruthy();
    expect(liveFwm.input_checkpoint_sha256).toBeTruthy();
    expect(canonical(stripPhysicalFields(liveFwm))).toBe(
      canonical(stripPhysicalFields(composerFwm))
    );
    // and they are genuinely per-run-root (differ between the two independent run roots)
    expect(liveFwm.publication_intent_journal_entry_hash).not.toBe(
      composerFwm.publication_intent_journal_entry_hash
    );
    expect(liveFwm.input_checkpoint_sha256).not.toBe(composerFwm.input_checkpoint_sha256);

    // --- self-consistency: the live FWM file is a real 0400 artifact whose digest IS the
    // live row-68 accepted_object_sha256 (mirrors the R3 resource-manifest self-consistency
    // check; proves the excluded value is a real artifact digest, not an arbitrary string). ---
    const liveFwmBytes = readFileSync(live.forwardFinalWriterManifestPath!);
    expect(statSync(live.forwardFinalWriterManifestPath!).mode & 0o777).toBe(0o400);
    expect(sha(liveFwmBytes)).toBe(
      String(live.journalEntries[fwmAcceptedIndex].accepted_object_sha256)
    );
  });

  it('fails closed on an invalid FWM mode and on a forward publish with no target identities', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);

    const badMode = await runFwmNegative({ case: 'bad-mode', runRoot: root(), runId });
    expect(badMode.ok).toBe(false);
    expect(badMode.error).toMatch(/final writer manifest mode mismatch/u);

    const noTargets = await runFwmNegative({
      case: 'no-targets',
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(noTargets.ok).toBe(false);
    expect(noTargets.error).toMatch(/forward manifest requires target identities/u);
  });
});

// R5 Sub-round C (design note docs/superpowers/specs/2026-07-17-q12-quiesce-window-mode-note.md
// §57 "caller-declared run-root mode marker"): run_live writes the cutover-window marker the
// W-side q12-writer-resume.py window_is_cutover() consumes OUT-OF-BAND. It is never a journal
// row (parity-neutral), carries EXACTLY the three keys the consumer's exact() check requires
// (schema_version/run_id/mode) with the required constants, is a 0400 artifact, and persists
// through the whole forward window (present at post-activate). The SECOND observation point in
// the marker-lifetime duty — "present before the group-3 writers.quiesce row" — needs a
// run_live mid-run stop/checkpoint seam and is deferred to R5 Sub-round D (the C7-stop
// machinery held for orchestrator ruling 2). The consumer-side malformed/missing/stray/wrong
// run_id negatives are already owned by the W-amendment test (qdrant-source-recovery-runtime,
// per the design note's recorded reviewer endorsement).
describe('Q12 live cutover controller (Task-9) — R5 Sub-round C: cutover-window marker', () => {
  it('writes the exact quiesce-window-mode.json cutover marker (0400), parity-neutral, present at post-activate', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: quiesceRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const live = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });

    // (a) the marker path is surfaced and is the canonical run-root file name the consumer reads.
    expect(live.quiesceWindowMarkerPath).toBeTruthy();
    expect(live.quiesceWindowMarkerPath!.endsWith('/quiesce-window-mode.json')).toBe(true);

    // (b) 0400, and EXACTLY the three keys window_is_cutover() requires (exact projection) with
    // the consumer's required constants: schema pin, mode=cutover, and run_id === the run.
    expect(statSync(live.quiesceWindowMarkerPath!).mode & 0o777).toBe(0o400);
    const marker = JSON.parse(readFileSync(live.quiesceWindowMarkerPath!, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(marker).sort()).toEqual(['mode', 'run_id', 'schema_version']);
    expect(marker.schema_version).toBe('megacampus.q12.quiesce-window-mode/v1');
    expect(marker.mode).toBe('cutover');
    expect(marker.run_id).toBe(runId);

    // (c) parity-neutral: adding the marker write left the forward window byte-identical to the
    // composer — run_live still journals the 76-row forward twin under the blessed exclusions, and
    // the marker added no journal row (the cleanup segment after it is proven in the R8-I-A block).
    expect(live.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );

    // post-activate persistence: the marker survives the whole window (still present after the
    // group-16 activate row, i.e. after run_live returns).
    expect(existsSync(live.quiesceWindowMarkerPath!)).toBe(true);
  });
});

// R8-I-A (design §6b, RULING R8-A/R8-C, ratified 2026-07-18 — POST-ACTIVATE CLEANUP IS JOURNALED):
// RULING 1's "receipt-only / no journal row after activate" (§6a item 5 / R5-E) is REVERSED for the
// real path (§6a item 6). After barrier.activate (the 76th row) run_live now JOURNALS the frozen
// barrier's 5-row guard_cleanup_complete/barrier.cleanup capability lifecycle (§6b.1), runs the
// FROZEN q12-database-barrier.sh cleanup child FOR REAL against that journal (no real PG — the
// barrier's own protected test mode, the same sandbox the R4-B/database-barrier rounds use),
// promotes the archived v1 receipt to the exact 10-key v2 database-barrier-receipt/v2, deletes the
// db capability, and binds the promoted digest in the terminal accepted row. The RESUME half stays
// RECEIPT-ONLY — writers.resume.forward journals NO rows — now FROZEN-FORCED by the barrier's
// tail-contiguity rule (q12-database-barrier.sh:511-513). The forward 76-row prefix is byte-unchanged.
describe('Q12 live cutover controller (Task-9) — R8-I-A: journaled post-activate barrier.cleanup segment', () => {
  it('journals the 5-row guard_cleanup_complete/barrier.cleanup lifecycle, runs the real frozen barrier cleanup child, and promotes the exact 10-key v2 receipt while keeping the 76-row prefix byte-unchanged', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: quiesceRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const live = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });

    // (a) the 76-row FORWARD PREFIX stays a byte/order twin of the composer under the blessed
    // exclusions — everything strictly AFTER the activate row is the only change (§6a item 6 scope
    // guard). The composer twin ends at the 76th row; the live journal now continues past it.
    expect(composer.journalEntries.length).toBe(FORWARD_PREFIX);
    expect(live.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );

    // (b) exactly 5 journaled cleanup rows follow, all phase guard_cleanup_complete /
    // command_id barrier.cleanup, in the §6b.1 order, and NOTHING else (the resume is receipt-only).
    expect(live.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    const cleanupRows = live.journalEntries.slice(FORWARD_PREFIX);
    expect(cleanupRows.map(r => [r.phase, r.outcome, r.command_id])).toEqual([
      ['guard_cleanup_complete', 'intent', 'barrier.cleanup'],
      ['guard_cleanup_complete', 'capability_issued', 'barrier.cleanup'],
      ['guard_cleanup_complete', 'capability_claimed', 'barrier.cleanup'],
      ['guard_cleanup_complete', 'capability_completed', 'barrier.cleanup'],
      ['guard_cleanup_complete', 'accepted', 'barrier.cleanup'],
    ]);
    // intent carries NO capability (0×64, barrier :551); the issued/claimed/completed rows bind ONE
    // real host capability; the accepted row binds the v2 database_barrier_receipt digest (§6b.1).
    const zero = '0'.repeat(64);
    expect(cleanupRows[0].capability_manifest_sha256).toBe(zero);
    expect(cleanupRows[0].accepted_object_kind).toBe('none');
    const capDigest = cleanupRows[1].capability_manifest_sha256 as string;
    expect(capDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(capDigest).not.toBe(zero);
    for (const index of [2, 3, 4]) {
      expect(cleanupRows[index].capability_manifest_sha256).toBe(capDigest);
    }
    for (const index of [1, 2, 3]) {
      expect(cleanupRows[index].accepted_object_kind).toBe('none');
      expect(cleanupRows[index].accepted_object_sha256).toBeNull();
    }
    // the terminal accepted row binds the promoted v2 receipt digest.
    expect(cleanupRows[4].accepted_object_kind).toBe('database_barrier_receipt');
    const acceptedDigest = cleanupRows[4].accepted_object_sha256 as string;
    expect(acceptedDigest).toMatch(/^[0-9a-f]{64}$/u);

    // (c) the post-activate result records the real cleanup + the receipt-only resume outcomes.
    expect(live.postActivate).toBeTruthy();
    const cleanup = live.postActivate!.cleanup;
    const resume = live.postActivate!.resume;
    expect(cleanup.status).toBe('guard_cleanup_complete');
    expect(cleanup.ok).toBe(true);
    expect(resume.status).toBe('resumed');
    expect(resume.ok).toBe(true);
    const receiptSha = cleanup.cleanup_receipt_sha256 as string;
    expect(receiptSha).toMatch(/^[0-9a-f]{64}$/u);
    // the accepted row binds EXACTLY the promoted v2 receipt digest, and the resume validated it.
    expect(acceptedDigest).toBe(receiptSha);
    expect(resume.validated_receipt_sha256).toBe(receiptSha);

    // (d) the terminal_proof_sha256 in the v2 receipt is the digest of the REAL frozen barrier
    // child's terminal proof (not a synthesized constant): the seam surfaces it and it is hex64.
    expect(cleanup.terminal_proof_sha256).toMatch(/^[0-9a-f]{64}$/u);

    // (e) the promoted receipt is the EXACT 10-key megacampus.q12.database-barrier-receipt/v2 the
    // real forward resume gate requires key-for-key (q12-writer-resume.py:1090-1104).
    const receipt = cleanup.receipt as Record<string, unknown>;
    expect(Object.keys(receipt).sort()).toEqual(
      [
        'database_capability_deleted',
        'expected_catalog_sha256',
        'last_command',
        'probe_receipt_sha256',
        'rollback_probes_verified',
        'run_id',
        'schema_version',
        'state',
        'terminal_proof_sha256',
        'zero_guard_residue',
      ].sort()
    );
    expect(receipt.schema_version).toBe('megacampus.q12.database-barrier-receipt/v2');
    expect(receipt.state).toBe('guard_cleanup_complete');
    expect(receipt.last_command).toBe('cleanup');
    expect(receipt.rollback_probes_verified).toBe(true);
    expect(receipt.zero_guard_residue).toBe(true);
    expect(receipt.database_capability_deleted).toBe(true);
    expect(receipt.run_id).toBe(runId);
    expect(receipt.terminal_proof_sha256).toBe(cleanup.terminal_proof_sha256);

    // (f) the v2 receipt is a real 0400 canonical artifact whose digest IS the accepted binding.
    const receiptPath = cleanup.cleanup_receipt_path as string;
    expect(receiptPath.endsWith('/database-barrier-receipt.json')).toBe(true);
    const receiptBytes = readFileSync(receiptPath);
    expect(sha(receiptBytes)).toBe(receiptSha);
    expect(statSync(receiptPath).mode & 0o777).toBe(0o400);
    expect(receiptBytes.toString('utf8')).toBe(`${canonical(receipt)}\n`);

    // (g) the activate v1 receipt was archived to database-barrier-receipt-v1-before-cleanup.json
    // (0400), the frozen barrier's required predecessor archive (§6b.1, barrier :643).
    const archivePath = cleanup.cleanup_receipt_archive_path as string;
    expect(archivePath.endsWith('/database-barrier-receipt-v1-before-cleanup.json')).toBe(true);
    expect(existsSync(archivePath)).toBe(true);
    expect(statSync(archivePath).mode & 0o777).toBe(0o400);

    // (h) the db capability lifecycle capability is durable in completed/ (the reconstructed
    // cleanup capability class, extension b) — run_live's own final reload_durable already accepted
    // the extended 81-row journal, so no chain/capability rejection remains.
    for (const row of live.journalEntries.slice(0, FORWARD_PREFIX)) {
      expect(row.command_id).not.toBe('barrier.cleanup');
    }
  });
});

// R5 Sub-round D (orchestrator RULING 2 — RECOVER SCOPE) closes the R5-C deferred
// marker-lifetime assertion: the SECOND observation point, "the cutover-window marker is present
// BEFORE the group-3 writers.quiesce row", which needed the run_live mid-run stop seam that only
// landed with R5-D. run_live(stop_after="writers.quiesce.pre") stops cleanly after group 2
// (barrier.install) and BEFORE journaling writers.quiesce; the marker is already on disk.
describe('Q12 live cutover controller (Task-9) — R5 Sub-round C close: marker present before group-3 writers.quiesce', () => {
  it('has the exact 0400 cutover marker on disk before the writers.quiesce row is journaled', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);
    const stopped = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
      stopAfter: 'writers.quiesce.pre',
    });

    // (a) the partial journal stopped after group 2: barrier.install/completed is the head, and
    // there is NO writers.quiesce row yet (the group-3 command has not run).
    const head = stopped.journalEntries.at(-1)!;
    expect(head.command_id).toBe('barrier.install');
    expect(head.outcome).toBe('completed');
    expect(stopped.journalEntries.some(r => r.command_id === 'writers.quiesce')).toBe(false);

    // (b) yet the marker is ALREADY present with EXACTLY the three keys the W-side
    // window_is_cutover() exact() check requires, 0400, mode=cutover, run_id === the run.
    expect(stopped.quiesceWindowMarkerPath).toBeTruthy();
    expect(stopped.quiesceWindowMarkerPath!.endsWith('/quiesce-window-mode.json')).toBe(true);
    expect(existsSync(stopped.quiesceWindowMarkerPath!)).toBe(true);
    expect(statSync(stopped.quiesceWindowMarkerPath!).mode & 0o777).toBe(0o400);
    const marker = JSON.parse(readFileSync(stopped.quiesceWindowMarkerPath!, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(Object.keys(marker).sort()).toEqual(['mode', 'run_id', 'schema_version']);
    expect(marker.schema_version).toBe('megacampus.q12.quiesce-window-mode/v1');
    expect(marker.mode).toBe('cutover');
    expect(marker.run_id).toBe(runId);

    // (c) a stopped run does NOT run post-activate.
    expect(stopped.postActivate).toBeNull();
  });
});

// R5 Sub-round D (orchestrator RULING 2 — RECOVER SCOPE, non-negotiable): run_recover resumes an
// interrupted forward cutover from an EXISTING run root and reproduces the SAME 76-row composer
// twin + post-activate an uninterrupted run would have. It supports EXACTLY two clean checkpoints
// — the C7 planned-exit head (deploy.prepare/completed) and the crash-after-FWM restart
// (writers.resume.forward/accepted) — and FAILS CLOSED with a NAMED refusal on every other head,
// never a heuristic continuation.
describe('Q12 live cutover controller (Task-9) — R5 Sub-round D: run_recover', () => {
  it('recovers from the C7 planned-exit head (deploy.prepare/completed) to the full 76-row twin + post-activate', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
    const quiescePath = writeQuiesceManifest(composerRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: composerRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const liveRoot = root();

    // stop the forward run at the C7 head — the journal ends at deploy.prepare/completed.
    const stopped = await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
      stopAfter: 'deploy.prepare',
    });
    const c7End = witnessIndex(composer.journalEntries, 'deploy.prepare', 'completed') + 1;
    expect(stopped.journalEntries.length).toBe(c7End);
    const stoppedHead = stopped.journalEntries.at(-1)!;
    expect(stoppedHead.command_id).toBe('deploy.prepare');
    expect(stoppedHead.outcome).toBe('completed');
    expect(stopped.postActivate).toBeNull();

    // recover on the SAME run root: the completed journal is length 76 and a full byte/order twin
    // of the composer under the ratified R5-A parity exclusions.
    const recovered = await materializeRecover({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    // Since R8-I-A a recovered run reproduces the 76-row forward twin (prefix, §6b.3) AND drives the
    // journaled cleanup segment via the shared drive_forward_tail, so the completed journal is 81 rows.
    expect(recovered.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    expect(recovered.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );

    // recover RESUMED (appended) — it did not rewrite the prefix: the first c7End rows are the
    // stopped partial journal byte-for-byte.
    expect(recovered.journalEntries.slice(0, c7End)).toEqual(stopped.journalEntries);

    // post-activate (R5-E, reused) is recorded on the recovered run.
    expect(recovered.postActivate).toBeTruthy();
    expect(recovered.postActivate!.cleanup.status).toBe('guard_cleanup_complete');
    expect(recovered.postActivate!.resume.status).toBe('resumed');
    expect(recovered.postActivate!.resume.validated_receipt_sha256).toBe(
      recovered.postActivate!.cleanup.cleanup_receipt_sha256
    );
  });

  it('recovers from the crash-after-FWM restart (writers.resume.forward/accepted) to the full 76-row twin + post-activate', async () => {
    const composerRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(composerRoot);
    const quiescePath = writeQuiesceManifest(composerRoot, runId);
    const composer = await materializeJoinedRetainedBarrierFixture({
      runRoot: composerRoot,
      joinedProfile: 'forward',
      quiesceManifestPath: quiescePath,
    });
    const liveRoot = root();

    // stop AFTER the group-14 FWM accepted row — the journal ends at writers.resume.forward/accepted.
    const stopped = await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
      stopAfter: 'final-writer-manifest',
    });
    const fwmEnd = witnessIndex(composer.journalEntries, 'writers.resume.forward', 'accepted') + 1;
    expect(stopped.journalEntries.length).toBe(fwmEnd);
    const stoppedHead = stopped.journalEntries.at(-1)!;
    expect(stoppedHead.command_id).toBe('writers.resume.forward');
    expect(stoppedHead.outcome).toBe('accepted');
    expect(stopped.postActivate).toBeNull();
    // the FWM artifact is already on disk (it is what the resume must NOT republish).
    expect(stopped.forwardFinalWriterManifestPath).toBeTruthy();

    const recovered = await materializeRecover({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    // Since R8-I-A a recovered run reproduces the 76-row forward twin (prefix, §6b.3) AND drives the
    // journaled cleanup segment via the shared drive_forward_tail, so the completed journal is 81 rows.
    expect(recovered.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    expect(recovered.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );
    // resumed from group 15 (deploy.commit): the FWM prefix is preserved byte-for-byte.
    expect(recovered.journalEntries.slice(0, fwmEnd)).toEqual(stopped.journalEntries);
    expect(recovered.postActivate).toBeTruthy();
    expect(recovered.postActivate!.cleanup.status).toBe('guard_cleanup_complete');
    expect(recovered.postActivate!.resume.status).toBe('resumed');
  });

  it('fails closed with a NAMED refusal on an empty durable journal', async () => {
    // Under Option A (R8-I-B) the barrier.install/completed and barrier.cleanup/accepted heads this
    // test used to reject are now SUPPORTED (see the R8-I-B block: install resumes, cleanup converges
    // no-op). The remaining unconditional fail-closed case is an absent/empty durable journal —
    // recover has nothing to resume. (Mid-lifecycle-barrier + unknown-head refusals are proven in the
    // R8-I-B block against the generalized dispatch.)
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);
    const emptyRefusal = await runRecoverExpectingRefusal({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(emptyRefusal.ok).toBe(false);
    expect(emptyRefusal.error).toMatch(/recover requires a non-empty durable journal/u);
  });
});

// R8-I-B (design §6b.2, RULING R8-C = Option A, ratified 2026-07-18): run_recover's dispatch is
// GENERALIZED from the R5 two-head set to ONE table covering every clean completed-group boundary
// head of the frozen 76-row chronology PLUS the post-activate cleanup heads (8 head classes). A
// resumed run re-drives the forward sequence from the NEXT group through the SHARED
// drive_forward_sequence, converging BYTE/ORDER-identical to an uninterrupted 81-row twin (§6b.2
// condition 3). Journal-head evidence ONLY — the withdrawn witness-file mechanism is gone. Named
// fail-closed REMAINS for mid-lifecycle barrier heads (with the standalone-supervisor pointer),
// unknown command_ids, and any broken/short chain (rejected by the chain walk BEFORE dispatch).
describe('Q12 live cutover controller (Task-9) — R8-I-B: generalized Option A recover head-dispatch', () => {
  // Drive an uninterrupted twin + an interrupted run stopped at a barrier's completed head, recover
  // the interrupted run, and assert the resumed 81-row journal converges to the twin.
  async function proveBarrierHeadConverges(
    stopAfter: 'writers.quiesce.pre' | 'barrier.verify-after-base' | 'barrier.activate',
    expectedHeadCommand: string
  ): Promise<void> {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);

    // twin: an uninterrupted full run (81 rows) with the SAME run id + quiesce manifest.
    const twin = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(twin.journalEntries.length).toBe(FORWARD_PREFIX + 5);

    // interrupted: stop cleanly at the barrier's completed head.
    const liveRoot = root();
    const stopped = await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
      stopAfter,
    });
    const stoppedHead = stopped.journalEntries.at(-1)!;
    expect(stoppedHead.command_id).toBe(expectedHeadCommand);
    expect(stoppedHead.outcome).toBe('completed');
    expect(stopped.postActivate).toBeNull();
    const stoppedLen = stopped.journalEntries.length;
    expect(stoppedLen).toBeLessThan(FORWARD_PREFIX + 5);

    // recover: resumes the forward sequence from the NEXT group, converging to the 81-row window.
    const recovered = await materializeRecover({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(recovered.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    // recover APPENDED — it did not rewrite the durable prefix (byte-for-byte identical rows).
    expect(recovered.journalEntries.slice(0, stoppedLen)).toEqual(stopped.journalEntries);
    // the 76-row forward prefix is a strict byte/order twin of the uninterrupted run (blessed set).
    expect(recovered.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)).toEqual(
      twin.journalEntries.slice(0, FORWARD_PREFIX).map(withParityExclusions)
    );
    // the WHOLE 81-row journal converges to the uninterrupted twin under the convergence exclusions.
    expect(recovered.journalEntries.map(withConvergenceExclusions)).toEqual(
      twin.journalEntries.map(withConvergenceExclusions)
    );
    // post-activate cleanup + receipt-only resume are recorded, receipt-bound.
    expect(recovered.postActivate).toBeTruthy();
    expect(recovered.postActivate!.cleanup.status).toBe('guard_cleanup_complete');
    expect(recovered.postActivate!.resume.status).toBe('resumed');
    expect(recovered.postActivate!.resume.validated_receipt_sha256).toBe(
      recovered.postActivate!.cleanup.cleanup_receipt_sha256
    );
  }

  it('head 1 — barrier.install/completed (group 2): recover resumes from group 3 and converges', async () => {
    await proveBarrierHeadConverges('writers.quiesce.pre', 'barrier.install');
  });

  it('head 2 — barrier.verify-after-base/completed (group 7): recover resumes from group 7 continuation and converges', async () => {
    await proveBarrierHeadConverges('barrier.verify-after-base', 'barrier.verify-after-base');
  });

  it('head 5 — barrier.activate/completed (group 16): recover drives the journaled cleanup segment and converges', async () => {
    await proveBarrierHeadConverges('barrier.activate', 'barrier.activate');
  });

  it('head 8 — barrier.cleanup/accepted (fully complete): recover is an idempotent no-op (journal + marker byte-unchanged)', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);
    const liveRoot = root();
    const full = await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(full.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    const fullHead = full.journalEntries.at(-1)!;
    expect(fullHead.command_id).toBe('barrier.cleanup');
    expect(fullHead.outcome).toBe('accepted');
    const journalBefore = readFileSync(join(liveRoot, 'phase.jsonl'));
    const markerBefore = readFileSync(join(liveRoot, 'quiesce-window-mode.json'));

    // a fully-complete run recovered again converges idempotently (folds in the old R8-D/R8-E no-op).
    const recovered = await materializeRecover({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(recovered.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    // NO re-drive, NO new row: the durable journal + the 0400 cutover marker are byte-for-byte unchanged.
    expect(readFileSync(join(liveRoot, 'phase.jsonl'))).toEqual(journalBefore);
    expect(readFileSync(join(liveRoot, 'quiesce-window-mode.json'))).toEqual(markerBefore);
    // it converged to the SAME durable chain (no fresh post-activate cleanup was recorded).
    expect(recovered.journalEntries).toEqual(full.journalEntries);
    expect(recovered.postActivate).toBeNull();
  });

  it('head 8 — mid-cleanup crash (barrier.cleanup/capability_claimed): recover resumes the cleanup segment and converges', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);

    const twin = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(twin.journalEntries.length).toBe(FORWARD_PREFIX + 5);

    // crash INSIDE the cleanup segment after the capability_claimed row (rows 1-3 durable).
    const liveRoot = root();
    await expect(
      materializeLiveController({
        runRoot: liveRoot,
        runId,
        quiesceManifestPath: quiescePath,
        cleanupCrashAfter: 'capability_claimed',
      })
    ).rejects.toThrow();
    const crashedRows = readFileSync(join(liveRoot, 'phase.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>);
    expect(crashedRows.length).toBe(FORWARD_PREFIX + 3);
    const crashHead = crashedRows.at(-1)!;
    expect(crashHead.command_id).toBe('barrier.cleanup');
    expect(crashHead.outcome).toBe('capability_claimed');

    // recover resumes the cleanup segment from the interrupted outcome, appending rows 4-5.
    const recovered = await materializeRecover({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(recovered.journalEntries.length).toBe(FORWARD_PREFIX + 5);
    // rows 1-3 (durable) are preserved byte-for-byte; recover only appended the completed + accepted rows.
    expect(recovered.journalEntries.slice(0, FORWARD_PREFIX + 3)).toEqual(crashedRows);
    expect(
      recovered.journalEntries
        .slice(FORWARD_PREFIX + 3)
        .map(r => [r.phase, r.outcome, r.command_id])
    ).toEqual([
      ['guard_cleanup_complete', 'capability_completed', 'barrier.cleanup'],
      ['guard_cleanup_complete', 'accepted', 'barrier.cleanup'],
    ]);
    // converges to the uninterrupted twin under the convergence exclusions.
    expect(recovered.journalEntries.map(withConvergenceExclusions)).toEqual(
      twin.journalEntries.map(withConvergenceExclusions)
    );
    expect(recovered.postActivate).toBeTruthy();
    expect(recovered.postActivate!.resume.status).toBe('resumed');
  });

  it('mid-lifecycle barrier head (claimed-not-completed) fails closed WITH the standalone-supervisor pointer', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);

    // build a barrier journal that stops MID-lifecycle at capability_claimed (not completed) via the
    // supervisor fixture — the head a mid-barrier crash leaves before the standalone-supervisor step.
    const midRoot = root();
    await materializeRootRetainedBarrierFixture({
      runRoot: midRoot,
      mode: 'forward',
      completed: [],
      chains: {
        install: {
          operation: 'install',
          stopAfter: 'claimed',
          installTransaction: 'not-committed',
          rootEpoch: parseLeaseEpoch('cutover'),
          cutoverCopyBeforeRecoveryRoot: 'absent',
          recoveryReissues: 0,
          publicationWindowOrphans: 0,
          completionMode: 'normal',
          faultAfter: 'none',
        },
      },
    });
    const journalPath = join(midRoot, 'phase.jsonl');
    const before = readFileSync(journalPath);
    const head = JSON.parse(before.toString('utf8').trim().split('\n').at(-1)!) as Record<
      string,
      unknown
    >;
    expect(head.command_id).toBe('barrier.install');
    expect(head.outcome).toBe('capability_claimed');

    const refusal = await runRecoverExpectingRefusal({
      runRoot: midRoot,
      quiesceManifestPath: quiescePath,
    });
    expect(refusal.ok).toBe(false);
    expect(refusal.error).toMatch(/recover does not support resuming from/u);
    expect(refusal.error).toMatch(/command=barrier\.install/u);
    expect(refusal.error).toMatch(/outcome=capability_claimed/u);
    // a MID-LIFECYCLE barrier head keeps the standalone-supervisor pointer (the R5-D2 mechanism):
    // the operator runs it to advance the barrier to its completed head, which recover then resumes.
    expect(refusal.error).toMatch(/q12-live-cutover\.sh install/u);
    // it did NOT continue: the durable journal is byte-for-byte unchanged.
    expect(readFileSync(journalPath)).toEqual(before);
  });

  it('CHAIN FIRST: a corrupted durable chain at the head fails on the chain walk, never reaching dispatch', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);
    const liveRoot = root();
    const full = await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(full.journalEntries.length).toBe(FORWARD_PREFIX + 5);

    // corrupt a HASH field (operator_digest) on the durable head row WITHOUT touching
    // resource_manifest_sha256 (run_recover reads entries[0].resource_manifest_sha256 pre-Engine to
    // pin the walk), so recover reaches Engine construction — where the full durable-chain validation
    // walk runs BEFORE any dispatch. The recomputed entry_hash no longer matches the stored one.
    const journalPath = join(liveRoot, 'phase.jsonl');
    const rows = readFileSync(journalPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>);
    rows.at(-1)!.operator_digest = `${'0'.repeat(63)}1`;
    const corrupted = `${rows.map(row => canonical(row)).join('\n')}\n`;
    chmodSync(journalPath, 0o600);
    writeFileSync(journalPath, corrupted, { mode: 0o600 });
    const markerBefore = readFileSync(join(liveRoot, 'quiesce-window-mode.json'));

    const refusal = await runRecoverExpectingRefusal({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(refusal.ok).toBe(false);
    // it failed on the CHAIN (Engine reload), not on dispatch — a broken chain never reaches the table.
    expect(refusal.error).toMatch(/journal entry hash mismatch/u);
    expect(refusal.error).not.toMatch(/does not support resuming/u);
    // marker byte-unchanged (chain failure never reaches dispatch/post-activate).
    expect(readFileSync(join(liveRoot, 'quiesce-window-mode.json'))).toEqual(markerBefore);
  });
});

// R8-I-C (design §6b.6, ratified R8-C composed-recovery obligation): the composed mid-barrier
// ACCEPTANCE PROBES. Each probe drives ONE durable journal through the FULL composition on a single
// run root, proving the §5.5 procedure converges end-to-end (§6b.2 condition 3):
//   (i)   run_live (fixture executors) uninterrupted -> snapshot the INDEPENDENT twin oracle;
//   (ii)  on a fresh root, run_live with a mid-`barrier.<op>` crash AT capability_claimed (a TWO-
//         PROCESS lease-reacquisition boundary: the barrier resumes under a SEPARATE supervisor);
//   (iii) recover FAILS CLOSED on the claimed-but-not-completed head with the EXACT
//         `q12-live-cutover.sh <op>` pointer AND leaves the durable journal byte-unchanged (cond. 7);
//   (iv)  the STANDALONE supervisor (`q12-live-cutover.sh <op>` -> run_supervisor,
//         resume_retained_chain) completes the barrier to `barrier.<op>/completed` under
//         cutover-recovery-1 — append-only, so the pre-crash rows survive byte-for-byte;
//   (v)   recover resumes the shared forward sequence from the group after the now-completed barrier,
//         driving to the FULL composed journal (through activate + the post-activate cleanup segment);
//   (vi)  assert composed == the DERIVED expected journal (FULL row bytes, the EXISTING field-level
//         exclusions only) + the explicit +2 row-count arithmetic (83 vs 81 for one resumed barrier).
//
// THE DERIVED-JOURNAL ORACLE (the SOLE primary oracle; condition 4). The prior "uninterrupted-
// equality" oracle was UNSATISFIABLE — FOUND DEFECT #11: the composition is a two-process lease
// reacquisition (q12-lifecycle-core.py:3922 sets lease_reacquired = new_session and durable-journal;
// pinned by q12-live-cutover.test.ts:94-132), so the resumed barrier completes under
// cutover-recovery-1 with EXTRA rows and can never equal an uninterrupted twin. The "in-process
// recoveryReissues=1 twin" oracle was ALSO unsatisfiable — FOUND DEFECT #12: the in-process reissue
// at retained_chain:2258-2298 emits a SINGLE claim under the recovery epoch and never preserves the
// pre-crash `capability_claimed/cutover` row, whereas the two-process crash-at-claimed preserves it
// append-only, so they differ by one row. The RATIFIED oracle DERIVES the expected journal from the
// INDEPENDENT uninterrupted twin + the pinned recovery-shape CONSTANTS (never from running the
// composed procedure): keep the three pre-crash rows (intent/cutover, capability_issued/cutover,
// capability_claimed/cutover) byte-as-is; INSERT `recovery_reacquired`/cutover-recovery-1 + a SECOND
// `capability_claimed`/cutover-recovery-1 immediately after the pre-crash claim; step the barrier's
// `completed` row's lease_epoch to cutover-recovery-1 (consecutive per the frozen epoch grammar
// q12-database-barrier.sh:514-518). Everything OUTSIDE that barrier group is byte/order-identical.
describe('Q12 live cutover controller (Task-9) — R8-I-C: §6b.6 composed mid-barrier recovery probes', () => {
  // Build the DERIVED expected journal (condition 1) from the INDEPENDENT twin + the ratified
  // recovery-shape constants. NON-CIRCULAR by construction: never reads the composed journal.
  function deriveComposedRecoveryExpected(
    twin: readonly Record<string, unknown>[],
    barrierCommand: string
  ): Record<string, unknown>[] {
    const claimedIndex = twin.findIndex(
      row => row.command_id === barrierCommand && row.outcome === 'capability_claimed'
    );
    if (claimedIndex < 0) {
      throw new Error(`derived: no ${barrierCommand} capability_claimed row in the twin`);
    }
    const completedIndex = twin.findIndex(
      row => row.command_id === barrierCommand && row.outcome === 'completed'
    );
    // the uninterrupted barrier group is the contiguous 4-row intent/issued/claimed/completed chain.
    if (completedIndex !== claimedIndex + 1) {
      throw new Error(
        `derived: ${barrierCommand} group is not a contiguous claimed->completed pair`
      );
    }
    const preCrashClaim = twin[claimedIndex];
    expect(preCrashClaim.lease_epoch).toBe('cutover');
    // the ratified recovery-shape INSERTION (pinned by q12-live-cutover.test.ts:94-132 + the frozen
    // consecutive cutover -> cutover-recovery-1 epoch grammar q12-database-barrier.sh:514-518). The
    // two inserted rows clone the pre-crash claim's shared fields (phase/command_sha256/quiesce/
    // accepted-object/etc.) and only step outcome + lease_epoch — the blessed-excluded per-run fields
    // (capability/entry/previous/resource hashes) are stripped before comparison, so their cloned
    // values are irrelevant.
    const reacquired = {
      ...preCrashClaim,
      outcome: 'recovery_reacquired',
      lease_epoch: 'cutover-recovery-1',
    };
    const secondClaim = {
      ...preCrashClaim,
      outcome: 'capability_claimed',
      lease_epoch: 'cutover-recovery-1',
    };
    const steppedCompleted = { ...twin[completedIndex], lease_epoch: 'cutover-recovery-1' };
    const rows = [
      ...twin.slice(0, claimedIndex + 1),
      reacquired,
      secondClaim,
      steppedCompleted,
      ...twin.slice(completedIndex + 1),
    ];
    // renumber seq consecutively — seq is NOT excluded, and the two inserted rows shift the tail by +2
    // exactly as the composed journal's own seq does.
    return rows.map((row, index) => ({ ...row, seq: index + 1 }));
  }

  async function proveComposedRecovery(operation: RetainedBarrierOperation): Promise<void> {
    const barrierCommand = `barrier.${operation}`;
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);

    // (i) uninterrupted run_live twin (the INDEPENDENT 81-row oracle).
    const twin = await materializeLiveController({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(twin.journalEntries.length).toBe(FORWARD_PREFIX + 5);

    // (ii) fresh root: run_live with a mid-`barrier.<op>` crash AT capability_claimed. The scoped
    // frontier_claim_command/claim-row fault crashes ONLY this barrier's delegated claim; run_live
    // rejects and leaves the durable journal head at barrier.<op>/capability_claimed (lease cutover).
    const liveRoot = root();
    await expect(
      materializeLiveController({
        runRoot: liveRoot,
        runId,
        quiesceManifestPath: quiescePath,
        barrierClaimCrash: operation,
      })
    ).rejects.toThrow();
    const journalPath = join(liveRoot, 'phase.jsonl');
    const crashedRows = readFileSync(journalPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>);
    const crashHead = crashedRows.at(-1)!;
    expect(crashHead.command_id).toBe(barrierCommand);
    expect(crashHead.outcome).toBe('capability_claimed');
    expect(crashHead.lease_epoch).toBe('cutover');

    // (iii) FAIL-CLOSED pre-supervisor (condition 7): recover on the mid-lifecycle claimed head
    // refuses with the EXACT standalone-supervisor pointer AND leaves the durable journal byte-
    // unchanged. This is the mechanism the operator follows before the supervisor step.
    const beforeRefusal = readFileSync(journalPath);
    const refusal = await runRecoverExpectingRefusal({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(refusal.ok).toBe(false);
    expect(refusal.error).toMatch(/recover does not support resuming from/u);
    expect(refusal.error).toMatch(new RegExp(`command=barrier\\.${operation}`, 'u'));
    expect(refusal.error).toMatch(/outcome=capability_claimed/u);
    expect(refusal.error).toMatch(new RegExp(`q12-live-cutover\\.sh ${operation}`, 'u'));
    expect(readFileSync(journalPath)).toEqual(beforeRefusal);

    // (iv) the STANDALONE supervisor completes the crashed barrier to barrier.<op>/completed under
    // cutover-recovery-1: a two-process lease reacquisition that APPENDS recovery_reacquired + a
    // second capability_claimed + completed while preserving the pre-crash rows byte-for-byte.
    const supervised = await materializeSupervisor({ runRoot: liveRoot, runId, operation });
    expect(supervised.journalEntries.slice(0, crashedRows.length)).toEqual(crashedRows);
    const supervisedTail = supervised.journalEntries.slice(crashedRows.length);
    expect(supervisedTail.map(r => [r.command_id, r.outcome, r.lease_epoch])).toEqual([
      [barrierCommand, 'recovery_reacquired', 'cutover-recovery-1'],
      [barrierCommand, 'capability_claimed', 'cutover-recovery-1'],
      [barrierCommand, 'completed', 'cutover-recovery-1'],
    ]);

    // (v) recover resumes the shared forward sequence from the group after the now-completed barrier,
    // driving to the FULL composed journal (through activate + the post-activate cleanup segment).
    const composed = await materializeRecover({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });

    // (vi) DERIVED-JOURNAL oracle. expected is built from the INDEPENDENT twin + the recovery-shape
    // constants (condition 1/3), NEVER from `composed`.
    const derived = deriveComposedRecoveryExpected(twin.journalEntries, barrierCommand);

    // condition 4: explicit row-count arithmetic — composed == uninterrupted + 2 per resumed barrier.
    expect(composed.journalEntries.length).toBe(twin.journalEntries.length + 2);
    expect(composed.journalEntries.length).toBe(FORWARD_PREFIX + 5 + 2); // 83 vs 81

    // condition 2: FULL-ROW-BYTES equality under the EXISTING field-level exclusions ONLY (the blessed
    // set + the FWM/cleanup row-scoped drops = withConvergenceExclusions). lease_epoch is NOT excluded
    // — asserted exactly (cutover for the pre-crash rows, cutover-recovery-1 for the inserted +
    // completed rows). A genuine implementation divergence here is a FOUND DEFECT, not an oracle issue.
    expect(composed.journalEntries.map(withConvergenceExclusions)).toEqual(
      derived.map(withConvergenceExclusions)
    );

    // condition 2 (cont.): the two INSERTED rows asserted as FULL row shapes, not mere presence.
    const insertedIndex = composed.journalEntries.findIndex(
      r => r.command_id === barrierCommand && r.outcome === 'recovery_reacquired'
    );
    expect(insertedIndex).toBeGreaterThan(0);
    const preCrashClaimComposed = composed.journalEntries[insertedIndex - 1];
    expect(preCrashClaimComposed).toMatchObject({
      command_id: barrierCommand,
      outcome: 'capability_claimed',
      lease_epoch: 'cutover',
    });
    const [reacquiredRow, secondClaimRow, steppedCompletedRow] = composed.journalEntries.slice(
      insertedIndex,
      insertedIndex + 3
    );
    for (const row of [reacquiredRow, secondClaimRow]) {
      expect(row.command_id).toBe(barrierCommand);
      expect(row.command_sha256).toBe(preCrashClaimComposed.command_sha256);
      expect(row.phase).toBe(preCrashClaimComposed.phase);
      expect(row.lease_epoch).toBe('cutover-recovery-1');
      expect(row.accepted_object_kind).toBe('none');
      expect(row.accepted_object_sha256).toBeNull();
    }
    expect(reacquiredRow.outcome).toBe('recovery_reacquired');
    expect(secondClaimRow.outcome).toBe('capability_claimed');
    expect(steppedCompletedRow).toMatchObject({
      command_id: barrierCommand,
      outcome: 'completed',
      lease_epoch: 'cutover-recovery-1',
    });

    // the composed run drove the full post-activate cleanup + receipt-only resume (it converged fully,
    // not just to the barrier).
    expect(composed.postActivate).toBeTruthy();
    expect(composed.postActivate!.cleanup.status).toBe('guard_cleanup_complete');
    expect(composed.postActivate!.resume.status).toBe('resumed');
  }

  it('install (first barrier, group 2): composed mid-barrier recovery converges to the derived twin (+2)', async () => {
    await proveComposedRecovery('install');
  });

  it('verify-after-base (mid-forward barrier, group 7): composed mid-barrier recovery converges (+2)', async () => {
    await proveComposedRecovery('verify-after-base');
  });

  it('activate (last barrier, group 16 -> cleanup): composed mid-barrier recovery converges (+2)', async () => {
    await proveComposedRecovery('activate');
  });
});
