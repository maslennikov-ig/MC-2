'use client';

import React, { memo, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface JsonViewerProps {
  data: unknown;
  title?: string;
  maxHeight?: string;
  defaultExpanded?: boolean;
}

interface JsonNodeProps {
  value: unknown;
  keyName?: string;
  level: number;
  isLast: boolean;
  expandAll: boolean;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

const INDENT_SIZE = 16; // px per level
const LARGE_ARRAY_THRESHOLD = 100; // Items before pagination kicks in
const LARGE_OBJECT_THRESHOLD = 100; // Keys before pagination kicks in
const ITEMS_PER_PAGE = 50; // Items shown per page for large datasets

// Syntax highlighting component for individual JSON values
const JsonValueRender = memo(({ value }: { value: unknown }) => {
  if (value === null) {
    return <span className="text-[var(--json-null)]">null</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-[var(--json-string)]">&quot;{value}&quot;</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-[var(--json-number)]">{value}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-[var(--json-boolean)]">{String(value)}</span>;
  }

  return <span>{String(value)}</span>;
});
JsonValueRender.displayName = 'JsonValueRender';

// Recursive JSON tree node component
const JsonNode = memo(({ value, keyName, level, isLast, expandAll }: JsonNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(expandAll);
  const [currentPage, setCurrentPage] = useState(0);

  // Sync with expandAll prop
  React.useEffect(() => {
    setIsExpanded(expandAll);
  }, [expandAll]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
    // Reset pagination when collapsing
    if (isExpanded) {
      setCurrentPage(0);
    }
  }, [isExpanded]);

  const showNextPage = useCallback(() => {
    setCurrentPage(prev => prev + 1);
  }, []);

  const showPrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  }, []);

  const indent = level * INDENT_SIZE;

  // Primitive value (leaf node)
  if (value === null || typeof value !== 'object') {
    return (
      <div className="flex font-mono text-sm leading-6">
        <div style={{ paddingLeft: `${indent}px` }} className="flex-1">
          {keyName && (
            <>
              <span className="text-[var(--json-keyword)]">&quot;{keyName}&quot;</span>
              <span className="text-[var(--json-bracket)]">: </span>
            </>
          )}
          <JsonValueRender value={value} />
          {!isLast && <span className="text-[var(--json-bracket)]">,</span>}
        </div>
      </div>
    );
  }

  // Array or Object
  const isArray = Array.isArray(value);
  const allEntries = isArray
    ? (value as JsonArray).map((item, idx) => [String(idx), item] as const)
    : Object.entries(value as JsonObject);

  const isEmpty = allEntries.length === 0;
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  // Performance optimization: Paginate large datasets
  const threshold = isArray ? LARGE_ARRAY_THRESHOLD : LARGE_OBJECT_THRESHOLD;
  const isLargeDataset = allEntries.length > threshold;
  const totalPages = Math.ceil(allEntries.length / ITEMS_PER_PAGE);
  const startIdx = currentPage * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, allEntries.length);
  const entries = isLargeDataset ? allEntries.slice(startIdx, endIdx) : allEntries;
  const hasNextPage = isLargeDataset && currentPage < totalPages - 1;
  const hasPrevPage = isLargeDataset && currentPage > 0;

  // Single-line display for empty arrays/objects
  if (isEmpty) {
    return (
      <div className="flex font-mono text-sm leading-6">
        <div style={{ paddingLeft: `${indent}px` }} className="flex-1">
          {keyName && (
            <>
              <span className="text-[var(--json-keyword)]">&quot;{keyName}&quot;</span>
              <span className="text-[var(--json-bracket)]">: </span>
            </>
          )}
          <span className="text-[var(--json-bracket)]">{openBracket}{closeBracket}</span>
          {!isLast && <span className="text-[var(--json-bracket)]">,</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header line with expand/collapse button */}
      <div className="flex items-center font-mono text-sm leading-6 group">
        <button
          onClick={toggleExpand}
          className="flex items-center hover:bg-accent/50 rounded px-1 -ml-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
          style={{ paddingLeft: `${indent}px` }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          {keyName && (
            <>
              <span className="text-[var(--json-keyword)] ml-1">&quot;{keyName}&quot;</span>
              <span className="text-[var(--json-bracket)]">: </span>
            </>
          )}
          <span className="text-[var(--json-bracket)]">{openBracket}</span>
          {!isExpanded && (
            <span className="text-muted-foreground ml-1 text-xs">
              {entries.length} {isArray ? 'items' : 'keys'}
            </span>
          )}
          {!isExpanded && <span className="text-[var(--json-bracket)]">{closeBracket}</span>}
          {!isExpanded && !isLast && <span className="text-[var(--json-bracket)]">,</span>}
        </button>
      </div>

      {/* Expanded content with animation */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Pagination info for large datasets */}
            {isLargeDataset && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground" style={{ paddingLeft: `${indent + INDENT_SIZE}px` }}>
                <span>
                  Showing {startIdx + 1}-{endIdx} of {allEntries.length} {isArray ? 'items' : 'keys'}
                </span>
                {hasPrevPage && (
                  <button
                    onClick={showPrevPage}
                    className="text-primary hover:underline focus:outline-none"
                  >
                    ← Prev
                  </button>
                )}
                {hasNextPage && (
                  <button
                    onClick={showNextPage}
                    className="text-primary hover:underline focus:outline-none"
                  >
                    Next →
                  </button>
                )}
              </div>
            )}

            {entries.map(([key, val], idx) => (
              <JsonNode
                key={`${key}-${idx}`}
                value={val}
                keyName={isArray ? undefined : key}
                level={level + 1}
                isLast={idx === entries.length - 1 && !hasNextPage}
                expandAll={expandAll}
              />
            ))}

            <div className="flex font-mono text-sm leading-6">
              <div style={{ paddingLeft: `${indent}px` }}>
                <span className="text-[var(--json-bracket)]">{closeBracket}</span>
                {!isLast && <span className="text-[var(--json-bracket)]">,</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
JsonNode.displayName = 'JsonNode';

export const JsonViewer = memo(({
  data,
  title,
  maxHeight = '60vh',
  defaultExpanded = false
}: JsonViewerProps) => {
  const [expandAll, setExpandAll] = useState(defaultExpanded);

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (_error) {
      return String(data);
    }
  }, [data]);

  // Performance measurement: Track JSON render time
  React.useEffect(() => {
    if (!data) return;

    const startMark = 'json-render-start';
    const endMark = 'json-render-end';
    const measureName = 'json-render-duration';

    performance.mark(startMark);

    const rafId = requestAnimationFrame(() => {
      performance.mark(endMark);

      try {
        performance.measure(measureName, startMark, endMark);
        const measure = performance.getEntriesByName(measureName)[0];
        const duration = measure.duration;

        // Count total items for context
        const itemCount = Array.isArray(data)
          ? data.length
          : typeof data === 'object' && data !== null
          ? Object.keys(data).length
          : 0;

        if (duration > 100 && itemCount > 50) {
          console.warn(
            `[Performance] JsonViewer render exceeded 100ms: ${duration.toFixed(2)}ms for ${itemCount} items`,
            { title, itemCount }
          );
        } else if (process.env.NODE_ENV === 'development' && itemCount > 100) {
          console.log(
            `[Performance] JsonViewer rendered ${itemCount} items in ${duration.toFixed(2)}ms`,
            { title }
          );
        }

        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
        performance.clearMeasures(measureName);
      } catch (error) {
        console.debug('[Performance] Failed to measure JSON render time:', error);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [data, title]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      toast.success('Copied to clipboard');
    } catch (_error) {
      toast.error('Failed to copy to clipboard');
    }
  }, [jsonString]);

  const toggleExpandAll = useCallback(() => {
    setExpandAll((prev) => !prev);
  }, []);

  if (!data) {
    return (
      <div className="p-4 border rounded-md bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          {title && <span className="text-sm font-medium">{title}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpandAll}
            className="h-8 px-2 text-xs"
            title={expandAll ? 'Свернуть всё' : 'Развернуть всё'}
          >
            {expandAll ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span className="ml-1 hidden sm:inline">Свернуть</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="ml-1 hidden sm:inline">Развернуть</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-2 text-xs"
            title="Копировать"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="ml-1 hidden sm:inline">Копировать</span>
          </Button>
        </div>
      </div>

      {/* JSON content with custom scrollbar */}
      <ScrollArea className="w-full" style={{ maxHeight }}>
        <div className="p-4">
          <JsonNode value={data} level={0} isLast={true} expandAll={expandAll} />
        </div>
      </ScrollArea>

      {/* CSS variables for syntax highlighting */}
      <style jsx>{`
        /* Light theme syntax colors */
        :global(:root) {
          --json-keyword: hsl(220, 95%, 45%); /* Blue - for keys */
          --json-string: hsl(130, 88%, 32%); /* Green - for string values */
          --json-number: hsl(169, 84%, 38%); /* Teal - for numbers */
          --json-boolean: hsl(240, 100%, 50%); /* Blue - for true/false */
          --json-null: hsl(0, 0%, 50%); /* Gray - for null */
          --json-bracket: hsl(240, 100%, 50%); /* Blue - for {}, [], : */
        }

        /* Dark theme syntax colors */
        :global(.dark) {
          --json-keyword: hsl(200, 100%, 65%); /* Light blue - for keys */
          --json-string: hsl(145, 63%, 57%); /* Green - for string values */
          --json-number: hsl(168, 55%, 60%); /* Teal - for numbers */
          --json-boolean: hsl(217, 71%, 63%); /* Blue - for true/false */
          --json-null: hsl(220, 9%, 66%); /* Gray - for null */
          --json-bracket: hsl(213, 97%, 68%); /* Light blue - for {}, [], : */
        }
      `}</style>
    </div>
  );
});

JsonViewer.displayName = 'JsonViewer';
