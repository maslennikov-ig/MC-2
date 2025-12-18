import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from "sonner";
import { RefinementRequest } from '@megacampus/shared-types';
import { refineStageResult } from '@/app/actions/refinement';

export const useRefinement = (courseId: string) => {
  const [isRefining, setIsRefining] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsRefining(false);
    }
  }, []);

  const refine = useCallback(async (
      stageId: string,
      nodeId: string | undefined,
      attemptNumber: number,
      userMessage: string,
      previousOutput: string
  ) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsRefining(true);
    try {
      const request: RefinementRequest = {
          courseId,
          stageId: stageId as RefinementRequest['stageId'],
          nodeId,
          attemptNumber,
          userMessage,
          previousOutput
      };

      const response = await refineStageResult(request, controller.signal);

      // Only show success toast if request wasn't aborted
      if (!controller.signal.aborted) {
        toast.success("Refinement Started", {
            description: "AI is working on your changes. A new attempt will appear shortly.",
        });
      }

      return response;

    } catch (error) {
      // Don't show error toast for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      toast.error("Refinement Failed", {
          description: error instanceof Error ? error.message : "Could not submit refinement request. Please try again.",
      });
      throw error;
    } finally {
      // Only reset state if this is still the current controller
      if (abortControllerRef.current === controller) {
        setIsRefining(false);
        abortControllerRef.current = null;
      }
    }
  }, [courseId]);

  return {
    refine,
    isRefining,
    cancel
  };
};
