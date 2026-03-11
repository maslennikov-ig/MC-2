/**
 * Unit tests for pipeline-audit.ts
 *
 * Tests all 4 CRUD audit-logging functions with mocked Supabase.
 * No DI refactoring needed — getSupabaseAdmin() is mocked via vi.mock().
 *
 * @module tests/unit/services/pipeline-audit
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ============================================================================
// MOCKS — hoisted before imports
// ============================================================================

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mockSupabase),
}));

vi.mock('@/shared/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================
import {
  logPipelineAction,
  getResourceAuditLogs,
  getAdminAuditLogs,
  queryAuditLogs,
} from '@/services/pipeline-audit';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a chainable Supabase mock that returns `response` at terminal */
function mockChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, Mock> = {};
  const methods = ['insert', 'select', 'eq', 'order', 'limit', 'range', 'update'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain thenable so await resolves to `response`
  Object.defineProperty(chain, 'then', {
    value: (resolve: (v: typeof response) => void) => resolve(response),
    enumerable: false,
  });
  return chain;
}

const SAMPLE_ROW = {
  id: 'audit-1',
  admin_id: 'admin-uuid',
  action: 'update_model_config',
  resource_type: 'model_config',
  resource_id: 'config-uuid',
  metadata: { key: 'value' },
  created_at: '2025-01-01T00:00:00Z',
};

// ============================================================================
// TESTS
// ============================================================================

describe('pipeline-audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // logPipelineAction
  // --------------------------------------------------------------------------
  describe('logPipelineAction', () => {
    it('should insert audit log entry successfully', async () => {
      const chain = mockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      await logPipelineAction('admin-uuid', 'update_model_config', 'model_config', 'config-uuid', {
        temperature: 0.7,
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('admin_audit_logs');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          admin_id: 'admin-uuid',
          action: 'update_model_config',
          resource_type: 'model_config',
          resource_id: 'config-uuid',
        })
      );
    });

    it('should handle DB error silently by default', async () => {
      const chain = mockChain({ data: null, error: { message: 'DB connection lost' } });
      mockSupabase.from.mockReturnValue(chain);

      // Should NOT throw
      await expect(
        logPipelineAction('admin-uuid', 'create_backup', 'config_backup', 'backup-uuid')
      ).resolves.toBeUndefined();
    });

    it('should throw when failOnError is true and DB fails', async () => {
      const chain = mockChain({ data: null, error: { message: 'DB connection lost' } });
      mockSupabase.from.mockReturnValue(chain);

      await expect(
        logPipelineAction(
          'admin-uuid',
          'import_config',
          'config_import',
          'import-uuid',
          {},
          {
            failOnError: true,
          }
        )
      ).rejects.toThrow('Operation aborted for compliance');
    });

    it('should throw when failOnError is true and unexpected exception occurs', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Network failure');
      });

      await expect(
        logPipelineAction(
          'admin-uuid',
          'import_config',
          'config_import',
          'import-uuid',
          {},
          {
            failOnError: true,
          }
        )
      ).rejects.toThrow('operation aborted for compliance');
    });

    it('should insert empty metadata when none provided', async () => {
      const chain = mockChain({ data: null, error: null });
      mockSupabase.from.mockReturnValue(chain);

      await logPipelineAction(
        'admin-uuid',
        'view_global_settings',
        'global_settings',
        'settings-uuid'
      );

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {},
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // getResourceAuditLogs
  // --------------------------------------------------------------------------
  describe('getResourceAuditLogs', () => {
    it('should return mapped audit log entries', async () => {
      const chain = mockChain({ data: [SAMPLE_ROW], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getResourceAuditLogs('model_config', 'config-uuid', 20);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'audit-1',
        adminId: 'admin-uuid',
        action: 'update_model_config',
        resourceType: 'model_config',
        resourceId: 'config-uuid',
        metadata: { key: 'value' },
        createdAt: '2025-01-01T00:00:00Z',
      });
      expect(chain.eq).toHaveBeenCalledWith('resource_type', 'model_config');
      expect(chain.eq).toHaveBeenCalledWith('resource_id', 'config-uuid');
      expect(chain.limit).toHaveBeenCalledWith(20);
    });

    it('should return empty array on DB error', async () => {
      const chain = mockChain({ data: null, error: { message: 'permission denied' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getResourceAuditLogs('model_config', 'config-uuid');
      expect(result).toEqual([]);
    });

    it('should return empty array when no data found', async () => {
      const chain = mockChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getResourceAuditLogs('prompt_template', 'template-uuid');
      expect(result).toEqual([]);
    });

    it('should use default limit of 50', async () => {
      const chain = mockChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await getResourceAuditLogs('model_config', 'config-uuid');
      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('should handle null resource_id/resource_type in rows', async () => {
      const rowWithNulls = {
        ...SAMPLE_ROW,
        resource_type: null,
        resource_id: null,
      };
      const chain = mockChain({ data: [rowWithNulls], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getResourceAuditLogs('model_config', 'config-uuid');
      expect(result[0]!.resourceType).toBe('');
      expect(result[0]!.resourceId).toBe('');
    });

    it('should return empty array on unexpected exception', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await getResourceAuditLogs('model_config', 'config-uuid');
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // getAdminAuditLogs
  // --------------------------------------------------------------------------
  describe('getAdminAuditLogs', () => {
    it('should return mapped audit log entries for admin', async () => {
      const chain = mockChain({ data: [SAMPLE_ROW], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getAdminAuditLogs('admin-uuid', 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          action: 'update_model_config',
          resourceType: 'model_config',
        })
      );
      expect(chain.eq).toHaveBeenCalledWith('admin_id', 'admin-uuid');
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should return empty array on DB error', async () => {
      const chain = mockChain({ data: null, error: { message: 'error' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getAdminAuditLogs('admin-uuid');
      expect(result).toEqual([]);
    });

    it('should return empty array when no data found', async () => {
      const chain = mockChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getAdminAuditLogs('admin-uuid');
      expect(result).toEqual([]);
    });

    it('should handle null metadata in rows', async () => {
      const rowWithNullMeta = { ...SAMPLE_ROW, metadata: null };
      const chain = mockChain({ data: [rowWithNullMeta], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await getAdminAuditLogs('admin-uuid');
      expect(result[0]!.metadata).toEqual({});
    });
  });

  // --------------------------------------------------------------------------
  // queryAuditLogs
  // --------------------------------------------------------------------------
  describe('queryAuditLogs', () => {
    it('should query with resource type and action filters', async () => {
      const chain = mockChain({ data: [SAMPLE_ROW], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await queryAuditLogs({
        resourceType: 'model_config',
        action: 'update_model_config',
        limit: 25,
        offset: 10,
      });

      expect(result).toHaveLength(1);
      expect(chain.eq).toHaveBeenCalledWith('resource_type', 'model_config');
      expect(chain.eq).toHaveBeenCalledWith('action', 'update_model_config');
      expect(chain.range).toHaveBeenCalledWith(10, 34); // offset + limit - 1
    });

    it('should query without filters', async () => {
      const chain = mockChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await queryAuditLogs({});
      expect(result).toEqual([]);
      // Should not call eq for filters
      expect(chain.eq).not.toHaveBeenCalledWith('resource_type', expect.anything());
      expect(chain.eq).not.toHaveBeenCalledWith('action', expect.anything());
    });

    it('should use default limit and offset', async () => {
      const chain = mockChain({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await queryAuditLogs({});
      expect(chain.range).toHaveBeenCalledWith(0, 49); // default: offset=0, limit=50
    });

    it('should return empty array on DB error', async () => {
      const chain = mockChain({ data: null, error: { message: 'error' } });
      mockSupabase.from.mockReturnValue(chain);

      const result = await queryAuditLogs({ resourceType: 'model_config' });
      expect(result).toEqual([]);
    });

    it('should return empty array on unexpected exception', async () => {
      mockSupabase.from.mockImplementation(() => {
        throw new Error('Network crash');
      });

      const result = await queryAuditLogs({});
      expect(result).toEqual([]);
    });
  });
});
