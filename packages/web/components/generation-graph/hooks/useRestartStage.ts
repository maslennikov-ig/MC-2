'use client';

import { useState, useCallback } from 'react';

interface RestartStageResult {
  success: boolean;
  jobId?: string;
  previousStatus?: string;
  newStatus?: string;
  stageNumber?: number;
  error?: string;
  code?: string;
}

interface UseRestartStageReturn {
  restartStage: (stageNumber: number) => Promise<RestartStageResult>;
  isRestarting: boolean;
  error: Error | null;
  lastResult: RestartStageResult | null;
}

/**
 * Hook for restarting course generation from a specific stage.
 *
 * Calls the /api/courses/[slug]/restart-stage endpoint which proxies
 * to tRPC generation.restartStage.
 *
 * Supported stages:
 * - Stage 2: Document Processing
 * - Stage 3: Classification
 * - Stage 4: Analysis
 * - Stage 5: Structure Generation
 * - Stage 6: Lesson Content (triggered from Stage 5)
 *
 * @param courseSlug - The course slug identifier
 * @returns Object with restartStage function, loading state, and error
 *
 * @example
 * ```tsx
 * const { restartStage, isRestarting, error } = useRestartStage('my-course');
 *
 * const handleRestart = async () => {
 *   const result = await restartStage(4);
 *   if (result.success) {
 *     console.log('Restarted from stage 4');
 *   }
 * };
 * ```
 */
export function useRestartStage(courseSlug: string): UseRestartStageReturn {
  const [isRestarting, setIsRestarting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastResult, setLastResult] = useState<RestartStageResult | null>(null);

  const restartStage = useCallback(
    async (stageNumber: number): Promise<RestartStageResult> => {
      // Validate stage number
      if (stageNumber < 2 || stageNumber > 6) {
        const err = new Error('Stage number must be between 2 and 6');
        setError(err);
        return { success: false, error: err.message, code: 'INVALID_STAGE' };
      }

      setIsRestarting(true);
      setError(null);
      setLastResult(null);

      try {
        const response = await fetch(`/api/courses/${courseSlug}/restart-stage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageNumber }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errorMessage = data.error || 'Failed to restart stage';
          const err = new Error(errorMessage);
          setError(err);
          const result: RestartStageResult = {
            success: false,
            error: errorMessage,
            code: data.code,
          };
          setLastResult(result);
          return result;
        }

        const result: RestartStageResult = {
          success: true,
          jobId: data.jobId,
          previousStatus: data.previousStatus,
          newStatus: data.newStatus,
          stageNumber: data.stageNumber,
        };
        setLastResult(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error during restart');
        setError(error);
        const result: RestartStageResult = {
          success: false,
          error: error.message,
          code: 'NETWORK_ERROR',
        };
        setLastResult(result);
        return result;
      } finally {
        setIsRestarting(false);
      }
    },
    [courseSlug]
  );

  return { restartStage, isRestarting, error, lastResult };
}
