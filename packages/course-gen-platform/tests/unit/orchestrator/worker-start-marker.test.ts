/**
 * `mc2-r7udy`: a worker restart must be visible from the database alone.
 *
 * Blocked since 2026-02-18 on `metric_event_type` being a PostgreSQL enum with
 * no value that truthfully means "a worker process started". Migration
 * 20260822160100 adds one — and note that the plan this work follows said no
 * migration was needed, on the grounds that `system_metrics` has no CHECK
 * constraint. True, and beside the point: the constraint is an enum, which is
 * stricter. It was only visible by asking the live server.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert }) }),
}));

const warn = vi.fn();
const info = vi.fn();
vi.mock('@/shared/logger', () => ({
  default: { warn, info, error: vi.fn(), debug: vi.fn() },
  logger: { warn, info, error: vi.fn(), debug: vi.fn() },
}));

const { recordWorkerStart, workerInstanceId } = await import('@/orchestrator/worker-start-marker');

beforeEach(() => {
  insert.mockReset();
  warn.mockReset();
  info.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe('the row a starting worker writes', () => {
  it('carries the build that came back, which is the point of it', async () => {
    vi.stubEnv('APP_VERSION', 'abc123def456');
    await recordWorkerStart({ role: 'general', concurrency: 5, queueName: 'course-generation' });

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.event_type).toBe('worker_started');
    expect(row.severity).toBe('info');
    // Knowing a worker restarted is half the answer; knowing it returned on
    // different code is what tells a deploy from a crash.
    expect(row.metadata.app_version).toBe('abc123def456');
    expect(row.message).toContain('abc123def456');
    vi.unstubAllEnvs();
  });

  it('identifies the process, not just the host', async () => {
    await recordWorkerStart({ role: 'general', concurrency: 5 });

    const row = insert.mock.calls[0][0];
    // A restarted container usually keeps its name, so the hostname alone
    // cannot distinguish two processes. The instance id can.
    expect(row.metadata.worker_instance_id).toBe(workerInstanceId());
    expect(row.metadata.worker_instance_id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(row.metadata.pid).toBe(process.pid);
    expect(typeof row.metadata.hostname).toBe('string');
  });

  it('takes the role from the caller rather than an environment variable', async () => {
    // Stage 7 runs from its own entrypoint and is selected by the compose
    // `command`; there is no STAGE7_WORKER variable set anywhere. Sniffing the
    // environment would have labelled every Stage 7 process 'general'.
    await recordWorkerStart({ role: 'stage7', concurrency: 3, queueName: 'stage7-enrichments' });

    expect(insert.mock.calls[0][0].metadata.worker_role).toBe('stage7');
  });

  it('falls back to distinguishing general from stage 6, which do share one', async () => {
    vi.stubEnv('STAGE6_WORKER', 'true');
    await recordWorkerStart({ concurrency: 30 });
    expect(insert.mock.calls[0][0].metadata.worker_role).toBe('stage6');

    vi.stubEnv('STAGE6_WORKER', '');
    insert.mockClear();
    await recordWorkerStart({ concurrency: 5 });
    expect(insert.mock.calls[0][0].metadata.worker_role).toBe('general');
    vi.unstubAllEnvs();
  });
});

describe('a marker that cannot be written', () => {
  it('does not stop the worker when the insert is refused', async () => {
    insert.mockResolvedValue({ error: { message: 'permission denied' } });

    await expect(recordWorkerStart({ concurrency: 5 })).resolves.toBeUndefined();
    // Silence here would make an absent marker indistinguishable from a worker
    // that never started.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'permission denied' }),
      expect.stringContaining('restart correlation will have a gap')
    );
  });

  it('does not stop the worker when the client throws', async () => {
    insert.mockRejectedValue(new Error('connection reset'));

    await expect(recordWorkerStart({ concurrency: 5 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'connection reset' }),
      expect.stringContaining('restart correlation will have a gap')
    );
  });
});
