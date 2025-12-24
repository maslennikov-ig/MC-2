'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browser-client';
import { logger } from '@/lib/client-logger';
import { useDebouncedCallback } from '@/lib/hooks/use-debounce';
import type { Database } from '@/types/database.generated';
import { toast } from 'sonner';
import { useGenerationStore } from '@/stores/useGenerationStore';

// =============================================================================
// Type Definitions for Stage 2 Dashboard
// =============================================================================

/**
 * Document processing steps in Stage 2
 * These correspond to step_name patterns in generation_trace
 */
export const DOCUMENT_PROCESSING_STEPS = [
  'docling',       // 1. Digitization
  'markdown',      // 2. Cleanup / markdown conversion
  'images',        // 3. Visual analysis
  'chunking',      // 4. Segmentation
  'embedding',     // 5. Vectorization
  'qdrant',        // 6. Indexing
  'summarization', // 7. Synthesis
] as const;

export type DocumentProcessingStep = (typeof DOCUMENT_PROCESSING_STEPS)[number];

/**
 * Priority level for document processing
 */
export type DocumentPriority = 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';

/**
 * Status of a document or its processing step
 */
export type DocumentStatus = 'pending' | 'active' | 'completed' | 'error';

/**
 * Single processing step data for a document
 */
export interface DocumentStepData {
  /** Step name */
  step: DocumentProcessingStep;
  /** Step status */
  status: DocumentStatus;
  /** Processing duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Timestamp when step completed */
  completedAt?: string;
}

/**
 * A single row in the Document Matrix (Stage 2 Dashboard)
 */
export interface DocumentMatrixRow {
  /** Document ID (file_catalog UUID) */
  documentId: string;
  /** Original filename */
  filename: string;
  /** AI-generated title from Phase 6 summarization */
  generatedTitle?: string | null;
  /** User-provided original filename at upload */
  originalName?: string | null;
  /** Overall document processing status */
  status: DocumentStatus;
  /** Document priority level */
  priority?: DocumentPriority;
  /** Number of completed processing stages */
  completedStages: number;
  /** Total number of processing stages (7) */
  totalStages: number;
  /** Total processing time in milliseconds */
  processingTimeMs?: number;
  /** Error message if any step failed */
  errorMessage?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Individual step statuses */
  steps: DocumentStepData[];
}

/**
 * Aggregated metrics for all documents in Stage 2
 */
export interface Stage2Aggregates {
  /** Total pages processed across all documents */
  totalPages: number;
  /** Total chunks created */
  totalChunks: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Average processing time per document in milliseconds */
  avgProcessingTimeMs: number;
  /** Total cost in USD */
  totalCostUsd: number;
}

/**
 * Complete data structure for Stage 2 Dashboard
 */
export interface Stage2DashboardData {
  /** Total number of documents */
  totalDocuments: number;
  /** Number of completed documents */
  completedDocuments: number;
  /** Number of currently processing documents */
  processingDocuments: number;
  /** Number of failed documents */
  failedDocuments: number;
  /** Number of pending documents */
  pendingDocuments: number;
  /** Individual document rows */
  documents: DocumentMatrixRow[];
  /** Aggregated metrics */
  aggregates: Stage2Aggregates;
}

/**
 * Hook options
 */
export interface UseStage2DashboardDataOptions {
  /** Course ID to fetch data for */
  courseId: string;
  /** Whether hook should fetch data */
  enabled?: boolean;
  /** Enable realtime subscriptions for live updates */
  enableRealtime?: boolean;
}

/**
 * Hook return type
 */
export interface UseStage2DashboardDataReturn {
  /** Aggregated Stage 2 dashboard data */
  data: Stage2DashboardData | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Manual refetch function */
  refetch: () => void;
}

// =============================================================================
// Type Aliases
// =============================================================================

type FileCatalogRow = Database['public']['Tables']['file_catalog']['Row'];
type GenerationTraceRow = Database['public']['Tables']['generation_trace']['Row'];

/**
 * Partial trace row with only the fields we select from the database
 */
interface PartialTraceRow {
  id: string;
  step_name: string;
  input_data: GenerationTraceRow['input_data'];
  output_data: GenerationTraceRow['output_data'];
  error_data: GenerationTraceRow['error_data'];
  duration_ms: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  created_at: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Map trace status to document status
 */
function mapTraceStatusToDocumentStatus(errorData: PartialTraceRow['error_data']): DocumentStatus {
  if (errorData) return 'error';
  return 'completed';
}

/**
 * Extract step name from generation_trace step_name field
 * Handles patterns like "stage_2_docling", "docling", "doc_docling" etc.
 */
function extractStepName(stepName: string): DocumentProcessingStep | null {
  const normalized = stepName.toLowerCase();

  for (const step of DOCUMENT_PROCESSING_STEPS) {
    if (normalized.includes(step)) {
      return step;
    }
  }

  return null;
}

/**
 * Determine overall document status from its processing steps
 */
function getDocumentStatus(steps: DocumentStepData[]): DocumentStatus {
  if (steps.length === 0) return 'pending';

  // If any step has an error, document has error
  if (steps.some(s => s.status === 'error')) return 'error';

  // If any step is active, document is active
  if (steps.some(s => s.status === 'active')) return 'active';

  // If all steps are completed (7 total), document is completed
  if (steps.filter(s => s.status === 'completed').length === DOCUMENT_PROCESSING_STEPS.length) {
    return 'completed';
  }

  // If some steps completed but not all, still active/in-progress
  if (steps.some(s => s.status === 'completed')) {
    return 'active';
  }

  return 'pending';
}

/**
 * Calculate aggregated metrics from document rows
 */
function calculateAggregates(documents: DocumentMatrixRow[]): Stage2Aggregates {
  let totalPages = 0;
  let totalChunks = 0;
  let totalTokens = 0;
  let totalProcessingTime = 0;
  let totalCostUsd = 0;
  let completedCount = 0;

  for (const doc of documents) {
    if (doc.processingTimeMs && doc.processingTimeMs > 0) {
      totalProcessingTime += doc.processingTimeMs;
      completedCount++;
    }
  }

  return {
    totalPages,
    totalChunks,
    totalTokens,
    avgProcessingTimeMs: completedCount > 0 ? totalProcessingTime / completedCount : 0,
    totalCostUsd,
  };
}

// =============================================================================
// Main Hook
// =============================================================================

/**
 * Hook for fetching and aggregating Stage 2 document processing dashboard data
 *
 * Combines file_catalog entries with generation_trace data to build a complete
 * document processing dashboard view. Supports realtime updates via Supabase subscriptions.
 *
 * Data flow:
 * 1. Query file_catalog for documents belonging to the course
 * 2. Query generation_trace for Stage 2 processing traces per document
 * 3. Map trace data to document steps and statuses
 * 4. Aggregate metrics (pages, chunks, tokens, processing time)
 * 5. Subscribe to realtime updates (optional)
 *
 * @param options - Hook options
 * @returns Dashboard data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * function Stage2Dashboard({ courseId }) {
 *   const { data, isLoading, error, refetch } = useStage2DashboardData({
 *     courseId,
 *     enableRealtime: true,
 *   });
 *
 *   if (isLoading) return <Skeleton />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!data) return <EmptyState />;
 *
 *   return <Stage2DashboardView data={data} />;
 * }
 * ```
 */
export function useStage2DashboardData({
  courseId,
  enabled = true,
  enableRealtime = true,
}: UseStage2DashboardDataOptions): UseStage2DashboardDataReturn {
  const [data, setData] = useState<Stage2DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track current fetch to avoid race conditions
  const fetchIdRef = useRef(0);

  // IMPORTANT: Get supabase client once and store in ref to prevent
  // subscription re-creation on every render (causing rate limit errors)
  const supabaseRef = useRef(getSupabaseClient());
  const supabase = supabaseRef.current;

  // Get document progress/status functions from Zustand store - SINGLE SOURCE OF TRUTH
  // This ensures consistency with Stage2Group and DocumentNode components
  const getDocumentProgressFromStore = useGenerationStore(state => state.getDocumentProgress);
  const getDocumentStatusFromStore = useGenerationStore(state => state.getDocumentStatus);

  // Skip hook if disabled or missing courseId
  const shouldFetch = enabled && !!courseId;

  /**
   * Fetch document and trace data from database
   */
  const fetchDocumentData = useCallback(async () => {
    logger.debug('[useStage2DashboardData] fetchDocumentData called', {
      shouldFetch,
      courseId: courseId || 'undefined',
    });

    if (!shouldFetch || !courseId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    const abortController = new AbortController();

    // Network timeout: 30 seconds for Supabase queries
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 30000);

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Get all files for this course from file_catalog
      const { data: filesData, error: filesError } = await supabase
        .from('file_catalog')
        .select('id, filename, generated_title, original_name, file_size, priority, vector_status, chunk_count, error_message, created_at')
        .eq('course_id', courseId)
        .order('created_at', { ascending: true })
        .abortSignal(abortController.signal);

      if (fetchId !== fetchIdRef.current) {
        abortController.abort();
        return;
      }

      if (filesError) {
        throw new Error(`Failed to fetch files: ${filesError.message}`);
      }

      const files = filesData || [];

      logger.debug('[useStage2DashboardData] Fetched files', {
        courseId,
        filesCount: files.length,
      });

      if (files.length === 0) {
        // No files for this course - return empty dashboard
        setData({
          totalDocuments: 0,
          completedDocuments: 0,
          processingDocuments: 0,
          failedDocuments: 0,
          pendingDocuments: 0,
          documents: [],
          aggregates: {
            totalPages: 0,
            totalChunks: 0,
            totalTokens: 0,
            avgProcessingTimeMs: 0,
            totalCostUsd: 0,
          },
        });
        setIsLoading(false);
        return;
      }

      // Step 2: Get generation_trace entries for Stage 2
      const { data: tracesData, error: tracesError } = await supabase
        .from('generation_trace')
        .select('id, step_name, input_data, output_data, error_data, duration_ms, tokens_used, cost_usd, created_at')
        .eq('course_id', courseId)
        .eq('stage', 'stage_2')
        .order('created_at', { ascending: true })
        .abortSignal(abortController.signal);

      if (fetchId !== fetchIdRef.current) {
        abortController.abort();
        return;
      }

      if (tracesError) {
        throw new Error(`Failed to fetch traces: ${tracesError.message}`);
      }

      const traces = tracesData || [];

      logger.debug('[useStage2DashboardData] Fetched traces', {
        courseId,
        tracesCount: traces.length,
      });

      // Step 3: Build document matrix rows
      // Create a map of file_id to traces
      const tracesByFile = new Map<string, PartialTraceRow[]>();

      for (const trace of traces as PartialTraceRow[]) {
        // Extract file reference from input_data
        const inputData = trace.input_data as Record<string, unknown> | null;
        let fileId: string | null = null;

        if (inputData) {
          // Common patterns for file reference in input_data
          fileId = (inputData.fileId as string)
            || (inputData.file_id as string)
            || (inputData.documentId as string)
            || (inputData.document_id as string);
        }

        if (fileId) {
          const existing = tracesByFile.get(fileId) || [];
          existing.push(trace);
          tracesByFile.set(fileId, existing);
        }
      }

      // Build document rows
      const documentRows: DocumentMatrixRow[] = [];

      for (const file of files) {
        const fileTraces = tracesByFile.get(file.id) || [];

        // Build step data from traces
        const steps: DocumentStepData[] = [];
        let totalDurationMs = 0;
        let errorMessage: string | undefined;

        for (const trace of fileTraces) {
          const stepName = extractStepName(trace.step_name);
          if (!stepName) continue;

          const status = mapTraceStatusToDocumentStatus(trace.error_data);

          if (trace.duration_ms) {
            totalDurationMs += trace.duration_ms;
          }

          if (status === 'error' && trace.error_data) {
            const errData = trace.error_data as Record<string, unknown>;
            errorMessage = (errData.message as string) || (errData.error as string) || 'Unknown error';
          }

          steps.push({
            step: stepName,
            status,
            durationMs: trace.duration_ms ?? undefined,
            errorMessage: status === 'error' ? errorMessage : undefined,
            completedAt: trace.created_at,
          });
        }

        // Get status and progress from Zustand store - SINGLE SOURCE OF TRUTH
        // This ensures consistency with Stage2Group and DocumentNode components
        const storeProgress = getDocumentProgressFromStore(file.id);
        const storeStatus = getDocumentStatusFromStore(file.id);

        // Use Zustand store data if available, otherwise fall back to local calculation
        let docStatus: DocumentStatus;
        let completedStages: number;

        if (storeStatus !== 'pending' || storeProgress.completed > 0) {
          // Zustand store has data - use it as source of truth
          docStatus = storeStatus as DocumentStatus;
          completedStages = storeProgress.completed;
        } else {
          // Fallback to local calculation (for cases when store hasn't loaded yet)
          completedStages = steps.filter(s => s.status === 'completed').length;

          // Use file_catalog.vector_status as additional fallback
          if (file.vector_status === 'indexed') {
            docStatus = 'completed';
          } else if (file.vector_status === 'failed' || file.error_message) {
            docStatus = 'error';
            errorMessage = errorMessage || file.error_message || undefined;
          } else if (file.vector_status === 'indexing' || steps.length > 0) {
            docStatus = getDocumentStatus(steps);
          } else {
            docStatus = 'pending';
          }
        }

        documentRows.push({
          documentId: file.id,
          filename: file.filename,
          generatedTitle: (file as { generated_title?: string | null }).generated_title ?? null,
          originalName: (file as { original_name?: string | null }).original_name ?? null,
          status: docStatus,
          priority: file.priority as DocumentPriority | undefined,
          completedStages,
          totalStages: DOCUMENT_PROCESSING_STEPS.length,
          processingTimeMs: totalDurationMs > 0 ? totalDurationMs : undefined,
          errorMessage,
          fileSize: file.file_size ? Number(file.file_size) : undefined,
          steps,
        });
      }

      // Step 4: Calculate aggregates
      const aggregates = calculateAggregates(documentRows);

      // Add chunk count from file_catalog
      aggregates.totalChunks = files.reduce((sum, f) => sum + (f.chunk_count || 0), 0);

      // Add token usage and cost from traces
      for (const trace of traces) {
        if (trace.tokens_used) {
          aggregates.totalTokens += trace.tokens_used;
        }
        if (trace.cost_usd) {
          aggregates.totalCostUsd += Number(trace.cost_usd);
        }
      }

      // Step 5: Build final dashboard data
      const dashboardData: Stage2DashboardData = {
        totalDocuments: documentRows.length,
        completedDocuments: documentRows.filter(d => d.status === 'completed').length,
        processingDocuments: documentRows.filter(d => d.status === 'active').length,
        failedDocuments: documentRows.filter(d => d.status === 'error').length,
        pendingDocuments: documentRows.filter(d => d.status === 'pending').length,
        documents: documentRows,
        aggregates,
      };

      setData(dashboardData);

      logger.debug('[useStage2DashboardData] Dashboard data built', {
        courseId,
        totalDocuments: dashboardData.totalDocuments,
        completedDocuments: dashboardData.completedDocuments,
        processingDocuments: dashboardData.processingDocuments,
        failedDocuments: dashboardData.failedDocuments,
      });
    } catch (err) {
      // Handle aborted requests (including timeout)
      if ((err as Error).name === 'AbortError') {
        // Check if this was a timeout (fetchId still matches)
        if (fetchId === fetchIdRef.current) {
          logger.warn('[useStage2DashboardData] Request timed out after 30s', { fetchId, courseId });
          setError(new Error('Network request timed out. Please try again.'));
          setData(null);
        } else {
          logger.debug('[useStage2DashboardData] Request aborted due to newer fetch', { fetchId });
        }
        return;
      }

      // Skip if a newer fetch was started
      if (fetchId !== fetchIdRef.current) return;

      const fetchError = err instanceof Error ? err : new Error('Failed to load document data');
      setError(fetchError);
      setData(null);

      logger.error('Failed to fetch Stage 2 dashboard data', {
        courseId: courseId || 'undefined',
        error: fetchError.message,
        stack: fetchError.stack,
      });
    } finally {
      // Clear timeout to prevent memory leak
      clearTimeout(timeoutId);

      // Skip if a newer fetch was started
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [shouldFetch, courseId, supabase, getDocumentProgressFromStore, getDocumentStatusFromStore]);

  // Create debounced version for realtime refetches
  const debouncedFetchDocumentData = useDebouncedCallback(fetchDocumentData, 500);

  // Store fetch function in ref to avoid re-subscriptions when function reference changes
  const fetchRef = useRef(debouncedFetchDocumentData);
  fetchRef.current = debouncedFetchDocumentData;

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchDocumentData();
  }, [fetchDocumentData]);

  // Set up realtime subscription
  // IMPORTANT: Only depend on courseId and enableRealtime to prevent re-subscriptions
  // Use fetchRef.current to access the latest fetch function without dependency
  useEffect(() => {
    if (!enableRealtime || !courseId) return;

    let isMounted = true;

    logger.debug('[useStage2DashboardData] Setting up realtime subscription', {
      courseId,
    });

    // Wrapper to safely refetch data only if component is still mounted
    // Uses ref to always call latest version of fetch function
    const safeRefetch = () => {
      if (isMounted) {
        fetchRef.current();
      }
    };

    // Subscribe to changes in file_catalog for this course
    const fileCatalogChannel = supabase
      .channel(`stage2_dashboard_files:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'file_catalog',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          logger.debug('[useStage2DashboardData] File catalog update received', {
            event: payload.eventType,
            fileId: (payload.new as Partial<FileCatalogRow>)?.id || (payload.old as Partial<FileCatalogRow>)?.id,
          });

          // Refetch data on any change (debounced)
          safeRefetch();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[useStage2DashboardData] File catalog realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          // Log full error for debugging - common causes:
          // 1. Table not in supabase_realtime publication
          // 2. RLS policies blocking access
          // 3. Missing SELECT permissions
          // 4. Rate limiting (too many subscriptions)
          const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Unknown error';
          logger.error('[useStage2DashboardData] File catalog realtime subscription error', {
            error: errorMessage,
            errorRaw: err,
            courseId,
          });
          // Don't show toast for expected errors (e.g., table not in publication, rate limits)
          // This is a configuration issue, not a runtime error
        } else if (status === 'TIMED_OUT') {
          logger.warn('[useStage2DashboardData] File catalog realtime subscription timed out');
          if (isMounted) {
            toast.error('Время ожидания соединения истекло');
          }
        } else if (status === 'CLOSED') {
          // CLOSED is normal on component unmount - only log for debugging
          // No toast here as it would show false errors during navigation
          logger.debug('[useStage2DashboardData] File catalog realtime connection closed');
        }
      });

    // Subscribe to changes in generation_trace for stage_2
    const traceChannel = supabase
      .channel(`stage2_dashboard_traces:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generation_trace',
          filter: `course_id=eq.${courseId}`,
        },
        (payload) => {
          const newRow = payload.new as Partial<GenerationTraceRow> | undefined;

          // Only process stage_2 traces
          if (newRow?.stage === 'stage_2') {
            logger.debug('[useStage2DashboardData] Generation trace update received', {
              event: payload.eventType,
              traceId: newRow?.id,
              stepName: newRow?.step_name,
            });

            // Refetch data on any change (debounced)
            safeRefetch();
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[useStage2DashboardData] Trace realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          // Log full error for debugging - common causes:
          // 1. Table not in supabase_realtime publication
          // 2. RLS policies blocking access
          // 3. Missing SELECT permissions
          // 4. Rate limiting (too many subscriptions)
          const errorMessage = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err)) || 'Unknown error';
          logger.error('[useStage2DashboardData] Trace realtime subscription error', {
            error: errorMessage,
            errorRaw: err,
            courseId,
          });
          // Don't show toast for expected errors (e.g., table not in publication, rate limits)
        } else if (status === 'TIMED_OUT') {
          logger.warn('[useStage2DashboardData] Trace realtime subscription timed out');
          if (isMounted) {
            toast.error('Время ожидания соединения истекло');
          }
        } else if (status === 'CLOSED') {
          // CLOSED is normal on component unmount - only log for debugging
          logger.debug('[useStage2DashboardData] Trace realtime connection closed');
        }
      });

    return () => {
      isMounted = false;
      logger.debug('[useStage2DashboardData] Unsubscribing from realtime channels', { courseId });
      fileCatalogChannel.unsubscribe();
      traceChannel.unsubscribe();
    };
    // IMPORTANT: Only depend on courseId and enableRealtime
    // supabase is stored in ref (stable), fetchRef is used for fetch function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableRealtime, courseId]);

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    fetchDocumentData();
  }, [fetchDocumentData]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
