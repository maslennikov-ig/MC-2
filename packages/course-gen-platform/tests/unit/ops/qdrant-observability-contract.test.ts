import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

const IMAGE_LOCKS = {
  prometheus: {
    image:
      'prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893',
    child: 'sha256:bd2dcadfb0d1096e2a4c21817ac7af918e2f19ff628e4bf25fd67a924c13dd80',
  },
  grafana: {
    image:
      'grafana/grafana:12.4.5@sha256:26b8f35a9e4e4431995cf64c3f396505a4faf17bcfc19f9ed84943ec6bfd5ecd',
    child: 'sha256:5e8dea6bf166881f31f370c16ba87a9eebe8ed33db7cce29ee6baf675d60676a',
  },
  node_exporter: {
    image:
      'prom/node-exporter:v1.12.0@sha256:9b0ade5e607f9dbedb0a8e11151b6011ae5bd79304c261804cfdd2cadf200a80',
    child: 'sha256:fb027a472051259b5b7cfd027fe9faf7f8ac5f5fb58af93a818a832f7a90fc57',
  },
  alertmanager: {
    image:
      'prom/alertmanager:v0.33.1@sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d',
    child: 'sha256:a89f8d4520954079275441eecdb71444328bd90633dd4eddfc33b9ed657f349b',
  },
} as const;

function source(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function serviceBlock(compose: string, service: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex(line => line === `  ${service}:`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^ {2}[a-zA-Z0-9_-]+:$/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('Q9 self-hosted Qdrant observability contract', () => {
  it('pins every monitoring image and keeps all monitoring listeners private', () => {
    const compose = source('docker-compose.infra.yml');
    const lock = JSON.parse(source('ops/qdrant/image-lock.json')) as Record<
      keyof typeof IMAGE_LOCKS,
      { image: string; platform: string; child_digest: string }
    >;

    for (const [service, expected] of Object.entries(IMAGE_LOCKS) as Array<
      [keyof typeof IMAGE_LOCKS, (typeof IMAGE_LOCKS)[keyof typeof IMAGE_LOCKS]]
    >) {
      const block = serviceBlock(compose, service);
      expect(block).toContain(`image: ${expected.image}`);
      expect(block).toContain('platform: linux/amd64');
      expect(lock[service]).toEqual({
        image: expected.image,
        platform: 'linux/amd64',
        child_digest: expected.child,
      });
    }

    expect(serviceBlock(compose, 'prometheus')).toContain("'127.0.0.1:9090:9090'");
    expect(serviceBlock(compose, 'prometheus')).not.toContain('--web.enable-lifecycle');
    expect(serviceBlock(compose, 'grafana')).toContain("'127.0.0.1:3005:3000'");
    expect(serviceBlock(compose, 'alertmanager')).toContain("'127.0.0.1:9093:9093'");
    expect(serviceBlock(compose, 'node_exporter')).not.toMatch(
      /ports:|network_mode:|pid:|privileged:|cap_add:/
    );
    expect(compose).not.toMatch(/['"]?0\.0\.0\.0:(?:3005|9090|9093|9100)/);
  });

  it('scrapes authenticated Qdrant main-listener metrics and private textfiles', () => {
    const prometheus = source('ops/qdrant/prometheus/prometheus.yml');
    const compose = source('docker-compose.infra.yml');
    const qdrant = serviceBlock(compose, 'qdrant');
    const exporter = serviceBlock(compose, 'node_exporter');

    expect(prometheus).toContain('metrics_path: /metrics');
    expect(prometheus).toMatch(/per_collection:\s*\n\s*- ['"]true['"]/);
    expect(prometheus).toContain("- 'qdrant:6333'");
    expect(prometheus).toMatch(/http_headers:\s*\n\s+api-key:\s*\n\s+files:/);
    expect(prometheus).toContain('/run/secrets/qdrant_read_only_api_key');
    expect(prometheus).toContain("- 'node_exporter:9100'");
    expect(prometheus).toContain("- 'alertmanager:9093'");
    expect(qdrant).not.toMatch(/metrics_port/i);

    expect(exporter).toContain('--collector.disable-defaults');
    expect(exporter).toContain('--collector.textfile');
    expect(exporter).toContain(
      '--collector.textfile.directory=/var/lib/node_exporter/textfile_collector'
    );
    expect(exporter).toContain('/var/lib/node_exporter/textfile_collector:ro');
    expect(exporter).not.toMatch(/\/proc|\/sys|rootfs|network_mode:|pid:|privileged:|cap_add:/);
  });

  it('preserves the exact ten Qdrant alert sources, severities and durations', () => {
    const alerts = source('ops/qdrant/prometheus/alerts.yml');
    const contracts = [
      ['QdrantDown', '2m', 'critical', 'absent(up{job="qdrant"})'],
      ['QdrantRecoveryMode', '5m', 'critical', 'qdrant_app_status_recovery_mode == 1'],
      [
        'QdrantRestErrorRateHigh',
        '10m',
        'warning',
        'megacampus:qdrant_rest_error_ratio:10m > 0.02',
      ],
      ['QdrantMemoryHigh', '15m', 'warning', 'qdrant_memory_resident_bytes / 2147483648 > 0.85'],
      ['QdrantPointCountUnexpectedDrop', '0m', 'critical', 'offset 5m'],
      [
        'QdrantSnapshotStale',
        '0m',
        'critical',
        'megacampus_qdrant_last_successful_snapshot_unixtime_seconds',
      ],
      [
        'QdrantRestoreDrillStale',
        '0m',
        'warning',
        'megacampus_qdrant_last_successful_restore_drill_unixtime_seconds',
      ],
      [
        'QdrantOffHostSnapshotStale',
        '0m',
        'critical',
        'megacampus_qdrant_offhost_last_successful_snapshot_unixtime_seconds',
      ],
      [
        'QdrantOffHostRestoreDrillStale',
        '0m',
        'warning',
        'megacampus_qdrant_offhost_last_successful_restore_drill_unixtime_seconds',
      ],
      ['QdrantHybridFallbackHigh', '15m', 'warning', 'megacampus_qdrant_hybrid_fallback_total'],
    ] as const;

    expect(
      [...alerts.matchAll(/^\s*- alert: (\S+)/gm)]
        .map(match => match[1])
        .filter(name => name.startsWith('Qdrant'))
    ).toEqual(contracts.map(([name]) => name));
    for (const [name, duration, severity, expressionFragment] of contracts) {
      const start = alerts.indexOf(`- alert: ${name}`);
      const next = alerts.indexOf('\n      - alert:', start + 1);
      const block = alerts.slice(start, next < 0 ? undefined : next);
      expect(block).toContain(`for: ${duration}`);
      expect(block).toContain(`severity: ${severity}`);
      expect(block).toContain(expressionFragment);
    }

    expect(alerts).toContain('record: megacampus:qdrant_rest_error_ratio:10m');
    expect(alerts).not.toContain('qdrant_collection_points > 0');
    expect(alerts).toMatch(/status=~"4\.\.\|5\.\."/);
    expect(alerts).toContain('clamp_min(');
    expect(alerts).toContain('record: megacampus:qdrant_rest_latency_p95_seconds:5m');
    expect(alerts).toContain('histogram_quantile(');
    expect(alerts).toContain('qdrant_rest_responses_duration_seconds_bucket');
    expect(alerts).toMatch(/absent\(megacampus_qdrant_last_successful_snapshot_unixtime_seconds\)/);
    expect(alerts).toMatch(
      /absent\(megacampus_qdrant_last_successful_restore_drill_unixtime_seconds\)/
    );
  });

  it('provisions a file-secret receiver and single-node Alertmanager routing', () => {
    const config = source('ops/qdrant/alertmanager/alertmanager.yml');
    const compose = serviceBlock(source('docker-compose.infra.yml'), 'alertmanager');

    expect(config).toContain('receiver: qdrant-telegram');
    expect(config).toContain('group_by: [alertname, severity]');
    expect(config).toContain('bot_token_file: /run/secrets/alertmanager_telegram_bot_token');
    expect(config).toContain('chat_id_file: /run/secrets/alertmanager_telegram_chat_id');
    expect(config).toContain('send_resolved: true');
    expect(compose).toContain('--cluster.listen-address=');
    expect(compose).toContain('--storage.path=/alertmanager');
    expect(compose).toContain('alertmanager-data:/alertmanager');
    expect(compose).not.toContain('/var/lib/alertmanager');
    expect(compose).not.toMatch(/bot_token:|chat_id:|telegram\.org/);
  });

  it('publishes textfile metrics atomically without credentials', () => {
    const publisher = source('ops/qdrant/textfile/publish-metrics.sh');
    expect(publisher).toContain('mktemp');
    expect(publisher).toMatch(/mv\s+--/);
    expect(publisher).toContain('megacampus_qdrant_hybrid_requests_total');
    expect(publisher).toContain('megacampus_qdrant_hybrid_fallback_total');
    expect(publisher).toContain('megacampus_qdrant_last_successful_snapshot_unixtime_seconds');
    expect(publisher).toContain('megacampus_qdrant_last_successful_restore_drill_unixtime_seconds');
    expect(publisher).not.toMatch(/api.?key|token|password|secret/i);
  });

  it('gives API, main worker and Stage 6 distinct durable files while excluding Stage 7', () => {
    const expectedConsumers = [
      ['docker-compose.app.yml', 'api', 'api', 'api-${COLOR:-blue}'],
      ['docker-compose.infra.yml', 'worker', 'worker', 'worker'],
      ['docker-compose.production.yml', 'api', 'api', 'api'],
      ['docker-compose.production.yml', 'worker', 'worker', 'worker'],
      ['docker-compose.production.yml', 'worker-stage6', 'stage6', 'stage6'],
    ] as const;

    for (const [file, service, metricService, instance] of expectedConsumers) {
      const block = serviceBlock(source(file), service);
      expect(block).toContain("user: '1001:1001'");
      expect(block).toContain('group_add:');
      expect(block).toContain(
        '${QDRANT_METRICS_GID:?QDRANT_METRICS_GID must be a numeric dedicated group ID}'
      );
      expect(block).toContain('QDRANT_METRICS_TEXTFILE_DIR=/var/lib/megacampus/qdrant-metrics');
      expect(block).toContain(`QDRANT_METRICS_SERVICE=${metricService}`);
      expect(block).toContain(`QDRANT_METRICS_INSTANCE=${instance}`);
      expect(block).toContain(
        '${QDRANT_METRICS_TEXTFILE_HOST_DIR:?QDRANT_METRICS_TEXTFILE_HOST_DIR must be set}:/var/lib/megacampus/qdrant-metrics'
      );
    }

    for (const file of ['docker-compose.infra.yml', 'docker-compose.production.yml']) {
      expect(serviceBlock(source(file), 'worker-stage7')).not.toMatch(
        /QDRANT_METRICS|qdrant-metrics|group_add:/
      );
    }

    const infra = source('docker-compose.infra.yml');
    const exporter = serviceBlock(infra, 'node_exporter');
    expect(exporter).toContain("user: '65534:65534'");
    expect(exporter).not.toContain('group_add:');
    expect(exporter).toContain(
      '${QDRANT_METRICS_TEXTFILE_HOST_DIR:?QDRANT_METRICS_TEXTFILE_HOST_DIR must be set}:/var/lib/node_exporter/textfile_collector:ro'
    );

    const productionExample = source('.env.production.example');
    expect(productionExample).toContain(
      'QDRANT_METRICS_TEXTFILE_HOST_DIR=/var/lib/megacampus/qdrant-metrics'
    );
    expect(productionExample).toMatch(/^QDRANT_METRICS_GID=[0-9]+$/m);
  });

  it('provisions a secret-free dashboard and secure operator runbook', () => {
    const datasource = source('ops/qdrant/grafana/provisioning/datasources/prometheus.yml');
    const provider = source('ops/qdrant/grafana/provisioning/dashboards/qdrant.yml');
    const dashboardSource = source('ops/qdrant/grafana/dashboards/qdrant.json');
    const dashboard = JSON.parse(dashboardSource) as {
      links: Array<{ url: string }>;
      panels: Array<{ title: string; targets?: Array<{ expr?: string }> }>;
      templating: { list: Array<{ name: string; definition?: string }> };
    };
    const runbook = source('docs/operations/qdrant-self-hosted.md');

    expect(datasource).toContain('uid: prometheus');
    expect(datasource).toContain('url: http://prometheus:9090');
    expect(datasource).toContain('editable: false');
    expect(provider).toContain('allowUiUpdates: false');
    expect(provider).toContain('path: /var/lib/grafana/dashboards');
    expect(dashboard.templating.list.map(variable => variable.name)).toEqual([
      'environment',
      'collection',
    ]);
    expect(
      dashboard.templating.list.find(variable => variable.name === 'collection')?.definition
    ).toBe('label_values(qdrant_collection_points, id)');
    const dashboardText = dashboard.panels
      .flatMap(panel => [panel.title, ...(panel.targets ?? []).map(target => target.expr ?? '')])
      .join('\n');
    for (const required of [
      'Target / alert state',
      'Qdrant version',
      'Points',
      'Vectors',
      'REST request rate',
      'REST error ratio',
      'REST p95 latency',
      'Memory',
      'Optimizations',
      'Snapshot / recovery',
      'Hybrid fallback',
    ]) {
      expect(dashboardText).toContain(required);
    }
    for (const metric of [
      'qdrant_collection_points',
      'qdrant_collection_running_optimizations',
      'qdrant_snapshot_created_total',
      'qdrant_snapshot_creation_running',
      'qdrant_snapshot_recovery_running',
    ]) {
      expect(dashboardText).toContain(`${metric}{id=~"$collection"}`);
      expect(dashboardText).not.toContain(`${metric}{collection=~"$collection"}`);
    }
    expect(dashboardText).toContain('qdrant_collection_vectors{collection=~"$collection"}');
    expect(dashboardText).not.toContain('qdrant_collection_vectors{id=~"$collection"}');
    expect(dashboard.links.map(link => link.url)).toEqual([
      'http://127.0.0.1:6335/dashboard',
      '/docs/operations/qdrant-self-hosted.md',
    ]);
    expect(dashboardSource).not.toMatch(/api.?key|bot.?token|chat.?id|password|secret/i);

    expect(runbook).toContain('ssh -L 6335:127.0.0.1:6335');
    expect(runbook).toContain('-L 3005:127.0.0.1:3005');
    expect(runbook).toContain('-L 9090:127.0.0.1:9090');
    expect(runbook).toContain('-L 9093:127.0.0.1:9093');
    expect(runbook).toContain('http://127.0.0.1:6335/dashboard');
    expect(runbook).toMatch(/read-only|только для чтения/i);
    expect(runbook).toMatch(/never\s+publish[\s\S]{0,100}public|никогда[\s\S]{0,100}публич/i);
    expect(runbook).toContain('megacampus-metrics');
    expect(runbook).toContain('root:megacampus-metrics');
    expect(runbook).toContain('3775');
    expect(runbook).toContain('QDRANT_METRICS_GID');
    expect(runbook).toMatch(/\[\[.*QDRANT_METRICS_GID.*\^\[0-9\]\+\$/s);
  });
});
