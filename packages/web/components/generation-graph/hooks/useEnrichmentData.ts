'use client';

/**
 * useEnrichmentData Hook
 *
 * Fetches enrichment summaries for a course and subscribes to
 * Supabase Realtime for live status updates.
 *
 * Features:
 * - Initial data fetch with error handling
 * - Supabase Realtime subscription with exponential backoff retry
 * - Debounced refetch to batch rapid updates
 *
 * @module components/generation-graph/hooks/useEnrichmentData
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import { logger } from '@/lib/client-logger';
import type { EnrichmentSummaryForNode } from '@megacampus/shared-types';
import type { Database } from '@/types/database.generated';

type LessonEnrichmentsRow = Database['public']['Tables']['lesson_enrichments']['Row'];

/** Realtime retry configuration */
const REALTIME_RETRY_CONFIG = {
  /** Maximum retry attempts before giving up */
  maxRetries: 5,
  /** Base delay in milliseconds (doubles each retry) */
  baseDelay: 1000,
  /** Maximum delay in milliseconds */
  maxDelay: 30000,
} as const;

/**
 * Return type for useEnrichmentData hook
 */
export interface UseEnrichmentDataResult {
  /** Map of lessonId -> enrichment summaries */
  enrichmentsByLesson: Map<string, EnrichmentSummaryForNode[]>;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Error if query failed */
  error: Error | null;
  /** Whether realtime subscription is connected */
  isConnected: boolean;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Map database enrichment type to EnrichmentSummaryForNode type
 */
function mapEnrichmentType(
  dbType: Database['public']['Enums']['enrichment_type']
): EnrichmentSummaryForNode['type'] {
  // Database enum values match the expected types
  return dbType as EnrichmentSummaryForNode['type'];
}

/**
 * Map database enrichment status to EnrichmentSummaryForNode status
 */
function mapEnrichmentStatus(
  dbStatus: Database['public']['Enums']['enrichment_status']
): EnrichmentSummaryForNode['status'] {
  // Database enum values match the expected statuses
  return dbStatus as EnrichmentSummaryForNode['status'];
}

/**
 * Transform raw enrichment rows into a Map grouped by lessonId
 */
function transformEnrichmentsToMap(
  enrichments: LessonEnrichmentsRow[]
): Map<string, EnrichmentSummaryForNode[]> {
  const map = new Map<string, EnrichmentSummaryForNode[]>();

  for (const enrichment of enrichments) {
    const lessonId = enrichment.lesson_id;
    const existing = map.get(lessonId) || [];

    existing.push({
      type: mapEnrichmentType(enrichment.enrichment_type),
      status: mapEnrichmentStatus(enrichment.status),
      count: 1,
      hasError: enrichment.status === 'failed' || !!enrichment.error_message,
    });

    map.set(lessonId, existing);
  }

  return map;
}

/**
 * Hook for fetching and subscribing to enrichment data
 *
 * Fetches enrichment summaries for all lessons in a course and
 * subscribes to Supabase Realtime for live status updates.
 *
 * @param courseId - Course UUID
 * @param enabled - Whether to enable the query (default: true)
 * @returns Object with enrichment data and loading states
 *
 * @example
 * ```typescript
 * const { enrichmentsByLesson, isLoading, isConnected } = useEnrichmentData(courseId);
 *
 * // Get enrichments for a specific lesson
 * const lessonEnrichments = enrichmentsByLesson.get(lessonId) || [];
 * ```
 */
export function useEnrichmentData(
  courseId: string | undefined,
  enabled: boolean = true
): UseEnrichmentDataResult {
  const [enrichments, setEnrichments] = useState<LessonEnrichmentsRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Use ref for stable supabase client reference
  const supabaseRef = useRef(getSupabaseClient());

  // Fetch function wrapped in ref to avoid dependency changes
  const fetchEnrichments = useCallback(async () => {
    if (!courseId || !enabled) {
      setEnrichments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = supabaseRef.current;

      const { data, error: queryError } = await supabase
        .from('lesson_enrichments')
        .select('lesson_id, enrichment_type, status, error_message, title')
        .eq('course_id', courseId)
        .order('lesson_id', { ascending: true })
        .order('order_index', { ascending: true });

      if (queryError) {
        logger.error('[useEnrichmentData] Failed to fetch enrichments', {
          courseId,
          error: queryError.message,
        });
        setError(new Error(queryError.message));
        setEnrichments([]);
      } else {
        logger.debug('[useEnrichmentData] Enrichments fetched', {
          courseId,
          count: data?.length || 0,
        });
        setEnrichments((data || []) as LessonEnrichmentsRow[]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('[useEnrichmentData] Unexpected error fetching enrichments', {
        courseId,
        error: errorMessage,
      });
      setError(err instanceof Error ? err : new Error(errorMessage));
      setEnrichments([]);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, enabled]);

  // Store fetch function in ref for stable reference in realtime callback
  const fetchRef = useRef(fetchEnrichments);
  useEffect(() => {
    fetchRef.current = fetchEnrichments;
  }, [fetchEnrichments]);

  // Debounce timeout ref for batching rapid realtime updates
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const REFETCH_DEBOUNCE_MS = 300;

  // Initial fetch
  useEffect(() => {
    fetchEnrichments();
  }, [fetchEnrichments]);

  // Retry state refs for Realtime subscription
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null);

  // Supabase Realtime subscription with exponential backoff retry
  useEffect(() => {
    if (!courseId || !enabled) {
      setIsConnected(false);
      return;
    }

    let isMounted = true;
    const supabase = supabaseRef.current;

    logger.debug('[useEnrichmentData] Setting up realtime subscription', {
      courseId,
    });

    // Safe debounced refetch wrapper - batches rapid realtime updates
    const debouncedRefetch = () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        if (isMounted) {
          fetchRef.current();
        }
      }, REFETCH_DEBOUNCE_MS);
    };

    /**
     * Calculate exponential backoff delay
     */
    const getRetryDelay = (attempt: number): number => {
      const delay = Math.min(
        REALTIME_RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
        REALTIME_RETRY_CONFIG.maxDelay
      );
      // Add jitter (±10%) to prevent thundering herd
      const jitter = delay * 0.1 * (Math.random() * 2 - 1);
      return Math.round(delay + jitter);
    };

    /**
     * Create and subscribe to channel with retry logic
     */
    const createSubscription = () => {
      // Clean up previous channel if exists
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }

      const channel = supabase
        .channel(`enrichments:${courseId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'lesson_enrichments',
            filter: `course_id=eq.${courseId}`,
          },
          (payload) => {
            logger.debug('[useEnrichmentData] Enrichment change received', {
              event: payload.eventType,
              enrichmentId: (payload.new as Partial<LessonEnrichmentsRow>)?.id ||
                (payload.old as Partial<LessonEnrichmentsRow>)?.id,
              lessonId: (payload.new as Partial<LessonEnrichmentsRow>)?.lesson_id,
              status: (payload.new as Partial<LessonEnrichmentsRow>)?.status,
            });

            // Refetch to get updated data (debounced to batch rapid updates)
            debouncedRefetch();
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            logger.debug('[useEnrichmentData] Realtime subscription active', {
              courseId,
              retryCount: retryCountRef.current,
            });
            if (isMounted) {
              setIsConnected(true);
              retryCountRef.current = 0; // Reset retry count on success
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const errorMessage = err?.message ||
              (typeof err === 'object' ? JSON.stringify(err) : String(err)) ||
              'Unknown error';
            const logLevel = status === 'CHANNEL_ERROR' ? 'error' : 'warn';

            logger[logLevel]('[useEnrichmentData] Realtime subscription failed', {
              status,
              error: errorMessage,
              courseId,
              retryCount: retryCountRef.current,
            });

            if (isMounted) {
              setIsConnected(false);

              // Attempt retry with exponential backoff
              if (retryCountRef.current < REALTIME_RETRY_CONFIG.maxRetries) {
                const delay = getRetryDelay(retryCountRef.current);
                retryCountRef.current++;

                logger.info('[useEnrichmentData] Scheduling retry', {
                  courseId,
                  attempt: retryCountRef.current,
                  maxRetries: REALTIME_RETRY_CONFIG.maxRetries,
                  delayMs: delay,
                });

                retryTimeoutRef.current = setTimeout(() => {
                  if (isMounted) {
                    createSubscription();
                  }
                }, delay);
              } else {
                logger.error('[useEnrichmentData] Max retries reached, giving up', {
                  courseId,
                  maxRetries: REALTIME_RETRY_CONFIG.maxRetries,
                });
              }
            }
          } else if (status === 'CLOSED') {
            logger.debug('[useEnrichmentData] Realtime connection closed', {
              courseId,
            });
            if (isMounted) {
              setIsConnected(false);
            }
          }
        });

      channelRef.current = channel;
    };

    // Start subscription
    createSubscription();

    return () => {
      isMounted = false;
      // Clear any pending debounced refetch
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      // Reset retry count
      retryCountRef.current = 0;

      logger.debug('[useEnrichmentData] Unsubscribing from realtime channel', {
        courseId,
      });
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [courseId, enabled]);

  // Transform enrichments to Map (memoized)
  const enrichmentsByLesson = useMemo(
    () => transformEnrichmentsToMap(enrichments),
    [enrichments]
  );

  // Refetch function for external use
  const refetch = useCallback(() => {
    fetchEnrichments();
  }, [fetchEnrichments]);

  return {
    enrichmentsByLesson,
    isLoading,
    error,
    isConnected,
    refetch,
  };
}

export type { EnrichmentSummaryForNode };
