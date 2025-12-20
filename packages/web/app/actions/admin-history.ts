'use server';

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';

interface HistoryParams {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  language?: 'ru' | 'en' | 'all';
}

export async function getGenerationHistoryAction(params: HistoryParams) {
  const headers = await getBackendAuthHeaders();

  const queryInput: Record<string, unknown> = {
    limit: params.limit,
    offset: params.offset,
  };

  if (params.search) queryInput.search = params.search;
  if (params.status && params.status !== 'all') queryInput.status = params.status;
  if (params.language && params.language !== 'all') queryInput.language = params.language;

  const query = encodeURIComponent(JSON.stringify(queryInput));

  try {
    const res = await fetch(`${TRPC_URL}/admin.getGenerationHistory?input=${query}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('History fetch failed:', text);
      throw new Error(`Failed to fetch history: ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      throw new Error(json.error.message);
    }

    return json.result.data;
  } catch (error) {
    console.error('Server Action Error:', error);
    throw error;
  }
}
