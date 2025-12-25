'use client';

import React, { memo, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SplitSquareHorizontal, AlignJustify, Plus, Minus } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface DiffViewerProps {
  /** Original content before fixes */
  originalContent: string;
  /** Fixed content after SelfReviewer */
  fixedContent: string;
  /** Optional list of changes for annotations */
  changes?: Array<{
    type: string;
    severity: string;
    location: string;
    description: string;
  }>;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

type ViewMode = 'unified' | 'split';

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  originalLine?: number;
  fixedLine?: number;
}

// =============================================================================
// DIFF ALGORITHM
// =============================================================================

/**
 * Simple line-based diff algorithm
 * Compares original and fixed content line by line
 *
 * For production use, consider replacing with a library like diff or diff-match-patch
 */
function computeDiff(original: string, fixed: string): DiffLine[] {
  const originalLines = original.split('\n');
  const fixedLines = fixed.split('\n');
  const result: DiffLine[] = [];

  let oIdx = 0;
  let fIdx = 0;

  while (oIdx < originalLines.length || fIdx < fixedLines.length) {
    if (oIdx >= originalLines.length) {
      // Rest are additions
      result.push({
        type: 'added',
        content: fixedLines[fIdx],
        fixedLine: fIdx + 1,
      });
      fIdx++;
    } else if (fIdx >= fixedLines.length) {
      // Rest are removals
      result.push({
        type: 'removed',
        content: originalLines[oIdx],
        originalLine: oIdx + 1,
      });
      oIdx++;
    } else if (originalLines[oIdx] === fixedLines[fIdx]) {
      // Same line
      result.push({
        type: 'unchanged',
        content: originalLines[oIdx],
        originalLine: oIdx + 1,
        fixedLine: fIdx + 1,
      });
      oIdx++;
      fIdx++;
    } else {
      // Check if next original line matches current fixed (deletion)
      const nextOMatches = oIdx + 1 < originalLines.length && originalLines[oIdx + 1] === fixedLines[fIdx];
      // Check if next fixed line matches current original (addition)
      const nextFMatches = fIdx + 1 < fixedLines.length && originalLines[oIdx] === fixedLines[fIdx + 1];

      if (nextOMatches && !nextFMatches) {
        // Deletion
        result.push({
          type: 'removed',
          content: originalLines[oIdx],
          originalLine: oIdx + 1,
        });
        oIdx++;
      } else if (nextFMatches && !nextOMatches) {
        // Addition
        result.push({
          type: 'added',
          content: fixedLines[fIdx],
          fixedLine: fIdx + 1,
        });
        fIdx++;
      } else {
        // Change (remove old, add new)
        result.push({
          type: 'removed',
          content: originalLines[oIdx],
          originalLine: oIdx + 1,
        });
        result.push({
          type: 'added',
          content: fixedLines[fIdx],
          fixedLine: fIdx + 1,
        });
        oIdx++;
        fIdx++;
      }
    }
  }

  return result;
}

/**
 * Calculate diff statistics
 */
function calculateStats(diffLines: DiffLine[]): { additions: number; deletions: number } {
  const additions = diffLines.filter(line => line.type === 'added').length;
  const deletions = diffLines.filter(line => line.type === 'removed').length;
  return { additions, deletions };
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

/**
 * Header with view mode toggle and stats
 */
interface DiffHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  additions: number;
  deletions: number;
  locale: 'ru' | 'en';
}

const DiffHeader = memo(function DiffHeader({
  viewMode,
  onViewModeChange,
  additions,
  deletions,
  locale,
}: DiffHeaderProps) {
  const t = (key: string) => {
    const translations: Record<string, { ru: string; en: string }> = {
      additions: { ru: 'добавлено', en: 'additions' },
      deletions: { ru: 'удалено', en: 'deletions' },
      unified: { ru: 'Единый вид', en: 'Unified view' },
      split: { ru: 'Раздельный вид', en: 'Split view' },
    };
    return translations[key]?.[locale] || key;
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">
          <Plus className="h-3 w-3 mr-1" />
          {additions} {t('additions')}
        </Badge>
        <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400">
          <Minus className="h-3 w-3 mr-1" />
          {deletions} {t('deletions')}
        </Badge>
      </div>

      <div className="flex gap-1">
        <Button
          variant={viewMode === 'unified' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('unified')}
          title={t('unified')}
        >
          <AlignJustify className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === 'split' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewModeChange('split')}
          title={t('split')}
        >
          <SplitSquareHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

/**
 * Single diff line (unified view)
 */
interface DiffLineComponentProps {
  line: DiffLine;
}

const DiffLineComponent = memo(function DiffLineComponent({ line }: DiffLineComponentProps) {
  const bgColor = {
    unchanged: '',
    added: 'bg-green-50 dark:bg-green-950/30',
    removed: 'bg-red-50 dark:bg-red-950/30',
  }[line.type];

  const textColor = {
    unchanged: 'text-slate-700 dark:text-slate-300',
    added: 'text-green-800 dark:text-green-300',
    removed: 'text-red-800 dark:text-red-300',
  }[line.type];

  const prefix = {
    unchanged: ' ',
    added: '+',
    removed: '-',
  }[line.type];

  const lineNumber = line.type === 'removed' ? line.originalLine : line.fixedLine;

  return (
    <div className={cn('flex font-mono text-xs', bgColor)}>
      {/* Line number */}
      <div className="w-12 flex-shrink-0 px-2 py-1 text-right text-slate-500 dark:text-slate-500 select-none border-r border-slate-200 dark:border-slate-700">
        {lineNumber}
      </div>

      {/* Change indicator */}
      <div className="w-6 flex-shrink-0 px-1 py-1 text-center select-none">
        <span className={textColor}>{prefix}</span>
      </div>

      {/* Content */}
      <div className={cn('flex-1 px-2 py-1 whitespace-pre-wrap break-all', textColor)}>
        {line.content}
      </div>
    </div>
  );
});

/**
 * Unified diff view (single column)
 */
interface UnifiedViewProps {
  diffLines: DiffLine[];
}

const UnifiedView = memo(function UnifiedView({ diffLines }: UnifiedViewProps) {
  return (
    <div className="bg-white dark:bg-slate-950">
      {diffLines.map((line, idx) => (
        <DiffLineComponent key={idx} line={line} />
      ))}
    </div>
  );
});

/**
 * Split diff view (two columns)
 */
interface SplitViewProps {
  diffLines: DiffLine[];
}

const SplitView = memo(function SplitView({ diffLines }: SplitViewProps) {
  // Group lines into pairs for side-by-side display
  const linePairs: Array<{
    left?: DiffLine;
    right?: DiffLine;
  }> = [];

  let leftLineNum = 1;
  let rightLineNum = 1;

  for (const line of diffLines) {
    if (line.type === 'unchanged') {
      linePairs.push({
        left: { ...line, originalLine: leftLineNum },
        right: { ...line, fixedLine: rightLineNum },
      });
      leftLineNum++;
      rightLineNum++;
    } else if (line.type === 'removed') {
      linePairs.push({
        left: { ...line, originalLine: leftLineNum },
        right: undefined,
      });
      leftLineNum++;
    } else if (line.type === 'added') {
      linePairs.push({
        left: undefined,
        right: { ...line, fixedLine: rightLineNum },
      });
      rightLineNum++;
    }
  }

  return (
    <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800">
      {/* Left column (original) */}
      <div className="bg-white dark:bg-slate-950">
        {linePairs.map((pair, idx) => {
          const line = pair.left;
          if (!line) {
            return (
              <div key={idx} className="flex font-mono text-xs bg-slate-100 dark:bg-slate-900">
                <div className="w-12 flex-shrink-0 px-2 py-1 text-right text-slate-400 dark:text-slate-600 select-none border-r border-slate-200 dark:border-slate-700" />
                <div className="w-6 flex-shrink-0 px-1 py-1 text-center select-none" />
                <div className="flex-1 px-2 py-1" />
              </div>
            );
          }

          const bgColor = line.type === 'removed' ? 'bg-red-50 dark:bg-red-950/30' : '';
          const textColor = line.type === 'removed' ? 'text-red-800 dark:text-red-300' : 'text-slate-700 dark:text-slate-300';
          const prefix = line.type === 'removed' ? '-' : ' ';

          return (
            <div key={idx} className={cn('flex font-mono text-xs', bgColor)}>
              <div className="w-12 flex-shrink-0 px-2 py-1 text-right text-slate-500 dark:text-slate-500 select-none border-r border-slate-200 dark:border-slate-700">
                {line.originalLine}
              </div>
              <div className="w-6 flex-shrink-0 px-1 py-1 text-center select-none">
                <span className={textColor}>{prefix}</span>
              </div>
              <div className={cn('flex-1 px-2 py-1 whitespace-pre-wrap break-all', textColor)}>
                {line.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right column (fixed) */}
      <div className="bg-white dark:bg-slate-950">
        {linePairs.map((pair, idx) => {
          const line = pair.right;
          if (!line) {
            return (
              <div key={idx} className="flex font-mono text-xs bg-slate-100 dark:bg-slate-900">
                <div className="w-12 flex-shrink-0 px-2 py-1 text-right text-slate-400 dark:text-slate-600 select-none border-r border-slate-200 dark:border-slate-700" />
                <div className="w-6 flex-shrink-0 px-1 py-1 text-center select-none" />
                <div className="flex-1 px-2 py-1" />
              </div>
            );
          }

          const bgColor = line.type === 'added' ? 'bg-green-50 dark:bg-green-950/30' : '';
          const textColor = line.type === 'added' ? 'text-green-800 dark:text-green-300' : 'text-slate-700 dark:text-slate-300';
          const prefix = line.type === 'added' ? '+' : ' ';

          return (
            <div key={idx} className={cn('flex font-mono text-xs', bgColor)}>
              <div className="w-12 flex-shrink-0 px-2 py-1 text-right text-slate-500 dark:text-slate-500 select-none border-r border-slate-200 dark:border-slate-700">
                {line.fixedLine}
              </div>
              <div className="w-6 flex-shrink-0 px-1 py-1 text-center select-none">
                <span className={textColor}>{prefix}</span>
              </div>
              <div className={cn('flex-1 px-2 py-1 whitespace-pre-wrap break-all', textColor)}>
                {line.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * DiffViewer - Side-by-side or unified diff viewer for SelfReviewer fixes
 *
 * Shows before/after comparison when SelfReviewer status is FIXED.
 *
 * Features:
 * - Two view modes: unified (default) and split
 * - Visual highlighting: green for additions, red for deletions
 * - Line numbers and change indicators
 * - Stats header with additions/deletions count
 * - Dark mode support
 * - Monospace font for code readability
 *
 * @example
 * ```tsx
 * <DiffViewer
 *   originalContent={originalMarkdown}
 *   fixedContent={patchedMarkdown}
 *   changes={selfReviewResult.issues}
 *   locale="en"
 * />
 * ```
 */
export const DiffViewer = memo(function DiffViewer({
  originalContent,
  fixedContent,
  changes: _changes, // Reserved for future enhancement (annotations)
  locale = 'en',
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('unified');

  // Compute diff lines
  const diffLines = useMemo(() => {
    return computeDiff(originalContent, fixedContent);
  }, [originalContent, fixedContent]);

  // Calculate stats
  const stats = useMemo(() => {
    return calculateStats(diffLines);
  }, [diffLines]);

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-950">
      {/* Header */}
      <DiffHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        additions={stats.additions}
        deletions={stats.deletions}
        locale={locale}
      />

      {/* Diff content */}
      <ScrollArea className="h-[400px]">
        {viewMode === 'unified' ? (
          <UnifiedView diffLines={diffLines} />
        ) : (
          <SplitView diffLines={diffLines} />
        )}
      </ScrollArea>
    </div>
  );
});
