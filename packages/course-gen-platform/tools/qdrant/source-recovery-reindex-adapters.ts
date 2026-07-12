import { isAbsolute, resolve } from 'node:path';

import { DocumentEvidenceCardsSchema } from '@megacampus/shared-types';
import {
  DocumentEvidenceRepository,
  type DocumentEvidenceDatabaseClient,
} from '../../src/stages/stage4-analysis/evidence/repository';
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  calculateAcceptedFailedCoverageFingerprint,
  type AcceptedFailedCoverageBinding,
  type AcceptedFailedCoverageEntry,
  type AcceptedFailedCoverageLedgerBinding,
  type RecoveryReindexBinding,
} from './reindex-plan';
import {
  loadReviewedRecoveryState,
  persistRecoveryJournalTransition as persistAcceptedRecoveryJournalTransition,
  type ReviewedRecoveryState,
} from './source-recovery';
import {
  calculateRecoveryManifestSha256,
  validateRecoveryProgressJournalBinding,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from './source-recovery-manifest';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export interface AcceptedCoverageRunConfig {
  organizationId: string;
  courseId: string;
  runId: string;
}

export interface SourceRecoveryReindexAdapterConfig {
  manifestPath: string;
  journalPath: string;
  expectedRecoveryRunId: string;
  expectedRecoveryManifestSha256: string;
  expectedCoverageFingerprint: string;
  acceptedCoverageRuns: readonly AcceptedCoverageRunConfig[];
}

export interface SourceRecoveryReindexEvidenceRepository {
  getAcceptedRun(
    runId: string,
    courseId: string,
    organizationId: string
  ): Promise<{ id: string; status: 'accepted' }>;
  listItems(runId: string): Promise<unknown>;
}

export interface SourceRecoveryReindexAdapterDependencies {
  loadReviewedRecoveryState(input: {
    manifestPath: string;
    journalPath: string;
  }): Promise<ReviewedRecoveryState>;
  persistRecoveryJournalTransition(input: {
    journalPath: string;
    manifest: SourceRecoveryManifest;
    current: RecoveryProgressJournal;
    next: RecoveryProgressJournal;
  }): Promise<void>;
  evidenceRepository: SourceRecoveryReindexEvidenceRepository;
}

function assertAbsoluteNormalizedPath(value: string, label: string): void {
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`${label} must be an explicit normalized absolute path`);
  }
}

function scopeKey(value: Pick<AcceptedCoverageRunConfig, 'organizationId' | 'courseId'>): string {
  return `${value.organizationId}:${value.courseId}`;
}

export function normalizeSourceRecoveryReindexAdapterConfig(
  input: SourceRecoveryReindexAdapterConfig
): SourceRecoveryReindexAdapterConfig {
  assertAbsoluteNormalizedPath(input.manifestPath, 'Recovery manifest path');
  assertAbsoluteNormalizedPath(input.journalPath, 'Recovery journal path');
  if (
    !UUID_V4_PATTERN.test(input.expectedRecoveryRunId) ||
    !SHA256_PATTERN.test(input.expectedRecoveryManifestSha256) ||
    !SHA256_PATTERN.test(input.expectedCoverageFingerprint)
  ) {
    throw new Error('Recovery adapter identities must use lower-case UUIDv4 and SHA-256');
  }
  const acceptedCoverageRuns = [...input.acceptedCoverageRuns]
    .map(run => ({ ...run }))
    .sort((left, right) =>
      [left.organizationId, left.courseId, left.runId]
        .join(':')
        .localeCompare([right.organizationId, right.courseId, right.runId].join(':'))
    );
  if (
    acceptedCoverageRuns.length === 0 ||
    acceptedCoverageRuns.some(
      run =>
        !UUID_V4_PATTERN.test(run.organizationId) ||
        !UUID_V4_PATTERN.test(run.courseId) ||
        !UUID_V4_PATTERN.test(run.runId)
    ) ||
    new Set(acceptedCoverageRuns.map(scopeKey)).size !== acceptedCoverageRuns.length ||
    new Set(acceptedCoverageRuns.map(run => run.runId)).size !== acceptedCoverageRuns.length
  ) {
    throw new Error('Accepted coverage runs must be unique lower-case UUIDv4 course scopes');
  }
  return { ...input, acceptedCoverageRuns };
}

function assertConfiguredRecoveryState(
  config: SourceRecoveryReindexAdapterConfig,
  state: ReviewedRecoveryState
): void {
  const canonicalSha256 = calculateRecoveryManifestSha256(state.manifest);
  if (
    state.manifest.run_id !== config.expectedRecoveryRunId ||
    state.manifestSha256 !== config.expectedRecoveryManifestSha256 ||
    state.manifestSha256 !== canonicalSha256
  ) {
    throw new Error('Loaded recovery state does not match exact configured identity');
  }
  validateRecoveryProgressJournalBinding(state.manifest, canonicalSha256, state.journal);
}

function canonicalJournal(journal: RecoveryProgressJournal): string {
  const sortedRecord = <T extends string>(record: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
    ) as Record<string, T>;
  return JSON.stringify({
    ...journal,
    copy_states: sortedRecord(journal.copy_states),
    disposition_kinds: sortedRecord(journal.disposition_kinds),
    disposition_states: sortedRecord(journal.disposition_states),
  });
}

function eligibleScopes(manifest: SourceRecoveryManifest): Map<string, string[]> {
  const eligible = manifest.dispositions.filter(entry => entry.kind === 'eligible_unrecoverable');
  if (eligible.length !== 6) {
    throw new Error('Recovery adapter requires exactly six eligible dispositions');
  }
  const scopes = new Map<string, string[]>();
  for (const entry of eligible) {
    if (!entry.course_id) throw new Error('Eligible recovery disposition must have a course');
    const key = `${entry.organization_id}:${entry.course_id}`;
    scopes.set(key, [...(scopes.get(key) ?? []), entry.file_catalog_id].sort());
  }
  return scopes;
}

function assertExactScopes(
  expected: ReadonlyMap<string, readonly string[]>,
  configured: readonly AcceptedCoverageRunConfig[]
): void {
  const configuredScopes = configured.map(scopeKey).sort();
  const expectedScopes = [...expected.keys()].sort();
  if (JSON.stringify(configuredScopes) !== JSON.stringify(expectedScopes)) {
    throw new Error('Configured accepted coverage runs do not match recovery course scopes');
  }
}

function exactFailedEntry(
  card: ReturnType<typeof DocumentEvidenceCardsSchema.parse>[number],
  run: AcceptedCoverageRunConfig
): AcceptedFailedCoverageEntry {
  if (
    card.coverage_status !== 'failed' ||
    card.coverage_reason !== 'source_file_unrecoverable' ||
    card.processing_mode !== 'metadata_only' ||
    card.summary !== null ||
    card.key_claims.length !== 0 ||
    card.terminology.length !== 0 ||
    card.constraints.length !== 0 ||
    card.token_counts.allocated !== 0
  ) {
    throw new Error('Accepted failed coverage card does not match exact zero-evidence shape');
  }
  return {
    documentId: card.document_id,
    organizationId: run.organizationId,
    courseId: run.courseId,
    coverageStatus: 'failed',
    coverageReason: 'source_file_unrecoverable',
    processingMode: 'metadata_only',
    summary: null,
    claims: [],
    terminology: [],
    constraints: [],
    allocatedTokens: 0,
  };
}

async function loadAcceptedCoverage(
  config: SourceRecoveryReindexAdapterConfig,
  manifest: SourceRecoveryManifest,
  repository: SourceRecoveryReindexEvidenceRepository
): Promise<AcceptedFailedCoverageBinding> {
  const expectedByScope = eligibleScopes(manifest);
  assertExactScopes(expectedByScope, config.acceptedCoverageRuns);
  const ledgers: AcceptedFailedCoverageLedgerBinding[] = [];
  for (const run of config.acceptedCoverageRuns) {
    let accepted: { id: string; status: 'accepted' };
    let cards: ReturnType<typeof DocumentEvidenceCardsSchema.parse>;
    try {
      accepted = await repository.getAcceptedRun(run.runId, run.courseId, run.organizationId);
      cards = DocumentEvidenceCardsSchema.parse(await repository.listItems(run.runId));
    } catch {
      throw new Error('Accepted coverage repository rejected the configured course ledger');
    }
    if (accepted.id !== run.runId || accepted.status !== 'accepted') {
      throw new Error('Accepted coverage repository returned a stale course ledger');
    }
    const expectedIds = expectedByScope.get(scopeKey(run))!;
    const relevantCards = cards.filter(
      card =>
        expectedIds.includes(card.document_id) ||
        (card.coverage_status === 'failed' && card.coverage_reason === 'source_file_unrecoverable')
    );
    const relevantIds = relevantCards.map(card => card.document_id).sort();
    if (
      new Set(relevantIds).size !== relevantIds.length ||
      JSON.stringify(relevantIds) !== JSON.stringify(expectedIds)
    ) {
      throw new Error('Accepted coverage ledger does not contain the exact eligible identities');
    }
    ledgers.push({
      ledgerId: run.runId,
      status: 'accepted',
      organizationId: run.organizationId,
      courseId: run.courseId,
      entries: relevantCards
        .map(card => exactFailedEntry(card, run))
        .sort((left, right) => left.documentId.localeCompare(right.documentId)),
    });
  }
  const binding: AcceptedFailedCoverageBinding = {
    status: 'accepted',
    recoveryRunId: manifest.run_id,
    recoveryManifestSha256: config.expectedRecoveryManifestSha256,
    fingerprint: '',
    ledgers,
  };
  binding.fingerprint = calculateAcceptedFailedCoverageFingerprint(binding);
  if (binding.fingerprint !== config.expectedCoverageFingerprint) {
    throw new Error('Accepted coverage fingerprint does not match exact configured state');
  }
  return binding;
}

export function createSourceRecoveryReindexAdapters(
  rawConfig: SourceRecoveryReindexAdapterConfig,
  dependencies: SourceRecoveryReindexAdapterDependencies
): Pick<
  import('./reindex-course-embeddings').ReindexCommandDependencies,
  'loadRecoveryBinding' | 'persistRecoveryJournalTransition'
> {
  const config = normalizeSourceRecoveryReindexAdapterConfig(rawConfig);
  const loadState = async (): Promise<ReviewedRecoveryState> => {
    const state = await dependencies.loadReviewedRecoveryState({
      manifestPath: config.manifestPath,
      journalPath: config.journalPath,
    });
    assertConfiguredRecoveryState(config, state);
    return state;
  };
  return {
    loadRecoveryBinding: async (): Promise<RecoveryReindexBinding> => {
      const state = await loadState();
      return {
        manifest: state.manifest,
        manifestSha256: state.manifestSha256,
        journal: state.journal,
        acceptedFailedCoverage: await loadAcceptedCoverage(
          config,
          state.manifest,
          dependencies.evidenceRepository
        ),
      };
    },
    persistRecoveryJournalTransition: async ({ expectedRevision, next }): Promise<void> => {
      const current = await loadState();
      if (current.journal.revision !== expectedRevision) {
        throw new Error('Recovery journal CAS revision is stale');
      }
      await dependencies.persistRecoveryJournalTransition({
        journalPath: config.journalPath,
        manifest: current.manifest,
        current: current.journal,
        next,
      });
      const reloaded = await loadState();
      if (canonicalJournal(reloaded.journal) !== canonicalJournal(next)) {
        throw new Error('Persisted recovery journal reload did not confirm the exact transition');
      }
    },
  };
}

export function createDefaultSourceRecoveryReindexAdapters(
  config: SourceRecoveryReindexAdapterConfig
): ReturnType<typeof createSourceRecoveryReindexAdapters> {
  const evidenceRepository = new DocumentEvidenceRepository(
    getSupabaseAdmin() as unknown as DocumentEvidenceDatabaseClient
  );
  return createSourceRecoveryReindexAdapters(config, {
    loadReviewedRecoveryState,
    persistRecoveryJournalTransition: persistAcceptedRecoveryJournalTransition,
    evidenceRepository,
  });
}
