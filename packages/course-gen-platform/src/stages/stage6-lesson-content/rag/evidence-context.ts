import { createHash } from 'node:crypto';
import {
  DocumentConflictSchema,
  DocumentEvidenceCardsSchema,
  DocumentEvidenceSnapshotSchema,
  DocumentEvidenceSourceManifestSchema,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceSnapshot,
  type DocumentEvidenceSourceManifestEntry,
  type EvidenceSourceRef,
} from '@megacampus/shared-types';
import { buildDocumentConflictSideHandle } from '@/stages/stage4-analysis/evidence/side-handle';

export interface Stage6EvidenceDecisionRow {
  id: string;
  run_id: string;
  subject_kind: 'claim_conflict' | 'degraded_evidence' | 'detector_capacity';
  conflict_id: string | null;
  document_id: string | null;
  selected_resolution: string;
  selected_recommendation_value: string | null;
  selected_side_handle: string | null;
  subject_key: string;
  supersedes_decision_id: string | null;
  decided_at: string;
}

export class Stage6EvidenceScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Stage6EvidenceScopeError';
  }
}

export interface Stage6AcceptedEvidenceContext {
  acceptedRunId: string;
  decisionIds: string[];
  decisionQueries: string[];
  sourceRefs: EvidenceSourceRef[];
  rejectedSourceRefs: EvidenceSourceRef[];
  allowedDocumentIds: string[];
  sourceVersionByDocumentId: Record<string, string>;
  decisionIdsByDocumentId: Record<string, string[]>;
  globalDecisionIds: string[];
  cacheIdentity: string;
}

export interface BuildStage6EvidenceContextInput {
  courseId: string;
  organizationId: string;
  snapshot: DocumentEvidenceSnapshot;
  sourceManifest: DocumentEvidenceSourceManifestEntry[];
  cards: DocumentEvidenceCard[];
  conflicts: DocumentConflict[];
  decisions: Stage6EvidenceDecisionRow[];
}

export function getStage6EvidenceProvenance(
  context: Stage6AcceptedEvidenceContext,
  documentId: string,
  chunkId: string
): {
  accepted_run_id: string;
  decision_ids: string[];
  decision_id_total: number;
  decision_id_overflow_count: number;
  decision_set_handle: string;
  source_refs: EvidenceSourceRef[];
  source_ref_total: number;
  source_ref_overflow_count: number;
  source_ref_set_handle: string;
} {
  const exact = context.sourceRefs.filter(
    ref => ref.document_id === documentId && ref.chunk_id === chunkId
  );
  // A ref with no chunk_id deliberately authorizes the accepted document version.
  // Page/heading fields remain provenance locators; chunk-scoped refs never broaden.
  const documentLevel = context.sourceRefs.filter(
    ref => ref.document_id === documentId && !ref.chunk_id
  );
  const sourceRefs = [...exact, ...documentLevel]
    .sort((left, right) => canonicalRef(left).localeCompare(canonicalRef(right)))
    .filter(
      (ref, index, values) => index === 0 || canonicalRef(values[index - 1]) !== canonicalRef(ref)
    );
  const decisionIds =
    sourceRefs.length === 0
      ? []
      : exactSorted([
          ...(context.decisionIdsByDocumentId[documentId] ?? []),
          ...context.globalDecisionIds,
        ]);
  const decisionLimit = 8;
  const sourceRefLimit = 8;
  return {
    accepted_run_id: context.acceptedRunId,
    decision_ids: decisionIds.slice(0, decisionLimit),
    decision_id_total: decisionIds.length,
    decision_id_overflow_count: Math.max(0, decisionIds.length - decisionLimit),
    decision_set_handle: `sha256:${sha256(JSON.stringify(decisionIds))}`,
    source_refs: sourceRefs.slice(0, sourceRefLimit),
    source_ref_total: sourceRefs.length,
    source_ref_overflow_count: Math.max(0, sourceRefs.length - sourceRefLimit),
    source_ref_set_handle: `sha256:${sha256(JSON.stringify(sourceRefs))}`,
  };
}

function refAppliesToChunk(ref: EvidenceSourceRef, documentId: string, chunkId: string): boolean {
  return ref.document_id === documentId && (!ref.chunk_id || ref.chunk_id === chunkId);
}

/**
 * Chunk-level accepted evidence guard used for both live Qdrant and retry cache reads.
 * Rejected exact/document-level refs win over accepted refs from the same document.
 */
export function isStage6EvidenceChunkAllowed(
  context: Stage6AcceptedEvidenceContext,
  documentId: string,
  chunkId: string
): boolean {
  if (context.rejectedSourceRefs.some(ref => refAppliesToChunk(ref, documentId, chunkId))) {
    return false;
  }
  return context.sourceRefs.some(ref => refAppliesToChunk(ref, documentId, chunkId));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalRef(ref: EvidenceSourceRef): string {
  return JSON.stringify({
    document_id: ref.document_id,
    chunk_id: ref.chunk_id ?? null,
    page_number: ref.page_number ?? null,
    heading_path: ref.heading_path ?? null,
    version_hash: ref.version_hash ?? null,
  });
}

function exactSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function selectedConflictSide(
  conflict: DocumentConflict,
  decision: Stage6EvidenceDecisionRow
): DocumentConflict['sides'][number] {
  if (!decision.selected_side_handle) {
    throw new Stage6EvidenceScopeError(
      decision.selected_recommendation_value
        ? 'Stage 6 legacy conflict decision has no durable selected side'
        : 'Stage 6 custom conflict decision has no durable selected side'
    );
  }
  const matchingSides = conflict.sides.filter(
    side =>
      side.side_handle === decision.selected_side_handle &&
      side.side_handle === buildDocumentConflictSideHandle(conflict.conflict_id, side.claim_ids)
  );
  if (matchingSides.length !== 1) {
    throw new Stage6EvidenceScopeError(
      'Stage 6 durable conflict decision cannot project one selected side'
    );
  }
  return matchingSides[0];
}

/**
 * Build the bounded, decision-aware projection consumed by live Stage 6 retrieval.
 * Full decision history and rejected conflict bodies never leave this boundary.
 */
export function buildStage6EvidenceContext(
  input: BuildStage6EvidenceContextInput
): Stage6AcceptedEvidenceContext {
  const snapshot = DocumentEvidenceSnapshotSchema.parse(input.snapshot);
  const sourceManifest = DocumentEvidenceSourceManifestSchema.parse(input.sourceManifest);
  const cards = DocumentEvidenceCardsSchema.parse(input.cards);
  const conflicts = DocumentConflictSchema.array().parse(input.conflicts);

  if (snapshot.accepted_run_id.length === 0) {
    throw new Stage6EvidenceScopeError('Stage 6 evidence requires an accepted run');
  }
  const decisions = [...input.decisions].sort((left, right) => left.id.localeCompare(right.id));
  const decisionIds = exactSorted(decisions.map(value => value.id));
  if (JSON.stringify(decisionIds) !== JSON.stringify(exactSorted(snapshot.current_decision_ids))) {
    throw new Stage6EvidenceScopeError('Stage 6 evidence decision snapshot is stale');
  }
  if (decisions.some(decision => decision.run_id !== snapshot.accepted_run_id)) {
    throw new Stage6EvidenceScopeError('Stage 6 evidence decision belongs to a foreign run');
  }

  const manifestByDocument = new Map(
    sourceManifest.map(source => [source.document_id, source] as const)
  );
  if (
    cards.length !== sourceManifest.length ||
    cards.some(card => !manifestByDocument.has(card.document_id))
  ) {
    throw new Stage6EvidenceScopeError(
      'Stage 6 evidence cards do not match the accepted run allowlist'
    );
  }

  const conflictById = new Map(conflicts.map(conflict => [conflict.conflict_id, conflict]));
  const decisionByConflict = new Map(
    decisions
      .filter(decision => decision.subject_kind === 'claim_conflict' && decision.conflict_id)
      .map(decision => [decision.conflict_id!, decision] as const)
  );
  const excludedClaimIds = new Set<string>();
  const selectedClaimIds = new Set<string>();
  const removedDocumentIds = new Set<string>();
  const terminalDegradedDocumentIds = new Set<string>();
  const rejectedRefs = new Map<string, EvidenceSourceRef>();
  const decisionIdsByDocument = new Map<string, Set<string>>();
  const globalDecisionIds: string[] = [];
  const decisionQueries: string[] = [];

  const addDocumentDecision = (documentId: string, decisionId: string) => {
    const values = decisionIdsByDocument.get(documentId) ?? new Set<string>();
    values.add(decisionId);
    decisionIdsByDocument.set(documentId, values);
  };

  for (const conflict of conflicts) {
    if (conflict.severity === 'informational') continue;
    conflict.sides
      .flatMap(side => side.claim_ids)
      .forEach(claimId => excludedClaimIds.add(claimId));
    const decision = decisionByConflict.get(conflict.conflict_id);
    if (!decision) {
      throw new Stage6EvidenceScopeError(
        'Stage 6 evidence material conflict has no current decision'
      );
    }
    const selectedSide = selectedConflictSide(conflict, decision);
    selectedSide.claim_ids.forEach(claimId => selectedClaimIds.add(claimId));
    selectedSide.document_ids.forEach(documentId => addDocumentDecision(documentId, decision.id));
    conflict.sides
      .filter(side => side !== selectedSide)
      .flatMap(side => side.source_refs)
      .forEach(ref => rejectedRefs.set(canonicalRef(ref), ref));
    decisionQueries.push(decision.selected_resolution.trim());
  }

  for (const decision of decisions) {
    if (decision.subject_kind === 'claim_conflict') {
      if (!decision.conflict_id || !conflictById.has(decision.conflict_id)) {
        throw new Stage6EvidenceScopeError(
          'Stage 6 evidence decision references an unknown conflict'
        );
      }
      continue;
    }
    if (decision.subject_kind === 'degraded_evidence') {
      if (!decision.document_id || !manifestByDocument.has(decision.document_id)) {
        throw new Stage6EvidenceScopeError(
          'Stage 6 degraded decision references a foreign document'
        );
      }
      terminalDegradedDocumentIds.add(decision.document_id);
      addDocumentDecision(decision.document_id, decision.id);
      if (decision.selected_recommendation_value === 'remove_document') {
        removedDocumentIds.add(decision.document_id);
      } else if (decision.selected_recommendation_value !== 'continue_limited') {
        throw new Stage6EvidenceScopeError('Stage 6 degraded evidence decision is not terminal');
      }
      continue;
    }
    if (decision.subject_kind === 'detector_capacity') {
      globalDecisionIds.push(decision.id);
    }
  }

  for (const card of cards) {
    if (
      (card.coverage_status === 'degraded' || card.coverage_status === 'failed') &&
      !terminalDegradedDocumentIds.has(card.document_id)
    ) {
      throw new Stage6EvidenceScopeError(
        'Stage 6 degraded or failed evidence requires a terminal degraded decision'
      );
    }
  }

  const assertAcceptedRef = (ref: EvidenceSourceRef) => {
    const source = manifestByDocument.get(ref.document_id);
    if (!source) {
      throw new Stage6EvidenceScopeError(
        'Stage 6 source ref is outside the accepted run allowlist'
      );
    }
    if (!ref.version_hash || ref.version_hash !== source.source_version_hash) {
      throw new Stage6EvidenceScopeError('Stage 6 source ref version is stale');
    }
  };
  rejectedRefs.forEach(ref => assertAcceptedRef(ref));

  const refs = new Map<string, EvidenceSourceRef>();
  for (const card of cards) {
    if (removedDocumentIds.has(card.document_id)) continue;
    for (const claim of card.key_claims) {
      if (excludedClaimIds.has(claim.claim_id) && !selectedClaimIds.has(claim.claim_id)) continue;
      for (const ref of claim.source_refs) {
        assertAcceptedRef(ref);
        refs.set(canonicalRef(ref), ref);
      }
    }
  }

  const sourceRefs = [...refs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, ref]) => ref);
  const rejectedSourceRefs = [...rejectedRefs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, ref]) => ref);
  const allowedDocumentIds = exactSorted(sourceRefs.map(ref => ref.document_id));
  const sourceVersionByDocumentId = Object.fromEntries(
    sourceManifest.map(source => [source.document_id, source.source_version_hash])
  );
  const refHash = sha256(JSON.stringify(sourceRefs));
  const rejectedRefHash = sha256(JSON.stringify(rejectedSourceRefs));
  const cacheIdentity = sha256(
    JSON.stringify({
      accepted_run_id: snapshot.accepted_run_id,
      decision_ids: decisionIds,
      source_ref_hash: refHash,
      rejected_source_ref_hash: rejectedRefHash,
    })
  );

  return {
    acceptedRunId: snapshot.accepted_run_id,
    decisionIds,
    decisionQueries: exactSorted(decisionQueries.filter(Boolean)).slice(0, 16),
    sourceRefs,
    rejectedSourceRefs,
    allowedDocumentIds,
    sourceVersionByDocumentId,
    decisionIdsByDocumentId: Object.fromEntries(
      [...decisionIdsByDocument.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([documentId, values]) => [documentId, exactSorted([...values])])
    ),
    globalDecisionIds: exactSorted(globalDecisionIds),
    cacheIdentity,
  };
}
