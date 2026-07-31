import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COLLECTION_CREATE_PARAMS } from '@/shared/qdrant/collection-schema';

// course_embeddings_v1 is created by this repo with strict mode on and max_query_limit 100, and
// production megacampus-prod reports that restriction active. duplicateVectorsForNewCourse asked
// for 10000 points in one page, so on 2026-07-31 the whole course-duplication path answered
// HTTP 400 'Limit exceeded 10000 > 100 for "limit"' and could not read a single vector (mc2-82bt2).
//
// Lowering the constant alone would have been worse than the bug: a course with more than 100
// chunks would have silently duplicated only the first page, turning a loud failure into quiet
// data loss. So the fake below enforces the real cap AND serves more points than one page holds.
const CAP = COLLECTION_CREATE_PARAMS.strict_mode_config.max_query_limit;
const TOTAL_POINTS = CAP * 2 + 7;

const { mockScroll, mockUpsert, mockLogger } = vi.hoisted(() => ({
  mockScroll: vi.fn(),
  mockUpsert: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: { scroll: mockScroll, upsert: mockUpsert },
}));
vi.mock('@/shared/logger/index.js', () => ({ logger: mockLogger, default: mockLogger }));

function buildPoints(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `point-${index}`,
    vector: { dense: [0.1, 0.2] },
    payload: { chunk_id: index, document_id: 'old-file', content: `chunk ${index}` },
  }));
}

/** A scroll that behaves like the deployed collection: it refuses an oversized page. */
function strictScroll(allPoints: ReturnType<typeof buildPoints>) {
  return vi.fn(async (_collection: string, options: { limit: number; offset?: unknown }) => {
    if (options.limit > CAP) {
      throw new Error(
        `Bad request: Limit exceeded ${options.limit} > ${CAP} for "limit". ` +
          `Help: Reduce the "limit" parameter to or below ${CAP}.`
      );
    }
    const start = typeof options.offset === 'number' ? options.offset : 0;
    const page = allPoints.slice(start, start + options.limit);
    const next = start + page.length;
    return { points: page, next_page_offset: next < allPoints.length ? next : null };
  });
}

describe('duplicateVectorsForNewCourse against a strict-mode collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue(undefined);
  });

  it('never asks for a page larger than the collection allows', async () => {
    const points = buildPoints(TOTAL_POINTS);
    mockScroll.mockImplementation(strictScroll(points));
    const { duplicateVectorsForNewCourse } = await import('@/shared/qdrant/lifecycle');

    await duplicateVectorsForNewCourse('old-file', 'new-file', 'new-course', 'new-org');

    expect(mockScroll).toHaveBeenCalled();
    for (const [, options] of mockScroll.mock.calls) {
      expect((options as { limit: number }).limit).toBeLessThanOrEqual(CAP);
    }
  });

  it('duplicates every chunk, not just the first page', async () => {
    const points = buildPoints(TOTAL_POINTS);
    mockScroll.mockImplementation(strictScroll(points));
    const { duplicateVectorsForNewCourse } = await import('@/shared/qdrant/lifecycle');

    const duplicated = await duplicateVectorsForNewCourse(
      'old-file',
      'new-file',
      'new-course',
      'new-org'
    );

    expect(duplicated).toBe(TOTAL_POINTS);
    const uploaded = mockUpsert.mock.calls.flatMap(
      ([, body]) => (body as { points: unknown[] }).points
    );
    expect(uploaded).toHaveLength(TOTAL_POINTS);
  });

  it('rewrites the tenancy fields on every page, not only the first', async () => {
    const points = buildPoints(TOTAL_POINTS);
    mockScroll.mockImplementation(strictScroll(points));
    const { duplicateVectorsForNewCourse } = await import('@/shared/qdrant/lifecycle');

    await duplicateVectorsForNewCourse('old-file', 'new-file', 'new-course', 'new-org');

    const uploaded = mockUpsert.mock.calls.flatMap(
      ([, body]) => (body as { points: { payload: Record<string, unknown> }[] }).points
    );
    for (const point of uploaded) {
      expect(point.payload.document_id).toBe('new-file');
      expect(point.payload.course_id).toBe('new-course');
      expect(point.payload.organization_id).toBe('new-org');
    }
  });

  it('still reports zero when the document has no vectors yet', async () => {
    mockScroll.mockImplementation(strictScroll([]));
    const { duplicateVectorsForNewCourse } = await import('@/shared/qdrant/lifecycle');

    await expect(
      duplicateVectorsForNewCourse('old-file', 'new-file', 'new-course', 'new-org')
    ).resolves.toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
