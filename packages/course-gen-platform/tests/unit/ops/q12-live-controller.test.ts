import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeJoinedRetainedBarrierFixture,
  materializeLiveController,
  materializeRecover,
  runFwmNegative,
  runRecoverExpectingRefusal,
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
    expect(live.journalEntries.length).toBe(76);

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
    // FWM accepted row only (every other row keeps the closed 4-field blessed set). ---
    expect(live.journalEntries.map(withParityExclusions)).toEqual(
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

    // (c) parity-neutral: adding the marker write left the journal byte-identical to the
    // composer — run_live still journals the full 76-row forward twin under the blessed
    // exclusions, and the marker added no journal row.
    expect(live.journalEntries.length).toBe(76);
    expect(live.journalEntries.map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );

    // post-activate persistence: the marker survives the whole window (still present after the
    // group-16 activate row, i.e. after run_live returns).
    expect(existsSync(live.quiesceWindowMarkerPath!)).toBe(true);
  });
});

// R5 Sub-round E (orchestrator RULING 1 — POST-ACTIVATE CLEANUP IS RECEIPT-ONLY): the frozen
// D5J §5 chronology ends at activate (76 journal rows) and the journal grammar has NO cleanup
// command_id, so run_live adds NO journal row for the cleanup or the post-activate resume. After
// the 76th row, run_live ORCHESTRATES — as children (fixture-seeded here; real docker/PG17 is
// round R8) via an executor seam — (1) the barrier cleanup, which produces a v2
// guard_cleanup_complete database-barrier receipt (+ probe receipt), and (2) the forward resume
// child, which fail-closed VALIDATES that receipt and resumes writers. run_live does NOT
// reimplement the receipt gate (it lives in the children); it INVOKES them and RECORDS their
// outcomes on the result (operator-visible truth, since the cleanup is deliberately not in the
// journal). The seeded receipt is shaped so the REAL q12-writer-resume.py forward gate
// (:1088-1134) would accept it.
describe('Q12 live cutover controller (Task-9) — R5 Sub-round E: post-activate receipt-only cleanup + resume', () => {
  it('records the post-activate v2 cleanup receipt + forward resume outcomes without adding a journal row', async () => {
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

    // (a) run_live RECORDS the post-activate cleanup + resume outcomes with an ok/status each.
    expect(live.postActivate).toBeTruthy();
    const cleanup = live.postActivate!.cleanup;
    const resume = live.postActivate!.resume;
    expect(cleanup.status).toBe('guard_cleanup_complete');
    expect(cleanup.ok).toBe(true);
    expect(resume.status).toBe('resumed');
    expect(resume.ok).toBe(true);

    // the cleanup receipt sha256 is recorded (hex64) and the resume child validated EXACTLY that
    // receipt (run_live's light orchestration join — NOT the receipt gate, which is the child's).
    const receiptSha = cleanup.cleanup_receipt_sha256 as string;
    expect(receiptSha).toMatch(/^[0-9a-f]{64}$/u);
    expect(resume.validated_receipt_sha256).toBe(receiptSha);

    // (b) the recorded cleanup receipt is a v2 guard_cleanup_complete receipt shaped so the REAL
    // q12-writer-resume.py forward branch (:1088-1104) would accept it: schema v2 + state +
    // last_command=cleanup + rollback_probes_verified True + hex64 probe, run_id/expected/terminal
    // bindings, zero_guard_residue + database_capability_deleted True.
    const receipt = cleanup.receipt as Record<string, unknown>;
    expect(receipt.schema_version).toBe('megacampus.q12.database-barrier-receipt/v2');
    expect(receipt.state).toBe('guard_cleanup_complete');
    expect(receipt.last_command).toBe('cleanup');
    expect(receipt.rollback_probes_verified).toBe(true);
    expect(receipt.zero_guard_residue).toBe(true);
    expect(receipt.database_capability_deleted).toBe(true);
    expect(receipt.run_id).toBe(runId);
    expect(receipt.probe_receipt_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(receipt.expected_catalog_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(receipt.terminal_proof_sha256).toMatch(/^[0-9a-f]{64}$/u);
    // the exact v2 receipt key set the real gate's exact() enforces (no more, no less).
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

    // the receipt is a real 0400 artifact whose digest IS the recorded cleanup_receipt_sha256,
    // and it is canonical bytes + newline (the real gate's canonical_json(barrier)+b"\n" check).
    const receiptPath = cleanup.cleanup_receipt_path as string;
    expect(receiptPath.endsWith('/database-barrier-receipt.json')).toBe(true);
    const receiptBytes = readFileSync(receiptPath);
    expect(sha(receiptBytes)).toBe(receiptSha);
    expect(statSync(receiptPath).mode & 0o777).toBe(0o400);
    expect(receiptBytes.toString('utf8')).toBe(`${canonical(receipt)}\n`);

    // the probe receipt is a real 0400 artifact whose digest IS the receipt's probe binding
    // (the real gate's probe_file.digest == barrier.probe_receipt_sha256 check).
    const probePath = cleanup.probe_receipt_path as string;
    expect(probePath.endsWith('/database-barrier-probe-receipt.json')).toBe(true);
    const probeBytes = readFileSync(probePath);
    expect(sha(probeBytes)).toBe(receipt.probe_receipt_sha256);
    expect(statSync(probePath).mode & 0o777).toBe(0o400);
    const probe = JSON.parse(probeBytes.toString('utf8')) as Record<string, unknown>;
    expect(probe.schema_version).toBe('megacampus.q12.database-barrier-probes/v1');
    expect(probe.run_id).toBe(runId);
    expect(probe.expected_catalog_sha256).toBe(receipt.expected_catalog_sha256);

    // (c) PARITY-NEUTRAL: still exactly 76 rows and a full byte/order twin of the composer under
    // the blessed/withParityExclusions helpers — the receipt-only cleanup/resume added NO journal
    // row (the grammar has no cleanup/resume command_id).
    expect(live.journalEntries.length).toBe(76);
    expect(live.journalEntries.map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );
    for (const row of live.journalEntries) {
      expect(row.command_id).not.toBe('cleanup');
      expect(row.command_id).not.toBe('barrier.cleanup');
      expect(row.command_id).not.toBe('writers.resume.forward.cleanup');
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
    expect(recovered.journalEntries.length).toBe(76);
    expect(recovered.journalEntries.map(withParityExclusions)).toEqual(
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
    expect(recovered.journalEntries.length).toBe(76);
    expect(recovered.journalEntries.map(withParityExclusions)).toEqual(
      composer.journalEntries.map(withParityExclusions)
    );
    // resumed from group 15 (deploy.commit): the FWM prefix is preserved byte-for-byte.
    expect(recovered.journalEntries.slice(0, fwmEnd)).toEqual(stopped.journalEntries);
    expect(recovered.postActivate).toBeTruthy();
    expect(recovered.postActivate!.cleanup.status).toBe('guard_cleanup_complete');
    expect(recovered.postActivate!.resume.status).toBe('resumed');
  });

  it('fails closed with a NAMED refusal on an unsupported durable head and does NOT continue', async () => {
    const quiesceRoot = root();
    const runId = deriveRootRetainedBarrierFixtureRunId(quiesceRoot);
    const quiescePath = writeQuiesceManifest(quiesceRoot, runId);

    // --- unsupported mid-forward head: stop before writers.quiesce => head barrier.install/completed,
    // which is neither the C7 head nor the crash-after-FWM head. ---
    const liveRoot = root();
    await materializeLiveController({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
      stopAfter: 'writers.quiesce.pre',
    });
    const journalPath = join(liveRoot, 'phase.jsonl');
    const before = readFileSync(journalPath);
    const refusal = await runRecoverExpectingRefusal({
      runRoot: liveRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(refusal.ok).toBe(false);
    expect(refusal.error).toMatch(/recover does not support resuming from/u);
    expect(refusal.error).toMatch(/command=barrier\.install/u);
    expect(refusal.error).toMatch(/outcome=completed/u);
    expect(refusal.error).toMatch(/phase=maintenance_guarded/u);
    // RULING-2 option (a) requirement 1: a barrier head's refusal POINTS the operator at the exact
    // standalone supervisor command to re-run (idempotent barrier resume), so the 3am next step
    // comes from the error, not archaeology. barrier.install => q12-live-cutover.sh install.
    expect(refusal.error).toMatch(/q12-live-cutover\.sh install/u);
    // it did NOT continue: the durable journal is byte-for-byte unchanged.
    expect(readFileSync(journalPath)).toEqual(before);

    // --- empty journal: a fresh run root with no durable rows. ---
    const emptyRefusal = await runRecoverExpectingRefusal({
      runRoot: root(),
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(emptyRefusal.ok).toBe(false);
    expect(emptyRefusal.error).toMatch(/recover requires a non-empty durable journal/u);

    // --- a head PAST activate: a full uninterrupted forward run (76 rows) has nothing to resume. ---
    const fullRoot = root();
    const full = await materializeLiveController({
      runRoot: fullRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(full.journalEntries.length).toBe(76);
    const pastActivate = await runRecoverExpectingRefusal({
      runRoot: fullRoot,
      runId,
      quiesceManifestPath: quiescePath,
    });
    expect(pastActivate.ok).toBe(false);
    expect(pastActivate.error).toMatch(/recover does not support resuming from/u);
    expect(pastActivate.error).toMatch(/command=barrier\.activate/u);
    // barrier.activate => the pointer names the activate operation.
    expect(pastActivate.error).toMatch(/q12-live-cutover\.sh activate/u);
  });
});
