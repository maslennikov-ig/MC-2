import { createHash } from 'node:crypto';
import {
  DocumentConflictSchema,
  DocumentEvidenceCardsSchema,
  DocumentEvidenceQuestionMetadataSchema,
  type DocumentConflict,
  type DocumentEvidenceCard,
  type DocumentEvidenceQuestionMetadata,
  type EvidenceSourceRef,
} from '@megacampus/shared-types';
import type { DetectorCapacityIssue } from './conflict-detector';
import { buildDocumentConflictSideHandle } from './side-handle';

export interface DocumentEvidenceSuggestedAnswer {
  value: string;
  text: string;
  rationale: string;
  is_recommended: boolean;
}

export type DocumentEvidenceDecisionSubject =
  | { kind: 'claim_conflict'; conflict: DocumentConflict }
  | {
      kind: 'degraded_evidence';
      card: DocumentEvidenceCard;
      attempt: number;
      maxAttempts: number;
    }
  | { kind: 'detector_capacity'; issue: DetectorCapacityIssue };

export interface DocumentEvidenceQuestion {
  questionId: string;
  subjectKey: string;
  subjectKind: DocumentEvidenceDecisionSubject['kind'];
  category: 'document_conflicts';
  priority: 'critical' | 'important';
  questionText: string;
  suggestedAnswers: DocumentEvidenceSuggestedAnswer[];
  metadata: DocumentEvidenceQuestionMetadata;
}

export interface CurrentEvidenceDecision {
  id: string;
  subject_key: string;
  resolved_by?: 'user' | 'system';
  subject_kind?: 'claim_conflict' | 'degraded_evidence' | 'detector_capacity';
}

export interface DocumentDecisionRepository {
  getAcceptedRun(
    runId: string,
    courseId: string,
    organizationId: string
  ): Promise<{ id: string; status: 'accepted' }>;
  listConflicts(runId: string): Promise<DocumentConflict[]>;
  listItems(runId: string): Promise<DocumentEvidenceCard[]>;
  listDetectorCapacityIssues(runId: string): Promise<DetectorCapacityIssue[]>;
  listCurrentDecisions(runId: string): Promise<CurrentEvidenceDecision[]>;
  getDegradedRetryState(input: {
    runId: string;
    documentId: string;
    configuredMaxAttempts: number;
  }): Promise<{ attempt: number; maxAttempts: number }>;
  materializeDecisionGateAtomic(input: {
    runId: string;
    courseId: string;
    organizationId: string;
    mode: 'manual' | 'automatic';
    questions: DocumentEvidenceQuestion[];
    gateIdempotencyKey: string;
  }): Promise<{ question_ids: string[]; decision_ids: string[]; reused: boolean }>;
}

interface DecisionLogger {
  info(value: Record<string, unknown>, message: string): void;
}

export interface ResolveDocumentEvidenceDecisionsInput {
  runId: string;
  courseId: string;
  organizationId: string;
  language: 'ru' | 'en';
  mode: 'manual' | 'automatic';
  maxUiExcerptChars: number;
  maxSourceRefsPerSide: number;
  maxDocumentsInMetadata: number;
  maxEvidenceRetryAttempts: number;
  automaticCapacityPolicy: 'continue_limited' | 'manual_only';
}

export interface ResolveDocumentEvidenceDecisionsDependencies {
  repository: DocumentDecisionRepository;
  log?: DecisionLogger;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableUuidV8(value: string): string {
  const chars = sha256(value).slice(0, 32).split('');
  chars[12] = '8';
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars
    .slice(12, 16)
    .join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20).join('')}`;
}

function sanitizePlainText(value: string, maxCharacters: number): string {
  const normalized = value.normalize('NFKC').replace(/<[^>]*>/gu, ' ');
  const withoutControlCharacters = Array.from(normalized, character => {
    const codePoint = character.codePointAt(0) ?? -1;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? ' ' : character;
  }).join('');
  return Array.from(withoutControlCharacters.replace(/\s+/gu, ' ').trim())
    .slice(0, maxCharacters)
    .join('');
}

function subjectIdentity(subject: DocumentEvidenceDecisionSubject): string {
  if (subject.kind === 'claim_conflict') return `conflict:${subject.conflict.conflict_id}`;
  if (subject.kind === 'degraded_evidence') {
    return `degraded:${subject.card.document_id}:${subject.card.coverage_status}:${subject.card.coverage_reason}:${subject.attempt}`;
  }
  return `capacity:${subject.issue.call_plan_hash}:${subject.issue.config_hash}`;
}

function subjectKey(runId: string, subject: DocumentEvidenceDecisionSubject): string {
  return `sha256:${sha256(`document-evidence-subject-v1:${runId}:${subjectIdentity(subject)}`)}`;
}

function boundedRef(ref: EvidenceSourceRef): EvidenceSourceRef {
  return {
    document_id: ref.document_id,
    ...(ref.chunk_id ? { chunk_id: sanitizePlainText(ref.chunk_id, 240) } : {}),
    ...(ref.page_number ? { page_number: ref.page_number } : {}),
    ...(ref.heading_path ? { heading_path: sanitizePlainText(ref.heading_path, 240) } : {}),
    ...(ref.version_hash ? { version_hash: sanitizePlainText(ref.version_hash, 240) } : {}),
  };
}

function uniqueAnswers(
  answers: DocumentEvidenceSuggestedAnswer[]
): DocumentEvidenceSuggestedAnswer[] {
  const result = new Map<string, DocumentEvidenceSuggestedAnswer>();
  for (const answer of answers) {
    if (!result.has(answer.value)) result.set(answer.value, answer);
  }
  const values = [...result.values()];
  if (values.filter(answer => answer.is_recommended).length !== 1) {
    throw new Error('Document evidence question requires exactly one recommended option');
  }
  return values;
}

function conflictQuestion(input: {
  runId: string;
  language: 'ru' | 'en';
  subjectKey: string;
  conflict: DocumentConflict;
  documentNames: Map<string, string>;
  maxUiExcerptChars: number;
  maxSourceRefsPerSide: number;
  maxDocumentsInMetadata: number;
}): Omit<DocumentEvidenceQuestion, 'questionId' | 'subjectKey' | 'subjectKind'> {
  const conflict = DocumentConflictSchema.parse(input.conflict);
  const sideHandles = conflict.sides.map(side => side.side_handle);
  if (
    sideHandles.some(handle => !handle) ||
    conflict.sides.some(
      side =>
        side.side_handle !== buildDocumentConflictSideHandle(conflict.conflict_id, side.claim_ids)
    ) ||
    !conflict.recommended_side_handle ||
    !sideHandles.includes(conflict.recommended_side_handle) ||
    conflict.sides.filter(side => side.side_role === 'recommended').length !== 1 ||
    conflict.sides.find(side => side.side_role === 'recommended')?.side_handle !==
      conflict.recommended_side_handle ||
    !conflict.alternative_side_handles ||
    conflict.alternative_side_handles.length !== conflict.alternatives.length ||
    conflict.alternative_side_handles.some(
      handle => !sideHandles.includes(handle) || handle === conflict.recommended_side_handle
    ) ||
    conflict.alternative_side_handles.some(
      (handle, index) =>
        conflict.sides.find(side => side.alternative_index === index)?.side_handle !== handle
    )
  ) {
    throw new Error('Document conflict lacks a complete durable side identity projection');
  }
  const allDocumentIds = [...new Set(conflict.sides.flatMap(side => side.document_ids))].sort();
  const shownDocuments = allDocumentIds.slice(0, input.maxDocumentsInMetadata);
  const metadata = DocumentEvidenceQuestionMetadataSchema.parse({
    schema_version: 'document-conflict-question-v1',
    subject_kind: 'claim_conflict',
    subject_key: input.subjectKey,
    run_id: input.runId,
    conflict_id: conflict.conflict_id,
    document_ids: shownDocuments,
    documents: shownDocuments.map(documentId => ({
      document_id: documentId,
      document_name: sanitizePlainText(
        input.documentNames.get(documentId) ?? `Document ${documentId.slice(0, 8)}`,
        300
      ),
    })),
    document_overflow_count: allDocumentIds.length - shownDocuments.length,
    sides: conflict.sides.slice(0, 8).map(side => ({
      side_handle: side.side_handle,
      excerpt: sanitizePlainText(side.statement, input.maxUiExcerptChars),
      source_refs: side.source_refs.slice(0, input.maxSourceRefsPerSide).map(boundedRef),
      source_ref_overflow_count: Math.max(0, side.source_refs.length - input.maxSourceRefsPerSide),
    })),
    provenance_handle: `sha256:${sha256(
      JSON.stringify({ fingerprint: conflict.conflict_fingerprint, sides: conflict.sides })
    )}`,
    course_impact: sanitizePlainText(conflict.course_impact, 1_200),
    recommendation: sanitizePlainText(conflict.recommended_resolution, 1_200),
    recommended_side_handle: conflict.recommended_side_handle,
    recommendation_rationale: sanitizePlainText(conflict.recommendation_rationale, 1_200),
    alternatives: conflict.alternatives
      .map(value => sanitizePlainText(value, 1_200))
      .filter(value => value.length > 0)
      .slice(0, 16),
    alternative_side_handles: conflict.alternative_side_handles,
  });
  if (metadata.subject_kind !== 'claim_conflict') throw new Error('Invalid conflict metadata');
  const recommendation: DocumentEvidenceSuggestedAnswer = {
    value: conflict.recommended_side_handle,
    text: metadata.recommendation,
    rationale: metadata.recommendation_rationale,
    is_recommended: true,
  };
  const alternatives = metadata.alternatives.map((text, index) => ({
    value: conflict.alternative_side_handles![index],
    text,
    rationale: metadata.recommendation_rationale,
    is_recommended: false,
  }));
  return {
    category: 'document_conflicts',
    priority: conflict.severity === 'critical' ? 'critical' : 'important',
    questionText:
      input.language === 'ru'
        ? `Как разрешить противоречие «${sanitizePlainText(conflict.topic, 240)}»?`
        : `How should “${sanitizePlainText(conflict.topic, 240)}” be resolved?`,
    suggestedAnswers: uniqueAnswers([...alternatives, recommendation]),
    metadata,
  };
}

const degradedCopy = {
  en: {
    retry: [
      'Retry evidence processing',
      'Repeat the same bounded configuration for a transient failure.',
    ],
    continue_limited: [
      'Continue with limited evidence',
      'Preserve the degraded audit and continue.',
    ],
    remove_document: [
      'Exclude from advisory evidence',
      'Keep source history but exclude this card downstream.',
    ],
  },
  ru: {
    retry: [
      'Повторить обработку данных',
      'Повторить ту же ограниченную конфигурацию после временного сбоя.',
    ],
    continue_limited: [
      'Продолжить с ограниченными данными',
      'Сохранить аудит деградации и продолжить.',
    ],
    remove_document: [
      'Исключить из рекомендательных данных',
      'Сохранить источник, но исключить карточку ниже по конвейеру.',
    ],
  },
} as const;

function isTerminalUnrecoverableSource(card: DocumentEvidenceCard): boolean {
  return card.coverage_status === 'failed' && card.coverage_reason === 'source_file_unrecoverable';
}

function degradedQuestion(input: {
  runId: string;
  language: 'ru' | 'en';
  subjectKey: string;
  card: DocumentEvidenceCard;
  attempt: number;
  maxAttempts: number;
}): Omit<DocumentEvidenceQuestion, 'questionId' | 'subjectKey' | 'subjectKind'> {
  const canRetry = !isTerminalUnrecoverableSource(input.card) && input.attempt < input.maxAttempts;
  const choices = canRetry
    ? (['retry', 'continue_limited', 'remove_document'] as const)
    : (['continue_limited', 'remove_document'] as const);
  const metadata = DocumentEvidenceQuestionMetadataSchema.parse({
    schema_version: 'document-conflict-question-v1',
    subject_kind: 'degraded_evidence',
    subject_key: input.subjectKey,
    run_id: input.runId,
    document_id: input.card.document_id,
    document_name: sanitizePlainText(input.card.document_name, 300),
    coverage_status: input.card.coverage_status,
    coverage_reason: sanitizePlainText(input.card.coverage_reason, 300),
    attempt: input.attempt,
    max_attempts: input.maxAttempts,
    choices,
  });
  const copy = degradedCopy[input.language];
  return {
    category: 'document_conflicts',
    priority: 'important',
    questionText:
      input.language === 'ru'
        ? `Как продолжить работу с документом «${sanitizePlainText(input.card.document_name, 300)}»?`
        : `How should evidence processing continue for “${sanitizePlainText(input.card.document_name, 300)}”?`,
    suggestedAnswers: uniqueAnswers(
      choices.map(value => ({
        value,
        text: copy[value][0],
        rationale: copy[value][1],
        is_recommended: value === 'continue_limited',
      }))
    ),
    metadata,
  };
}

function capacityQuestion(input: {
  runId: string;
  language: 'ru' | 'en';
  subjectKey: string;
  issue: DetectorCapacityIssue;
}): Omit<DocumentEvidenceQuestion, 'questionId' | 'subjectKey' | 'subjectKind'> {
  const metadata = DocumentEvidenceQuestionMetadataSchema.parse({
    schema_version: 'document-conflict-question-v1',
    subject_kind: 'detector_capacity',
    subject_key: input.subjectKey,
    run_id: input.runId,
    reason: 'detector_capacity_degraded',
    call_plan_hash: input.issue.call_plan_hash,
    config_hash: input.issue.config_hash,
  });
  return {
    category: 'document_conflicts',
    priority: 'important',
    questionText:
      input.language === 'ru'
        ? 'Как продолжить после превышения безопасной ёмкости проверки противоречий?'
        : 'How should the course proceed after the safe conflict-detector capacity was exceeded?',
    suggestedAnswers: uniqueAnswers([
      {
        value: 'abort_adjust_sources',
        text:
          input.language === 'ru'
            ? 'Остановиться и изменить набор источников'
            : 'Stop and adjust source selection',
        rationale:
          input.language === 'ru'
            ? 'Требует явного изменения корпуса или конфигурации оператором.'
            : 'Requires an operator to materially change the corpus or configuration.',
        is_recommended: false,
      },
      {
        value: 'continue_limited',
        text:
          input.language === 'ru'
            ? 'Продолжить с ограниченной проверкой'
            : 'Continue with limited conflict verification',
        rationale:
          input.language === 'ru'
            ? 'Сохраняет явный аудит ограничения.'
            : 'Preserves an explicit capacity audit.',
        is_recommended: true,
      },
    ]),
    metadata,
  };
}

export function buildDocumentEvidenceQuestion(input: {
  runId: string;
  language: 'ru' | 'en';
  subject: DocumentEvidenceDecisionSubject;
  documentNames: Map<string, string>;
  maxUiExcerptChars: number;
  maxSourceRefsPerSide: number;
  maxDocumentsInMetadata: number;
}): DocumentEvidenceQuestion {
  if (
    !Number.isSafeInteger(input.maxUiExcerptChars) ||
    input.maxUiExcerptChars < 32 ||
    input.maxUiExcerptChars > 2_000 ||
    !Number.isSafeInteger(input.maxSourceRefsPerSide) ||
    input.maxSourceRefsPerSide < 1 ||
    input.maxSourceRefsPerSide > 32 ||
    !Number.isSafeInteger(input.maxDocumentsInMetadata) ||
    input.maxDocumentsInMetadata < 1 ||
    input.maxDocumentsInMetadata > 64
  ) {
    throw new Error('Document evidence question bounds are invalid');
  }
  const key = subjectKey(input.runId, input.subject);
  const body =
    input.subject.kind === 'claim_conflict'
      ? conflictQuestion({ ...input, subjectKey: key, conflict: input.subject.conflict })
      : input.subject.kind === 'degraded_evidence'
        ? degradedQuestion({
            runId: input.runId,
            language: input.language,
            subjectKey: key,
            card: input.subject.card,
            attempt: input.subject.attempt,
            maxAttempts: input.subject.maxAttempts,
          })
        : capacityQuestion({
            runId: input.runId,
            language: input.language,
            subjectKey: key,
            issue: input.subject.issue,
          });
  return {
    questionId: stableUuidV8(`document-conflict-question-v1:${input.runId}:${key}`),
    subjectKey: key,
    subjectKind: input.subject.kind,
    ...body,
  };
}

export async function resolveDocumentEvidenceDecisions(
  input: ResolveDocumentEvidenceDecisionsInput,
  dependencies: ResolveDocumentEvidenceDecisionsDependencies
): Promise<{
  pauseRequired: boolean;
  requiredQuestionIds: string[];
  currentDecisionIds: string[];
  unresolvedInformationalConflictIds: string[];
  decisionSummary?: { user: number; system: number; degradedAutomatic: number };
  unresolvedCriticalConflictCount?: number;
}> {
  const run = await dependencies.repository.getAcceptedRun(
    input.runId,
    input.courseId,
    input.organizationId
  );
  if (run.id !== input.runId || run.status !== 'accepted') {
    throw new Error('Document decisions require the accepted persisted evidence run');
  }
  const conflicts = DocumentConflictSchema.array().parse(
    await dependencies.repository.listConflicts(input.runId)
  );
  const cards = DocumentEvidenceCardsSchema.parse(
    await dependencies.repository.listItems(input.runId)
  );
  const capacityIssues = await dependencies.repository.listDetectorCapacityIssues(input.runId);
  const current = await dependencies.repository.listCurrentDecisions(input.runId);
  const currentKeys = new Set(current.map(value => value.subject_key));
  const documentNames = new Map(cards.map(card => [card.document_id, card.document_name]));
  const subjects: DocumentEvidenceDecisionSubject[] = [];
  const unresolvedInformationalConflictIds: string[] = [];
  let unresolvedCriticalConflictCount = 0;

  for (const conflict of [...conflicts].sort((a, b) =>
    a.conflict_id.localeCompare(b.conflict_id)
  )) {
    const subject: DocumentEvidenceDecisionSubject = { kind: 'claim_conflict', conflict };
    const key = subjectKey(input.runId, subject);
    if (conflict.severity === 'informational') {
      if (!currentKeys.has(key)) unresolvedInformationalConflictIds.push(conflict.conflict_id);
    } else if (!currentKeys.has(key)) {
      subjects.push(subject);
      if (conflict.severity === 'critical') unresolvedCriticalConflictCount += 1;
    }
  }
  for (const issue of capacityIssues) {
    const subject: DocumentEvidenceDecisionSubject = { kind: 'detector_capacity', issue };
    if (!currentKeys.has(subjectKey(input.runId, subject))) subjects.push(subject);
  }
  for (const evidenceCard of cards
    .filter(value => value.coverage_status === 'degraded' || value.coverage_status === 'failed')
    .sort((a, b) => a.document_id.localeCompare(b.document_id))) {
    const retry = await dependencies.repository.getDegradedRetryState({
      runId: input.runId,
      documentId: evidenceCard.document_id,
      configuredMaxAttempts: input.maxEvidenceRetryAttempts,
    });
    if (
      input.mode === 'automatic' &&
      !isTerminalUnrecoverableSource(evidenceCard) &&
      retry.attempt < retry.maxAttempts
    ) {
      throw new Error('Evidence retry is not exhausted; automatic degraded decision is forbidden');
    }
    const subject: DocumentEvidenceDecisionSubject = {
      kind: 'degraded_evidence',
      card: evidenceCard,
      attempt: retry.attempt,
      maxAttempts: retry.maxAttempts,
    };
    if (!currentKeys.has(subjectKey(input.runId, subject))) subjects.push(subject);
  }
  if (
    input.mode === 'automatic' &&
    capacityIssues.length > 0 &&
    input.automaticCapacityPolicy !== 'continue_limited'
  ) {
    throw new Error('Automatic detector-capacity continuation policy is not approved');
  }

  const questions = subjects.map(subject =>
    buildDocumentEvidenceQuestion({
      runId: input.runId,
      language: input.language,
      subject,
      documentNames,
      maxUiExcerptChars: input.maxUiExcerptChars,
      maxSourceRefsPerSide: input.maxSourceRefsPerSide,
      maxDocumentsInMetadata: input.maxDocumentsInMetadata,
    })
  );
  const materialized = await dependencies.repository.materializeDecisionGateAtomic({
    runId: input.runId,
    courseId: input.courseId,
    organizationId: input.organizationId,
    mode: input.mode,
    questions,
    gateIdempotencyKey: stableUuidV8(
      `document-decision-gate-v1:${input.runId}:${sha256(JSON.stringify(questions))}`
    ),
  });
  const decisionIds = [
    ...new Set([...current.map(value => value.id), ...materialized.decision_ids]),
  ].sort();
  const automaticQuestions = input.mode === 'automatic' ? questions : [];
  dependencies.log?.info(
    {
      mode: input.mode,
      requiredQuestionCount: materialized.question_ids.length,
      currentDecisionCount: decisionIds.length,
      unresolvedInformationalCount: unresolvedInformationalConflictIds.length,
    },
    'Document evidence decision gate complete'
  );
  return {
    pauseRequired: input.mode === 'manual' && materialized.question_ids.length > 0,
    requiredQuestionIds: [...materialized.question_ids].sort(),
    currentDecisionIds: decisionIds,
    unresolvedInformationalConflictIds: unresolvedInformationalConflictIds.sort(),
    decisionSummary: {
      user: current.filter(value => value.resolved_by === 'user').length,
      system:
        current.filter(value => value.resolved_by === 'system').length + automaticQuestions.length,
      degradedAutomatic: automaticQuestions.filter(
        question => question.subjectKind === 'degraded_evidence'
      ).length,
    },
    unresolvedCriticalConflictCount,
  };
}
