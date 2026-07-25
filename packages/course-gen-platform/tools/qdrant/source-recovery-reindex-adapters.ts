import { isAbsolute, resolve } from 'node:path';

import { getSupabaseAdmin } from '../../src/shared/supabase/admin';
import {
  createRecoveryDispositionDatabase,
  createSupabaseRecoveryGateway,
  requireQ12CapabilityFetchInstalled,
  type RecoveryCatalogRow,
  type RecoverySupabaseClient,
} from './source-recovery-database';
import {
  calculateAcceptedFailedCoverageFingerprint,
  coverageScopeKey,
  expectedCoverageErrorMessage,
  type AcceptedFailedCoverageBinding,
  type AcceptedFailedCoverageEntry,
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
// The frozen Q12 command manifest (sha aaec6fc2…) binds exactly one `<accepted-coverage-run>` argv slot.
// Owner-approved amendment 2026-07-25: that slot carries a self-describing file_catalog authority token
// instead of an `organization:course:run` document-evidence ledger triple, because the recovery spans six
// course scopes (sha-bound in the reviewed manifest, so argv need not repeat them) and the evidence
// ledgers do not exist in-window at all.
const ACCEPTED_COVERAGE_AUTHORITY_PATTERN =
  /^catalog:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/u;

export interface AcceptedCoverageAuthority {
  source: 'file_catalog';
  recoveryRunId: string;
}

export function formatAcceptedCoverageAuthority(recoveryRunId: string): string {
  return `catalog:${recoveryRunId}`;
}

export function parseAcceptedCoverageAuthority(value: string): AcceptedCoverageAuthority {
  const matched = ACCEPTED_COVERAGE_AUTHORITY_PATTERN.exec(value);
  if (!matched) {
    throw new Error('--accepted-coverage-run must be catalog:<recovery-run-id>');
  }
  return { source: 'file_catalog', recoveryRunId: matched[1] };
}

export interface SourceRecoveryReindexAdapterConfig {
  manifestPath: string;
  journalPath: string;
  expectedRecoveryRunId: string;
  expectedRecoveryManifestSha256: string;
  expectedCoverageFingerprint: string;
  acceptedCoverageAuthority: string;
}

export interface SourceRecoveryCatalogCoverageRepository {
  listFileCatalogExpectedRows(ids: readonly string[]): Promise<RecoveryCatalogRow[]>;
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
  catalogRepository: SourceRecoveryCatalogCoverageRepository;
}

function assertAbsoluteNormalizedPath(value: string, label: string): void {
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`${label} must be an explicit normalized absolute path`);
  }
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
  const authority = parseAcceptedCoverageAuthority(input.acceptedCoverageAuthority);
  if (authority.recoveryRunId !== input.expectedRecoveryRunId) {
    throw new Error('Accepted coverage authority must name the configured recovery run');
  }
  return { ...input };
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

function eligibleDispositions(manifest: SourceRecoveryManifest) {
  const eligible = manifest.dispositions.filter(entry => entry.kind === 'eligible_unrecoverable');
  if (eligible.length !== 6) {
    throw new Error('Recovery adapter requires exactly six eligible dispositions');
  }
  for (const entry of eligible) {
    if (!entry.course_id) throw new Error('Eligible recovery disposition must have a course');
  }
  return eligible;
}

// The accepted failed coverage is the recovered file_catalog state itself: `applyDispositionEntry`
// moves every eligible row to vector_status='failed' with the run-scoped unrecoverable marker, so the
// binding is a read of live truth cross-checked against the sha-bound reviewed manifest. Nothing here is
// invented, and no document-evidence ledger is consulted (they are created empty by the C4 migration and
// their zero-evidence cards are minted only by post-window Stage-4 runs — tracked on mc2-8m90f).
async function buildAcceptedCoverageBinding(
  manifest: SourceRecoveryManifest,
  repository: SourceRecoveryCatalogCoverageRepository,
  recoveryManifestSha256: string
): Promise<AcceptedFailedCoverageBinding> {
  const eligible = eligibleDispositions(manifest);
  const ids = eligible.map(entry => entry.file_catalog_id).sort();
  let rows: RecoveryCatalogRow[];
  try {
    rows = await repository.listFileCatalogExpectedRows(ids);
  } catch {
    throw new Error(
      'Accepted coverage file_catalog read was rejected for the recovered identities'
    );
  }
  const rowsById = new Map(rows.map(row => [row.id, row]));
  if (rowsById.size !== rows.length || rows.length !== ids.length) {
    throw new Error('Accepted coverage file_catalog rows must be the exact recovered identities');
  }
  const expectedErrorMessage = expectedCoverageErrorMessage(manifest.run_id);
  const entriesByScope = new Map<string, AcceptedFailedCoverageEntry[]>();
  for (const entry of eligible) {
    const row = rowsById.get(entry.file_catalog_id);
    if (
      !row ||
      row.organization_id !== entry.organization_id ||
      row.course_id !== entry.course_id ||
      row.storage_path !== entry.expected_storage_path ||
      row.hash !== entry.expected_hash ||
      row.vector_status !== 'failed' ||
      row.error_message !== expectedErrorMessage
    ) {
      throw new Error(
        'Accepted coverage file_catalog row is not the exact recovered disposition state'
      );
    }
    const key = coverageScopeKey({
      organizationId: entry.organization_id,
      courseId: entry.course_id!,
    });
    entriesByScope.set(key, [
      ...(entriesByScope.get(key) ?? []),
      {
        fileCatalogId: row.id,
        organizationId: row.organization_id,
        courseId: entry.course_id!,
        storagePath: row.storage_path,
        hash: row.hash,
        vectorStatus: 'failed',
        errorMessage: row.error_message,
      },
    ]);
  }
  const binding: AcceptedFailedCoverageBinding = {
    status: 'accepted',
    source: 'file_catalog',
    recoveryRunId: manifest.run_id,
    recoveryManifestSha256,
    fingerprint: '',
    scopes: [...entriesByScope.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entries]) => {
        const [organizationId, courseId] = key.split(':');
        return {
          organizationId,
          courseId,
          entries: [...entries].sort((left, right) =>
            left.fileCatalogId.localeCompare(right.fileCatalogId)
          ),
        };
      }),
  };
  binding.fingerprint = calculateAcceptedFailedCoverageFingerprint(binding);
  return binding;
}

async function loadAcceptedCoverage(
  config: SourceRecoveryReindexAdapterConfig,
  manifest: SourceRecoveryManifest,
  repository: SourceRecoveryCatalogCoverageRepository
): Promise<AcceptedFailedCoverageBinding> {
  const binding = await buildAcceptedCoverageBinding(
    manifest,
    repository,
    config.expectedRecoveryManifestSha256
  );
  if (binding.fingerprint !== config.expectedCoverageFingerprint) {
    throw new Error('Accepted coverage fingerprint does not match exact configured state');
  }
  return binding;
}

function createDefaultCatalogCoverageRepository(): SourceRecoveryCatalogCoverageRepository {
  requireQ12CapabilityFetchInstalled();
  return createRecoveryDispositionDatabase(
    createSupabaseRecoveryGateway(getSupabaseAdmin() as unknown as RecoverySupabaseClient)
  );
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
          dependencies.catalogRepository
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
  return createSourceRecoveryReindexAdapters(config, {
    loadReviewedRecoveryState,
    persistRecoveryJournalTransition: persistAcceptedRecoveryJournalTransition,
    catalogRepository: createDefaultCatalogCoverageRepository(),
  });
}

// W7a real leg (emit half): the source.forward acceptance emit-entrypoint. The Q12 controller's
// StagedValueResolver.on_source_forward_accepted needs three window-staged values —
// <accepted-recovery-manifest-sha256>, <accepted-coverage-fingerprint>, <accepted-coverage-run>. This
// COMPUTES them from the real reviewed recovery manifest + the recovered file_catalog rows (the same
// canonical functions the reindex adapter validates against — never a Python re-derivation) and the
// controller reads the written authority via read_source_forward_acceptance. The frozen manifest's single
// <accepted-coverage-run> slot carries the `catalog:<recovery-run-id>` authority token; the six recovered
// course scopes come from the sha-bound manifest, not from argv.

export interface SourceForwardAcceptanceEmitConfig {
  manifestPath: string;
  journalPath: string;
  expectedRecoveryRunId: string;
  acceptedCoverageAuthority: string;
}

export interface SourceForwardAcceptanceAuthority {
  schema: 'megacampus.q12.source-forward-acceptance/v1';
  recovery_manifest_sha256: string;
  coverage_fingerprint: string;
  coverage_run: string;
}

export interface SourceForwardAcceptanceEmitDependencies {
  loadReviewedRecoveryState(input: {
    manifestPath: string;
    journalPath: string;
  }): Promise<ReviewedRecoveryState>;
  catalogRepository: SourceRecoveryCatalogCoverageRepository;
}

export async function computeSourceForwardAcceptance(
  config: SourceForwardAcceptanceEmitConfig,
  dependencies: SourceForwardAcceptanceEmitDependencies
): Promise<SourceForwardAcceptanceAuthority> {
  assertAbsoluteNormalizedPath(config.manifestPath, 'Recovery manifest path');
  assertAbsoluteNormalizedPath(config.journalPath, 'Recovery journal path');
  if (!UUID_V4_PATTERN.test(config.expectedRecoveryRunId)) {
    throw new Error('Recovery adapter identities must use lower-case UUIDv4 and SHA-256');
  }
  const authority = parseAcceptedCoverageAuthority(config.acceptedCoverageAuthority);
  if (authority.recoveryRunId !== config.expectedRecoveryRunId) {
    throw new Error('Accepted coverage authority must name the configured recovery run');
  }
  const state = await dependencies.loadReviewedRecoveryState({
    manifestPath: config.manifestPath,
    journalPath: config.journalPath,
  });
  const canonicalSha256 = calculateRecoveryManifestSha256(state.manifest);
  if (
    state.manifest.run_id !== config.expectedRecoveryRunId ||
    state.manifestSha256 !== canonicalSha256
  ) {
    throw new Error('Loaded recovery state does not match exact configured identity');
  }
  validateRecoveryProgressJournalBinding(state.manifest, canonicalSha256, state.journal);
  const binding = await buildAcceptedCoverageBinding(
    state.manifest,
    dependencies.catalogRepository,
    canonicalSha256
  );
  return {
    schema: 'megacampus.q12.source-forward-acceptance/v1',
    recovery_manifest_sha256: canonicalSha256,
    coverage_fingerprint: binding.fingerprint,
    coverage_run: formatAcceptedCoverageAuthority(authority.recoveryRunId),
  };
}

export function createDefaultSourceForwardAcceptanceDependencies(): SourceForwardAcceptanceEmitDependencies {
  return {
    loadReviewedRecoveryState,
    catalogRepository: createDefaultCatalogCoverageRepository(),
  };
}
