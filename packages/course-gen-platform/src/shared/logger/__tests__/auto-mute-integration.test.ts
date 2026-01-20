/* eslint-disable */
/**
 * Integration test for auto-mute flow
 *
 * Tests the complete flow from logger.error() to auto_muted status in DB.
 *
 * @module tests/unit/auto-mute-integration.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logPermanentFailure } from '@/shared/logger/error-service';

describe('auto-mute integration', () => {
  let supabase: ReturnType<typeof getSupabaseAdmin>;
  let testOrgId: string;
  const testLogIds: string[] = [];

  beforeAll(async () => {
    supabase = getSupabaseAdmin();

    // Create test organization
    const timestamp = Date.now();
    const { data: org, error } = await supabase
      .from('organizations')
      .insert({
        name: `Test Org AutoMute ${timestamp}`,
        slug: `test-org-automute-${timestamp}`,
        tier: 'free',
      })
      .select('id')
      .single();

    if (error || !org) {
      throw new Error(`Failed to create test organization: ${error?.message}`);
    }

    testOrgId = (org as { id: string }).id;
  });

  afterAll(async () => {
    // Clean up log_issue_status entries
    if (testLogIds.length > 0) {
      await supabase
        .from('log_issue_status' as never)
        .delete()
        .in('log_id', testLogIds);
    }

    // Clean up error_logs entries
    if (testLogIds.length > 0) {
      await supabase
        .from('error_logs' as never)
        .delete()
        .in('id', testLogIds);
    }

    // Clean up test organization
    if (testOrgId) {
      await supabase.from('organizations').delete().eq('id', testOrgId);
    }
  });

  describe('logPermanentFailure with auto-mute patterns', () => {
    it('should auto-mute Redis connection ended errors', async () => {
      const errorMessage = 'Redis connection ended, no more reconnections';

      await logPermanentFailure({
        organization_id: testOrgId,
        error_message: errorMessage,
        severity: 'ERROR',
      });

      // Find the log entry we just created
      const { data: logs } = await supabase
        .from('error_logs' as never)
        .select('id')
        .eq('organization_id', testOrgId)
        .eq('error_message', errorMessage)
        .order('created_at', { ascending: false })
        .limit(1);

      const logId = (logs as Array<{ id: string }> | null)?.[0]?.id;
      expect(logId).toBeDefined();
      testLogIds.push(logId!);

      // Check log_issue_status has auto_muted entry
      const { data: statusEntries } = await supabase
        .from('log_issue_status' as never)
        .select('status, notes')
        .eq('log_id', logId!)
        .eq('log_type', 'error_log');

      const entry = (statusEntries as Array<{ status: string; notes: string }> | null)?.[0];
      expect(entry).toBeDefined();
      expect(entry?.status).toBe('auto_muted');
      expect(entry?.notes).toContain('graceful_shutdown');
    });

    it('should auto-mute Cloudflare 502 errors', async () => {
      const errorMessage = 'Cloudflare returned 502 Bad Gateway';

      await logPermanentFailure({
        organization_id: testOrgId,
        error_message: errorMessage,
        severity: 'ERROR',
      });

      // Find the log entry
      const { data: logs } = await supabase
        .from('error_logs' as never)
        .select('id')
        .eq('organization_id', testOrgId)
        .eq('error_message', errorMessage)
        .order('created_at', { ascending: false })
        .limit(1);

      const logId = (logs as Array<{ id: string }> | null)?.[0]?.id;
      expect(logId).toBeDefined();
      testLogIds.push(logId!);

      // Check log_issue_status
      const { data: statusEntries } = await supabase
        .from('log_issue_status' as never)
        .select('status, notes')
        .eq('log_id', logId!)
        .eq('log_type', 'error_log');

      const entry = (statusEntries as Array<{ status: string; notes: string }> | null)?.[0];
      expect(entry).toBeDefined();
      expect(entry?.status).toBe('auto_muted');
      expect(entry?.notes).toContain('external_service');
    });

    it('should NOT auto-mute regular errors', async () => {
      const errorMessage = 'Database constraint violation: unique key';

      await logPermanentFailure({
        organization_id: testOrgId,
        error_message: errorMessage,
        severity: 'ERROR',
      });

      // Find the log entry
      const { data: logs } = await supabase
        .from('error_logs' as never)
        .select('id')
        .eq('organization_id', testOrgId)
        .eq('error_message', errorMessage)
        .order('created_at', { ascending: false })
        .limit(1);

      const logId = (logs as Array<{ id: string }> | null)?.[0]?.id;
      expect(logId).toBeDefined();
      testLogIds.push(logId!);

      // Should NOT have any status entry (not auto-muted)
      const { data: statusEntries } = await supabase
        .from('log_issue_status' as never)
        .select('status')
        .eq('log_id', logId!)
        .eq('log_type', 'error_log');

      const entries = statusEntries as Array<{ status: string }> | null;
      expect(entries?.length ?? 0).toBe(0);
    });

    it('should handle multiple logs with same error message', async () => {
      const errorMessage = 'Redis connection ended - test duplicate';

      // Call twice with same error
      await logPermanentFailure({
        organization_id: testOrgId,
        error_message: errorMessage,
        severity: 'ERROR',
      });

      await logPermanentFailure({
        organization_id: testOrgId,
        error_message: errorMessage,
        severity: 'ERROR',
      });

      // Find both log entries
      const { data: logs } = await supabase
        .from('error_logs' as never)
        .select('id')
        .eq('organization_id', testOrgId)
        .eq('error_message', errorMessage)
        .order('created_at', { ascending: false })
        .limit(2);

      const entries = logs as Array<{ id: string }> | null;
      expect(entries).toHaveLength(2);

      // Track for cleanup
      if (entries) {
        testLogIds.push(...entries.map(e => e.id));
      }

      // Both should have auto_muted status
      for (const log of entries || []) {
        const { data: statusEntries } = await supabase
          .from('log_issue_status' as never)
          .select('status')
          .eq('log_id', log.id)
          .eq('log_type', 'error_log');

        const status = (statusEntries as Array<{ status: string }> | null)?.[0];
        expect(status?.status).toBe('auto_muted');
      }
    });
  });
});
