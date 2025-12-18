'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  debounceMs?: number;      // Default: 1000ms
  savedDurationMs?: number; // How long to show "saved" before idle. Default: 2000ms
}

interface UseAutoSaveResult {
  status: SaveStatus;
  error: string | null;
  save: (fieldPath: string, value: unknown) => void;
  flush: () => void;        // Immediately save (for onBlur)
  reset: () => void;        // Reset to idle
}

/**
 * Hook for auto-saving field changes with debouncing and status tracking.
 *
 * Provides a debounced save function that tracks the save lifecycle:
 * idle -> saving -> saved/error -> idle. The "saved" status automatically
 * transitions to "idle" after a configured duration.
 *
 * @param mutationFn - Async function that performs the save operation
 * @param baseInput - Base input object (e.g., { courseId, stageId }) merged with fieldPath/value
 * @param options - Configuration options for debounce and saved duration
 * @returns Object with save function, status, error, flush, and reset methods
 *
 * @example
 * ```tsx
 * const mutation = trpc.generation.updateField.useMutation();
 *
 * const { status, save, flush } = useAutoSave(
 *   mutation.mutateAsync,
 *   { courseId, stageId: 'stage_4' }
 * );
 *
 * <input
 *   onChange={(e) => save('topic_analysis.determined_topic', e.target.value)}
 *   onBlur={() => flush()}
 * />
 * <SaveStatusIndicator status={status} />
 * ```
 */
export function useAutoSave<TInput extends { fieldPath: string; value: unknown }>(
  mutationFn: (input: TInput) => Promise<unknown>,
  baseInput: Omit<TInput, 'fieldPath' | 'value'>,
  options?: UseAutoSaveOptions
): UseAutoSaveResult {
  const debounceMs = options?.debounceMs ?? 1000;
  const savedDurationMs = options?.savedDurationMs ?? 2000;

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSaveRef = useRef<ReturnType<typeof useDebouncedCallback<typeof performSave>> | null>(null);

  const performSave = useCallback(async (fieldPath: string, value: unknown) => {
    // Clear any existing "saved" timeout
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = null;
    }

    // Reset error on new save attempt
    setError(null);
    setStatus('saving');

    try {
      const input = {
        ...baseInput,
        fieldPath,
        value,
      } as TInput;

      await mutationFn(input);

      setStatus('saved');

      // Automatically transition to idle after savedDurationMs
      savedTimeoutRef.current = setTimeout(() => {
        setStatus('idle');
        savedTimeoutRef.current = null;
      }, savedDurationMs);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Save failed';
      setError(errorMessage);
      setStatus('error');
    }
  }, [mutationFn, baseInput, savedDurationMs]);

  const debouncedSave = useDebouncedCallback(
    performSave,
    debounceMs
  );

  // Store ref for cleanup
  debouncedSaveRef.current = debouncedSave;

  // Cleanup on unmount: cancel pending debounced calls and clear timeouts
  useEffect(() => {
    return () => {
      // Cancel pending debounced save to prevent memory leak
      debouncedSaveRef.current?.cancel();
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const flush = useCallback(() => {
    debouncedSave.flush();
  }, [debouncedSave]);

  const reset = useCallback(() => {
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = null;
    }
    setStatus('idle');
    setError(null);
  }, []);

  return {
    status,
    error,
    save: debouncedSave,
    flush,
    reset,
  };
}
