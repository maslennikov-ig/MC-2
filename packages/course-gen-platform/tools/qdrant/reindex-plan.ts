import { createHash } from 'node:crypto';
import { MIME_TYPES_BY_TIER } from '@megacampus/shared-types';
import {
  getFileExtension,
  isSupportedFormat,
} from '../../src/stages/stage2-document-processing/docling/types';
import {
  calculateRecoveryManifestSha256,
  normalizeRecoveryManifest,
  type RecoveryDispositionEntry,
  type RecoveryProgressJournal,
  type SourceRecoveryManifest,
} from './source-recovery-manifest';

export type ReindexLocale = 'ru' | 'en';

export interface ReindexSourceRow {
  id: string;
  organizationId: string;
  courseId: string | null;
  courseOrganizationId?: string | null;
  userId: string | null;
  storagePath: string;
  mimeType: string;
  priority: string | null;
  hash: string;
  vectorStatus: string;
  errorMessage: string | null;
  chunkCount: number | null;
  locale: ReindexLocale;
  alreadyEnqueued: boolean;
}

export type ReindexGapReason =
  | 'missing_course'
  | 'missing_user'
  | 'organization_mismatch'
  | 'invalid_source_path'
  | 'source_missing'
  | 'unsupported_mime';

export interface ReindexGap {
  fileId: string;
  reason: ReindexGapReason;
}

export interface ReindexPlan {
  eligible: number;
  recoverable: number;
  auditedFailed: number;
  unresolvedMissing: number;
  unresolvedInvalid: number;
  missingSource: number;
  invalidSourcePath: number;
  unsupported: number;
  alreadyEnqueued: number;
  estimatedDocuments: number;
  expectedDocuments: number;
  estimatedPoints: number;
  unknownPointEstimates: number;
  estimatedJinaRequests: {
    minimum: number;
    maximum: number | null;
  };
  candidateFileIds: string[];
  alreadyEnqueuedFileIds: string[];
  auditedFailedFileIds: string[];
  recoveryRunId?: string;
  recoveryManifestSha256?: string;
  acceptedCoverageLedgerIds?: string[];
  acceptedCoverageStatus?: 'accepted';
  acceptedCoverageFingerprint?: string;
  verificationFingerprint?: string;
  gaps: ReindexGap[];
}

export interface AcceptedFailedCoverageEntry {
  documentId: string;
  organizationId: string;
  courseId: string;
  coverageStatus: 'failed';
  coverageReason: 'source_file_unrecoverable';
  processingMode: 'metadata_only';
  summary: null;
  claims: readonly string[];
  terminology: readonly string[];
  constraints: readonly string[];
  allocatedTokens: 0;
}

export interface AcceptedFailedCoverageLedgerBinding {
  ledgerId: string;
  status: 'accepted';
  organizationId: string;
  courseId: string;
  entries: readonly AcceptedFailedCoverageEntry[];
}

export interface AcceptedFailedCoverageBinding {
  status: 'accepted';
  recoveryRunId: string;
  recoveryManifestSha256: string;
  fingerprint: string;
  ledgers: readonly AcceptedFailedCoverageLedgerBinding[];
}

export interface RecoveryReindexBinding {
  manifest: SourceRecoveryManifest;
  manifestSha256: string;
  journal: RecoveryProgressJournal;
  acceptedFailedCoverage: AcceptedFailedCoverageBinding;
}

export type ReindexSourceProbe = (row: ReindexSourceRow) => boolean | 'invalid_source_path';

const VERIFIED_RECOVERY_PHASES = new Set(['verified', 'reindex_started', 'complete']);
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function calculateAcceptedFailedCoverageFingerprint(
  binding: AcceptedFailedCoverageBinding
): string {
  const ledgers = [...binding.ledgers]
    .sort((left, right) =>
      [left.organizationId, left.courseId, left.ledgerId]
        .join(':')
        .localeCompare([right.organizationId, right.courseId, right.ledgerId].join(':'))
    )
    .map(ledger => ({
      ledgerId: ledger.ledgerId,
      status: ledger.status,
      organizationId: ledger.organizationId,
      courseId: ledger.courseId,
      entries: [...ledger.entries]
        .sort((left, right) => left.documentId.localeCompare(right.documentId))
        .map(entry => ({
          documentId: entry.documentId,
          organizationId: entry.organizationId,
          courseId: entry.courseId,
          coverageStatus: entry.coverageStatus,
          coverageReason: entry.coverageReason,
          processingMode: entry.processingMode,
          summary: entry.summary,
          claims: [...entry.claims],
          terminology: [...entry.terminology],
          constraints: [...entry.constraints],
          allocatedTokens: entry.allocatedTokens,
        })),
    }));
  return createHash('sha256')
    .update(
      JSON.stringify({
        status: binding.status,
        recoveryRunId: binding.recoveryRunId,
        recoveryManifestSha256: binding.recoveryManifestSha256,
        ledgers,
      })
    )
    .digest('hex');
}

function assertExactSet(
  actual: readonly string[],
  expected: readonly string[],
  label: string
): void {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (
    new Set(actualSorted).size !== actualSorted.length ||
    JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)
  ) {
    throw new Error(`${label} must exactly match the reviewed eligible disposition set`);
  }
}

function validateRecoveryBinding(
  binding: RecoveryReindexBinding,
  sourceRows: readonly ReindexSourceRow[]
): {
  manifest: SourceRecoveryManifest;
  eligibleByFileId: ReadonlyMap<string, RecoveryDispositionEntry>;
} {
  const manifest = normalizeRecoveryManifest(binding.manifest);
  const canonicalSha256 = calculateRecoveryManifestSha256(manifest);
  if (binding.manifestSha256 !== canonicalSha256) {
    throw new Error('Recovery binding manifest SHA-256 is not canonical');
  }
  if (
    binding.journal.run_id !== manifest.run_id ||
    binding.journal.manifest_sha256 !== canonicalSha256
  ) {
    throw new Error('Recovery journal binding does not match the reviewed manifest');
  }
  if (!VERIFIED_RECOVERY_PHASES.has(binding.journal.phase)) {
    throw new Error('Recovery journal must be verified before reindex planning');
  }
  if (!Object.values(binding.journal.copy_states).every(state => state === 'published')) {
    throw new Error('Recovery journal copies must all be published before reindex planning');
  }
  if (
    !manifest.dispositions.every(
      entry =>
        binding.journal.disposition_kinds[entry.entry_id] === entry.kind &&
        binding.journal.disposition_states[entry.entry_id] === 'disposition_verified'
    )
  ) {
    throw new Error('Recovery journal dispositions must exactly match verified manifest entries');
  }
  assertExactSet(
    Object.keys(binding.journal.copy_states),
    manifest.copies.map(entry => entry.entry_id),
    'Recovery journal copy IDs'
  );
  assertExactSet(
    Object.keys(binding.journal.disposition_states),
    manifest.dispositions.map(entry => entry.entry_id),
    'Recovery journal disposition state IDs'
  );
  assertExactSet(
    Object.keys(binding.journal.disposition_kinds),
    manifest.dispositions.map(entry => entry.entry_id),
    'Recovery journal disposition kind IDs'
  );

  const eligible = manifest.dispositions.filter(entry => entry.kind === 'eligible_unrecoverable');
  if (eligible.length !== 6) {
    throw new Error('Recovery binding must contain exactly six eligible audited failures');
  }
  const coverage = binding.acceptedFailedCoverage;
  if (!coverage || coverage.status !== 'accepted') {
    throw new Error('Accepted failed coverage status must be accepted');
  }
  if (
    coverage.recoveryRunId !== manifest.run_id ||
    coverage.recoveryManifestSha256 !== canonicalSha256
  ) {
    throw new Error('Accepted failed coverage run binding does not match recovery truth');
  }
  if (coverage.fingerprint !== calculateAcceptedFailedCoverageFingerprint(coverage)) {
    throw new Error('Accepted failed coverage fingerprint is not canonical');
  }
  const ledgers = [...coverage.ledgers].sort((left, right) =>
    [left.organizationId, left.courseId, left.ledgerId]
      .join(':')
      .localeCompare([right.organizationId, right.courseId, right.ledgerId].join(':'))
  );
  if (
    ledgers.length === 0 ||
    ledgers.some(
      ledger =>
        !UUID_V4_PATTERN.test(ledger.ledgerId) ||
        !UUID_V4_PATTERN.test(ledger.organizationId) ||
        !UUID_V4_PATTERN.test(ledger.courseId) ||
        ledger.status !== 'accepted'
    ) ||
    new Set(ledgers.map(ledger => ledger.ledgerId)).size !== ledgers.length ||
    new Set(ledgers.map(ledger => `${ledger.organizationId}:${ledger.courseId}`)).size !==
      ledgers.length
  ) {
    throw new Error('Accepted failed coverage ledgers must be unique lower-case UUIDv4 scopes');
  }
  const coverageEntries = ledgers.flatMap(ledger => ledger.entries);
  assertExactSet(
    coverageEntries.map(entry => entry.documentId),
    eligible.map(entry => entry.file_catalog_id),
    'Accepted failed coverage IDs'
  );
  const eligibleById = new Map(eligible.map(entry => [entry.file_catalog_id, entry]));
  for (const ledger of ledgers) {
    for (const entry of ledger.entries) {
      const disposition = eligibleById.get(entry.documentId);
      if (
        !disposition ||
        entry.organizationId !== ledger.organizationId ||
        entry.courseId !== ledger.courseId ||
        entry.organizationId !== disposition.organization_id ||
        entry.courseId !== disposition.course_id ||
        entry.coverageStatus !== 'failed' ||
        entry.coverageReason !== 'source_file_unrecoverable' ||
        entry.processingMode !== 'metadata_only' ||
        entry.summary !== null ||
        entry.claims.length !== 0 ||
        entry.terminology.length !== 0 ||
        entry.constraints.length !== 0 ||
        entry.allocatedTokens !== 0
      ) {
        throw new Error('Accepted failed coverage must contain exact zero-evidence tenant truth');
      }
    }
  }

  const rowsById = new Map(sourceRows.map(row => [row.id, row]));
  for (const entry of eligible) {
    const row = rowsById.get(entry.file_catalog_id);
    const expectedError = `source_file_unrecoverable; recovery_run=${manifest.run_id}`;
    if (
      !row ||
      row.organizationId !== entry.organization_id ||
      row.courseId !== entry.course_id ||
      row.hash !== entry.expected_hash ||
      row.storagePath !== entry.expected_storage_path ||
      row.vectorStatus !== 'failed' ||
      row.errorMessage !== expectedError
    ) {
      throw new Error(`Recovery audited failure row does not match reviewed predicates`);
    }
  }

  return {
    manifest,
    eligibleByFileId: new Map(eligible.map(entry => [entry.file_catalog_id, entry])),
  };
}

export function calculateReindexVerificationFingerprint(plan: ReindexPlan): string {
  if (!plan.recoveryRunId || !plan.recoveryManifestSha256) {
    throw new Error('A recovery binding is required for a verification fingerprint');
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        recoveryRunId: plan.recoveryRunId,
        recoveryManifestSha256: plan.recoveryManifestSha256,
        acceptedCoverageLedgerIds: plan.acceptedCoverageLedgerIds,
        acceptedCoverageStatus: plan.acceptedCoverageStatus,
        acceptedCoverageFingerprint: plan.acceptedCoverageFingerprint,
        auditedFailedFileIds: [...plan.auditedFailedFileIds].sort(),
        candidateFileIds: [...plan.candidateFileIds].sort(),
        alreadyEnqueuedFileIds: [...plan.alreadyEnqueuedFileIds].sort(),
        missingSource: plan.missingSource,
        invalidSourcePath: plan.invalidSourcePath,
        unresolvedMissing: plan.unresolvedMissing,
        unresolvedInvalid: plan.unresolvedInvalid,
      })
    )
    .digest('hex');
}

const UPLOAD_MIME_TYPES = new Set<string>(Object.values(MIME_TYPES_BY_TIER).flat());
const PLAIN_TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown']);

function supportsStage2(row: ReindexSourceRow): boolean {
  if (!UPLOAD_MIME_TYPES.has(row.mimeType)) return false;
  if (PLAIN_TEXT_MIME_TYPES.has(row.mimeType)) return true;
  return isSupportedFormat(getFileExtension(row.storagePath));
}

function addGap(gaps: ReindexGap[], fileId: string, reason: ReindexGapReason): void {
  gaps.push({ fileId, reason });
}

export function buildReindexPlan(
  sourceRows: readonly ReindexSourceRow[],
  sourceProbe: ReindexSourceProbe,
  recoveryBinding?: RecoveryReindexBinding
): ReindexPlan {
  const validatedBinding = recoveryBinding
    ? validateRecoveryBinding(recoveryBinding, sourceRows)
    : undefined;
  let eligible = 0;
  let recoverable = 0;
  let auditedFailed = 0;
  let unresolvedMissing = 0;
  let unresolvedInvalid = 0;
  let missingSource = 0;
  let invalidSourcePath = 0;
  let unsupported = 0;
  let alreadyEnqueued = 0;
  let estimatedPoints = 0;
  let unknownPointEstimates = 0;
  let minimumJinaRequests = 0;
  let maximumJinaRequests = 0;
  const candidateFileIds: string[] = [];
  const alreadyEnqueuedFileIds: string[] = [];
  const auditedFailedFileIds: string[] = [];
  const gaps: ReindexGap[] = [];

  const rows = [...sourceRows].sort((left, right) => left.id.localeCompare(right.id));
  for (const row of rows) {
    if (!row.courseId) {
      unsupported += 1;
      addGap(gaps, row.id, 'missing_course');
      continue;
    }
    if (
      row.courseOrganizationId !== undefined &&
      row.courseOrganizationId !== null &&
      row.courseOrganizationId !== row.organizationId
    ) {
      unsupported += 1;
      addGap(gaps, row.id, 'organization_mismatch');
      continue;
    }
    if (!row.userId) {
      unsupported += 1;
      addGap(gaps, row.id, 'missing_user');
      continue;
    }
    if (!supportsStage2(row)) {
      unsupported += 1;
      addGap(gaps, row.id, 'unsupported_mime');
      continue;
    }

    eligible += 1;
    const sourceStatus = sourceProbe(row);
    if (sourceStatus === 'invalid_source_path') {
      invalidSourcePath += 1;
      if (validatedBinding?.eligibleByFileId.has(row.id)) {
        auditedFailed += 1;
        auditedFailedFileIds.push(row.id);
        continue;
      }
      unresolvedInvalid += 1;
      addGap(gaps, row.id, 'invalid_source_path');
      continue;
    }
    if (!sourceStatus) {
      missingSource += 1;
      if (validatedBinding?.eligibleByFileId.has(row.id)) {
        auditedFailed += 1;
        auditedFailedFileIds.push(row.id);
        continue;
      }
      unresolvedMissing += 1;
      addGap(gaps, row.id, 'source_missing');
      continue;
    }

    if (row.chunkCount === null) {
      unknownPointEstimates += 1;
    } else {
      const pointCount = Math.max(0, row.chunkCount);
      estimatedPoints += pointCount;
      maximumJinaRequests += pointCount;
      if (pointCount > 0) minimumJinaRequests += 1;
    }
    if (row.alreadyEnqueued) {
      alreadyEnqueued += 1;
      alreadyEnqueuedFileIds.push(row.id);
    } else {
      recoverable += 1;
      candidateFileIds.push(row.id);
    }
  }

  const plan: ReindexPlan = {
    eligible,
    recoverable,
    auditedFailed,
    unresolvedMissing,
    unresolvedInvalid,
    missingSource,
    invalidSourcePath,
    unsupported,
    alreadyEnqueued,
    estimatedDocuments: recoverable,
    expectedDocuments: recoverable + alreadyEnqueued,
    estimatedPoints,
    unknownPointEstimates,
    estimatedJinaRequests: {
      minimum: minimumJinaRequests,
      maximum: unknownPointEstimates === 0 ? maximumJinaRequests : null,
    },
    candidateFileIds,
    alreadyEnqueuedFileIds,
    auditedFailedFileIds,
    ...(validatedBinding
      ? {
          recoveryRunId: validatedBinding.manifest.run_id,
          recoveryManifestSha256: recoveryBinding!.manifestSha256,
          acceptedCoverageLedgerIds: recoveryBinding!.acceptedFailedCoverage.ledgers
            .map(ledger => ledger.ledgerId)
            .sort(),
          acceptedCoverageStatus: recoveryBinding!.acceptedFailedCoverage.status,
          acceptedCoverageFingerprint: recoveryBinding!.acceptedFailedCoverage.fingerprint,
        }
      : {}),
    gaps,
  };
  if (validatedBinding) {
    if (auditedFailedFileIds.length !== validatedBinding.eligibleByFileId.size) {
      throw new Error('Every reviewed eligible disposition must remain a raw source gap');
    }
    if (unresolvedMissing === 0 && unresolvedInvalid === 0) {
      const expected = validatedBinding.manifest.expected_post_counts;
      if (
        eligible !== expected.eligible ||
        recoverable + alreadyEnqueued !== expected.recoverable ||
        missingSource !== expected.missing ||
        invalidSourcePath !== expected.invalid ||
        unsupported !== expected.unsupported
      ) {
        throw new Error('Reindex source truth does not match reviewed post-recovery counts');
      }
    }
    plan.verificationFingerprint = calculateReindexVerificationFingerprint(plan);
  }
  return plan;
}

export interface DatabaseFileCatalogSourceRow {
  id: string;
  organization_id: string;
  course_id: string | null;
  storage_path: string;
  mime_type: string;
  priority: string | null;
  hash: string;
  vector_status: string;
  error_message: string | null;
  chunk_count: number | null;
}

export const FILE_CATALOG_REINDEX_COLUMNS =
  'id, organization_id, course_id, storage_path, mime_type, priority, hash, vector_status, error_message, chunk_count';
export const COURSE_REINDEX_COLUMNS = 'id, organization_id, user_id, language';

export interface DatabaseCourseSourceRow {
  id: string;
  organization_id: string;
  user_id: string;
  language: string | null;
}

export interface ReindexSourceDatabase {
  countFileCatalogSources: (courseId?: string) => Promise<number>;
  listFileCatalogSourcesPage: (input: {
    courseId?: string;
    afterId?: string;
    limit: number;
  }) => Promise<DatabaseFileCatalogSourceRow[]>;
  listCourseSources: (courseIds: readonly string[]) => Promise<DatabaseCourseSourceRow[]>;
}

const FILE_SOURCE_PAGE_SIZE = 500;
const COURSE_SOURCE_BATCH_SIZE = 200;

export async function loadReindexSources(
  database: ReindexSourceDatabase,
  courseId?: string
): Promise<ReindexSourceRow[]> {
  const expectedFileCount = await database.countFileCatalogSources(courseId);
  if (!Number.isSafeInteger(expectedFileCount) || expectedFileCount < 0) {
    throw new Error(`Invalid exact source count: ${expectedFileCount}`);
  }

  const files: DatabaseFileCatalogSourceRow[] = [];
  let afterId: string | undefined;
  while (files.length < expectedFileCount) {
    const page = await database.listFileCatalogSourcesPage({
      courseId,
      afterId,
      limit: FILE_SOURCE_PAGE_SIZE,
    });
    if (page.length === 0) break;

    for (const file of page) {
      if (afterId !== undefined && file.id <= afterId) {
        throw new Error(`Non-increasing file_catalog keyset page at ${file.id}`);
      }
      afterId = file.id;
      files.push(file);
    }
    if (page.length < FILE_SOURCE_PAGE_SIZE) break;
  }

  if (files.length !== expectedFileCount) {
    throw new Error(
      `Paged file_catalog rows ${files.length} do not match independent exact source count ${expectedFileCount}`
    );
  }

  const courseIds = [
    ...new Set(files.flatMap(file => (file.course_id ? [file.course_id] : []))),
  ].sort();
  const courses: DatabaseCourseSourceRow[] = [];
  for (let index = 0; index < courseIds.length; index += COURSE_SOURCE_BATCH_SIZE) {
    const batch = courseIds.slice(index, index + COURSE_SOURCE_BATCH_SIZE);
    courses.push(...(await database.listCourseSources(batch)));
  }
  return mapDatabaseReindexSources(files, courses);
}

export function mapDatabaseReindexSources(
  files: readonly DatabaseFileCatalogSourceRow[],
  courses: readonly DatabaseCourseSourceRow[]
): ReindexSourceRow[] {
  const coursesById = new Map(courses.map(course => [course.id, course]));
  return [...files]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(file => {
      const course = file.course_id ? coursesById.get(file.course_id) : undefined;
      return {
        id: file.id,
        organizationId: file.organization_id,
        courseId: file.course_id,
        courseOrganizationId: course?.organization_id ?? null,
        userId: course?.user_id ?? null,
        storagePath: file.storage_path,
        mimeType: file.mime_type,
        priority: file.priority,
        hash: file.hash,
        vectorStatus: file.vector_status,
        errorMessage: file.error_message,
        chunkCount: file.chunk_count,
        locale: course?.language === 'en' ? 'en' : 'ru',
        alreadyEnqueued: false,
      };
    });
}

export function getReindexPlanExitCode(plan: ReindexPlan): 0 | 2 {
  return plan.unresolvedMissing > 0 || plan.unresolvedInvalid > 0 ? 2 : 0;
}

export interface IndexedDocumentIdentity {
  documentId: string;
  courseId: string;
  organizationId: string;
  pointCount: number;
}

export interface ReindexSchemaVerification {
  ok: boolean;
  mismatches: string[];
}

export interface ReindexRelevanceCheck {
  language: ReindexLocale;
  passed: boolean;
  nativeHybrid: boolean;
}

export interface ReindexContextMismatch {
  documentId: string;
  expectedCourseId: string | null;
  actualCourseId: string;
  expectedOrganizationId: string;
  actualOrganizationId: string;
}

export interface ReindexCountMismatch {
  scope: 'course' | 'organization';
  id: string;
  expected: number;
  actual: number;
}

export interface ReindexPointCountMismatch {
  documentId: string;
  expected: number;
  actual: number;
}

export interface ReindexVerificationResult {
  ok: boolean;
  expectedDocuments: number;
  indexedDocuments: number;
  expectedKnownPoints: number;
  indexedPoints: number;
  missingDocumentIds: string[];
  extraDocumentIds: string[];
  contextMismatches: ReindexContextMismatch[];
  countMismatches: ReindexCountMismatch[];
  pointCountMismatches: ReindexPointCountMismatch[];
  schemaMismatches: string[];
  relevanceFailures: ReindexLocale[];
}

export interface VerifyReindexParityInput {
  expectedSources: readonly ReindexSourceRow[];
  indexedDocuments: readonly IndexedDocumentIdentity[];
  schemaVerification: ReindexSchemaVerification;
  relevanceChecks: readonly ReindexRelevanceCheck[];
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function buildSourceCounts(sources: readonly ReindexSourceRow[]): {
  courses: Map<string, number>;
  organizations: Map<string, number>;
} {
  const courses = new Map<string, number>();
  const organizations = new Map<string, number>();
  for (const source of sources) {
    if (source.courseId) incrementCount(courses, source.courseId);
    incrementCount(organizations, source.organizationId);
  }
  return { courses, organizations };
}

function buildIndexCounts(documents: readonly IndexedDocumentIdentity[]): {
  courses: Map<string, number>;
  organizations: Map<string, number>;
} {
  const courses = new Map<string, number>();
  const organizations = new Map<string, number>();
  for (const document of documents) {
    incrementCount(courses, document.courseId);
    incrementCount(organizations, document.organizationId);
  }
  return { courses, organizations };
}

function compareCounts(
  scope: ReindexCountMismatch['scope'],
  expected: ReadonlyMap<string, number>,
  actual: ReadonlyMap<string, number>
): ReindexCountMismatch[] {
  const ids = new Set([...expected.keys(), ...actual.keys()]);
  return [...ids].sort().flatMap(id => {
    const expectedCount = expected.get(id) ?? 0;
    const actualCount = actual.get(id) ?? 0;
    return expectedCount === actualCount
      ? []
      : [{ scope, id, expected: expectedCount, actual: actualCount }];
  });
}

export function verifyReindexParity(input: VerifyReindexParityInput): ReindexVerificationResult {
  const expectedById = new Map(input.expectedSources.map(source => [source.id, source]));
  const indexedById = new Map(
    [...input.indexedDocuments]
      .sort((left, right) => left.documentId.localeCompare(right.documentId))
      .map(document => [document.documentId, document])
  );
  const expectedIds = [...expectedById.keys()].sort();
  const indexedIds = [...indexedById.keys()].sort();
  const missingDocumentIds = expectedIds.filter(id => !indexedById.has(id));
  const extraDocumentIds = indexedIds.filter(id => !expectedById.has(id));

  const contextMismatches = expectedIds.flatMap(documentId => {
    const expected = expectedById.get(documentId)!;
    const actual = indexedById.get(documentId);
    if (
      !actual ||
      (actual.courseId === expected.courseId && actual.organizationId === expected.organizationId)
    ) {
      return [];
    }
    return [
      {
        documentId,
        expectedCourseId: expected.courseId,
        actualCourseId: actual.courseId,
        expectedOrganizationId: expected.organizationId,
        actualOrganizationId: actual.organizationId,
      },
    ];
  });

  const expectedCounts = buildSourceCounts(input.expectedSources);
  const actualCounts = buildIndexCounts([...indexedById.values()]);
  const countMismatches = [
    ...compareCounts('course', expectedCounts.courses, actualCounts.courses),
    ...compareCounts('organization', expectedCounts.organizations, actualCounts.organizations),
  ];
  const pointCountMismatches = expectedIds.flatMap(documentId => {
    const expected = expectedById.get(documentId)!;
    const actual = indexedById.get(documentId);
    if (!actual || expected.chunkCount === null || actual.pointCount === expected.chunkCount) {
      return [];
    }
    return [
      {
        documentId,
        expected: expected.chunkCount,
        actual: actual.pointCount,
      },
    ];
  });
  const relevanceFailures = (['ru', 'en'] as const).filter(language => {
    const checks = input.relevanceChecks.filter(check => check.language === language);
    return checks.length !== 1 || !checks[0].passed || !checks[0].nativeHybrid;
  });
  const schemaMismatches = [...input.schemaVerification.mismatches];

  return {
    ok:
      input.schemaVerification.ok &&
      missingDocumentIds.length === 0 &&
      extraDocumentIds.length === 0 &&
      contextMismatches.length === 0 &&
      countMismatches.length === 0 &&
      pointCountMismatches.length === 0 &&
      relevanceFailures.length === 0,
    expectedDocuments: expectedById.size,
    indexedDocuments: indexedById.size,
    expectedKnownPoints: input.expectedSources.reduce(
      (total, source) => total + (source.chunkCount ?? 0),
      0
    ),
    indexedPoints: input.indexedDocuments.reduce(
      (total, document) => total + document.pointCount,
      0
    ),
    missingDocumentIds,
    extraDocumentIds,
    contextMismatches,
    countMismatches,
    pointCountMismatches,
    schemaMismatches,
    relevanceFailures,
  };
}
