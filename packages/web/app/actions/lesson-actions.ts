'use server';

import { getBackendAuthHeaders, TRPC_URL } from '@/lib/auth';
import { extractApiError } from '@/lib/api-error-handler';

/**
 * Approve a lesson after review
 * Connects to trpc.lessonContent.approveLesson
 */
export async function approveLesson(
  courseId: string,
  lessonId: string,
  signal?: AbortSignal
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/lessonContent.approveLesson`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, lessonId }),
    signal,
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to approve lesson');
  }

  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Update lesson content (manual edits)
 * Connects to trpc.lessonContent.updateLessonContent
 */
export async function updateLessonContent(
  courseId: string,
  lessonId: string,
  content: Record<string, unknown>,
  signal?: AbortSignal
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/lessonContent.updateLessonContent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, lessonId, content }),
    signal,
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to update lesson content');
  }

  const data = await response.json();
  return data?.result?.data || data;
}

/**
 * Regenerate a lesson (uses existing retryLesson procedure)
 * Connects to trpc.lessonContent.retryLesson
 */
export async function regenerateLesson(
  courseId: string,
  lessonId: string,
  lessonSpec: unknown,
  signal?: AbortSignal
) {
  const headers = await getBackendAuthHeaders();

  const response = await fetch(`${TRPC_URL}/lessonContent.retryLesson`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ courseId, lessonId, lessonSpec }),
    signal,
  });

  if (!response.ok) {
    await extractApiError(response, 'Failed to regenerate lesson');
  }

  const data = await response.json();
  return data?.result?.data || data;
}
