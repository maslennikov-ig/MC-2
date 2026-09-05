import { createHash } from 'node:crypto';

import type { KnowledgeObjectKind } from './contract';
import type { KnowledgeSyncPackage } from './contract';
import { serializeKnowledgeSyncPackage } from './package-builder';
import { classifyDeliveryFailure, deliverClaimedKnowledgeSync, type DeliveryConfig, type DeliveryFailure } from './delivery';
import { KnowledgeSyncPreparationError } from './errors';

export { KnowledgeSyncPreparationError } from './errors';
export const KNOWLEDGE_SYNC_MAX_ATTEMPTS = 8;
export interface KnowledgeSyncOutboxEntry { id: string; eventId: string; objectKind: KnowledgeObjectKind; objectId: string; organizationId: string; completedAt: string; rawBody: Buffer | null; attempts: number; leaseToken: string; bindingId: string }
export interface KnowledgeSyncOutboxRepository {
  persistRawBodyOnce(id: string, leaseToken: string, rawBody: Buffer, payloadHash: string): Promise<Buffer | null>;
  markDelivered(id: string, leaseToken: string): Promise<boolean>;
  reschedule(id: string, leaseToken: string, nextAttemptAt: Date, error: string): Promise<boolean>;
  markTerminal(id: string, leaseToken: string, error: string): Promise<boolean>;
}

function safeError(failure: DeliveryFailure): string { return failure.kind === 'http' ? `HTTP ${failure.status}` : 'Transient delivery failure'; }
export function computeRetryDelayMs(attempt: number, eventId: string): number {
  const base = 15_000 * 2 ** Math.max(0, attempt - 1);
  const entropy = createHash('sha256').update(eventId, 'utf8').digest().readUInt32BE(0);
  const jitter = entropy % Math.max(1, Math.floor(base / 4));
  return Math.min(300_000, base + jitter);
}

export async function processKnowledgeSyncOutboxEntry(input: {
  entry: KnowledgeSyncOutboxEntry;
  buildPackage(): Promise<KnowledgeSyncPackage>;
  repository: KnowledgeSyncOutboxRepository;
  delivery: DeliveryConfig;
  now?: Date;
}): Promise<'delivered' | 'retryable' | 'terminal' | 'lost_lease'> {
  try {
    const packageValue = input.entry.rawBody ? null : await input.buildPackage();
    const rawBody = input.entry.rawBody ?? await input.repository.persistRawBodyOnce(input.entry.id, input.entry.leaseToken, serializeKnowledgeSyncPackage(packageValue!), packageValue!.hashes.payloadHash);
    if (rawBody == null) return 'lost_lease';
    await deliverClaimedKnowledgeSync({ id: input.entry.id, eventId: input.entry.eventId, rawBody }, input.delivery);
    return await input.repository.markDelivered(input.entry.id, input.entry.leaseToken) ? 'delivered' : 'lost_lease';
  } catch (error) {
    if (error instanceof KnowledgeSyncPreparationError) {
      if (!error.retryable || input.entry.attempts >= KNOWLEDGE_SYNC_MAX_ATTEMPTS) {
        return await input.repository.markTerminal(input.entry.id, input.entry.leaseToken, 'Preparation requires operator action') ? 'terminal' : 'lost_lease';
      }
      const next = new Date((input.now ?? new Date()).getTime() + computeRetryDelayMs(input.entry.attempts, input.entry.eventId));
      return await input.repository.reschedule(input.entry.id, input.entry.leaseToken, next, 'Transient preparation failure') ? 'retryable' : 'lost_lease';
    }
    const candidate = error as { kind?: unknown; status?: unknown };
    const failure: DeliveryFailure = candidate.kind === 'http' && typeof candidate.status === 'number'
      ? { kind: 'http', status: candidate.status, message: 'HTTP delivery failed' }
      : { kind: 'network', message: 'Knowledge package preparation or delivery failed' };
    const classification = classifyDeliveryFailure(failure);
    if (classification === 'retryable' && input.entry.attempts < KNOWLEDGE_SYNC_MAX_ATTEMPTS) {
      const next = new Date((input.now ?? new Date()).getTime() + computeRetryDelayMs(input.entry.attempts, input.entry.eventId));
      return await input.repository.reschedule(input.entry.id, input.entry.leaseToken, next, safeError(failure)) ? 'retryable' : 'lost_lease';
    }
    return await input.repository.markTerminal(input.entry.id, input.entry.leaseToken, failure.kind === 'http' ? `HTTP ${failure.status}` : 'Retry budget exhausted') ? 'terminal' : 'lost_lease';
  }
}
