import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DuplicateFileResult } from '@/shared/types/database-queries';

const { mockCreateClient, mockQdrantDelete, mockQdrantScroll, mockQdrantUpsert, mockLogger } =
  vi.hoisted(() => ({
    mockCreateClient: vi.fn(),
    mockQdrantDelete: vi.fn(),
    mockQdrantScroll: vi.fn(),
    mockQdrantUpsert: vi.fn(),
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((...args) => mockCreateClient(...args)),
}));

vi.mock('@/shared/qdrant/client', () => ({
  qdrantClient: {
    delete: vi.fn((...args) => mockQdrantDelete(...args)),
    scroll: vi.fn((...args) => mockQdrantScroll(...args)),
    upsert: vi.fn((...args) => mockQdrantUpsert(...args)),
  },
}));

vi.mock('@/shared/logger/index.js', () => ({
  logger: mockLogger,
  default: mockLogger,
}));

function createStorageQuotaSupabase() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table: string) => {
      expect(table).toBe('organizations');

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                storage_used_bytes: 10,
                storage_quota_bytes: 100,
              },
              error: null,
            }),
          })),
        })),
      };
    }),
  };
}

function createInsertSupabase(insertedFileId = 'reference-file-id') {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: insertedFileId,
      organization_id: 'org-1',
      course_id: 'course-1',
      filename: 'duplicate.pdf',
      file_type: 'pdf',
      file_size: 9,
      storage_path: '/files/original.pdf',
      hash: 'hash-1',
      mime_type: 'application/pdf',
      vector_status: 'indexed',
      original_file_id: 'original-file-id',
      reference_count: 1,
      parsed_content: null,
      markdown_content: 'markdown',
    },
    error: null,
  });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
  const from = vi.fn((table: string) => {
    expect(table).toBe('file_catalog');
    return {
      insert,
      delete: vi.fn(() => ({
        eq: deleteEq,
      })),
    };
  });

  return {
    supabase: {
      from,
      rpc,
    } as unknown as SupabaseClient,
    rpc,
    insert,
    deleteEq,
  };
}

function createDeleteSupabase() {
  const referenceFile = {
    id: 'reference-file-id',
    organization_id: 'org-1',
    course_id: 'course-1',
    filename: 'duplicate.pdf',
    file_type: 'pdf',
    file_size: 9,
    storage_path: '/files/original.pdf',
    hash: 'hash-1',
    mime_type: 'application/pdf',
    vector_status: 'indexed',
    original_file_id: 'original-file-id',
    reference_count: 1,
    parsed_content: null,
    markdown_content: 'markdown',
  };
  const fileCatalogReads = [
    { data: referenceFile, error: null },
    { data: { reference_count: 1 }, error: null },
  ];
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    rpc,
    from: vi.fn((table: string) => {
      if (table === 'file_catalog') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockImplementation(() => Promise.resolve(fileCatalogReads.shift())),
            })),
          })),
          delete: vi.fn(() => ({
            eq: deleteEq,
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    deleteEq,
  };
}

function createOriginalWithReferencesSupabase() {
  const originalFile = {
    id: 'original-file-id',
    organization_id: 'org-1',
    course_id: 'course-1',
    filename: 'original.pdf',
    file_type: 'pdf',
    file_size: 9,
    storage_path: '/files/original.pdf',
    hash: 'hash-1',
    mime_type: 'application/pdf',
    vector_status: 'indexed',
    original_file_id: null,
    reference_count: 2,
    parsed_content: null,
    markdown_content: 'markdown',
  };
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    rpc,
    from: vi.fn((table: string) => {
      if (table === 'file_catalog') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: originalFile, error: null }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: deleteEq,
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    deleteEq,
  };
}

describe('qdrant lifecycle reference count ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_SERVICE_KEY = 'dummy';

    mockQdrantDelete.mockResolvedValue({});
    mockQdrantScroll.mockResolvedValue({
      points: [
        {
          id: 1,
          vector: [0.1, 0.2],
          payload: {
            document_id: 'original-file-id',
            course_id: 'original-course-id',
            organization_id: 'original-org-id',
            chunk_id: 'chunk-1',
          },
        },
      ],
    });
    mockQdrantUpsert.mockResolvedValue({});
  });

  it('creates deduplicated reference rows without manually incrementing file_catalog counts', async () => {
    const insertSupabase = createInsertSupabase();
    const storageQuotaSupabase = createStorageQuotaSupabase();
    mockCreateClient.mockReturnValue(storageQuotaSupabase);

    const { processDeduplicatedUpload } = await import('@/shared/qdrant/lifecycle-helpers');

    await expect(
      processDeduplicatedUpload(
        insertSupabase.supabase,
        Buffer.from('duplicate'),
        {
          filename: 'duplicate.pdf',
          organization_id: 'org-1',
          course_id: 'course-1',
          mime_type: 'application/pdf',
        },
        'hash-1',
        {
          file_id: 'original-file-id',
          storage_path: '/files/original.pdf',
          vector_status: 'indexed',
          reference_count: 1,
          parsed_content: null,
          markdown_content: 'markdown',
          file_size: 9,
          mime_type: 'application/pdf',
        } as DuplicateFileResult
      )
    ).resolves.toEqual({
      file_id: 'reference-file-id',
      vectors_duplicated: 1,
    });

    expect(insertSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_file_id: 'original-file-id',
        reference_count: 1,
      })
    );
    expect(insertSupabase.rpc).not.toHaveBeenCalledWith(
      'increment_file_reference_count',
      expect.anything()
    );
  });

  it('rolls back inserted reference rows without manually decrementing when deduplication fails', async () => {
    const insertSupabase = createInsertSupabase();
    mockQdrantUpsert.mockRejectedValueOnce(new Error('qdrant unavailable'));

    const { processDeduplicatedUpload } = await import('@/shared/qdrant/lifecycle-helpers');

    await expect(
      processDeduplicatedUpload(
        insertSupabase.supabase,
        Buffer.from('duplicate'),
        {
          filename: 'duplicate.pdf',
          organization_id: 'org-1',
          course_id: 'course-1',
          mime_type: 'application/pdf',
        },
        'hash-1',
        {
          file_id: 'original-file-id',
          storage_path: '/files/original.pdf',
          vector_status: 'indexed',
          reference_count: 1,
          parsed_content: null,
          markdown_content: 'markdown',
          file_size: 9,
          mime_type: 'application/pdf',
        } as DuplicateFileResult
      )
    ).rejects.toThrow(/Vector duplication failed/);

    expect(insertSupabase.deleteEq).toHaveBeenCalledWith('id', 'reference-file-id');
    expect(insertSupabase.rpc).not.toHaveBeenCalledWith(
      'decrement_file_reference_count',
      expect.anything()
    );
  });

  it('deletes reference rows without manually decrementing and returns the persisted remaining count', async () => {
    const supabase = createDeleteSupabase();
    mockCreateClient.mockReturnValue(supabase);

    const { handleFileDelete } = await import('@/shared/qdrant/lifecycle');

    await expect(handleFileDelete('reference-file-id')).resolves.toMatchObject({
      physical_file_deleted: false,
      remaining_references: 1,
      storage_freed_bytes: 9,
    });

    expect(supabase.deleteEq).toHaveBeenCalledWith('id', 'reference-file-id');
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'decrement_file_reference_count',
      expect.anything()
    );
    expect(supabase.rpc).toHaveBeenCalledWith('update_organization_storage', {
      p_organization_id: 'org-1',
      p_delta_bytes: -9,
    });
  });

  it('blocks deleting an original row while active references still point at it', async () => {
    const supabase = createOriginalWithReferencesSupabase();
    mockCreateClient.mockReturnValue(supabase);

    const { handleFileDelete } = await import('@/shared/qdrant/lifecycle');

    await expect(handleFileDelete('original-file-id')).rejects.toThrow(/active references/);

    expect(mockQdrantDelete).not.toHaveBeenCalled();
    expect(supabase.deleteEq).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      'decrement_file_reference_count',
      expect.anything()
    );
  });
});
