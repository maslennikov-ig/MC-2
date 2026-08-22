/**
 * A durable record that a worker process started.
 *
 * `mc2-r7udy` asks one narrow question: for a given course and time window, can
 * an operator tell from the database alone whether a worker restarted while that
 * course was generating? Every stuck-Stage-6 investigation so far has had to
 * guess, because the only evidence was container logs that rotate and a
 * `docker ps` uptime that says nothing about the past.
 *
 * The build sha is the second half of the answer. Knowing a worker restarted is
 * useful; knowing it came back on different code is what distinguishes a crash
 * from a deploy, and the deploy is usually the thing being suspected.
 *
 * Deliberately best-effort. A worker that cannot write its own marker must still
 * start: this row is diagnostics, and refusing to process jobs because
 * diagnostics failed would be a worse outage than the one it helps investigate.
 * The failure is logged at warn, which is enough for the absence of markers to
 * be explicable rather than mysterious.
 *
 * @module orchestrator/worker-start-marker
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { getSupabaseAdmin } from '../shared/supabase/admin';
import logger from '../shared/logger';

/**
 * Identifies this process for as long as it lives.
 *
 * Generated once at module load, so every row a single worker writes shares it
 * and two rows with different ids are provably two processes. The hostname alone
 * would not do: a restarted container frequently keeps its name.
 */
const WORKER_INSTANCE_ID = randomUUID();

/**
 * The role this process plays, which decides which queues it drains.
 *
 * Passed in by the caller rather than sniffed from the environment. Stage 7 runs
 * from its own entrypoint and is selected by the compose `command`, not by any
 * variable — a `STAGE7_WORKER` check would have quietly labelled every Stage 7
 * process `general`, which is the failure this marker exists to avoid.
 */
export type WorkerRole = 'general' | 'stage6' | 'stage7';

/** General and Stage 6 do share an entrypoint, and this is how they differ. */
function generalOrStage6(): WorkerRole {
  return process.env.STAGE6_WORKER === 'true' ? 'stage6' : 'general';
}

/** This process's instance id, for anything else that wants to name itself. */
export function workerInstanceId(): string {
  return WORKER_INSTANCE_ID;
}

/**
 * Write one `worker_started` row.
 *
 * `event_type` is a PostgreSQL enum, not a free text column — this value exists
 * because migration 20260822160100 added it, and before that there was no
 * truthful way to say this at all. Severity is `info`: a worker starting is
 * normal, and it is the *pattern* of these rows against a course timeline that
 * carries the information, not any single one.
 */
export async function recordWorkerStart(details: {
  role?: WorkerRole;
  concurrency: number;
  queueName?: string;
  /** Job types this worker registered a handler for. */
  registeredHandlers?: readonly string[];
}): Promise<void> {
  const role = details.role ?? generalOrStage6();
  try {
    const { error } = await getSupabaseAdmin()
      .from('system_metrics')
      .insert({
        event_type: 'worker_started',
        severity: 'info',
        message: `Worker ${role} started on build ${process.env.APP_VERSION ?? 'unknown'}`,
        metadata: {
          worker_instance_id: WORKER_INSTANCE_ID,
          worker_role: role,
          // The whole point of the marker: which code came back.
          app_version: process.env.APP_VERSION ?? null,
          node_env: process.env.NODE_ENV ?? null,
          environment: process.env.ENVIRONMENT ?? null,
          hostname: hostname(),
          pid: process.pid,
          concurrency: details.concurrency,
          queue_name: details.queueName ?? null,
          registered_handlers: details.registeredHandlers ? [...details.registeredHandlers] : null,
        },
      });

    if (error) {
      logger.warn(
        { err: error.message, workerInstanceId: WORKER_INSTANCE_ID },
        'Could not record worker start marker - restart correlation will have a gap here'
      );
      return;
    }

    logger.info(
      {
        workerInstanceId: WORKER_INSTANCE_ID,
        workerRole: role,
        appVersion: process.env.APP_VERSION ?? null,
      },
      'Worker start marker recorded'
    );
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        workerInstanceId: WORKER_INSTANCE_ID,
      },
      'Could not record worker start marker - restart correlation will have a gap here'
    );
  }
}
