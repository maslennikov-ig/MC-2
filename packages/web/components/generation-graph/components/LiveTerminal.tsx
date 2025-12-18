'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LessonLogEntry, Stage6NodeName, STAGE6_NODE_LABELS } from '@megacampus/shared-types';

// =============================================================================
// Types
// =============================================================================

interface LiveTerminalProps {
  /** Log entries to display */
  logs: LessonLogEntry[];
  /** Maximum number of lines to keep in buffer (default: 100) */
  maxLines?: number;
  /** Additional CSS classes */
  className?: string;
  /** Callback when Clear button is clicked */
  onClear?: () => void;
}

// =============================================================================
// Color Mappings
// =============================================================================

/** Color classes for log levels */
const LOG_LEVEL_COLORS: Record<LessonLogEntry['level'], string> = {
  debug: 'text-slate-500',
  info: 'text-slate-300 dark:text-slate-400',
  warn: 'text-yellow-500',
  error: 'text-red-500',
};

/** Color classes for node tags */
const NODE_TAG_COLORS: Record<Stage6NodeName | 'system', string> = {
  planner: 'text-purple-400',
  expander: 'text-blue-400',
  assembler: 'text-cyan-400',
  smoother: 'text-green-400',
  judge: 'text-orange-400',
  system: 'text-slate-500',
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format timestamp as HH:MM:SS
 */
function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Get display name for node tag
 */
function getNodeDisplayName(node: Stage6NodeName | 'system'): string {
  if (node === 'system') return 'System';
  return STAGE6_NODE_LABELS[node].ru;
}

// =============================================================================
// Component
// =============================================================================

/**
 * LiveTerminal - Terminal-like log display for lesson generation pipeline
 *
 * Features:
 * - Auto-scrolls to bottom on new logs
 * - Color-coded by log level and node
 * - Monospace font for technical feel
 * - Blinking cursor at bottom
 * - Dark theme (even in light mode)
 * - Buffered to max lines
 */
export function LiveTerminal({
  logs,
  maxLines = 100,
  className = '',
  onClear,
}: LiveTerminalProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showCursor, setShowCursor] = useState(true);

  // Limit logs to maxLines (keep most recent)
  const displayLogs = logs.slice(-maxLines);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs.length]);

  // Blinking cursor animation
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530); // Blink every 530ms (standard terminal cursor speed)

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`
        flex flex-col h-full bg-slate-950 text-slate-300 rounded-lg overflow-hidden border border-slate-800
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-400">Terminal</h3>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1 rounded hover:bg-slate-800 transition-colors text-slate-500 hover:text-slate-300"
            title="Clear logs"
            aria-label="Clear logs"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Log Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
      >
        {displayLogs.length === 0 ? (
          <div className="text-slate-600 italic">No logs yet...</div>
        ) : (
          <>
            {displayLogs.map((log) => (
              <div
                key={log.id}
                className={`flex gap-2 mb-1 ${LOG_LEVEL_COLORS[log.level]}`}
              >
                {/* Timestamp */}
                <span className="text-slate-500 select-none shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>

                {/* Node Tag */}
                <span
                  className={`${NODE_TAG_COLORS[log.node]} font-semibold select-none shrink-0`}
                >
                  [{getNodeDisplayName(log.node)}]
                </span>

                {/* Message */}
                <span className="break-words flex-1">{log.message}</span>
              </div>
            ))}

            {/* Blinking Cursor */}
            <div className="flex gap-2 mt-1">
              <span
                className={`inline-block w-2 h-4 bg-slate-400 transition-opacity ${
                  showCursor ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
