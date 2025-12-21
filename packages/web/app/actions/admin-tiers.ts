'use server';

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';
import type { TierSettings } from '@megacampus/shared-types';

export interface UpdateTierSettingsParams {
  tierKey: 'trial' | 'free' | 'basic' | 'standard' | 'premium';
  displayName: string;
  storageQuotaBytes: number;
  maxFileSizeBytes: number;
  maxFilesPerCourse: number;
  maxConcurrentJobs: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  monthlyPriceCents: number;
  features?: Record<string, unknown>;
  isActive: boolean;
}

export async function listTiersAction(): Promise<TierSettings[]> {
  const headers = await getBackendAuthHeaders();

  try {
    const res = await fetch(`${TRPC_URL}/admin.listTiers`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = 'Failed to load tier settings';

      try {
        const errorJson = JSON.parse(text);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        } else if (errorJson.error?.json?.message) {
          // tRPC error format
          errorMessage = errorJson.error.json.message;
        }
      } catch {
        // Text is not JSON, use status text
        errorMessage = res.statusText || errorMessage;
      }

      console.error('List tiers fetch failed:', text);
      throw new Error(errorMessage);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data as TierSettings[];
  } catch (error) {
    console.error('List Tiers Server Action Error:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading tier settings'
    );
  }
}

export async function updateTierSettingsAction(params: UpdateTierSettingsParams): Promise<TierSettings> {
  const headers = await getBackendAuthHeaders();

  try {
    const res = await fetch(`${TRPC_URL}/admin.updateTierSettings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = 'Failed to update tier settings';

      try {
        const errorJson = JSON.parse(text);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        } else if (errorJson.error?.json?.message) {
          // tRPC error format
          errorMessage = errorJson.error.json.message;
        }
      } catch {
        // Text is not JSON, use status text
        errorMessage = res.statusText || errorMessage;
      }

      console.error('Update tier settings failed:', text);
      throw new Error(errorMessage);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data as TierSettings;
  } catch (error) {
    console.error('Update Tier Settings Server Action Error:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while updating tier settings'
    );
  }
}
