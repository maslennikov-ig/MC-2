import { createHash } from 'node:crypto';
import {
  CourseStructureSchema,
  EvidenceSourceRefSchema,
  Stage5DocumentEvidenceEnrichmentSchema,
  type CourseStructure,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceSnapshot,
  type EvidenceSourceRef,
  type Stage5DocumentEvidenceEnrichment,
} from '@megacampus/shared-types';
import type { SearchResult } from '@/shared/qdrant/search-types';
import type {
  Stage5CurrentEvidenceDecision,
  Stage5EvidenceEnrichmentDependencies,
  Stage5EvidenceEnrichmentInput,
  Stage5EvidenceEnrichmentResult,
  Stage5EvidenceMaterial,
  Stage5EvidencePatcher,
} from './types';

export type { Stage5EvidenceContextRepository } from './types';

const MAX_RESULTS_PER_SECTION = 8;
const MAX_ADDITIONS_PER_SECTION = 2;
const MAX_REFS_PER_SECTION = 16;
const MAX_DOCUMENTS_PER_SECTION_QUERY = 64;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('und');
}

function boundedText(value: string, maxCharacters = 300): string {
  return Array.from(value.normalize('NFKC').replace(/\s+/gu, ' ').trim())
    .slice(0, maxCharacters)
    .join('');
}

function notApplicableRecord(): Stage5DocumentEvidenceEnrichment {
  const body = {
    schema_version: 'stage5-document-evidence-enrichment-v1' as const,
    status: 'not_applicable' as const,
    accepted_run_id: null,
    accepted_decision_ids: [],
    section_evidence: [],
    attempted_patches: 0,
    retrieved_ref_count: 0,
    fallback_section_count: 0,
  };
  return Stage5DocumentEvidenceEnrichmentSchema.parse({
    ...body,
    provenance_hash: sha256(body),
  });
}

function buildRecord(input: {
  status: Exclude<Stage5DocumentEvidenceEnrichment['status'], 'not_applicable'>;
  runId: string;
  decisionIds: string[];
  materials?: Stage5EvidenceMaterial[];
  attemptedPatches?: number;
  fallbackSectionCount?: number;
}): Stage5DocumentEvidenceEnrichment {
  const bySection = new Map<
    number,
    { searchQueries: Set<string>; refs: Map<string, EvidenceSourceRef> }
  >();
  for (const material of input.materials ?? []) {
    const aggregate = bySection.get(material.sectionNumber) ?? {
      searchQueries: new Set<string>(),
      refs: new Map<string, EvidenceSourceRef>(),
    };
    aggregate.searchQueries.add(material.searchQuery);
    for (const ref of material.evidenceRefs) {
      aggregate.refs.set(JSON.stringify(stableValue(ref)), ref);
    }
    bySection.set(material.sectionNumber, aggregate);
  }
  const sectionEvidence = [...bySection.entries()]
    .sort(([left], [right]) => left - right)
    .map(([sectionNumber, aggregate]) => ({
      section_number: sectionNumber,
      search_queries: [...aggregate.searchQueries].sort().slice(0, 4),
      evidence_refs: [...aggregate.refs.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, ref]) => ref)
        .slice(0, MAX_REFS_PER_SECTION),
    }));
  const body = {
    schema_version: 'stage5-document-evidence-enrichment-v1' as const,
    status: input.status,
    accepted_run_id: input.runId,
    accepted_decision_ids: [...new Set(input.decisionIds)].sort(),
    section_evidence: sectionEvidence,
    attempted_patches: input.attemptedPatches ?? 0,
    retrieved_ref_count: sectionEvidence.reduce(
      (total, section) => total + section.evidence_refs.length,
      0
    ),
    fallback_section_count: input.fallbackSectionCount ?? 0,
  };
  return Stage5DocumentEvidenceEnrichmentSchema.parse({
    ...body,
    provenance_hash: sha256(body),
  });
}

export function buildEvidenceFailureRecord(
  snapshot: DocumentEvidenceSnapshot
): Stage5DocumentEvidenceEnrichment {
  return buildRecord({
    status: 'degraded',
    runId: snapshot.accepted_run_id,
    decisionIds: snapshot.current_decision_ids,
  });
}

function exactDecisionIds(
  snapshotIds: string[],
  decisions: Stage5CurrentEvidenceDecision[]
): boolean {
  const expected = [...new Set(snapshotIds)].sort();
  const actual = [...new Set(decisions.map(decision => decision.id))].sort();
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function decisionScopeIsValid(
  decision: Stage5CurrentEvidenceDecision,
  input: Stage5EvidenceEnrichmentInput
): boolean {
  return (
    decision.run_id === input.snapshot?.accepted_run_id &&
    decision.course_id === input.courseId &&
    decision.organization_id === input.organizationId
  );
}

function selectedConflictStatement(
  conflict: DocumentConflict,
  decision: Stage5CurrentEvidenceDecision
): string | undefined {
  const selectedValue = decision.selected_recommendation_value ?? '';
  if (selectedValue === `recommendation:${conflict.conflict_id}`) {
    return conflict.recommended_resolution;
  }
  const alternativePrefix = `alternative:${conflict.conflict_id}:`;
  if (selectedValue.startsWith(alternativePrefix)) {
    const index = Number.parseInt(selectedValue.slice(alternativePrefix.length), 10);
    return Number.isSafeInteger(index) ? conflict.alternatives[index] : undefined;
  }
  const selectedText = normalizedText(decision.selected_resolution);
  return [
    conflict.recommended_resolution,
    ...conflict.alternatives,
    ...conflict.sides.map(side => side.statement),
  ].find(candidate => normalizedText(candidate) === selectedText);
}

function selectedDecisionValue(decision: Stage5CurrentEvidenceDecision): string {
  return decision.selected_recommendation_value ?? decision.selected_resolution;
}

function refKey(ref: Pick<EvidenceSourceRef, 'document_id' | 'chunk_id'>): string {
  return `${ref.document_id}:${ref.chunk_id ?? '*'}`;
}

function resolveDecisionPolicy(input: {
  cards: DocumentEvidenceCard[];
  conflicts: DocumentConflict[];
  decisions: Stage5CurrentEvidenceDecision[];
}): {
  blockedDocumentIds: Set<string>;
  blockedClaimIds: Set<string>;
  blockedStatements: Set<string>;
  blockedRefs: Set<string>;
  removedDocumentIds: Set<string>;
  continueLimited: boolean;
  complete: boolean;
} {
  const blockedDocumentIds = new Set<string>();
  const blockedClaimIds = new Set<string>();
  const blockedStatements = new Set<string>();
  const blockedRefs = new Set<string>();
  const removedDocumentIds = new Set<string>();
  let continueLimited = false;
  let complete = true;
  const claimStatements = new Map(
    input.cards.flatMap(card =>
      card.key_claims.map(claim => [claim.claim_id, claim.statement] as const)
    )
  );

  const decisionsByConflict = new Map(
    input.decisions
      .filter(decision => decision.subject_kind === 'claim_conflict' && decision.conflict_id)
      .map(decision => [decision.conflict_id as string, decision])
  );
  for (const conflict of input.conflicts) {
    if (conflict.severity === 'informational' && !decisionsByConflict.has(conflict.conflict_id)) {
      continue;
    }
    const decision = decisionsByConflict.get(conflict.conflict_id);
    if (!decision) {
      complete = false;
      continue;
    }
    const selected = selectedConflictStatement(conflict, decision);
    const selectedSides = selected
      ? conflict.sides.filter(
          side =>
            normalizedText(side.statement) === normalizedText(selected) ||
            side.claim_ids.some(
              claimId =>
                normalizedText(claimStatements.get(claimId) ?? '') === normalizedText(selected)
            )
        )
      : [];
    const selectedSide = selectedSides.length === 1 ? selectedSides[0] : undefined;
    if (!selectedSide) complete = false;
    const selectedDocuments = new Set(selectedSide?.document_ids ?? []);
    for (const side of conflict.sides) {
      if (side === selectedSide) continue;
      side.claim_ids.forEach(claimId => blockedClaimIds.add(claimId));
      blockedStatements.add(normalizedText(side.statement));
      side.source_refs.forEach(ref => blockedRefs.add(refKey(ref)));
      side.document_ids.forEach(documentId => {
        if (!selectedDocuments.has(documentId)) blockedDocumentIds.add(documentId);
      });
    }
  }

  const degradedDecisions = new Map(
    input.decisions
      .filter(decision => decision.subject_kind === 'degraded_evidence' && decision.document_id)
      .map(decision => [decision.document_id as string, decision])
  );
  for (const card of input.cards) {
    if (card.coverage_status === 'assessed') continue;
    const decision = degradedDecisions.get(card.document_id);
    const selectedValue = decision ? selectedDecisionValue(decision) : undefined;
    if (!decision || !['continue_limited', 'remove_document'].includes(selectedValue ?? '')) {
      complete = false;
    }
  }

  for (const decision of input.decisions) {
    const selectedValue = selectedDecisionValue(decision);
    if (decision.subject_kind === 'degraded_evidence' && decision.document_id) {
      if (selectedValue === 'remove_document') {
        removedDocumentIds.add(decision.document_id);
      }
      if (selectedValue === 'continue_limited') continueLimited = true;
    }
    if (decision.subject_kind === 'detector_capacity' && selectedValue === 'continue_limited') {
      continueLimited = true;
    }
  }

  return {
    blockedDocumentIds,
    blockedClaimIds,
    blockedStatements,
    blockedRefs,
    removedDocumentIds,
    continueLimited,
    complete,
  };
}

function sourceVersion(card: DocumentEvidenceCard): string | undefined {
  const versions = new Set(
    card.key_claims
      .flatMap(claim => claim.source_refs)
      .map(ref => ref.version_hash)
      .filter((version): version is string => typeof version === 'string')
  );
  return versions.size === 1 ? [...versions][0] : undefined;
}

function compareCardPriority(left: DocumentEvidenceCard, right: DocumentEvidenceCard): number {
  const priorityRank = { CORE: 0, IMPORTANT: 1, SUPPLEMENTARY: 2 } as const;
  const authorityRank = {
    organization_specific: 0,
    course_source: 1,
    general_reference: 2,
    unknown: 3,
  } as const;
  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    authorityRank[left.authority_scope] - authorityRank[right.authority_scope] ||
    right.course_relevance - left.course_relevance ||
    right.content_quality - left.content_quality ||
    left.document_id.localeCompare(right.document_id)
  );
}

function resultRef(
  result: SearchResult,
  input: Stage5EvidenceEnrichmentInput,
  expectedVersion: string,
  blockedRefs: Set<string>
): EvidenceSourceRef | undefined {
  const payload = result.payload;
  if (
    !payload ||
    payload.organization_id !== input.organizationId ||
    payload.course_id !== input.courseId ||
    payload.version_hash !== expectedVersion ||
    blockedRefs.has(refKey({ document_id: result.document_id, chunk_id: result.chunk_id })) ||
    blockedRefs.has(refKey({ document_id: result.document_id }))
  ) {
    return undefined;
  }
  const parsed = EvidenceSourceRefSchema.safeParse({
    document_id: result.document_id,
    chunk_id: result.chunk_id,
    ...(result.page_number ? { page_number: result.page_number } : {}),
    ...(result.heading_path ? { heading_path: boundedText(result.heading_path, 240) } : {}),
    version_hash: expectedVersion,
  });
  return parsed.success ? parsed.data : undefined;
}

function buildSearchQuery(structure: CourseStructure, sectionIndex: number): string {
  const section = structure.sections[sectionIndex];
  const topics = section.lessons.flatMap(lesson => lesson.key_topics).slice(0, 2);
  return boundedText([section.section_title, ...topics].join(' '), 300);
}

function buildAdditions(
  card: DocumentEvidenceCard,
  policy: ReturnType<typeof resolveDecisionPolicy>,
  returnedRefs: EvidenceSourceRef[]
): string[] {
  return card.key_claims
    .filter(claim => !policy.blockedClaimIds.has(claim.claim_id))
    .filter(claim =>
      claim.source_refs.some(claimRef =>
        returnedRefs.some(
          returnedRef =>
            claimRef.document_id === returnedRef.document_id &&
            typeof claimRef.chunk_id === 'string' &&
            claimRef.chunk_id === returnedRef.chunk_id &&
            typeof claimRef.version_hash === 'string' &&
            claimRef.version_hash === returnedRef.version_hash
        )
      )
    )
    .map(claim => claim.statement)
    .map(value => boundedText(value, 300))
    .filter(value => value.length >= 5 && !policy.blockedStatements.has(normalizedText(value)))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, MAX_ADDITIONS_PER_SECTION);
}

const deterministicPatcher: Stage5EvidencePatcher = ({ baseline, materials }) => {
  const candidate = structuredClone(baseline);
  const additionsBySection = new Map<number, string[]>();
  for (const material of materials) {
    const existing = additionsBySection.get(material.sectionNumber) ?? [];
    for (const addition of material.additions) {
      if (!existing.includes(addition)) existing.push(addition);
    }
    additionsBySection.set(material.sectionNumber, existing.slice(0, MAX_ADDITIONS_PER_SECTION));
  }
  for (const [sectionNumber, additions] of additionsBySection) {
    const section = candidate.sections.find(
      (value, index) => (value.section_number ?? index + 1) === sectionNumber
    );
    const lesson = section?.lessons[0];
    if (!lesson) continue;
    for (const addition of additions) {
      if (lesson.key_topics.length >= 10) break;
      if (!lesson.key_topics.includes(addition)) lesson.key_topics.push(addition);
    }
  }
  return candidate;
};

function nonDestructiveViolations(baseline: CourseStructure, candidate: CourseStructure): string[] {
  const violations: string[] = [];
  if (candidate.sections.length !== baseline.sections.length) {
    violations.push('sections_removed_or_reordered');
    return violations;
  }
  const courseFields: Array<keyof CourseStructure> = [
    'course_title',
    'course_description',
    'estimated_duration_hours',
    'difficulty_level',
    'prerequisites',
    'learning_outcomes',
    'course_tags',
  ];
  if (
    courseFields.some(field => JSON.stringify(candidate[field]) !== JSON.stringify(baseline[field]))
  ) {
    violations.push('baseline_course_metadata_changed');
  }
  baseline.sections.forEach((baselineSection, sectionIndex) => {
    const candidateSection = candidate.sections[sectionIndex];
    if (
      candidateSection.section_number !== baselineSection.section_number ||
      candidateSection.section_title !== baselineSection.section_title ||
      candidateSection.section_description !== baselineSection.section_description ||
      JSON.stringify(candidateSection.learning_objectives) !==
        JSON.stringify(baselineSection.learning_objectives) ||
      candidateSection.lessons.length !== baselineSection.lessons.length
    ) {
      violations.push('sections_removed_or_reordered');
      return;
    }
    baselineSection.lessons.forEach((baselineLesson, lessonIndex) => {
      const candidateLesson = candidateSection.lessons[lessonIndex];
      if (
        candidateLesson.lesson_number !== baselineLesson.lesson_number ||
        candidateLesson.lesson_title !== baselineLesson.lesson_title ||
        candidateLesson.estimated_duration_minutes !== baselineLesson.estimated_duration_minutes ||
        JSON.stringify(candidateLesson.lesson_objectives) !==
          JSON.stringify(baselineLesson.lesson_objectives) ||
        baselineLesson.key_topics.some(
          (topic, topicIndex) => candidateLesson.key_topics[topicIndex] !== topic
        )
      ) {
        violations.push('baseline_lesson_changed_or_required_topic_removed');
      }
    });
  });
  return [...new Set(violations)];
}

function validateCandidate(
  baseline: CourseStructure,
  candidate: CourseStructure,
  input: Stage5EvidenceEnrichmentInput,
  dependencies: Stage5EvidenceEnrichmentDependencies
): string[] {
  const violations = nonDestructiveViolations(baseline, candidate);
  const schema = CourseStructureSchema.safeParse(candidate);
  if (!schema.success) violations.push('course_structure_schema_or_size_violation');
  violations.push(...(input.validateCandidate?.(candidate) ?? []));
  violations.push(...(dependencies.validateCandidate?.(candidate) ?? []));
  return [...new Set(violations)];
}

export async function enrichBaselineWithDocumentEvidence(
  input: Stage5EvidenceEnrichmentInput,
  dependencies: Stage5EvidenceEnrichmentDependencies
): Promise<Stage5EvidenceEnrichmentResult> {
  if (!input.snapshot) {
    return { courseStructure: input.baseline, enrichment: notApplicableRecord() };
  }

  const runId = input.snapshot.accepted_run_id;
  let cards: DocumentEvidenceCard[];
  let conflicts: DocumentConflict[];
  let decisions: Stage5CurrentEvidenceDecision[];
  try {
    await dependencies.repository.getAcceptedRun(runId, input.courseId, input.organizationId);
    [cards, conflicts, decisions] = await Promise.all([
      dependencies.repository.listItems(runId),
      dependencies.repository.listConflicts(runId),
      dependencies.repository.getLatestDecisions(runId),
    ]);
    if (
      !exactDecisionIds(input.snapshot.current_decision_ids, decisions) ||
      decisions.some(decision => !decisionScopeIsValid(decision, input))
    ) {
      throw new Error('stale_or_cross_tenant_decision_snapshot');
    }
  } catch (error) {
    dependencies.log?.warn(
      {
        courseId: input.courseId,
        runId,
        category: 'evidence_context_rejected',
        errorName: error instanceof Error ? error.name : 'unknown',
      },
      'Stage 5 evidence context was rejected'
    );
    return {
      courseStructure: input.baseline,
      enrichment: buildRecord({
        status: 'degraded',
        runId,
        decisionIds: input.snapshot.current_decision_ids,
      }),
    };
  }

  const actualCoverage = {
    source_count: cards.length,
    assessed_count: cards.filter(card => card.coverage_status === 'assessed').length,
    degraded_count: cards.filter(card => card.coverage_status === 'degraded').length,
    failed_count: cards.filter(card => card.coverage_status === 'failed').length,
  };
  if (JSON.stringify(actualCoverage) !== JSON.stringify(input.snapshot.coverage)) {
    return {
      courseStructure: input.baseline,
      enrichment: buildRecord({
        status: 'degraded',
        runId,
        decisionIds: decisions.map(value => value.id),
      }),
    };
  }

  const policy = resolveDecisionPolicy({ cards, conflicts, decisions });
  if (!policy.complete) {
    return {
      courseStructure: input.baseline,
      enrichment: buildRecord({
        status: 'degraded',
        runId,
        decisionIds: decisions.map(value => value.id),
      }),
    };
  }
  const eligibleCards = cards
    .filter(card => card.coverage_status !== 'failed')
    .filter(card => !policy.removedDocumentIds.has(card.document_id))
    .filter(card => !policy.blockedDocumentIds.has(card.document_id))
    .filter(card => sourceVersion(card) !== undefined)
    .sort(compareCardPriority)
    .slice(0, MAX_DOCUMENTS_PER_SECTION_QUERY);
  const cardsById = new Map(eligibleCards.map(card => [card.document_id, card]));
  const allowedDocumentIds = eligibleCards.map(card => card.document_id);

  if (allowedDocumentIds.length === 0) {
    return {
      courseStructure: input.baseline,
      enrichment: buildRecord({
        status: 'no_relevant_evidence',
        runId,
        decisionIds: decisions.map(value => value.id),
      }),
    };
  }

  const materials: Stage5EvidenceMaterial[] = [];
  let failedQueries = 0;
  let fallbackSectionCount = 0;
  for (let sectionIndex = 0; sectionIndex < input.baseline.sections.length; sectionIndex++) {
    const section = input.baseline.sections[sectionIndex];
    const sectionNumber = section.section_number ?? sectionIndex + 1;
    const query = buildSearchQuery(input.baseline, sectionIndex);
    try {
      const response = await dependencies.search(query, {
        limit: MAX_RESULTS_PER_SECTION,
        score_threshold: 0.7,
        enable_hybrid: true,
        include_payload: true,
        enable_priority_boost: true,
        group_by_document: true,
        group_size: 2,
        filters: {
          organization_id: input.organizationId,
          course_id: input.courseId,
          document_ids: allowedDocumentIds,
        },
      });
      if (response.metadata.fallback_used) fallbackSectionCount += 1;
      const refsByDocument = new Map<string, Map<string, EvidenceSourceRef>>();
      for (const result of response.results) {
        const card = cardsById.get(result.document_id);
        const expectedVersion = card ? sourceVersion(card) : undefined;
        if (!card || !expectedVersion) continue;
        const ref = resultRef(result, input, expectedVersion, policy.blockedRefs);
        if (!ref) continue;
        const refs = refsByDocument.get(card.document_id) ?? new Map<string, EvidenceSourceRef>();
        refs.set(JSON.stringify(stableValue(ref)), ref);
        refsByDocument.set(card.document_id, refs);
      }
      for (const [documentId, refs] of [...refsByDocument.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const card = cardsById.get(documentId);
        if (!card) continue;
        const evidenceRefs = [...refs.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([, ref]) => ref)
          .slice(0, MAX_REFS_PER_SECTION);
        const additions = buildAdditions(card, policy, evidenceRefs);
        if (additions.length === 0) continue;
        materials.push({
          sectionNumber,
          documentId,
          additions,
          evidenceRefs,
          searchQuery: query,
        });
      }
    } catch (error) {
      failedQueries += 1;
      dependencies.log?.warn(
        {
          courseId: input.courseId,
          runId,
          sectionNumber,
          category: 'qdrant_unavailable',
          errorName: error instanceof Error ? error.name : 'unknown',
        },
        'Stage 5 advisory retrieval was unavailable'
      );
    }
  }

  if (materials.length === 0) {
    const status =
      failedQueries > 0
        ? policy.continueLimited
          ? 'failed_open_with_decision'
          : 'degraded'
        : fallbackSectionCount > 0
          ? 'degraded'
          : 'no_relevant_evidence';
    return {
      courseStructure: input.baseline,
      enrichment: buildRecord({
        status,
        runId,
        decisionIds: decisions.map(value => value.id),
        fallbackSectionCount,
      }),
    };
  }

  const patcher = dependencies.patcher ?? deterministicPatcher;
  let violations: string[] = [];
  for (const attempt of [1, 2] as const) {
    const candidate = await patcher({ baseline: input.baseline, materials, attempt, violations });
    violations = validateCandidate(input.baseline, candidate, input, dependencies);
    if (violations.length === 0) {
      const changed = JSON.stringify(candidate) !== JSON.stringify(input.baseline);
      const status = changed
        ? failedQueries > 0 || fallbackSectionCount > 0
          ? 'degraded'
          : 'applied'
        : 'no_relevant_evidence';
      const persistedMaterials = changed ? materials : [];
      const enrichment = buildRecord({
        status,
        runId,
        decisionIds: decisions.map(value => value.id),
        materials: persistedMaterials,
        attemptedPatches: attempt,
        fallbackSectionCount,
      });
      dependencies.log?.info(
        {
          courseId: input.courseId,
          runId,
          status,
          sectionCount: enrichment.section_evidence.length,
          refCount: enrichment.retrieved_ref_count,
        },
        'Stage 5 advisory evidence pass completed'
      );
      return { courseStructure: changed ? candidate : input.baseline, enrichment };
    }
  }

  return {
    courseStructure: input.baseline,
    enrichment: buildRecord({
      status: policy.continueLimited ? 'failed_open_with_decision' : 'degraded',
      runId,
      decisionIds: decisions.map(value => value.id),
      attemptedPatches: 2,
      fallbackSectionCount,
    }),
  };
}
