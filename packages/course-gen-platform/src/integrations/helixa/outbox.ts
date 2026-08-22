import type { KnowledgeObjectKind } from './contract';
import type { KnowledgeSyncPackage } from './contract';
import { serializeKnowledgeSyncPackage } from './package-builder';
import { classifyDeliveryFailure, deliverClaimedKnowledgeSync, type DeliveryConfig, type DeliveryFailure } from './delivery';

export interface KnowledgeSyncOutboxEntry { id: string; eventId: string; objectKind: KnowledgeObjectKind; objectId: string; organizationId: string; completedAt: string; rawBody: Buffer | null }
export interface KnowledgeSyncOutboxRepository {
  persistRawBodyOnce(id: string, rawBody: Buffer, payloadHash: string): Promise<Buffer>;
  markDelivered(id: string): Promise<void>;
  reschedule(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  markTerminal(id: string, error: string): Promise<void>;
}

function safeError(failure: DeliveryFailure): string { return failure.kind === 'http' ? `HTTP ${failure.status}` : 'Network delivery failed'; }

export async function processKnowledgeSyncOutboxEntry(input: {
  entry: KnowledgeSyncOutboxEntry;
  buildPackage(): Promise<KnowledgeSyncPackage>;
  repository: KnowledgeSyncOutboxRepository;
  delivery: DeliveryConfig;
  now?: Date;
}): Promise<'delivered' | 'retryable' | 'terminal'> {
  try {
    const packageValue = input.entry.rawBody ? null : await input.buildPackage();
    const rawBody = input.entry.rawBody ?? await input.repository.persistRawBodyOnce(input.entry.id, serializeKnowledgeSyncPackage(packageValue!), packageValue!.hashes.payloadHash);
    await deliverClaimedKnowledgeSync({ id: input.entry.id, eventId: input.entry.eventId, rawBody }, input.delivery);
    await input.repository.markDelivered(input.entry.id);
    return 'delivered';
  } catch (error) {
    const candidate = error as { kind?: unknown; status?: unknown };
    const failure: DeliveryFailure = candidate.kind === 'http' && typeof candidate.status === 'number'
      ? { kind: 'http', status: candidate.status, message: 'HTTP delivery failed' }
      : { kind: 'network', message: 'Knowledge package preparation or delivery failed' };
    const classification = classifyDeliveryFailure(failure);
    if (classification === 'retryable') await input.repository.reschedule(input.entry.id, new Date((input.now ?? new Date()).getTime() + 60_000), safeError(failure));
    else await input.repository.markTerminal(input.entry.id, safeError(failure));
    return classification;
  }
}
