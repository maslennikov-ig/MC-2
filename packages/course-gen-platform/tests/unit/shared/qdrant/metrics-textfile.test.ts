import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { recordHybridSearchOutcome } from '@/shared/qdrant/metrics-textfile';

const temporaryDirectories: string[] = [];

function directory(): string {
  const created = mkdtempSync(join(tmpdir(), 'mc2-qdrant-metrics-'));
  temporaryDirectories.push(created);
  return created;
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('Qdrant hybrid textfile metrics', () => {
  it('persists attempts and fallbacks across independent writes', async () => {
    const path = directory();
    const options = { directory: path, service: 'worker', instance: 'primary' };

    await recordHybridSearchOutcome(false, options);
    await recordHybridSearchOutcome(true, options);
    await recordHybridSearchOutcome(false, options);

    expect(readdirSync(path)).toEqual(['worker-primary.prom']);
    expect(readFileSync(join(path, 'worker-primary.prom'), 'utf8')).toContain(
      'megacampus_qdrant_hybrid_requests_total{service="worker",instance="primary"} 3'
    );
    expect(readFileSync(join(path, 'worker-primary.prom'), 'utf8')).toContain(
      'megacampus_qdrant_hybrid_fallback_total{service="worker",instance="primary"} 1'
    );
  });

  it('serializes concurrent updates and leaves only the atomically renamed exposition', async () => {
    const path = directory();
    const options = { directory: path, service: 'stage6', instance: 'worker-1' };

    await Promise.all(
      Array.from({ length: 12 }, (_, index) => recordHybridSearchOutcome(index % 3 === 0, options))
    );

    expect(readdirSync(path)).toEqual(['stage6-worker-1.prom']);
    const exposition = readFileSync(join(path, 'stage6-worker-1.prom'), 'utf8');
    expect(exposition).toContain(
      'megacampus_qdrant_hybrid_requests_total{service="stage6",instance="worker-1"} 12'
    );
    expect(exposition).toContain(
      'megacampus_qdrant_hybrid_fallback_total{service="stage6",instance="worker-1"} 4'
    );
  });

  it('does nothing when the production textfile directory is not configured', async () => {
    const previous = process.env.QDRANT_METRICS_TEXTFILE_DIR;
    delete process.env.QDRANT_METRICS_TEXTFILE_DIR;
    try {
      await expect(recordHybridSearchOutcome(true)).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.QDRANT_METRICS_TEXTFILE_DIR;
      else process.env.QDRANT_METRICS_TEXTFILE_DIR = previous;
    }
  });

  it('rejects unsafe label and filename components', async () => {
    await expect(
      recordHybridSearchOutcome(true, {
        directory: directory(),
        service: 'worker"} 1\nleaked_metric',
        instance: 'primary',
      })
    ).rejects.toThrow(/service/i);
  });
});
