'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NodeStatus } from '@megacampus/shared-types';

/**
 * Document entry with processing status for Stage 2 graph initialization.
 */
export interface DocumentWithStatus {
  id: string;
  name: string;
  status: NodeStatus;
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
}

/**
 * Hook to fetch documents from file_catalog with their processing statuses.
 * Used to initialize Stage 2 document nodes on page load before realtime traces arrive.
 *
 * @param courseId - Course ID to fetch documents for
 * @returns Object containing:
 *   - documents: Array of documents with status
 *   - filenameMap: Map<fileId, filename> for lookups
 *   - getFilename: Function to get filename by fileId
 *   - isLoading: Loading state
 *   - error: Error if fetch failed
 */
export function useDocumentsWithStatus(courseId: string) {
  const [documents, setDocuments] = useState<DocumentWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch file catalog data with processing statuses
  useEffect(() => {
    if (!courseId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const supabase = createClient();

        // Fetch files from file_catalog
        const { data: files, error: filesError } = await supabase
          .from('file_catalog')
          .select('id, filename, generated_title, original_name, priority')
          .eq('course_id', courseId);

        if (filesError) {
          throw new Error(filesError.message);
        }

        if (!files || files.length === 0) {
          if (!cancelled) {
            setDocuments([]);
            setIsLoading(false);
          }
          return;
        }

        // Fetch Stage 2 traces to determine document statuses
        // We look for 'finish' step_name traces to identify completed documents
        const { data: traces, error: tracesError } = await supabase
          .from('generation_trace')
          .select('input_data, error_data, step_name')
          .eq('course_id', courseId)
          .eq('stage', 'stage_2');

        if (tracesError) {
          console.warn('[useDocumentsWithStatus] Failed to fetch traces:', tracesError);
          // Continue with files, assuming all pending
        }

        // Build a map of document statuses from traces
        const documentStatuses = new Map<string, NodeStatus>();

        if (traces) {
          traces.forEach(trace => {
            // Safely extract fileId from input_data (which is Json type)
            // Stage 2 traces use 'fileId' field, not 'document_id'
            const inputData = trace.input_data as Record<string, unknown> | null;
            const docId = inputData?.fileId as string | undefined;
            if (!docId) return;

            // Determine status from trace
            if (trace.error_data) {
              documentStatuses.set(docId, 'error');
            } else if (trace.step_name === 'finish') {
              // Only mark as completed if we have a finish trace
              if (documentStatuses.get(docId) !== 'error') {
                documentStatuses.set(docId, 'completed');
              }
            } else if (!documentStatuses.has(docId)) {
              // Active if we have traces but not finished
              documentStatuses.set(docId, 'active');
            }
          });
        }

        // Build documents array
        const docsWithStatus: DocumentWithStatus[] = files.map(file => {
          const displayName = file.generated_title || file.original_name || file.filename;
          const status = documentStatuses.get(file.id) || 'pending';

          return {
            id: file.id,
            name: displayName,
            status,
            priority: file.priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' | undefined,
          };
        });

        if (!cancelled) {
          setDocuments(docsWithStatus);
        }
      } catch (err) {
        console.error('[useDocumentsWithStatus] Failed to fetch documents:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to fetch documents'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchDocuments();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Build filename map from documents
  const filenameMap = useMemo(() => {
    const map = new Map<string, string>();
    documents.forEach(doc => {
      map.set(doc.id, doc.name);
    });
    return map;
  }, [documents]);

  // Lookup function
  const getFilename = useCallback((fileId: string): string | undefined => {
    return filenameMap.get(fileId);
  }, [filenameMap]);

  return {
    documents,
    filenameMap,
    getFilename,
    isLoading,
    error,
  };
}
