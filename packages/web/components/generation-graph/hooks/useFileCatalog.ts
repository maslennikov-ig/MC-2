'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * File catalog entry for filename lookup.
 */
interface FileCatalogEntry {
  id: string;
  filename: string;
  original_name: string | null;
}

/**
 * Hook to fetch and maintain a filename lookup map from file_catalog.
 *
 * Used to resolve fileId UUIDs to human-readable filenames for document nodes
 * in the graph visualization.
 *
 * @param courseId - Course ID to fetch files for
 * @returns Object containing:
 *   - filenameMap: Map<fileId, filename> for lookups
 *   - getFilename: Function to get filename by fileId
 *   - isLoading: Loading state
 *   - error: Error if fetch failed
 *
 * @example
 * ```tsx
 * const { getFilename } = useFileCatalog(courseId);
 * const displayName = getFilename(fileId) || 'Unknown Document';
 * ```
 */
export function useFileCatalog(courseId: string) {
  const [filenameMap, setFilenameMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch file catalog data
  useEffect(() => {
    if (!courseId) {
      setIsLoading(false);
      return;
    }

    const fetchFiles = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('file_catalog')
          .select('id, filename, original_name')
          .eq('course_id', courseId);

        if (fetchError) {
          throw new Error(fetchError.message);
        }

        // Build filename map
        const map = new Map<string, string>();
        (data as FileCatalogEntry[] || []).forEach((file) => {
          // Prefer original_name if available, otherwise use filename
          const displayName = file.original_name || file.filename;
          if (displayName) {
            map.set(file.id, displayName);
          }
        });

        setFilenameMap(map);
      } catch (err) {
        console.error('[useFileCatalog] Failed to fetch file catalog:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch files'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchFiles();
  }, [courseId]);

  // Lookup function
  const getFilename = useCallback((fileId: string): string | undefined => {
    return filenameMap.get(fileId);
  }, [filenameMap]);

  return {
    filenameMap,
    getFilename,
    isLoading,
    error,
  };
}
