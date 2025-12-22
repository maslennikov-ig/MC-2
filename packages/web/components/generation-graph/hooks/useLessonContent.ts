'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/client-logger';

/**
 * Lesson content data from lesson_contents table
 */
export interface LessonContentData {
  id: string;
  lesson_id: string;
  course_id: string;
  content: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  status: string;
  generation_attempt: number;
  parent_content_id: string | null;
  user_refinement_prompt: string | null;
  created_at: string;
  updated_at: string;
}

interface UseLessonContentOptions {
  /** Course UUID */
  courseId: string;
  /** Lesson ID in format "section.lesson" (e.g., "1.2") or lesson UUID */
  lessonId: string | null;
  /** Whether to fetch content (disabled when lessonId is null or not a lesson node) */
  enabled?: boolean;
}

/**
 * Hook for fetching lesson content from lesson_contents table
 *
 * Automatically fetches the latest version of generated content
 * for a specific lesson when enabled.
 *
 * @param options - Hook options
 * @returns Object with content data, loading state, and error
 *
 * @example
 * ```tsx
 * function LessonDetails({ courseId, lessonId }: { courseId: string; lessonId: string }) {
 *   const { data, isLoading, error, refetch } = useLessonContent({
 *     courseId,
 *     lessonId,
 *     enabled: !!lessonId,
 *   });
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!data) return <EmptyState />;
 *
 *   return <LessonContentView data={data} />;
 * }
 * ```
 */
export function useLessonContent({ courseId, lessonId, enabled = true }: UseLessonContentOptions) {
  const [data, setData] = useState<LessonContentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track current fetch to avoid race conditions
  const fetchIdRef = useRef(0);

  /**
   * Fetch lesson content from API
   */
  const fetchContent = useCallback(async () => {
    if (!courseId || !lessonId || !enabled) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/coursegen/lesson-content?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
        {
          credentials: 'include',
        }
      );

      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return;

      const responseData = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof responseData.error === 'string'
            ? responseData.error
            : responseData.error?.message || 'Ошибка загрузки контента';
        throw new Error(errorMessage);
      }

      // tRPC wraps response in { result: { data: {...} } }
      const content: LessonContentData | null = responseData.result?.data || null;
      setData(content);

      logger.debug('Lesson content fetched', {
        courseId,
        lessonId,
        found: !!content,
        contentLength: content?.content ? JSON.stringify(content.content).length : 0,
      });
    } catch (err) {
      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return;

      const fetchError = err instanceof Error ? err : new Error('Ошибка сети');
      setError(fetchError);
      setData(null);

      logger.error('Failed to fetch lesson content', {
        courseId,
        lessonId,
        error: fetchError.message,
      });
    } finally {
      // Skip if a newer fetch was started
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [courseId, lessonId, enabled]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    return fetchContent();
  }, [fetchContent]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
