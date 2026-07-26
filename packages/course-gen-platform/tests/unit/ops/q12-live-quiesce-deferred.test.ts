import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RUN_REAL_CONTROLLER } from './fixtures/q12-real-controller-gate.js';
import {
  canonical,
  deriveRootRetainedBarrierFixtureRunId,
  materializeLiveController,
  materializeRecover,
  sha,
} from './fixtures/q12-retained-barrier-contract.js';

// mc2-y02tz — C2-DEFERRED WRITER-QUIESCE PUBLICATION.
//
// The Q12 live cutover controller (run_live, deploy/qdrant/q12-lifecycle-core.py) used to REQUIRE
// the writer-quiesce manifest to already exist on disk before it journalled its first row. That
// input cannot exist on the FIRST live run of a window: `<run-root>/writer-quiesce-<run-id>.json`
// is published by the in-window group-3 ordinary command `writers.quiesce` (frozen manifest ->
// deploy/qdrant/source-recovery-run.sh --operation quiesce-writers-only, path derived at
// source-recovery-run.sh:522), which run_live itself drives, onto a run root run_live requires to
// be FRESH; the W-side child (deploy/qdrant/q12-writer-resume.py run_quiesce) additionally
// requires an existing `<run-root>/phase.jsonl` whose head phase is `quiesced`. Hand-authoring the
// file is not an available answer: it is an authority asserting that the writers are ALREADY
// quiesced, which the operator does not hold.
//
// These proofs therefore drive the production first-run ordering end to end: nothing pre-publishes
// the manifest, the request declares the all-zero digest ("not published yet"), and the fixture's
// ordinary-execution seam publishes the real 0400 file at the exact moment the `writers.quiesce`
// command executes — simulating the real C2 child.

const ZERO = '0'.repeat(64);

const roots: string[] = [];

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function root(): string {
  // the controller pins the non-production run-root shape (Engine.__post_init__)
  const value = mkdtempSync('/tmp/mc2-q12-d5-root-');
  roots.push(value);
  return value;
}

// Minimal valid W-owned quiesce manifest (the accepted composition-seam harness shape, the same
// one q12-live-controller.test.ts feeds the pre-published path).
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

/** The exact bytes the simulated C2 child publishes (and a pre-published twin is fed). */
function quiesceManifestBody(runId: string): string {
  const services = ['api', 'web', 'worker', 'worker-stage6', 'worker-stage7'];
  const kind = (service: string) =>
    service === 'api' ? 'api' : service === 'web' ? 'web' : 'worker';
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
    writers: [
      ...services.map((service, index) =>
        quiesceWriter(`production-${kind(service)}`, service, index + 1)
      ),
      ...services.map((service, index) =>
        quiesceWriter(`development-${kind(service)}`, `${service}-dev`, index + 6)
      ),
    ],
  };
  return `${canonical(value)}\n`;
}

/** The path the real C2 child publishes at, inside the controller's own run root. */
function deferredManifestPath(runRoot: string, runId: string): string {
  return join(runRoot, `writer-quiesce-${runId}.json`);
}

// The blessed parity exclusion set (design §6a ruling 4) plus the two row-scoped drops, copied
// from q12-live-controller.test.ts. Every excluded field is inherently per-run-root: the
// checkpoint binds the physical journal file's device+inode, the resource manifest is a real
// checkpoint-bound artifact, the FWM accepted digest hashes a file carrying those physical
// fields, and the cleanup rows bind a per-invocation sandbox path and the barrier child's proof.
function withParityExclusions(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  delete rest.capability_manifest_sha256;
  delete rest.entry_hash;
  delete rest.previous_hash;
  delete rest.resource_manifest_sha256;
  if (row.command_id === 'writers.resume.forward' && row.outcome === 'accepted') {
    delete rest.accepted_object_sha256;
  }
  if (row.command_id === 'barrier.cleanup') {
    delete rest.command_sha256;
    delete rest.accepted_object_sha256;
  }
  return rest;
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

describe.runIf(RUN_REAL_CONTROLLER)(
  'Q12 live cutover controller (Task-9) — C2-deferred writer-quiesce publication (mc2-y02tz)',
  () => {
    it('drives the production first-run ordering: adopts the digest the writers.quiesce child published and stays a byte/order twin of the pre-published path', async () => {
      const deferredRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(deferredRoot);
      const manifestPath = deferredManifestPath(deferredRoot, runId);
      const body = quiesceManifestBody(runId);
      const digest = sha(Buffer.from(body, 'utf8'));

      // Nothing pre-publishes it — this is the production first-run precondition.
      expect(existsSync(manifestPath)).toBe(false);

      const deferred = await materializeLiveController({
        runRoot: deferredRoot,
        runId,
        quiesceManifestPath: manifestPath,
        deferredQuiesce: { publish: true, body },
      });

      // --- the C2 child really published the artifact, and it is the 0400 file the controller read
      expect(existsSync(manifestPath)).toBe(true);
      expect(statSync(manifestPath).mode & 0o777).toBe(0o400);
      expect(readFileSync(manifestPath, 'utf8')).toBe(body);

      // --- the run completed the whole window (76 forward rows + the 5-row cleanup segment)
      expect(deferred.journalEntries.length).toBe(81);
      expect(deferred.postActivate).toBeTruthy();
      expect(deferred.postActivate!.cleanup.status).toBe('guard_cleanup_complete');
      expect(deferred.postActivate!.resume.status).toBe('resumed');

      // --- the accepted row carries the REAL published digest, not the requested all-zero one
      const acceptedIndex = witnessIndex(deferred.journalEntries, 'writers.quiesce', 'accepted');
      const acceptedRow = deferred.journalEntries[acceptedIndex];
      expect(acceptedRow.accepted_object_kind).toBe('writer_quiesce_manifest');
      expect(acceptedRow.accepted_object_sha256).toBe(digest);
      expect(digest).not.toBe(ZERO);

      // --- the ZERO -> QSHA step lands on EXACTLY the accepted row (unchanged from today)
      for (const row of deferred.journalEntries.slice(0, acceptedIndex)) {
        expect(row.quiesce_manifest_sha256).toBe(ZERO);
      }
      for (const row of deferred.journalEntries.slice(acceptedIndex)) {
        expect(row.quiesce_manifest_sha256).toBe(digest);
      }

      // --- the group-14 FWM consumed the PUBLISHED bytes (not a pre-read / not the zero digest)
      expect(deferred.forwardFinalWriterManifestPath).toBeTruthy();
      const fwm = JSON.parse(
        readFileSync(deferred.forwardFinalWriterManifestPath!, 'utf8')
      ) as Record<string, unknown>;
      expect(fwm.writer_quiesce_manifest_sha256).toBe(digest);
      expect(fwm.final_writers).toBeTruthy();

      // --- PARITY DUTY: the deferred journal is identical to the journal the SAME window produces
      // when the very same manifest bytes at the very same path ARE pre-published. The twin reuses
      // the artifact the deferred run's child published, so the <quiesce-manifest> substitution
      // string and the manifest bytes are identical by construction; only the run root differs
      // (every per-run-root field is in the blessed exclusion set).
      const prePublished = await materializeLiveController({
        runRoot: root(),
        runId,
        quiesceManifestPath: manifestPath,
      });
      expect(prePublished.journalEntries.length).toBe(81);
      expect(deferred.journalEntries.map(withParityExclusions)).toEqual(
        prePublished.journalEntries.map(withParityExclusions)
      );
      // The two runs are genuinely distinct runs on distinct roots.
      expect(prePublished.forwardFinalWriterManifestPath).not.toBe(
        deferred.forwardFinalWriterManifestPath
      );
    });

    it('steps the resource-manifest domain at exactly the two witnesses on the deferred path', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      const deferred = await materializeLiveController({
        runRoot,
        runId,
        quiesceManifestPath: deferredManifestPath(runRoot, runId),
        deferredQuiesce: { publish: true, body: quiesceManifestBody(runId) },
      });
      // resource_manifest_sha256 is dropped VALUE-only from the parity set, so its step TOPOLOGY
      // has to be asserted here: genesis -> (pg.backup/intent) snapshot -> (deploy.prepare/
      // completed) targets, i.e. exactly two transitions and three distinct domains.
      const rows = deferred.journalEntries;
      const transitions = rows
        .map((row, index) => ({ index, value: String(row.resource_manifest_sha256) }))
        .filter(
          (row, index) =>
            index > 0 && row.value !== String(rows[index - 1].resource_manifest_sha256)
        );
      expect(transitions.map(t => t.index)).toEqual([
        witnessIndex(rows, 'pg.backup', 'intent'),
        witnessIndex(rows, 'deploy.prepare', 'completed'),
      ]);
      expect(new Set(rows.map(r => String(r.resource_manifest_sha256))).size).toBe(3);
    });

    it('resumes a deferred first run that stopped before the group-3 publication', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      const manifestPath = deferredManifestPath(runRoot, runId);
      const body = quiesceManifestBody(runId);

      // A deferred first leg held at the pre-quiesce boundary: nothing is published yet, so the
      // manifest CANNOT exist on this root.
      const stopped = await materializeLiveController({
        runRoot,
        runId,
        quiesceManifestPath: manifestPath,
        deferredQuiesce: { publish: false },
        stopAfter: 'writers.quiesce.pre',
      });
      expect(stopped.journalEntries.length).toBe(8);
      expect(stopped.journalEntries.at(-1)!.command_id).toBe('barrier.install');
      expect(stopped.journalEntries.at(-1)!.outcome).toBe('completed');
      expect(existsSync(manifestPath)).toBe(false);

      // recover must accept the still-absent manifest on the same terms run_live does and let its
      // own group-3 child publish it, otherwise this root is unrecoverable by ANY path.
      const recovered = await materializeRecover({
        runRoot,
        runId,
        quiesceManifestPath: manifestPath,
        deferredQuiesce: { publish: true, body },
      });
      expect(recovered.journalEntries.length).toBe(81);
      expect(existsSync(manifestPath)).toBe(true);
      const acceptedIndex = witnessIndex(recovered.journalEntries, 'writers.quiesce', 'accepted');
      expect(recovered.journalEntries[acceptedIndex].accepted_object_sha256).toBe(
        sha(Buffer.from(body, 'utf8'))
      );
    });

    it('fails closed when the deferred manifest path is not the run-root publication path', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      // Inside the run root but NOT the name the real C2 child publishes at
      // (<run-root>/writer-quiesce-<run-id>.json, q12-writer-resume.py:695). Before this guard a
      // typo here was only discovered after the ten production writers were already stopped.
      await expect(
        materializeLiveController({
          runRoot,
          runId,
          quiesceManifestPath: join(runRoot, 'writer-quiesce-typo.json'),
          deferredQuiesce: { publish: true, body: quiesceManifestBody(runId) },
        })
      ).rejects.toThrow(
        /deferred writer quiesce manifest path must be the run-root publication path/u
      );
      expect(readFileSync(join(runRoot, 'phase.jsonl'), 'utf8')).toBe('');
      expect(existsSync(join(runRoot, 'quiesce-window-mode.json'))).toBe(false);
    });

    it('fails closed at group 3 when the published manifest is not this run’s writer inventory', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      const manifestPath = deferredManifestPath(runRoot, runId);
      // A structurally valid manifest that belongs to a DIFFERENT run: identity checks pass, the
      // content authority must not. Without adoption-time content validation this is only caught
      // 11 groups later, with the writers already down.
      const foreign = quiesceManifestBody('11111111-2222-4333-8444-555555555555');
      await expect(
        materializeLiveController({
          runRoot,
          runId,
          quiesceManifestPath: manifestPath,
          deferredQuiesce: { publish: true, body: foreign },
        })
      ).rejects.toThrow(/writer quiesce manifest shape mismatch/u);
      const journal = readFileSync(join(runRoot, 'phase.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>);
      expect(
        journal.some(r => r.command_id === 'writers.quiesce' && r.outcome === 'accepted')
      ).toBe(false);
      expect(journal.some(r => r.command_id === 'pg.backup')).toBe(false);
    });

    it('fails closed when the manifest is absent but the request declares a non-zero digest', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      await expect(
        materializeLiveController({
          runRoot,
          runId,
          quiesceManifestPath: deferredManifestPath(runRoot, runId),
          deferredQuiesce: { publish: false, requestedSha256: 'c'.repeat(64) },
        })
      ).rejects.toThrow(/live quiesce manifest is absent for a declared non-zero digest/u);
      // it refused BEFORE appending a single row (Engine construction creates the empty durable
      // journal on the fresh root; the refusal lands before any row and before writers.quiesce ran)
      expect(readFileSync(join(runRoot, 'phase.jsonl'), 'utf8')).toBe('');
      expect(existsSync(join(runRoot, 'quiesce-window-mode.json'))).toBe(false);
    });

    it('fails closed when the writers.quiesce child publishes the manifest with a non-0400 mode', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      const manifestPath = deferredManifestPath(runRoot, runId);
      await expect(
        materializeLiveController({
          runRoot,
          runId,
          quiesceManifestPath: manifestPath,
          deferredQuiesce: { publish: true, publishMode: 0o600, body: quiesceManifestBody(runId) },
        })
      ).rejects.toThrow(/unsafe file identity/u);
      // the wrongly-moded artifact is on disk — the refusal is the controller's, not the fixture's
      expect(statSync(manifestPath).mode & 0o777).toBe(0o600);
      // and it refused mid-window, before the writers.quiesce accepted row
      const journal = readFileSync(join(runRoot, 'phase.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>);
      expect(
        journal.some(r => r.command_id === 'writers.quiesce' && r.outcome === 'accepted')
      ).toBe(false);
    });

    it('fails closed when the writers.quiesce child publishes no manifest at all', async () => {
      const runRoot = root();
      const runId = deriveRootRetainedBarrierFixtureRunId(runRoot);
      const manifestPath = deferredManifestPath(runRoot, runId);
      await expect(
        materializeLiveController({
          runRoot,
          runId,
          quiesceManifestPath: manifestPath,
          deferredQuiesce: { publish: false },
        })
      ).rejects.toThrow(/writers\.quiesce published no writer quiesce manifest/u);
      expect(existsSync(manifestPath)).toBe(false);
    });
  }
);
