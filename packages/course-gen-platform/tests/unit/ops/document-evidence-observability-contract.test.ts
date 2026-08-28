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
    expect(alerts).toContain('min by (environment) (megacampus_document_evidence_coverage_ratio)');
    expect(alerts).toContain('increase(');
    expect(alerts).toContain('megacampus_document_evidence_degraded_automatic_decisions_total');
    expect(alerts).toContain(
      'megacampus_document_evidence_oldest_unresolved_critical_unixtime_seconds'
    );
    expect(alerts).toContain(
      'sum by (environment) (increase(megacampus_document_evidence_runs_total'
    );
    expect(alerts).toContain(
      'max by (environment) (megacampus_document_evidence_unresolved_critical_conflicts)'
    );
    expect(alerts).not.toMatch(/document_id|course_id|organization_id|tenant_id|answer|claim/iu);
  });

  /**
   * mc2-kim48. Dev and staging report into one Prometheus, and every one of these four
   * expressions used to aggregate bare. Bare `sum()` DROPS ALL LABELS, so the alert
   * could not carry the environment it came from even in principle — and with the
   * label then absent, `external_labels: environment: staging` supplied it, because an
   * external label is applied "only when a time series does not have a given label
   * yet". A dev failure would have woken the on-call as staging, and a dev count would
   * have been summed into a staging count first.
   *
   * The behaviour is proved by `alert-tests.yml` under promtool; this asserts the
   * shape, so a future edit cannot quietly drop the grouping and take the label with
   * it.
   */
  it('keeps every evidence alert able to say which environment it came from', () => {
    const alerts = source('ops/qdrant/prometheus/alerts.yml');
    // Comments are dropped first: they explain the bare aggregation this replaced, so
    // reading them as expressions would fail the check on its own explanation.
    const group = alerts
      .slice(
        alerts.indexOf('- name: document-evidence-alerts'),
        alerts.indexOf('- name: supabase-backup-alerts')
      )
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');

    // No bare aggregation survives in this group.
    expect(group).not.toMatch(/\b(sum|min|max|count)\(/u);
    // Every rule names the environment in what the channel will show.
    const summaries = group.match(/summary: .*/gu) ?? [];
    expect(summaries).toHaveLength(4);
    for (const summary of summaries) {
      expect(summary).toContain('$labels.environment');
    }
    // `absent()` returns a label-less series, so it can neither be matched against a
    // per-environment left side nor name the environment that lost its signal.
    expect(group).not.toContain('absent(');
    expect(group).toContain('unless');
  });

  it('marks dev series as dev, and gives the dev workers something to write', () => {
    const prometheus = source('ops/qdrant/prometheus/prometheus.yml');
    // One exporter serves one shared directory, so the environment is recovered from
    // the writer's own instance label rather than from a second scrape target.
    expect(prometheus).toContain('metric_relabel_configs');
    expect(prometheus).toContain('exported_instance');
    expect(prometheus).toContain('replacement: dev');

    // The writer turns on with this variable; it was set on idle staging containers
    // and not on the dev ones where the runs happen, which is why the metrics were
    // absent and the four rules unreachable.
    const devCompose = source('docker-compose.dev.yml');
    expect(devCompose).toContain('QDRANT_METRICS_INSTANCE=worker-dev');
    expect(devCompose).toContain('QDRANT_METRICS_INSTANCE=stage6-dev');
    // The suffix is load-bearing: it is what the relabel above matches.
    for (const instance of devCompose.match(/QDRANT_METRICS_INSTANCE=.*/gu) ?? []) {
      expect(instance.trim().endsWith('-dev')).toBe(true);
    }
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
    // Two environments failing must produce two alerts, each naming its own; and one
    // healthy environment on its own must produce none, which is the failure mode a
    // per-environment split invites.
    expect(tests).toContain('# evidence-two-environments');
    expect(tests).toContain('# evidence-one-environment-clean');
    expect(tests).toContain('environment: dev');
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
