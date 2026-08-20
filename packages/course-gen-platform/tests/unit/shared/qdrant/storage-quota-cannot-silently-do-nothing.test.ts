/**
 * Contract: a storage quota update either happens or throws.
 *
 * `updateStorageQuota` called `update_organization_storage`, and when that RPC
 * failed it "fell back" to an UPDATE that set only `updated_at`. A comment
 * promised it would set `storage_used_bytes` by other means; it never did, and
 * the function returned successfully.
 *
 * The RPC was defined in `20251015_add_storage_quota_functions.sql`, which was
 * never applied — so the fallback ran on every single call. Measured on
 * 2026-08-20: 74 of 75 organizations at exactly `storage_used_bytes = 0` against
 * 243 MB of real files, and the quota check that reads that column therefore
 * could never trip (mc2-mg8un).
 *
 * The migration is applied now. This pins the other half: there is no correct
 * silent fallback for an atomic counter, so failure must be loud. A no-op that
 * reports success is how ten months passed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, rpc, from, update, eq } = vi.hoisted(() => {
  const rpc = vi.fn();
  const eq = vi.fn(() => Promise.resolve({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { createClient: vi.fn(() => ({ rpc, from })), rpc, from, update, eq };
});

vi.mock('@supabase/supabase-js', () => ({ createClient }));

vi.mock('@/shared/logger/index.js', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

import { updateStorageQuota } from '@/shared/qdrant/lifecycle';

const ORG_ID = '50000000-0000-4000-8000-000000000001';
const ONE_MIB = 1_048_576;

describe('updateStorageQuota when the RPC fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key-not-a-secret';
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  });

  it('throws instead of reporting success', async () => {
    rpc.mockResolvedValue({ error: { message: 'function does not exist' } });

    await expect(updateStorageQuota(ORG_ID, ONE_MIB, 'increment')).rejects.toThrow(
      /Failed to update storage quota/u
    );
  });

  it('does not pretend by writing a row that leaves the counter alone', async () => {
    rpc.mockResolvedValue({ error: { message: 'function does not exist' } });

    await expect(updateStorageQuota(ORG_ID, ONE_MIB, 'increment')).rejects.toThrow();

    // The old fallback did exactly this: `.from('organizations').update({ updated_at })`.
    // It touched the row, logged a warning, and returned as if the quota had moved.
    expect(from).not.toHaveBeenCalledWith('organizations');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('updateStorageQuota when the RPC succeeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-key-not-a-secret';
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  });

  it('sends a positive delta for an increment', async () => {
    rpc.mockResolvedValue({ error: null });
    // The quota check that follows an increment reads the row back.
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { storage_used_bytes: ONE_MIB, storage_quota_bytes: ONE_MIB * 100 },
              error: null,
            }),
        }),
      }),
    } as never);

    await updateStorageQuota(ORG_ID, ONE_MIB, 'increment');

    expect(rpc).toHaveBeenCalledWith('update_organization_storage', {
      p_organization_id: ORG_ID,
      p_delta_bytes: ONE_MIB,
    });
  });

  it('sends a negative delta for a decrement, and does not re-check the quota', async () => {
    rpc.mockResolvedValue({ error: null });

    await updateStorageQuota(ORG_ID, ONE_MIB, 'decrement');

    expect(rpc).toHaveBeenCalledWith('update_organization_storage', {
      p_organization_id: ORG_ID,
      p_delta_bytes: -ONE_MIB,
    });
    // Freeing space cannot put an organization over its quota.
    expect(from).not.toHaveBeenCalled();
  });
});
