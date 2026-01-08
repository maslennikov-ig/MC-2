'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSupabase } from '@/lib/supabase/browser-client';
import type {
  CardEnrichmentContent,
  EnrichmentMetadata,
} from '@megacampus/shared-types';

// Backend URL configuration (client-safe)
// In production, use relative URL /api (nginx proxies to API server)
// In development, use env var or default to localhost:3456
const BACKEND_URL = (() => {
  const url = process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL;

  // If env var is set, use it
  if (url) return url;

  // In browser, check if we're in production (not localhost)
  if (typeof window !== 'undefined') {
    const isProduction = window.location.hostname !== 'localhost' &&
                         window.location.hostname !== '127.0.0.1';
    if (isProduction) {
      // Use relative URL - nginx proxies /api/trpc to API server
      return '/api';
    }
  }

  // Development fallback
  return 'http://localhost:3456';
})();
const TRPC_URL = `${BACKEND_URL}/trpc`;

/**
 * Default polling interval for card generation status checks.
 * 3 seconds balances responsiveness with server load.
 * Card generation typically takes 10-30 seconds.
 */
const DEFAULT_POLLING_INTERVAL_MS = 3000;

// ============================================================================
// Types - Single Source of Truth from @megacampus/shared-types
// ============================================================================

/**
 * Re-export shared types for convenience.
 * CardEnrichmentContent is the canonical type for card content.
 * EnrichmentMetadata is the canonical type for generation metadata.
 *
 * @see packages/shared-types/src/enrichment-content.ts
 */
export type { CardEnrichmentContent, EnrichmentMetadata };

/**
 * Card data returned from the API
 */
export interface CardData {
  /** Enrichment UUID */
  id: string;
  /** Current generation status */
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'cancelled';
  /** Card content - uses CardEnrichmentContent from shared-types */
  content: CardEnrichmentContent | null;
  /** Card metadata - uses EnrichmentMetadata from shared-types */
  metadata: EnrichmentMetadata | null;
  /** Last update timestamp */
  updatedAt: string;
  /** Generation attempt number */
  generationAttempt: number;
  /** Error message if failed */
  errorMessage: string | null;
}

/**
 * Parameters for the useAutoCard hook
 */
export interface UseAutoCardParams {
  /** Course UUID */
  courseId: string;
  /** Lesson UUID (required for lesson cards) */
  lessonId?: string;
  /** Type of card: course or lesson */
  cardType: 'course' | 'lesson';
  /** Enable/disable the hook */
  enabled?: boolean;
  /** Polling interval in ms when status is pending/generating (default: 3000) */
  pollingInterval?: number;
}

/**
 * Return type for the useAutoCard hook
 */
export interface UseAutoCardResult {
  /** Card data or null if not found */
  card: CardData | null;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Regeneration in progress */
  isRegenerating: boolean;
  /** Error from fetch or regeneration */
  error: Error | null;
  /** Refetch card data */
  refetch: () => Promise<void>;
  /** Regenerate the card */
  regenerate: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for fetching and managing auto-generated cards
 *
 * Features:
 * - Auto-fetches card data on mount
 * - Polls while status is 'pending' or 'generating'
 * - Provides regenerate mutation
 * - Handles loading/error states
 *
 * @example
 * ```tsx
 * const { card, isLoading, regenerate } = useAutoCard({
 *   courseId: 'uuid',
 *   cardType: 'course',
 * });
 *
 * if (isLoading) return <Skeleton />;
 * if (card?.content) return <Image src={card.content.imageUrl} />;
 * ```
 */
export function useAutoCard({
  courseId,
  lessonId,
  cardType,
  enabled = true,
  pollingInterval = DEFAULT_POLLING_INTERVAL_MS,
}: UseAutoCardParams): UseAutoCardResult {
  const { session } = useSupabase();
  const [card, setCard] = useState<CardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for cleanup and abort
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Get auth headers from current session (client-side)
   */
  const getAuthHeaders = useCallback((): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    };
  }, [session]);

  /**
   * Fetch card data from tRPC API
   * @param showLoading - Whether to show loading state
   * @param signal - AbortSignal for cancellation
   */
  const fetchCard = useCallback(async (
    showLoading = true,
    signal?: AbortSignal
  ): Promise<CardData | null> => {
    // Validate inputs
    if (!courseId) return null;
    if (cardType === 'lesson' && !lessonId) return null;

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const headers = getAuthHeaders();

      // Build query params for GET request
      const params = new URLSearchParams({
        input: JSON.stringify({
          courseId,
          ...(lessonId && { lessonId }),
          cardType,
        }),
      });

      const response = await fetch(`${TRPC_URL}/enrichment.getAutoCard?${params}`, {
        method: 'GET',
        headers,
        signal, // Support cancellation
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch card: ${response.status}`);
      }

      const result = await response.json();

      // tRPC wraps the response in result.data
      const cardData = result.result?.data;

      if (isMountedRef.current) {
        setCard(cardData);
      }

      return cardData;
    } catch (err) {
      // Ignore abort errors - they're expected during cleanup
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(errorObj);
      }
      return null;
    } finally {
      if (isMountedRef.current && showLoading) {
        setIsLoading(false);
      }
    }
  }, [courseId, lessonId, cardType, getAuthHeaders]);

  /**
   * Refetch wrapper
   */
  const refetch = useCallback(async () => {
    await fetchCard(true);
  }, [fetchCard]);

  /**
   * Regenerate card mutation with optimistic update
   */
  const regenerate = useCallback(async () => {
    // Validate inputs
    if (!courseId) return;
    if (cardType === 'lesson' && !lessonId) return;

    setIsRegenerating(true);
    setError(null);

    // Optimistic update - immediately show pending status for better UX
    const previousCard = card;
    if (card) {
      setCard({
        ...card,
        status: 'pending',
        content: null, // Clear previous content
        generationAttempt: card.generationAttempt + 1,
        errorMessage: null,
      });
    }

    try {
      const headers = getAuthHeaders();

      const response = await fetch(`${TRPC_URL}/enrichment.regenerateAutoCard`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId,
          ...(lessonId && { lessonId }),
          cardType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to regenerate card: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.result?.data?.success) {
        throw new Error(result.result?.data?.error || 'Unknown error');
      }

      // Refetch to get server state (polling will take over)
      await fetchCard(false);
    } catch (err) {
      // Revert optimistic update on error
      if (isMountedRef.current && previousCard) {
        setCard(previousCard);
      }

      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(errorObj);
      }
    } finally {
      if (isMountedRef.current) {
        setIsRegenerating(false);
      }
    }
  }, [courseId, lessonId, cardType, card, fetchCard, getAuthHeaders]);

  /**
   * Schedule next poll - called after each fetch to continue polling if needed.
   * No dependency on card state to avoid circular useEffect dependencies.
   */
  const scheduleNextPoll = useCallback(() => {
    // Clear any existing timeout
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }

    pollingTimeoutRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;

      const updatedCard = await fetchCard(false);

      // Continue polling if still pending/generating
      if (updatedCard && ['pending', 'generating'].includes(updatedCard.status)) {
        scheduleNextPoll(); // Recursive, controlled by status check
      }
    }, pollingInterval);
  }, [fetchCard, pollingInterval]); // No card dependency!

  // Initial fetch with AbortController
  useEffect(() => {
    isMountedRef.current = true;

    // Create abort controller for this effect
    abortControllerRef.current = new AbortController();

    if (enabled) {
      fetchCard(true, abortControllerRef.current.signal);
    }

    return () => {
      isMountedRef.current = false;
      // Abort any in-flight requests
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      // Clear polling timeout
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, [enabled, fetchCard]);

  // Start/stop polling based on card status changes only
  // Use card?.status and card?.id to avoid triggering on every card object change
  useEffect(() => {
    const shouldPoll = enabled && card && ['pending', 'generating'].includes(card.status);

    if (shouldPoll) {
      scheduleNextPoll();
    }

    return () => {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, [enabled, card?.status, card?.id, scheduleNextPoll]);

  return {
    card,
    isLoading,
    isRegenerating,
    error,
    refetch,
    regenerate,
  };
}
