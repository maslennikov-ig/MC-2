import { createHash } from 'node:crypto';
import {
  DocumentConflictSideHandleSchema,
  type DocumentConflictSideHandle,
} from '@megacampus/shared-types';

const SIDE_HANDLE_SCHEMA_VERSION = 'document-conflict-side-v1';

/** Stable identity independent of localized, truncated, or user-edited display text. */
export function buildDocumentConflictSideHandle(
  conflictId: string,
  claimIds: string[]
): DocumentConflictSideHandle {
  const sortedClaimIds = [...new Set(claimIds)].sort();
  if (sortedClaimIds.length === 0) throw new Error('Conflict side handle requires claim identity');
  const identity = `${SIDE_HANDLE_SCHEMA_VERSION}|${conflictId}|${sortedClaimIds.join(',')}`;
  return DocumentConflictSideHandleSchema.parse(
    `side:v1:${createHash('sha256').update(identity).digest('hex')}`
  );
}
