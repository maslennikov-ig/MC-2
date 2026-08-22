import { knowledgeEventId } from './package-builder';
import type { KnowledgeObjectKind } from './contract';

export interface CompletedObject { kind: KnowledgeObjectKind; id: string; organizationId: string; completedAt: string }
export interface ReconcileRepository { listCompleted(): Promise<CompletedObject[]>; insertMissing(intents: Array<CompletedObject & { eventId: string }>): Promise<number> }

export async function reconcileCompletedKnowledgeObjects(repository: ReconcileRepository, options: { apply?: boolean } = {}) {
  const completed = await repository.listCompleted();
  const intents = completed.map(item => ({ ...item, eventId: knowledgeEventId(item) }));
  if (options.apply !== true) return { dryRun: true, discovered: intents.length, inserted: 0, intents };
  return { dryRun: false, discovered: intents.length, inserted: await repository.insertMissing(intents), intents };
}

