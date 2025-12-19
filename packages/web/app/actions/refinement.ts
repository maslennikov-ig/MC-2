'use server';

import { RefinementRequest } from '@megacampus/shared-types';
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';
import { extractApiError } from '@/lib/api-error-handler';

/**
 * Submit a refinement request to the backend
 * T086a: Connects to trpc.generation.refine
 */
export async function refineStageResult(
  request: RefinementRequest,
  signal?: AbortSignal
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.refine`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to submit refinement');
  }

  const data = await response.json();
  return data?.result?.data || data;
}
