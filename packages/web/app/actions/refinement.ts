'use server';

import { ChatRequest, ChatResponse } from '@megacampus/shared-types/chat-types';
import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';
import { extractApiError } from '@/lib/api-error-handler';

/**
 * Submit a chat request to the backend
 * Connects to trpc.generation.chat
 */
export async function sendChatMessage(
  request: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/generation.chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to send chat message');
  }

  const data = await response.json();
  return data?.result?.data || data;
}
