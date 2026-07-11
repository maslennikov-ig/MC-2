import { MIME_TYPES_BY_TIER } from '@megacampus/shared-types';
import {
  getFileExtension,
  isSupportedFormat,
} from '../../src/stages/stage2-document-processing/docling/types';

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
  vectorStatus: string;
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
  gaps: ReindexGap[];
}

export type ReindexSourceProbe = (row: ReindexSourceRow) => boolean | 'invalid_source_path';

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
  sourceProbe: ReindexSourceProbe
): ReindexPlan {
  let eligible = 0;
  let recoverable = 0;
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
      addGap(gaps, row.id, 'invalid_source_path');
      continue;
    }
    if (!sourceStatus) {
      missingSource += 1;
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

  return {
    eligible,
    recoverable,
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
    gaps,
  };
}

export interface DatabaseFileCatalogSourceRow {
  id: string;
  organization_id: string;
  course_id: string | null;
  storage_path: string;
  mime_type: string;
  priority: string | null;
  vector_status: string;
  chunk_count: number | null;
}

export const FILE_CATALOG_REINDEX_COLUMNS =
  'id, organization_id, course_id, storage_path, mime_type, priority, vector_status, chunk_count';
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
        vectorStatus: file.vector_status,
        chunkCount: file.chunk_count,
        locale: course?.language === 'en' ? 'en' : 'ru',
        alreadyEnqueued: false,
      };
    });
}

export function getReindexPlanExitCode(plan: ReindexPlan, allowGaps: boolean): 0 | 2 {
  return plan.gaps.length > 0 && !allowGaps ? 2 : 0;
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
