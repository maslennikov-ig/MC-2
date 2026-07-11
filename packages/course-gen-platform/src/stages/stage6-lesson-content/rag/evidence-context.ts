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

export interface Stage6EvidenceDecisionRow {
  id: string;
  run_id: string;
  subject_kind: 'claim_conflict' | 'degraded_evidence' | 'detector_capacity';
  conflict_id: string | null;
  document_id: string | null;
  selected_resolution: string;
  selected_recommendation_value: string | null;
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
  allowedDocumentIds: string[];
  sourceVersionByDocumentId: Record<string, string>;
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
  source_refs: EvidenceSourceRef[];
} {
  const exact = context.sourceRefs.filter(
    ref => ref.document_id === documentId && ref.chunk_id === chunkId
  );
  const documentRefs = context.sourceRefs.filter(ref => ref.document_id === documentId);
  const documentLevel = documentRefs.filter(ref => !ref.chunk_id);
  return {
    accepted_run_id: context.acceptedRunId,
    decision_ids: context.decisionIds,
    source_refs: (exact.length > 0
      ? exact
      : documentLevel.length > 0
        ? documentLevel
        : documentRefs
    ).slice(0, 8),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('und');
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

function selectedConflictClaimIds(
  conflict: DocumentConflict,
  decision: Stage6EvidenceDecisionRow,
  cards: DocumentEvidenceCard[]
): Set<string> {
  const recommendationValue = `recommendation:${conflict.conflict_id}`;
  const alternativePrefix = `alternative:${conflict.conflict_id}:`;
  let selectedResolution = decision.selected_resolution;
  if (decision.selected_recommendation_value === recommendationValue) {
    selectedResolution = conflict.recommended_resolution;
  } else if (decision.selected_recommendation_value?.startsWith(alternativePrefix)) {
    const indexText = decision.selected_recommendation_value.slice(alternativePrefix.length);
    const index = /^\d+$/u.test(indexText) ? Number.parseInt(indexText, 10) : -1;
    if (conflict.alternatives[index]) {
      selectedResolution = conflict.alternatives[index];
    }
  }
  const selectedText = canonicalText(selectedResolution);
  const matchingClaimIds = new Set(
    cards.flatMap(card =>
      card.key_claims
        .filter(claim => canonicalText(claim.statement) === selectedText)
        .map(claim => claim.claim_id)
    )
  );
  const selectedSide = conflict.sides.find(side =>
    side.claim_ids.some(claimId => matchingClaimIds.has(claimId))
  );
  return new Set(selectedSide?.claim_ids ?? []);
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
    throw new Error('Stage 6 evidence requires an accepted run');
  }
  const decisions = [...input.decisions].sort((left, right) => left.id.localeCompare(right.id));
  const decisionIds = exactSorted(decisions.map(value => value.id));
  if (JSON.stringify(decisionIds) !== JSON.stringify(exactSorted(snapshot.current_decision_ids))) {
    throw new Error('Stage 6 evidence decision snapshot is stale');
  }
  if (decisions.some(decision => decision.run_id !== snapshot.accepted_run_id)) {
    throw new Error('Stage 6 evidence decision belongs to a foreign run');
  }

  const manifestByDocument = new Map(
    sourceManifest.map(source => [source.document_id, source] as const)
  );
  if (
    cards.length !== sourceManifest.length ||
    cards.some(card => !manifestByDocument.has(card.document_id))
  ) {
    throw new Error('Stage 6 evidence cards do not match the accepted run allowlist');
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
  const decisionQueries: string[] = [];

  for (const conflict of conflicts) {
    if (conflict.severity === 'informational') continue;
    conflict.sides
      .flatMap(side => side.claim_ids)
      .forEach(claimId => excludedClaimIds.add(claimId));
    const decision = decisionByConflict.get(conflict.conflict_id);
    if (!decision) throw new Error('Stage 6 evidence material conflict has no current decision');
    selectedConflictClaimIds(conflict, decision, cards).forEach(claimId =>
      selectedClaimIds.add(claimId)
    );
    decisionQueries.push(decision.selected_resolution.trim());
  }

  for (const decision of decisions) {
    if (decision.subject_kind === 'claim_conflict') {
      if (!decision.conflict_id || !conflictById.has(decision.conflict_id)) {
        throw new Error('Stage 6 evidence decision references an unknown conflict');
      }
      continue;
    }
    if (decision.subject_kind === 'degraded_evidence') {
      if (!decision.document_id || !manifestByDocument.has(decision.document_id)) {
        throw new Error('Stage 6 degraded decision references a foreign document');
      }
      if (decision.selected_recommendation_value === 'remove_document') {
        removedDocumentIds.add(decision.document_id);
      } else if (decision.selected_recommendation_value !== 'continue_limited') {
        throw new Error('Stage 6 degraded evidence decision is not terminal');
      }
    }
  }

  const refs = new Map<string, EvidenceSourceRef>();
  for (const card of cards) {
    if (removedDocumentIds.has(card.document_id)) continue;
    for (const claim of card.key_claims) {
      if (excludedClaimIds.has(claim.claim_id) && !selectedClaimIds.has(claim.claim_id)) continue;
      for (const ref of claim.source_refs) {
        const source = manifestByDocument.get(ref.document_id);
        if (!source) throw new Error('Stage 6 source ref is outside the accepted run allowlist');
        if (!ref.version_hash || ref.version_hash !== source.source_version_hash) {
          throw new Error('Stage 6 source ref version is stale');
        }
        refs.set(canonicalRef(ref), ref);
      }
    }
  }

  const sourceRefs = [...refs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, ref]) => ref);
  const allowedDocumentIds = exactSorted(sourceRefs.map(ref => ref.document_id));
  const sourceVersionByDocumentId = Object.fromEntries(
    sourceManifest.map(source => [source.document_id, source.source_version_hash])
  );
  const refHash = sha256(JSON.stringify(sourceRefs));
  const cacheIdentity = sha256(
    JSON.stringify({
      accepted_run_id: snapshot.accepted_run_id,
      decision_ids: decisionIds,
      source_ref_hash: refHash,
    })
  );

  return {
    acceptedRunId: snapshot.accepted_run_id,
    decisionIds,
    decisionQueries: exactSorted(decisionQueries.filter(Boolean)).slice(0, 16),
    sourceRefs,
    allowedDocumentIds,
    sourceVersionByDocumentId,
    cacheIdentity,
  };
}
