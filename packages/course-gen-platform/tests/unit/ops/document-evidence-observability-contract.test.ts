import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const source = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8');

describe('E7 document evidence observability contract', () => {
  it('defines privacy-safe evidence alerts including absent and reset-tolerant expressions', () => {
    const alerts = source('ops/qdrant/prometheus/alerts.yml');
    for (const alert of [
      'DocumentEvidenceRunFailed',
      'DocumentEvidenceCoverageIncomplete',
      'DocumentEvidenceDegradedAutomaticDecisionsRepeated',
      'DocumentEvidenceCriticalConflictStale',
    ]) {
      expect(alerts).toContain(`- alert: ${alert}`);
    }
    expect(alerts).toContain('megacampus_document_evidence_runs_total');
    expect(alerts).toContain('megacampus_document_evidence_stage4_invocations_total');
    expect(alerts).toContain('status="failed"');
    expect(alerts).toContain('min(megacampus_document_evidence_coverage_ratio) < 1');
    expect(alerts).toContain('increase(');
    expect(alerts).toContain('megacampus_document_evidence_degraded_automatic_decisions_total');
    expect(alerts).toContain(
      'megacampus_document_evidence_oldest_unresolved_critical_unixtime_seconds'
    );
    expect(alerts).toContain('absent(');
    expect(alerts).toContain('sum(increase(megacampus_document_evidence_runs_total');
    expect(alerts).toContain('max(megacampus_document_evidence_unresolved_critical_conflicts)');
    expect(alerts).not.toMatch(/document_id|course_id|organization_id|tenant_id|answer|claim/iu);
  });

  it('tests failed/coverage/degraded/stale evidence alerts across absent series and resets', () => {
    const tests = source('ops/qdrant/prometheus/alert-tests.yml');
    for (const alert of [
      'DocumentEvidenceRunFailed',
      'DocumentEvidenceCoverageIncomplete',
      'DocumentEvidenceDegradedAutomaticDecisionsRepeated',
      'DocumentEvidenceCriticalConflictStale',
    ]) {
      expect(tests).toContain(`alertname: ${alert}`);
    }
    expect(tests).toContain('# evidence-counter-reset');
    expect(tests).toContain('# evidence-series-absent');
    expect(tests).toContain('# evidence-invocation-only-failure');
  });

  it('adds evidence run, coverage, mode, cost, conflict, decision and retrieval panels', () => {
    const dashboardSource = source('ops/qdrant/grafana/dashboards/qdrant.json');
    const dashboard = JSON.parse(dashboardSource) as {
      panels: Array<{ title: string; targets?: Array<{ expr?: string }> }>;
    };
    const text = dashboard.panels
      .flatMap(panel => [panel.title, ...(panel.targets ?? []).map(target => target.expr ?? '')])
      .join('\n');
    for (const required of [
      'Evidence run status',
      'Evidence document coverage',
      'Evidence processing modes',
      'Evidence cost and duration',
      'Evidence conflicts and decisions',
      'Evidence Stage 5 / 6 retrieval',
    ]) {
      expect(text).toContain(required);
    }
    expect(dashboardSource).not.toMatch(
      /document_id|course_id|organization_id|tenant_id|answer|claim|api.?key|password|secret/iu
    );
    const runPanel = dashboard.panels.find(panel => panel.title === 'Evidence run status');
    expect(runPanel?.targets?.map(target => target.expr).join('\n')).toContain(
      'megacampus_document_evidence_stage4_invocations_total'
    );
  });

  it('ships flock in the runner image used by the kernel-backed textfile publisher', () => {
    const dockerfile = source('packages/course-gen-platform/Dockerfile');
    const publisher = source(
      'packages/course-gen-platform/src/shared/metrics/document-evidence-textfile.ts'
    );
    expect(dockerfile).toMatch(/FROM node:.* AS runtime-tools[\s\S]*util-linux/u);
    expect(dockerfile).toContain('flock --version');
    expect(dockerfile).toContain('FROM runtime-tools AS runner');
    expect(publisher).toContain("spawn('flock', ['--exclusive', '--timeout', '5', '3']");
  });

  it('exposes one target-stable observability migration command with recovery epochs', () => {
    const packageJson = JSON.parse(source('packages/course-gen-platform/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['migration:document-evidence-observability:apply']).toContain(
      'TMPDIR=${TMPDIR:-/tmp}'
    );
    expect(packageJson.scripts['migration:document-evidence-observability:apply']).toContain(
      'apply-all'
    );
    expect(packageJson.scripts['migration:document-evidence-observability:rollback']).toContain(
      'rollback-all'
    );
    const runner = source(
      'packages/course-gen-platform/scripts/migrations/document-evidence-observability-index.ts'
    );
    expect(runner).toContain('sslmode=verify-full');
    expect(runner).toContain('DOCUMENT_EVIDENCE_OBSERVABILITY_REMOTE_CONFIRMATION');
    const totals = source(
      'packages/course-gen-platform/supabase/migrations/20260711151000_document_evidence_observability_totals.sql'
    );
    expect(totals).toContain('generation BIGINT');
    expect(totals).toContain('pg_postmaster_start_time()');
    expect(totals).toContain('increment_document_evidence_terminal_insert_totals');
  });
});
