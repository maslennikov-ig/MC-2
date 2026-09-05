// Split out of `generation-commands.ts` on 2026-09-05. Prettier reformatting the
// densely-authored original took it from 854 to 1258 lines, past the repository's
// 800-line `max-lines` rule, so the file that had only ever been lint-clean because
// it was unformatted had to become several files that are both. Nothing here changed
// behaviour: these are the original declarations, moved. `generation-commands.ts`
// re-exports every one of them, so no import anywhere else had to change.

import { randomUUID } from 'node:crypto';

import type { HelixaGenerationRepository, HelixaGenerationRow } from './generation-types';

export function createInMemoryHelixaGenerationRepository(
  options: { objectId?: () => string; now?: () => Date } = {}
): HelixaGenerationRepository {
  const rows = new Map<string, HelixaGenerationRow>();
  const objectId = options.objectId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const key = (bindingId: string, commandId: string) => `${bindingId}\u0000${commandId}`;
  return {
    // In-memory contract fake intentionally conforms to the async repository surface.
    // eslint-disable-next-line @typescript-eslint/require-await
    async reserve(input) {
      const existing = rows.get(key(input.binding.bindingId, input.command.commandId));
      if (existing) {
        if (existing.commandHash !== input.commandHash) return { kind: 'conflict' };
        return {
          kind: 'reserved',
          row: { ...existing },
          mutationOwner: false,
          newlyReserved: false,
        };
      }
      const timestamp = now().toISOString();
      const row: HelixaGenerationRow = {
        bindingId: input.binding.bindingId,
        commandId: input.command.commandId,
        commandHash: input.commandHash,
        operation: input.command.operation,
        payloadHash: input.command.payloadHash,
        proposalId: input.command.proposalId,
        approvedRevision: input.command.approvedRevision,
        objectKind: input.objectKind,
        objectId: objectId(),
        status: 'reserved',
        acceptedAt: null,
        updatedAt: timestamp,
        claimGeneration: 1,
        leaseToken: randomUUID(),
      };
      rows.set(key(row.bindingId, row.commandId), row);
      return { kind: 'reserved', row: { ...row }, mutationOwner: true, newlyReserved: true };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async renew(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      return Boolean(
        row &&
          row.objectId === input.objectId &&
          row.leaseToken === input.leaseToken &&
          row.claimGeneration === input.claimGeneration &&
          row.status === 'reserved'
      );
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async markScheduled(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (
        !row ||
        row.objectId !== input.objectId ||
        row.leaseToken !== input.leaseToken ||
        row.claimGeneration !== input.claimGeneration ||
        row.status !== 'reserved'
      )
        return null;
      const timestamp = now().toISOString();
      Object.assign(row, {
        status: 'scheduled' as const,
        acceptedAt: timestamp,
        updatedAt: timestamp,
        leaseToken: null,
      });
      return { ...row };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async reconcileCompleted(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (
        !row ||
        row.objectId !== input.objectId ||
        row.leaseToken !== input.leaseToken ||
        row.claimGeneration !== input.claimGeneration ||
        !['reserved', 'executing'].includes(row.status)
      )
        return null;
      Object.assign(row, {
        status: 'native_completed' as const,
        nativeCompletedAt: input.nativeCompletedAt,
        outboxEventId: input.outboxEventId,
        leaseToken: null,
        acceptedAt: row.acceptedAt ?? now().toISOString(),
        updatedAt: now().toISOString(),
      });
      return { ...row };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async actionRequired(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (
        !row ||
        row.objectId !== input.objectId ||
        row.leaseToken !== input.leaseToken ||
        row.claimGeneration !== input.claimGeneration
      )
        return false;
      Object.assign(row, {
        status: 'action_required' as const,
        safeErrorCode: input.safeErrorCode,
        leaseToken: null,
        updatedAt: now().toISOString(),
      });
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async lookup(bindingId, commandId) {
      const row = rows.get(key(bindingId, commandId));
      return row ? { ...row } : null;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async claimScheduled(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (!row || row.status !== 'scheduled' || row.leaseToken !== null) return null;
      Object.assign(row, {
        claimGeneration: row.claimGeneration + 1,
        leaseToken: randomUUID(),
        updatedAt: now().toISOString(),
      });
      return { ...row };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async returnScheduled(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (
        !row ||
        row.status !== 'scheduled' ||
        row.objectId !== input.objectId ||
        row.leaseToken !== input.leaseToken ||
        row.claimGeneration !== input.claimGeneration
      )
        return false;
      Object.assign(row, { leaseToken: null, updatedAt: now().toISOString() });
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async failObserved(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (
        !row ||
        row.status !== 'scheduled' ||
        row.objectId !== input.objectId ||
        row.leaseToken !== input.leaseToken ||
        row.claimGeneration !== input.claimGeneration
      )
        return false;
      Object.assign(row, {
        status: 'action_required' as const,
        safeErrorCode: 'megacampus_generation_native_failed',
        leaseToken: null,
        updatedAt: now().toISOString(),
      });
      return true;
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async completeObserved(input) {
      const row = rows.get(key(input.bindingId, input.commandId));
      if (
        !row ||
        row.status !== 'scheduled' ||
        row.objectId !== input.objectId ||
        row.leaseToken !== input.leaseToken ||
        row.claimGeneration !== input.claimGeneration
      )
        return false;
      Object.assign(row, {
        status: 'native_completed' as const,
        nativeCompletedAt: input.nativeCompletedAt,
        outboxEventId: input.outboxEventId,
        leaseToken: null,
        updatedAt: now().toISOString(),
      });
      return true;
    },
  };
}
