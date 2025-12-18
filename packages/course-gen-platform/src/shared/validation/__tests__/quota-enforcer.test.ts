/**
 * Integration tests for storage quota enforcement
 *
 * These tests verify:
 * - Quota checking logic
 * - Atomic increment/decrement operations
 * - Race condition handling
 * - Error handling and validation
 * - Byte formatting utilities
 *
 * @module shared/validation/__tests__/quota-enforcer.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  checkQuota,
  incrementQuota,
  decrementQuota,
  getQuotaInfo,
  formatBytes,
  calculateUsagePercentage,
  TIER_QUOTAS,
} from '../quota-enforcer';
import { QuotaExceededError } from '@/server/errors/typed-errors';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

// ============================================================================
// TEST SETUP
// ============================================================================

let testOrgId: string;
let supabase: ReturnType<typeof getSupabaseAdmin>;

beforeAll(async () => {
  supabase = getSupabaseAdmin();

  // Create a test organization with free tier (10 MB quota)
  const { data: org, error } = await supabase
    .from('organizations')
    .insert({
      name: `Test Org Quota ${Date.now()}`,
      tier: 'free',
      storage_quota_bytes: TIER_QUOTAS.free,
      storage_used_bytes: 0,
    })
    .select('id')
    .single();

  if (error || !org) {
    throw new Error(`Failed to create test organization: ${error?.message}`);
  }

  testOrgId = org.id;
});

afterAll(async () => {
  // Clean up test organization
  if (testOrgId) {
    await supabase.from('organizations').delete().eq('id', testOrgId);
  }
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('formatBytes', () => {
  it('should format zero bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(5242880)).toBe('5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(2147483648)).toBe('2 GB');
  });

  it('should format with decimals', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(7340032)).toBe('7 MB');
  });
});

describe('calculateUsagePercentage', () => {
  it('should return 0 for zero total', () => {
    expect(calculateUsagePercentage(100, 0)).toBe(0);
  });

  it('should calculate correct percentages', () => {
    expect(calculateUsagePercentage(0, 100)).toBe(0);
    expect(calculateUsagePercentage(50, 100)).toBe(50);
    expect(calculateUsagePercentage(100, 100)).toBe(100);
  });

  it('should cap at 100%', () => {
    expect(calculateUsagePercentage(150, 100)).toBe(100);
  });

  it('should handle decimal percentages', () => {
    expect(calculateUsagePercentage(33, 100)).toBe(33);
    expect(calculateUsagePercentage(1, 3)).toBeCloseTo(33.33, 2);
  });
});

// ============================================================================
// QUOTA CHECK TESTS
// ============================================================================

describe('checkQuota', () => {
  it('should allow upload within quota', async () => {
    const fileSize = 5242880; // 5 MB
    const result = await checkQuota(testOrgId, fileSize);

    expect(result.allowed).toBe(true);
    expect(result.currentUsage).toBe(0);
    expect(result.totalQuota).toBe(TIER_QUOTAS.free);
    expect(result.fileSize).toBe(fileSize);
    expect(result.projectedUsage).toBe(fileSize);
    expect(result.availableSpace).toBe(TIER_QUOTAS.free);
  });

  it('should reject upload exceeding quota', async () => {
    const fileSize = 20971520; // 20 MB (exceeds 10 MB free tier)
    const result = await checkQuota(testOrgId, fileSize);

    expect(result.allowed).toBe(false);
    expect(result.projectedUsage).toBeGreaterThan(result.totalQuota);
  });

  it('should return formatted values', async () => {
    const fileSize = 1048576; // 1 MB
    const result = await checkQuota(testOrgId, fileSize);

    expect(result.currentUsageFormatted).toBe('0 Bytes');
    expect(result.totalQuotaFormatted).toBe('10 MB');
    expect(result.availableSpaceFormatted).toBe('10 MB');
  });

  it('should throw error for invalid organizationId', async () => {
    await expect(checkQuota('', 1000)).rejects.toThrow('Invalid organizationId');
  });

  it('should throw error for invalid fileSize', async () => {
    await expect(checkQuota(testOrgId, 0)).rejects.toThrow('Invalid fileSize');
    await expect(checkQuota(testOrgId, -100)).rejects.toThrow('Invalid fileSize');
  });

  it('should throw error for non-existent organization', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(checkQuota(fakeId, 1000)).rejects.toThrow('Organization not found');
  });
});

// ============================================================================
// ATOMIC INCREMENT TESTS
// ============================================================================

describe('incrementQuota', () => {
  it('should successfully increment storage usage', async () => {
    const fileSize = 1048576; // 1 MB

    // Reset quota to ensure clean state
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Increment quota
    await incrementQuota(testOrgId, fileSize);

    // Verify increment
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize);
  });

  it('should handle multiple increments', async () => {
    const fileSize = 524288; // 512 KB

    // Reset quota
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Multiple increments
    await incrementQuota(testOrgId, fileSize);
    await incrementQuota(testOrgId, fileSize);
    await incrementQuota(testOrgId, fileSize);

    // Verify total
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize * 3);
  });

  it('should throw QuotaExceededError when exceeding quota', async () => {
    // Reset quota
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Try to increment beyond quota (free tier = 10 MB)
    const largeFile = 15728640; // 15 MB

    await expect(incrementQuota(testOrgId, largeFile)).rejects.toThrow(QuotaExceededError);

    // Verify storage wasn't incremented
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(0);
  });

  it('should throw error for invalid inputs', async () => {
    await expect(incrementQuota('', 1000)).rejects.toThrow('Invalid organizationId');
    await expect(incrementQuota(testOrgId, 0)).rejects.toThrow('Invalid fileSize');
    await expect(incrementQuota(testOrgId, -100)).rejects.toThrow('Invalid fileSize');
  });

  it('should throw error for non-existent organization', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(incrementQuota(fakeId, 1000)).rejects.toThrow('Organization not found');
  });
});

// ============================================================================
// ATOMIC DECREMENT TESTS
// ============================================================================

describe('decrementQuota', () => {
  it('should successfully decrement storage usage', async () => {
    const fileSize = 1048576; // 1 MB

    // Reset and set initial usage
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });
    await incrementQuota(testOrgId, fileSize * 3); // 3 MB

    // Decrement
    await decrementQuota(testOrgId, fileSize);

    // Verify
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize * 2); // 2 MB remaining
  });

  it('should handle multiple decrements', async () => {
    const fileSize = 524288; // 512 KB

    // Reset and set initial usage
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });
    await incrementQuota(testOrgId, fileSize * 5);

    // Multiple decrements
    await decrementQuota(testOrgId, fileSize);
    await decrementQuota(testOrgId, fileSize);

    // Verify
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize * 3);
  });

  it('should not go below zero', async () => {
    const fileSize = 1048576; // 1 MB

    // Reset to clean state
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Try to decrement from zero
    await decrementQuota(testOrgId, fileSize);

    // Verify it stays at zero
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(0);
  });

  it('should throw error for invalid inputs', async () => {
    await expect(decrementQuota('', 1000)).rejects.toThrow('Invalid organizationId');
    await expect(decrementQuota(testOrgId, 0)).rejects.toThrow('Invalid fileSize');
    await expect(decrementQuota(testOrgId, -100)).rejects.toThrow('Invalid fileSize');
  });

  it('should throw error for non-existent organization', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(decrementQuota(fakeId, 1000)).rejects.toThrow('Organization not found');
  });
});

// ============================================================================
// GET QUOTA INFO TESTS
// ============================================================================

describe('getQuotaInfo', () => {
  it('should return complete quota information', async () => {
    const fileSize = 2097152; // 2 MB

    // Reset and set usage
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });
    await incrementQuota(testOrgId, fileSize);

    // Get info
    const info = await getQuotaInfo(testOrgId);

    expect(info.organizationId).toBe(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize);
    expect(info.storageQuotaBytes).toBe(TIER_QUOTAS.free);
    expect(info.availableBytes).toBe(TIER_QUOTAS.free - fileSize);
    expect(info.tier).toBe('free');
    expect(info.storageUsedFormatted).toBe('2 MB');
    expect(info.storageQuotaFormatted).toBe('10 MB');
    expect(info.usagePercentage).toBeCloseTo(20, 1);
  });

  it('should calculate correct usage percentage', async () => {
    // Reset
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Use 50% of quota (5 MB of 10 MB)
    await incrementQuota(testOrgId, 5242880);

    const info = await getQuotaInfo(testOrgId);
    expect(info.usagePercentage).toBeCloseTo(50, 1);
  });

  it('should throw error for invalid organizationId', async () => {
    await expect(getQuotaInfo('')).rejects.toThrow('Invalid organizationId');
  });

  it('should throw error for non-existent organization', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(getQuotaInfo(fakeId)).rejects.toThrow('Organization not found');
  });
});

// ============================================================================
// RACE CONDITION TEST (Concurrent Operations)
// ============================================================================

describe('Race condition handling', () => {
  it('should handle concurrent increments atomically', async () => {
    const fileSize = 524288; // 512 KB
    const concurrentUploads = 10;

    // Reset
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Simulate concurrent uploads
    const promises = Array(concurrentUploads)
      .fill(null)
      .map(() => incrementQuota(testOrgId, fileSize));

    await Promise.all(promises);

    // Verify exact total (no race condition)
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize * concurrentUploads);
  });

  it('should handle concurrent increment and decrement', async () => {
    const fileSize = 524288; // 512 KB

    // Reset and set initial usage
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });
    await incrementQuota(testOrgId, fileSize * 10);

    // Concurrent operations
    const operations = [
      incrementQuota(testOrgId, fileSize),
      decrementQuota(testOrgId, fileSize),
      incrementQuota(testOrgId, fileSize),
      decrementQuota(testOrgId, fileSize),
    ];

    await Promise.all(operations);

    // Net effect should be zero change
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize * 10);
  });

  it('should enforce quota during concurrent uploads', async () => {
    const fileSize = 3145728; // 3 MB
    const concurrentUploads = 5; // Would total 15 MB, exceeding 10 MB quota

    // Reset
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Attempt concurrent uploads
    const promises = Array(concurrentUploads)
      .fill(null)
      .map(() => incrementQuota(testOrgId, fileSize));

    const results = await Promise.allSettled(promises);

    // Some should succeed, some should fail with QuotaExceededError
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(
      r => r.status === 'rejected' && r.reason instanceof QuotaExceededError
    ).length;

    expect(succeeded).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(0);
    expect(succeeded + failed).toBe(concurrentUploads);

    // Verify final usage doesn't exceed quota
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBeLessThanOrEqual(info.storageQuotaBytes);
  });
});

// ============================================================================
// INTEGRATION TEST: Complete Upload Flow
// ============================================================================

describe('Complete upload flow', () => {
  it('should handle full upload lifecycle', async () => {
    const fileSize = 2097152; // 2 MB

    // Reset
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Step 1: Check quota before upload
    const checkResult = await checkQuota(testOrgId, fileSize);
    expect(checkResult.allowed).toBe(true);

    // Step 2: Perform upload (simulated) and increment quota
    await incrementQuota(testOrgId, fileSize);

    // Step 3: Verify quota updated
    let info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize);

    // Step 4: Delete file and decrement quota
    await decrementQuota(testOrgId, fileSize);

    // Step 5: Verify quota freed
    info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(0);
  });

  it('should prevent upload when quota would be exceeded', async () => {
    const fileSize = 6291456; // 6 MB

    // Reset
    await supabase.rpc('reset_storage_quota', { org_id: testOrgId });

    // Upload first file (6 MB of 10 MB used)
    await incrementQuota(testOrgId, fileSize);

    // Try to upload second file (would exceed 10 MB quota)
    const checkResult = await checkQuota(testOrgId, fileSize);
    expect(checkResult.allowed).toBe(false);

    // Attempting increment should throw
    await expect(incrementQuota(testOrgId, fileSize)).rejects.toThrow(QuotaExceededError);

    // Verify quota unchanged
    const info = await getQuotaInfo(testOrgId);
    expect(info.storageUsedBytes).toBe(fileSize); // Still only first file
  });
});
