import { execFile, spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  publishDocumentEvidenceMetrics,
  publishDocumentEvidenceMetricsSafely,
  documentEvidenceTextfileTesting,
  type DocumentEvidenceMetricEvent,
} from '@/shared/metrics/document-evidence-textfile';

const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);

function directory(): string {
  // Windows' WSL temp mount ignores POSIX chmod; the production contract is Linux mode 0644.
  const created = mkdtempSync(join(process.cwd(), '.mc2-evidence-metrics-'));
  temporaryDirectories.push(created);
  return created;
}

const options = (path: string) => ({ directory: path, service: 'worker', instance: 'primary' });

const durableTotals = (revision = 1) => ({
  databaseStartUnixMilliseconds: 1_700_000_000_000,
  generation: 10,
  revision,
  runs: { accepted: 1, failed: 0 },
  documents: { source: 4, assessed: 2, degraded: 1, failed: 1 },
  latestCoverage: { source: 4, assessed: 2, degraded: 1, failed: 1 },
  processingModes: {
    full_text: 1,
    hierarchical_summary: 1,
    summary: 1,
    targeted_retrieval: 0,
    metadata_only: 1,
  },
  batches: 3,
  inputTokens: 100,
  outputTokens: 25,
  modelCalls: 4,
  costUsd: 0.125,
  durationSeconds: 2.5,
  conflicts: { critical: 1, important: 2, informational: 3 },
  decisions: { user: 2, system: 1, degradedAutomatic: 1 },
});

const stage4Event = (status: 'accepted' | 'failed' = 'accepted'): DocumentEvidenceMetricEvent => ({
  stage: 'stage4',
  status,
  mode: 'active',
  runDelta: 1,
  observedAtUnixMilliseconds: 1_700_000_001_000,
  coverage: { source: 4, assessed: 2, degraded: 1, failed: 1 },
  documentDeltas: { source: 4, assessed: 2, degraded: 1, failed: 1 },
  processingModes: {
    full_text: 1,
    hierarchical_summary: 1,
    summary: 1,
    targeted_retrieval: 0,
    metadata_only: 1,
  },
  batches: 3,
  inputTokens: 100,
  outputTokens: 25,
  modelCalls: 4,
  costUsd: 0.125,
  durationSeconds: 2.5,
  conflicts: { critical: 1, important: 2, informational: 3 },
  decisions: { user: 2, system: 1, degradedAutomatic: 1 },
  criticalConflictState: {
    unresolved: 1,
    oldestUnixSeconds: 1_700_000_000,
    observedAtUnixMilliseconds: 1_700_000_001_000,
  },
  durableTotals: durableTotals(),
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('document evidence textfile metrics', () => {
  it('serializes real child processes updating the same service file without lost counters', async () => {
    const path = directory();
    const moduleUrl = pathToFileURL(
      resolve(process.cwd(), 'src/shared/metrics/document-evidence-textfile.ts')
    ).href;
    const script = `
      import { publishDocumentEvidenceMetrics } from ${JSON.stringify(moduleUrl)};
      await publishDocumentEvidenceMetrics(
        { stage: 'stage6', status: 'success', retrievals: 1, fallbacks: 0 },
        { directory: process.env.EVIDENCE_DIR, service: 'worker', instance: 'shared' }
      );
    `;

    await Promise.all(
      Array.from({ length: 12 }, () =>
        execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
          cwd: process.cwd(),
          env: { ...process.env, EVIDENCE_DIR: path },
        })
      )
    );

    const exposition = readFileSync(join(path, 'evidence-worker-shared.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_stage6_outcomes_total{service="worker",instance="shared",status="success"} 12'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_retrieval_total{service="worker",instance="shared",stage="stage6",outcome="request"} 12'
    );
    const leftovers = readdirSync(path).filter(name => /tmp|acquire|stale/u.test(name));
    expect(leftovers).toEqual([]);
    expect(statSync(join(path, 'evidence-worker-shared.prom.lock')).isFile()).toBe(true);
  });

  it('holds a kernel lock on the inherited file descriptor until the parent closes it', async () => {
    const path = directory();
    const lockPath = join(path, '.owned.lock');
    const targetPath = join(path, 'owned.prom');
    const owner = await documentEvidenceTextfileTesting.acquireOwnedLock(lockPath);

    expect(statSync(lockPath).isFile()).toBe(true);
    await expect(
      execFileAsync('flock', ['--exclusive', '--nonblock', lockPath, 'true'])
    ).rejects.toMatchObject({
      code: 1,
    });
    await owner.write(targetPath, 'owner\n', 0o644);
    await expect(
      execFileAsync('flock', ['--exclusive', '--nonblock', lockPath, 'true'])
    ).rejects.toMatchObject({
      code: 1,
    });
    await owner.release();

    await expect(
      execFileAsync('flock', ['--exclusive', '--nonblock', lockPath, 'true'])
    ).resolves.toBeDefined();
    expect(readFileSync(targetPath, 'utf8')).toBe('owner\n');
    expect(readdirSync(path).filter(name => /tmp|acquire|stale/u.test(name))).toEqual([]);
  });

  it('recovers immediately when the process holding the kernel lock is killed', async () => {
    const path = directory();
    const lockPath = join(path, '.killed-owner.lock');
    const targetPath = join(path, 'recovered.prom');
    const moduleUrl = pathToFileURL(
      resolve(process.cwd(), 'src/shared/metrics/document-evidence-textfile.ts')
    ).href;
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
          import { documentEvidenceTextfileTesting } from ${JSON.stringify(moduleUrl)};
          await documentEvidenceTextfileTesting.acquireOwnedLock(process.env.LOCK_PATH);
          process.stdout.write('LOCKED\\n');
          setInterval(() => {}, 1_000);
        `,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, LOCK_PATH: lockPath },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
    });
    while (!output.includes('LOCKED')) await new Promise(resolve => setTimeout(resolve, 5));

    child.kill('SIGKILL');
    await once(child, 'exit');
    const recovered = await documentEvidenceTextfileTesting.acquireOwnedLock(lockPath);
    await recovered.write(targetPath, 'recovered\n', 0o644);
    await recovered.release();

    expect(readFileSync(targetPath, 'utf8')).toBe('recovered\n');
    expect(readdirSync(path).filter(name => /tmp|acquire|stale/u.test(name))).toEqual([]);
  });

  it('continues a same-path publication after the preceding queued update rejects', async () => {
    const path = directory();
    const invalid = publishDocumentEvidenceMetrics(
      { stage: 'stage6', status: 'not-allowlisted' } as never,
      options(path)
    );
    const valid = publishDocumentEvidenceMetrics(
      { stage: 'stage6', status: 'success', retrievals: 1, fallbacks: 0 },
      options(path)
    );

    await expect(invalid).rejects.toThrow(/status/iu);
    await expect(valid).resolves.toBeUndefined();
    expect(readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8')).toContain(
      'megacampus_document_evidence_stage6_outcomes_total{service="worker",instance="primary",status="success"} 1'
    );
  });

  it('reconciles absolute durable totals by revision after a sink failure without replica duplicates', async () => {
    const root = directory();
    const path = join(root, 'late-sink');
    const warn = vi.fn();
    await publishDocumentEvidenceMetricsSafely(stage4Event(), { warn }, options(path));
    expect(warn).toHaveBeenCalledOnce();
    mkdirSync(path);

    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    await publishDocumentEvidenceMetrics(
      { ...stage4Event(), runDelta: 0, durableTotals: durableTotals() },
      { directory: path, service: 'worker', instance: 'secondary' }
    );
    await publishDocumentEvidenceMetrics(
      {
        ...stage4Event(),
        durableTotals: {
          ...durableTotals(0),
          runs: { accepted: 0, failed: 0 },
          documents: { source: 0, assessed: 0, degraded: 0, failed: 0 },
          latestCoverage: { source: 0, assessed: 0, degraded: 0, failed: 0 },
        },
      },
      { directory: path, service: 'worker', instance: 'secondary' }
    );

    const aggregate = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(aggregate).toContain(
      'megacampus_document_evidence_reconciliation_revision{service="stage4",instance="aggregate"} 1'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_runs_total{service="stage4",instance="aggregate",stage="stage4",status="accepted"} 1'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_documents_total{service="stage4",instance="aggregate",outcome="source"} 4'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_batches_total{service="stage4",instance="aggregate"} 3'
    );
    for (const file of ['evidence-worker-primary.prom', 'evidence-worker-secondary.prom']) {
      const replica = readFileSync(join(path, file), 'utf8');
      expect(replica).not.toContain('megacampus_document_evidence_runs_total');
      expect(replica).toContain('megacampus_document_evidence_stage4_invocations_total');
    }
  });

  it('removes legacy durable decision series from an upgraded replica file', async () => {
    const path = directory();
    const replicaPath = join(path, 'evidence-worker-primary.prom');
    writeFileSync(
      replicaPath,
      [
        'megacampus_document_evidence_decisions_total{service="worker",instance="primary",actor="user"} 9',
        'megacampus_document_evidence_decisions_total{service="worker",instance="primary",actor="system"} 8',
        'megacampus_document_evidence_degraded_automatic_decisions_total{service="worker",instance="primary"} 7',
        '',
      ].join('\n')
    );
    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    const replica = readFileSync(replicaPath, 'utf8');
    expect(replica).not.toContain('megacampus_document_evidence_decisions_total');
    expect(replica).not.toContain(
      'megacampus_document_evidence_degraded_automatic_decisions_total'
    );
    expect(replica).toContain('megacampus_document_evidence_stage4_invocations_total');
  });

  it('orders durable totals by database start, generation, then revision across restore and reapply', async () => {
    const path = directory();
    const eventWith = (
      databaseStartUnixMilliseconds: number,
      generation: number,
      revision: number,
      accepted: number
    ): DocumentEvidenceMetricEvent => ({
      ...stage4Event(),
      durableTotals: {
        ...durableTotals(revision),
        databaseStartUnixMilliseconds,
        generation,
        runs: { accepted, failed: 0 },
      },
    });
    const readAccepted = (): string =>
      readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');

    await publishDocumentEvidenceMetrics(eventWith(1_000, 10, 99, 9), options(path));
    await publishDocumentEvidenceMetrics(eventWith(1_000, 11, 0, 1), options(path));
    expect(readAccepted()).toContain('status="accepted"} 1');

    await publishDocumentEvidenceMetrics(eventWith(1_000, 10, 100, 8), options(path));
    expect(readAccepted()).toContain('status="accepted"} 1');

    await publishDocumentEvidenceMetrics(eventWith(2_000, 1, 0, 2), options(path));
    expect(readAccepted()).toContain('status="accepted"} 2');

    await publishDocumentEvidenceMetrics(eventWith(1_000, 999, 999, 7), options(path));
    await publishDocumentEvidenceMetrics(eventWith(2_000, 1, 0, 6), options(path));
    expect(readAccepted()).toContain('status="accepted"} 2');

    await publishDocumentEvidenceMetrics(eventWith(2_000, 1, 1, 3), options(path));
    expect(readAccepted()).toContain('status="accepted"} 3');
  });

  it('reconciles the same accepted run twice and counts one appended user decision once', async () => {
    const path = directory();
    const first = {
      ...stage4Event(),
      decisions: { user: 0, system: 1, degradedAutomatic: 1 },
      durableTotals: {
        ...durableTotals(),
        decisions: { user: 0, system: 1, degradedAutomatic: 1 },
      },
    } as DocumentEvidenceMetricEvent;
    const replay = {
      ...stage4Event(),
      runDelta: 0,
      documentDeltas: { source: 0, assessed: 0, degraded: 0, failed: 0 },
      processingModes: {
        full_text: 0,
        hierarchical_summary: 0,
        summary: 0,
        targeted_retrieval: 0,
        metadata_only: 0,
      },
      batches: 0,
      inputTokens: 0,
      outputTokens: 0,
      modelCalls: 0,
      costUsd: 0,
      durationSeconds: 0,
      conflicts: { critical: 0, important: 0, informational: 0 },
      decisions: { user: 0, system: 1, degradedAutomatic: 1 },
      durableTotals: {
        ...durableTotals(),
        decisions: { user: 0, system: 1, degradedAutomatic: 1 },
      },
    } as DocumentEvidenceMetricEvent;
    const resumed = {
      ...replay,
      decisions: { user: 1, system: 1, degradedAutomatic: 1 },
      durableTotals: {
        ...durableTotals(2),
        decisions: { user: 1, system: 1, degradedAutomatic: 1 },
      },
      observedAtUnixMilliseconds: 1_700_000_002_000,
    } as DocumentEvidenceMetricEvent;

    await publishDocumentEvidenceMetrics(first, options(path));
    await publishDocumentEvidenceMetrics(replay, options(path));
    for (let index = 0; index < 300; index += 1) {
      await publishDocumentEvidenceMetrics(first, options(path));
    }
    await publishDocumentEvidenceMetrics(resumed, options(path));
    await publishDocumentEvidenceMetrics(resumed, options(path));

    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    const aggregate = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_stage4_invocations_total{service="worker",instance="primary",status="accepted",mode="active"} 304'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_runs_total{service="stage4",instance="aggregate",stage="stage4",status="accepted"} 1'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_documents_total{service="stage4",instance="aggregate",outcome="source"} 4'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_batches_total{service="stage4",instance="aggregate"} 3'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_cost_usd_total{service="stage4",instance="aggregate"} 0.125'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_conflicts_total{service="stage4",instance="aggregate",severity="critical"} 1'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_decisions_total{service="stage4",instance="aggregate",actor="user"} 1'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_decisions_total{service="stage4",instance="aggregate",actor="system"} 1'
    );
    expect(aggregate).toContain(
      'megacampus_document_evidence_degraded_automatic_decisions_total{service="stage4",instance="aggregate"} 1'
    );
    expect(`${exposition}\n${aggregate}`).not.toMatch(
      /10000000-0000-4000-8000-000000000001|sha256:/u
    );
  });

  it('persists bounded Stage 4 counters and exact coverage across restarts', async () => {
    const path = directory();

    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    await publishDocumentEvidenceMetrics(
      {
        ...stage4Event('failed'),
        durableTotals: {
          ...durableTotals(2),
          runs: { accepted: 1, failed: 1 },
          documents: { source: 8, assessed: 4, degraded: 2, failed: 2 },
          latestCoverage: { source: 4, assessed: 2, degraded: 1, failed: 1 },
          processingModes: {
            full_text: 2,
            hierarchical_summary: 2,
            summary: 2,
            targeted_retrieval: 0,
            metadata_only: 2,
          },
          batches: 6,
          inputTokens: 200,
          outputTokens: 50,
          modelCalls: 8,
          costUsd: 0.25,
          durationSeconds: 5,
          conflicts: { critical: 2, important: 4, informational: 6 },
        },
      },
      options(path)
    );

    expect(readdirSync(path).sort()).toEqual([
      '.evidence-stage4-state.lock',
      'evidence-stage4-state.prom',
      'evidence-worker-primary.prom',
      'evidence-worker-primary.prom.lock',
    ]);
    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    const stage4Exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_stage4_invocations_total{service="worker",instance="primary",status="accepted",mode="active"} 1'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_stage4_invocations_total{service="worker",instance="primary",status="failed",mode="active"} 1'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_documents_total{service="stage4",instance="aggregate",outcome="assessed"} 4'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_coverage_ratio{service="stage4",instance="aggregate"} 1'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_processing_mode_total{service="stage4",instance="aggregate",mode="metadata_only"} 2'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_batches_total{service="stage4",instance="aggregate"} 6'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_tokens_total{service="stage4",instance="aggregate",direction="input"} 200'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_model_calls_total{service="stage4",instance="aggregate"} 8'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_cost_usd_total{service="stage4",instance="aggregate"} 0.25'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_duration_seconds_total{service="stage4",instance="aggregate"} 5'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_conflicts_total{service="stage4",instance="aggregate",severity="critical"} 2'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_decisions_total{service="stage4",instance="aggregate",actor="system"} 1'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_degraded_automatic_decisions_total{service="stage4",instance="aggregate"} 1'
    );
    expect(stage4Exposition).toMatch(
      /megacampus_document_evidence_unresolved_critical_conflicts\{service="stage4",instance="aggregate"\} 1\n/
    );
    expect(stage4Exposition).toMatch(
      /megacampus_document_evidence_oldest_unresolved_critical_unixtime_seconds\{service="stage4",instance="aggregate"\} 1700000000/
    );
    expect(statSync(join(path, 'evidence-worker-primary.prom')).mode & 0o777).toBe(0o644);
    expect(statSync(join(path, 'evidence-stage4-state.prom')).mode & 0o777).toBe(0o644);
  });

  it('serializes concurrent Stage 5 and Stage 6 outcomes without temporary files', async () => {
    const path = directory();
    const events: DocumentEvidenceMetricEvent[] = [
      ...Array.from({ length: 8 }, () => ({
        stage: 'stage5' as const,
        status: 'degraded' as const,
        retrievals: 3,
        fallbacks: 1,
      })),
      ...Array.from({ length: 8 }, () => ({
        stage: 'stage6' as const,
        status: 'fallback' as const,
        retrievals: 1,
        fallbacks: 1,
      })),
    ];

    await Promise.all(events.map(event => publishDocumentEvidenceMetrics(event, options(path))));

    expect(readdirSync(path).sort()).toEqual([
      'evidence-worker-primary.prom',
      'evidence-worker-primary.prom.lock',
    ]);
    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_stage5_outcomes_total{service="worker",instance="primary",status="degraded"} 8'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_retrieval_total{service="worker",instance="primary",stage="stage5",outcome="request"} 24'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_retrieval_total{service="worker",instance="primary",stage="stage5",outcome="fallback"} 8'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_stage6_outcomes_total{service="worker",instance="primary",status="fallback"} 8'
    );
  });

  it('rejects non-enum labels and never serializes content-shaped event fields', async () => {
    const path = directory();
    await expect(
      publishDocumentEvidenceMetrics(
        { stage: 'stage6', status: 'tenant-123' } as never,
        options(path)
      )
    ).rejects.toThrow(/status/i);
    await expect(
      publishDocumentEvidenceMetrics(stage4Event(), {
        directory: path,
        service: 'worker"} 1\nleaked',
        instance: 'primary',
      })
    ).rejects.toThrow(/service/i);

    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    expect(exposition).not.toMatch(
      /document_id|course_id|organization_id|tenant|answer|claim|filename|model_name|model=/i
    );
  });

  it('fails open with one bounded constant log when metric I/O is unavailable', async () => {
    const warn = vi.fn();
    await expect(
      publishDocumentEvidenceMetricsSafely(
        stage4Event(),
        { warn },
        {
          directory: join(directory(), 'missing'),
          service: 'worker',
          instance: 'primary',
        }
      )
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith({}, 'Document evidence metrics update failed');
  });

  it('publishes incomplete failed-run coverage without inventing document outcomes', async () => {
    const path = directory();
    await publishDocumentEvidenceMetrics(
      {
        ...stage4Event('failed'),
        coverage: { source: 4, assessed: 0, degraded: 0, failed: 0 },
        documentDeltas: { source: 0, assessed: 0, degraded: 0, failed: 0 },
        criticalConflictState: undefined,
        durableTotals: {
          ...durableTotals(),
          runs: { accepted: 0, failed: 1 },
          documents: { source: 4, assessed: 0, degraded: 0, failed: 0 },
          latestCoverage: { source: 4, assessed: 0, degraded: 0, failed: 0 },
          processingModes: {
            full_text: 0,
            hierarchical_summary: 0,
            summary: 0,
            targeted_retrieval: 0,
            metadata_only: 0,
          },
          batches: 0,
          inputTokens: 0,
          outputTokens: 0,
          modelCalls: 0,
          costUsd: 0,
          durationSeconds: 0,
          conflicts: { critical: 0, important: 0, informational: 0 },
          decisions: { user: 0, system: 0, degradedAutomatic: 0 },
        },
      },
      options(path)
    );
    const stage4Exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_coverage_ratio{service="stage4",instance="aggregate"} 0'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_documents_total{service="stage4",instance="aggregate",outcome="source"} 4'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_documents_total{service="stage4",instance="aggregate",outcome="failed"} 0'
    );
    expect(exposition).not.toContain('megacampus_document_evidence_documents_total');
  });

  it('does not clear another run until durable reconciliation explicitly resolves it', async () => {
    const path = directory();
    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    await publishDocumentEvidenceMetrics(
      {
        ...stage4Event(),
        conflicts: { critical: 0, important: 0, informational: 0 },
        criticalConflictState: undefined,
      },
      options(path)
    );
    let exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_unresolved_critical_conflicts{service="stage4",instance="aggregate"} 1'
    );

    await publishDocumentEvidenceMetrics(
      {
        ...stage4Event(),
        conflicts: { critical: 0, important: 0, informational: 0 },
        criticalConflictState: {
          unresolved: 0,
          oldestUnixSeconds: 0,
          observedAtUnixMilliseconds: 1_700_000_002_000,
        },
      },
      options(path)
    );
    exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_unresolved_critical_conflicts{service="stage4",instance="aggregate"} 0'
    );

    await publishDocumentEvidenceMetrics(
      {
        ...stage4Event(),
        criticalConflictState: {
          unresolved: 1,
          oldestUnixSeconds: 1_700_000_000,
          observedAtUnixMilliseconds: 1_700_000_001_500,
        },
      },
      { directory: path, service: 'worker', instance: 'secondary' }
    );
    exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_unresolved_critical_conflicts{service="stage4",instance="aggregate"} 0'
    );
  });

  it('keeps series distinct across multiple bounded service files', async () => {
    const path = directory();
    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    await publishDocumentEvidenceMetrics(
      { stage: 'stage6', status: 'success' },
      { directory: path, service: 'stage6', instance: 'worker-1' }
    );
    const series = readdirSync(path)
      .filter(file => file.endsWith('.prom'))
      .flatMap(file => readFileSync(join(path, file), 'utf8').trim().split('\n'))
      .map(line => line.slice(0, line.lastIndexOf(' ')));
    expect(new Set(series).size).toBe(series.length);
    expect(series.join('\n')).toContain('service="worker",instance="primary"');
    expect(series.join('\n')).toContain('service="stage6",instance="worker-1"');
  });
});
