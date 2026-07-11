import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  publishDocumentEvidenceMetrics,
  publishDocumentEvidenceMetricsSafely,
  type DocumentEvidenceMetricEvent,
} from '@/shared/metrics/document-evidence-textfile';

const temporaryDirectories: string[] = [];

function directory(): string {
  // Windows' WSL temp mount ignores POSIX chmod; the production contract is Linux mode 0644.
  const created = mkdtempSync(join(process.cwd(), '.mc2-evidence-metrics-'));
  temporaryDirectories.push(created);
  return created;
}

const options = (path: string) => ({ directory: path, service: 'worker', instance: 'primary' });

const stage4Event = (status: 'accepted' | 'failed' = 'accepted'): DocumentEvidenceMetricEvent => ({
  stage: 'stage4',
  status,
  mode: 'active',
  observedAtUnixMilliseconds: 1_700_000_001_000,
  coverage: { source: 4, assessed: 2, degraded: 1, failed: 1 },
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
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('document evidence textfile metrics', () => {
  it('persists bounded Stage 4 counters and exact coverage across restarts', async () => {
    const path = directory();

    await publishDocumentEvidenceMetrics(stage4Event(), options(path));
    await publishDocumentEvidenceMetrics(stage4Event('failed'), options(path));

    expect(readdirSync(path).sort()).toEqual([
      'evidence-stage4-state.prom',
      'evidence-worker-primary.prom',
    ]);
    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    const stage4Exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_document_evidence_runs_total{service="worker",instance="primary",stage="stage4",status="accepted"} 1'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_runs_total{service="worker",instance="primary",stage="stage4",status="failed"} 1'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_documents_total{service="worker",instance="primary",outcome="assessed"} 4'
    );
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_coverage_ratio{service="stage4",instance="aggregate"} 1'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_processing_mode_total{service="worker",instance="primary",mode="metadata_only"} 2'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_batches_total{service="worker",instance="primary"} 6'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_tokens_total{service="worker",instance="primary",direction="input"} 200'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_model_calls_total{service="worker",instance="primary"} 8'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_cost_usd_total{service="worker",instance="primary"} 0.25'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_duration_seconds_total{service="worker",instance="primary"} 5'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_conflicts_total{service="worker",instance="primary",severity="critical"} 2'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_decisions_total{service="worker",instance="primary",actor="system"} 2'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_degraded_automatic_decisions_total{service="worker",instance="primary"} 2'
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

    expect(readdirSync(path)).toEqual(['evidence-worker-primary.prom']);
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
        criticalConflictState: undefined,
      },
      options(path)
    );
    const stage4Exposition = readFileSync(join(path, 'evidence-stage4-state.prom'), 'utf8');
    const exposition = readFileSync(join(path, 'evidence-worker-primary.prom'), 'utf8');
    expect(stage4Exposition).toContain(
      'megacampus_document_evidence_coverage_ratio{service="stage4",instance="aggregate"} 0'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_documents_total{service="worker",instance="primary",outcome="source"} 4'
    );
    expect(exposition).toContain(
      'megacampus_document_evidence_documents_total{service="worker",instance="primary",outcome="failed"} 0'
    );
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
      .flatMap(file => readFileSync(join(path, file), 'utf8').trim().split('\n'))
      .map(line => line.slice(0, line.lastIndexOf(' ')));
    expect(new Set(series).size).toBe(series.length);
    expect(series.join('\n')).toContain('service="worker",instance="primary"');
    expect(series.join('\n')).toContain('service="stage6",instance="worker-1"');
  });
});
