/**
 * DiffViewer Component (T036)
 *
 * Wrapper around json-diff-kit for displaying JSON diffs.
 * Used in ConfigHistoryDialog to show differences between config versions.
 *
 * @module app/admin/pipeline/components/diff-viewer
 */

'use client';

import { Differ, Viewer } from 'json-diff-kit';
import 'json-diff-kit/dist/viewer.css';

interface DiffViewerProps {
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
}

/**
 * Display JSON diff between two values
 *
 * Uses json-diff-kit to compute and render visual diff.
 * Supports nested objects, arrays, and circular references.
 *
 * @param oldValue - Original value (left side)
 * @param newValue - New value (right side)
 */
export function DiffViewer({ oldValue, newValue }: DiffViewerProps) {
  const differ = new Differ({
    detectCircular: true,
    maxDepth: Infinity,
    showModifications: true,
    arrayDiffMethod: 'lcs', // Longest common subsequence for arrays
  });

  const diff = differ.diff(oldValue, newValue);

  return (
    <div className="rounded-lg border bg-background">
      <Viewer
        diff={diff}
        indent={2}
        lineNumbers={true}
        highlightInlineDiff={true}
        inlineDiffOptions={{
          mode: 'word',
          wordSeparator: ' ',
        }}
      />
    </div>
  );
}
