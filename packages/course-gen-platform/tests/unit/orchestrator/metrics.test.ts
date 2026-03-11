/**
 * Tests for orchestrator/metrics.ts
 *
 * MetricsStore: pure in-memory metrics tracking (853 LOC, zero external deps)
 * - Job metrics (start, success, failure, retry)
 * - Percentile calculations
 * - FSM init metrics
 * - Outbox processor metrics
 * - Worker fallback metrics
 * - Model fallback metrics
 * - Enrichment metrics (Stage 7)
 * - exportMetrics / exportAllMetrics
 */
import { describe, it, expect, beforeEach } from 'vitest';
import metricsStore, { exportMetrics, exportAllMetrics } from '../../../src/orchestrator/metrics';
import { JobType } from '@megacampus/shared-types';

beforeEach(() => {
  metricsStore.reset();
});

// ─────────────────────────────────────────────────────────────────────────────
// Job metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — job metrics', () => {
  it('records job start', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    const m = metricsStore.getMetrics(JobType.STRUCTURE_ANALYSIS);
    expect(m?.total).toBe(1);
    expect(m?.success).toBe(0);
  });

  it('records job success with duration', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobSuccess(JobType.STRUCTURE_ANALYSIS, 1500);
    const m = metricsStore.getMetrics(JobType.STRUCTURE_ANALYSIS);
    expect(m?.success).toBe(1);
    expect(m?.durations).toContain(1500);
  });

  it('records job failure with duration', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobFailure(JobType.STRUCTURE_ANALYSIS, 500);
    const m = metricsStore.getMetrics(JobType.STRUCTURE_ANALYSIS);
    expect(m?.failed).toBe(1);
  });

  it('records job retry', () => {
    metricsStore.recordJobRetry(JobType.STRUCTURE_ANALYSIS);
    const m = metricsStore.getMetrics(JobType.STRUCTURE_ANALYSIS);
    expect(m?.retries).toBe(1);
  });

  it('returns null for unknown job type', () => {
    expect(metricsStore.getMetrics(JobType.STRUCTURE_ANALYSIS)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Success/failure rates
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — rates', () => {
  it('calculates success rate correctly', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobSuccess(JobType.STRUCTURE_ANALYSIS, 100);
    expect(metricsStore.getSuccessRate(JobType.STRUCTURE_ANALYSIS)).toBe(50);
  });

  it('returns 0 for unknown job type success rate', () => {
    expect(metricsStore.getSuccessRate(JobType.STRUCTURE_ANALYSIS)).toBe(0);
  });

  it('calculates failure rate correctly', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobFailure(JobType.STRUCTURE_ANALYSIS, 100);
    expect(metricsStore.getFailureRate(JobType.STRUCTURE_ANALYSIS)).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Percentiles
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — percentiles', () => {
  it('returns null when no durations', () => {
    expect(metricsStore.getPercentiles(JobType.STRUCTURE_ANALYSIS)).toBeNull();
  });

  it('calculates percentiles for recorded durations', () => {
    for (let i = 1; i <= 100; i++) {
      metricsStore.recordJobSuccess(JobType.STRUCTURE_ANALYSIS, i * 10);
    }
    const p = metricsStore.getPercentiles(JobType.STRUCTURE_ANALYSIS);
    expect(p).not.toBeNull();
    expect(p!.min).toBe(10);
    expect(p!.max).toBe(1000);
    expect(p!.p50).toBe(500);
    expect(p!.avg).toBe(505);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FSM metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — FSM init metrics', () => {
  it('records FSM init success with cache hit', () => {
    metricsStore.recordFSMInit(true, 50, true);
    const fsm = metricsStore.getFSMMetrics();
    expect(fsm.total).toBe(1);
    expect(fsm.success).toBe(1);
    expect(fsm.cacheHits).toBe(1);
    expect(fsm.cacheMisses).toBe(0);
    expect(fsm.successRate).toBe(100);
    expect(fsm.cacheHitRate).toBe(100);
  });

  it('records FSM init failure with reason', () => {
    metricsStore.recordFSMInit(false, 100, false, 'timeout');
    const fsm = metricsStore.getFSMMetrics();
    expect(fsm.failed).toBe(1);
    expect(fsm.failureReasons.get('timeout')).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Outbox metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — outbox metrics', () => {
  it('records outbox batch processing', () => {
    metricsStore.recordOutboxBatch(5, 1, 200, 10);
    const outbox = metricsStore.getOutboxMetrics();
    expect(outbox.batchesProcessed).toBe(1);
    expect(outbox.jobsCreated).toBe(5);
    expect(outbox.jobsFailed).toBe(1);
    expect(outbox.successRate).toBeCloseTo(83.33, 1);
  });

  it('records outbox retry', () => {
    metricsStore.recordOutboxRetry('job-1', 1);
    const outbox = metricsStore.getOutboxMetrics();
    expect(outbox.retries).toBe(1);
  });

  it('records outbox error type', () => {
    metricsStore.recordOutboxError('CONNECTION_REFUSED');
    metricsStore.recordOutboxError('CONNECTION_REFUSED');
    const outbox = metricsStore.getOutboxMetrics();
    expect(outbox.errors.get('CONNECTION_REFUSED')).toBe(2);
  });

  it('calculates avg queue depth', () => {
    metricsStore.recordOutboxBatch(1, 0, 50, 10);
    metricsStore.recordOutboxBatch(1, 0, 50, 20);
    const outbox = metricsStore.getOutboxMetrics();
    expect(outbox.avgQueueDepth).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Worker fallback metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — worker fallback metrics', () => {
  it('records layer 2 activation', () => {
    metricsStore.recordLayer2Activation(true, 'course-1');
    const fallback = metricsStore.getFallbackMetrics();
    expect(fallback.layer2Activations).toBe(1);
    expect(fallback.layer2Successes).toBe(1);
  });

  it('records layer 3 activation', () => {
    metricsStore.recordLayer3Activation(false, 'course-2');
    const fallback = metricsStore.getFallbackMetrics();
    expect(fallback.layer3Activations).toBe(1);
    expect(fallback.layer3Failures).toBe(1);
  });

  it('tracks recent activations', () => {
    metricsStore.recordLayer2Activation(true, 'c-1');
    const fallback = metricsStore.getFallbackMetrics();
    expect(fallback.recentActivations).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model fallback metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — model fallback metrics', () => {
  it('records model fallback by reason and stage', () => {
    metricsStore.recordModelFallback('cjk', 'stage6');
    metricsStore.recordModelFallback('timeout', 'stage6');
    const mf = metricsStore.getModelFallbackMetrics();
    expect(mf.total).toBe(2);
    expect(mf.byReason.get('cjk')).toBe(1);
    expect(mf.byStage.get('stage6')).toBe(2);
  });

  it('records model fallback outcomes', () => {
    metricsStore.recordModelFallback('error', 'stage6');
    metricsStore.recordModelFallbackOutcome(true);
    metricsStore.recordModelFallback('error', 'stage6');
    metricsStore.recordModelFallbackOutcome(false);
    const mf = metricsStore.getModelFallbackMetrics();
    expect(mf.successes).toBe(1);
    expect(mf.failures).toBe(1);
    expect(mf.successRate).toBe(50);
  });

  it('returns sorted top reasons', () => {
    metricsStore.recordModelFallback('timeout', 'stage6');
    metricsStore.recordModelFallback('timeout', 'stage6');
    metricsStore.recordModelFallback('cjk', 'stage6');
    const mf = metricsStore.getModelFallbackMetrics();
    expect(mf.topReasons[0].reason).toBe('timeout');
    expect(mf.topReasons[0].count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Enrichment metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — enrichment metrics', () => {
  it('records enrichment start', () => {
    metricsStore.recordEnrichmentStart('video');
    const em = metricsStore.getEnrichmentMetrics();
    expect(em.total).toBe(1);
  });

  it('records enrichment success with usage', () => {
    metricsStore.recordEnrichmentStart('quiz');
    metricsStore.recordEnrichmentSuccess('quiz', 3000, { tokensUsed: 500, costUsd: 0.05 });
    const em = metricsStore.getEnrichmentMetrics();
    expect(em.successes).toBe(1);
    expect(em.tokensUsed).toBe(500);
    expect(em.costUsd).toBe(0.05);
  });

  it('records enrichment failure', () => {
    metricsStore.recordEnrichmentStart('presentation');
    metricsStore.recordEnrichmentFailure('presentation', 1000);
    const em = metricsStore.getEnrichmentMetrics();
    expect(em.failures).toBe(1);
  });

  it('records draft creation and approval', () => {
    metricsStore.recordDraftCreated();
    metricsStore.recordDraftApproved();
    const em = metricsStore.getEnrichmentMetrics();
    expect(em.draftsCreated).toBe(1);
    expect(em.draftsApproved).toBe(1);
  });

  it('tracks by-type stats', () => {
    metricsStore.recordEnrichmentStart('video');
    metricsStore.recordEnrichmentSuccess('video', 5000);
    metricsStore.recordEnrichmentStart('quiz');
    metricsStore.recordEnrichmentFailure('quiz', 1000);
    const em = metricsStore.getEnrichmentMetrics();
    expect(em.byTypeStats).toHaveLength(2);
  });

  it('calculates avg duration', () => {
    metricsStore.recordEnrichmentSuccess('video', 2000);
    metricsStore.recordEnrichmentSuccess('video', 4000);
    const em = metricsStore.getEnrichmentMetrics();
    expect(em.avgDurationMs).toBe(3000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export functions
// ─────────────────────────────────────────────────────────────────────────────

describe('exportMetrics / exportAllMetrics', () => {
  it('exportMetrics returns job type summary', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobSuccess(JobType.STRUCTURE_ANALYSIS, 100);
    const exported = exportMetrics();
    expect(exported).toHaveProperty(JobType.STRUCTURE_ANALYSIS);
  });

  it('exportAllMetrics includes all metric categories', () => {
    const all = exportAllMetrics();
    expect(all).toHaveProperty('jobTypes');
    expect(all).toHaveProperty('fsm');
    expect(all).toHaveProperty('outbox');
    expect(all).toHaveProperty('fallback');
    expect(all).toHaveProperty('modelFallback');
    expect(all).toHaveProperty('enrichment');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — reset', () => {
  it('clears all metrics', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordFSMInit(true, 50, true);
    metricsStore.recordOutboxBatch(1, 0, 50, 5);
    metricsStore.recordModelFallback('error', 'stage6');
    metricsStore.recordEnrichmentStart('video');

    metricsStore.reset();

    expect(metricsStore.getMetrics(JobType.STRUCTURE_ANALYSIS)).toBeNull();
    expect(metricsStore.getFSMMetrics().total).toBe(0);
    expect(metricsStore.getOutboxMetrics().batchesProcessed).toBe(0);
    expect(metricsStore.getModelFallbackMetrics().total).toBe(0);
    expect(metricsStore.getEnrichmentMetrics().total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('MetricsStore — getAllMetrics', () => {
  it('returns summary for all recorded job types', () => {
    metricsStore.recordJobStart(JobType.STRUCTURE_ANALYSIS);
    metricsStore.recordJobSuccess(JobType.STRUCTURE_ANALYSIS, 100);
    metricsStore.recordJobStart(JobType.LESSON_CONTENT);
    metricsStore.recordJobFailure(JobType.LESSON_CONTENT, 200);

    const all = metricsStore.getAllMetrics();
    expect(Object.keys(all)).toHaveLength(2);
  });
});
