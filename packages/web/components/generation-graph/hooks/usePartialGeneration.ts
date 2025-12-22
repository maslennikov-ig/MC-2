'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/client-logger';

/**
 * Result from partial generation API
 */
interface PartialGenerationResult {
  success: boolean;
  jobCount: number;
  jobIds: string[];
  selectedLessonIds: string[];
}

/**
 * Job status from the API
 */
interface JobStatus {
  job_id: string;
  status: 'pending' | 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress?: { percent?: number; status?: string };
}

/**
 * Tracked job with lesson mapping
 */
interface TrackedJob {
  jobId: string;
  lessonId: string;
  status: JobStatus['status'];
}

const POLL_INTERVAL = 3000; // Poll every 3 seconds

/**
 * Hook for partial lesson generation (selected lessons or sections)
 *
 * Provides functions to generate specific lessons or entire sections
 * via the /api/coursegen/partial-generate endpoint which proxies to
 * the tRPC lessonContent.partialGenerate mutation.
 *
 * Features:
 * - Automatic job status polling to track generation progress
 * - isGenerating stays true until all jobs complete/fail
 * - Individual lesson tracking via isLessonGenerating
 *
 * @param courseId - Course UUID identifier
 * @returns Object with generation functions, loading state, and error
 */
export function usePartialGeneration(courseId: string) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>([]);
  const [generatingSectionIds, setGeneratingSectionIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<Error | null>(null);
  const [lastResult, setLastResult] = useState<PartialGenerationResult | null>(null);

  // Pending lesson IDs - for UI reactivity (triggers re-renders)
  const [pendingLessonIds, setPendingLessonIds] = useState<Set<string>>(new Set());

  // Refs for SYNCHRONOUS checks (prevents race conditions on rapid clicks)
  const pendingLessonIdsRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const trackedJobsRef = useRef<TrackedJob[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    trackedJobsRef.current = trackedJobs;
  }, [trackedJobs]);

  /**
   * Fetch status for a single job
   */
  const fetchJobStatus = useCallback(async (jobId: string): Promise<JobStatus | null> => {
    try {
      const response = await fetch(`/api/coursegen/job-status?jobId=${encodeURIComponent(jobId)}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      // tRPC wraps in { result: { data: {...} } }
      return data.result?.data || data;
    } catch {
      return null;
    }
  }, []);

  /**
   * Poll all tracked jobs and update their status
   * Uses ref to avoid dependency cycle
   */
  const pollJobStatuses = useCallback(async () => {
    const currentJobs = trackedJobsRef.current;
    if (currentJobs.length === 0) {
      return;
    }

    const updatedJobs: TrackedJob[] = [];
    let allComplete = true;

    for (const job of currentJobs) {
      // Skip already completed/failed jobs
      if (job.status === 'completed' || job.status === 'failed') {
        updatedJobs.push(job);
        continue;
      }

      const status = await fetchJobStatus(job.jobId);
      if (status) {
        updatedJobs.push({
          ...job,
          status: status.status,
        });

        if (status.status !== 'completed' && status.status !== 'failed') {
          allComplete = false;
        }
      } else {
        // Keep existing if fetch failed
        updatedJobs.push(job);
        allComplete = false;
      }
    }

    setTrackedJobs(updatedJobs);

    // If all jobs complete, stop polling
    if (allComplete && updatedJobs.length > 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setIsGenerating(false);
      setGeneratingSectionIds(new Set());

      // Show completion toast
      const completedCount = updatedJobs.filter(j => j.status === 'completed').length;
      const failedCount = updatedJobs.filter(j => j.status === 'failed').length;

      if (failedCount > 0) {
        toast.warning(`Генерация завершена: ${completedCount} успешно, ${failedCount} с ошибками`);
      } else {
        toast.success(`Генерация ${completedCount} урок${completedCount === 1 ? 'а' : 'ов'} завершена`);
      }

      // Clear tracked jobs after a delay
      setTimeout(() => setTrackedJobs([]), 2000);
    }
  }, [fetchJobStatus]);

  /**
   * Start polling when jobs are added
   */
  useEffect(() => {
    if (trackedJobs.length > 0 && !pollIntervalRef.current) {
      // Start polling at interval (don't call immediately to avoid double-call)
      pollIntervalRef.current = setInterval(pollJobStatuses, POLL_INTERVAL);
      // Initial poll after short delay
      setTimeout(pollJobStatuses, 500);
    }

    // Cleanup only when no jobs left
    if (trackedJobs.length === 0 && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [trackedJobs.length, pollJobStatuses]);

  /**
   * Generate specific lessons by ID
   * @param lessonIds - Array of lesson IDs in format "section.lesson" (e.g., ["1.1", "2.3"])
   * @param priority - Job priority (1-10, higher = more priority), default 5
   */
  const generateLessons = useCallback(
    async (lessonIds: string[], priority: number = 5): Promise<PartialGenerationResult | null> => {
      if (lessonIds.length === 0) {
        const err = new Error('No lessons selected');
        setError(err);
        toast.error('Select at least one lesson to generate');
        return null;
      }

      // SYNCHRONOUS CHECK via ref: Skip if any lesson is already pending or generating
      // This prevents race conditions on rapid double-clicks (state is async, ref is sync)
      const alreadyPending = lessonIds.some(id => pendingLessonIdsRef.current.has(id));
      const alreadyGenerating = lessonIds.some(id =>
        trackedJobsRef.current.some(j => j.lessonId === id && j.status !== 'completed' && j.status !== 'failed')
      );
      if (alreadyPending || alreadyGenerating) {
        logger.info('Generation skipped - lessons already pending/generating', { lessonIds, alreadyPending, alreadyGenerating });
        return null;
      }

      // SYNCHRONOUS UPDATE via ref: Block immediately (before async setState)
      lessonIds.forEach(id => pendingLessonIdsRef.current.add(id));

      // Async state update for UI reactivity
      setPendingLessonIds(prev => {
        const next = new Set(prev);
        lessonIds.forEach(id => next.add(id));
        return next;
      });

      setIsGenerating(true);
      setError(null);
      setLastResult(null);

      try {
        const response = await fetch(`/api/coursegen/partial-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            courseId,
            lessonIds,
            priority,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errorMessage = typeof data.error === 'string'
            ? data.error
            : data.error?.message || data.message || 'Error starting generation';
          const err = new Error(errorMessage);
          setError(err);
          setIsGenerating(false);
          // Clear pending on error (both ref and state)
          lessonIds.forEach(id => pendingLessonIdsRef.current.delete(id));
          setPendingLessonIds(prev => {
            const next = new Set(prev);
            lessonIds.forEach(id => next.delete(id));
            return next;
          });
          toast.error(errorMessage);
          return null;
        }

        // tRPC wraps response in { result: { data: {...} } }
        const result: PartialGenerationResult = data.result?.data || data;
        setLastResult(result);

        // Create tracked jobs
        const newJobs: TrackedJob[] = result.jobIds.map((jobId, index) => ({
          jobId,
          lessonId: lessonIds[index] || lessonIds[0],
          status: 'pending' as const,
        }));
        setTrackedJobs(prev => [...prev, ...newJobs]);

        // Clear pending state - lessons are now tracked in trackedJobs (both ref and state)
        lessonIds.forEach(id => pendingLessonIdsRef.current.delete(id));
        setPendingLessonIds(prev => {
          const next = new Set(prev);
          lessonIds.forEach(id => next.delete(id));
          return next;
        });

        const lessonWord = result.jobCount === 1 ? 'урока' : result.jobCount < 5 ? 'уроков' : 'уроков';
        toast.success(`Запущена генерация ${result.jobCount} ${lessonWord}`);

        logger.info('Partial generation started', {
          courseId,
          lessonIds,
          jobCount: result.jobCount,
          jobIds: result.jobIds,
        });

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Network error');
        setError(error);
        setIsGenerating(false);
        // Clear pending on network error (both ref and state)
        lessonIds.forEach(id => pendingLessonIdsRef.current.delete(id));
        setPendingLessonIds(prev => {
          const next = new Set(prev);
          lessonIds.forEach(id => next.delete(id));
          return next;
        });
        toast.error('Network error. Check connection and try again.');
        logger.error('Partial generation failed', {
          courseId,
          lessonIds,
          error: error.message,
        });
        return null;
      }
      // Note: NOT clearing isGenerating here - polling will handle that
    },
    [courseId]
  );

  /**
   * Generate all lessons in specific sections (modules)
   * @param sectionIds - Array of section numbers (e.g., [1, 2, 3])
   * @param priority - Job priority (1-10, higher = more priority), default 5
   */
  const generateSections = useCallback(
    async (sectionIds: number[], priority: number = 5): Promise<PartialGenerationResult | null> => {
      if (sectionIds.length === 0) {
        const err = new Error('No sections selected');
        setError(err);
        toast.error('Select at least one module to generate');
        return null;
      }

      setIsGenerating(true);
      setGeneratingSectionIds(new Set(sectionIds));
      setError(null);
      setLastResult(null);

      try {
        const response = await fetch(`/api/coursegen/partial-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            courseId,
            sectionIds,
            priority,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errorMessage = typeof data.error === 'string'
            ? data.error
            : data.error?.message || data.message || 'Error starting generation';
          const err = new Error(errorMessage);
          setError(err);
          setIsGenerating(false);
          setGeneratingSectionIds(new Set());
          toast.error(errorMessage);
          return null;
        }

        // tRPC wraps response in { result: { data: {...} } }
        const result: PartialGenerationResult = data.result?.data || data;
        setLastResult(result);

        // Create tracked jobs (map lessonIds from result)
        const newJobs: TrackedJob[] = result.jobIds.map((jobId, index) => ({
          jobId,
          lessonId: result.selectedLessonIds?.[index] || `section-${sectionIds[0]}`,
          status: 'pending' as const,
        }));
        setTrackedJobs(prev => [...prev, ...newJobs]);

        const sectionWord = sectionIds.length === 1 ? 'модуля' : 'модулей';
        toast.success(`Запущена генерация ${sectionIds.length} ${sectionWord} (${result.jobCount} уроков)`);

        logger.info('Partial generation started (sections)', {
          courseId,
          sectionIds,
          jobCount: result.jobCount,
          jobIds: result.jobIds,
        });

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Network error');
        setError(error);
        setIsGenerating(false);
        setGeneratingSectionIds(new Set());
        toast.error('Network error. Check connection and try again.');
        logger.error('Partial generation failed (sections)', {
          courseId,
          sectionIds,
          error: error.message,
        });
        return null;
      }
      // Note: NOT clearing isGenerating here - polling will handle that
    },
    [courseId]
  );

  /**
   * Generate a single lesson
   * @param lessonId - Lesson ID in format "section.lesson" (e.g., "1.1")
   * @param priority - Job priority (1-10, higher = more priority), default 5
   */
  const generateLesson = useCallback(
    (lessonId: string, priority: number = 5) => generateLessons([lessonId], priority),
    [generateLessons]
  );

  /**
   * Generate all lessons in a single section (module)
   * @param sectionId - Section number (e.g., 1)
   * @param priority - Job priority (1-10, higher = more priority), default 5
   */
  const generateSection = useCallback(
    (sectionId: number, priority: number = 5) => generateSections([sectionId], priority),
    [generateSections]
  );

  // Compute generating lesson IDs from tracked jobs AND pending lessons
  // pendingLessonIds = lessons clicked but API not yet responded
  // trackedJobs = lessons with active jobs in progress
  const generatingLessonIds = new Set([
    ...pendingLessonIds,
    ...trackedJobs
      .filter(j => j.status !== 'completed' && j.status !== 'failed')
      .map(j => j.lessonId),
  ]);

  // Check if specific lesson is generating (instant response)
  const isLessonGenerating = useCallback(
    (lessonId: string) => generatingLessonIds.has(lessonId),
    [generatingLessonIds]
  );

  // Check if specific section is generating
  const isSectionGenerating = useCallback(
    (sectionId: number) => generatingSectionIds.has(sectionId),
    [generatingSectionIds]
  );

  return {
    // Generation actions
    generateLessons,
    generateSections,
    generateLesson,
    generateSection,

    // State
    isGenerating,
    isLessonGenerating,
    isSectionGenerating,
    generatingLessonIds,
    generatingSectionIds,
    trackedJobs,
    error,
    lastResult,
  };
}
