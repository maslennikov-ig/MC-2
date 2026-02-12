'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { LessonLogEntry, Stage6NodeName, STAGE6_NODE_LABELS } from '@megacampus/shared-types'

// =============================================================================
// Types
// =============================================================================

interface LiveTerminalProps {
  /** Log entries to display */
  logs: LessonLogEntry[]
  /** Maximum number of lines to keep in buffer (default: 100) */
  maxLines?: number
  /** Additional CSS classes */
  className?: string
  /** Callback when Clear button is clicked */
  onClear?: () => void
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
}

/** Color classes for node tags
 * 3-node pipeline: generator, selfReviewer, judge
 */
const NODE_TAG_COLORS: Record<Stage6NodeName | 'system', string> = {
  generator: 'text-indigo-400',
  selfReviewer: 'text-teal-400',
  judge: 'text-orange-400',
  system: 'text-slate-500',
}

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
  }).format(date)
}

/**
 * Get display name for node tag
 */
function getNodeDisplayName(node: Stage6NodeName | 'system'): string {
  if (node === 'system') return 'System'
  return STAGE6_NODE_LABELS[node].ru
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
export function LiveTerminal({ logs, maxLines = 100, className = '', onClear }: LiveTerminalProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showCursor, setShowCursor] = useState(true)

  // Limit logs to maxLines (keep most recent)
  const displayLogs = logs.slice(-maxLines)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [logs.length])

  // Blinking cursor animation
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev)
    }, 530) // Blink every 530ms (standard terminal cursor speed)

    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-slate-300 ${className} `}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <h3 className="text-sm font-medium text-slate-400">Terminal</h3>
        {onClear && (
          <button
            onClick={onClear}
            className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
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
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Terminal output"
        className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {displayLogs.length === 0 ? (
          <div className="text-slate-600 italic">No logs yet...</div>
        ) : (
          <>
            {displayLogs.map((log) => (
              <div key={log.id} className={`mb-1 flex gap-2 ${LOG_LEVEL_COLORS[log.level]}`}>
                {/* Timestamp */}
                <span className="shrink-0 text-slate-500 select-none">
                  {formatTimestamp(log.timestamp)}
                </span>

                {/* Node Tag */}
                <span className={`${NODE_TAG_COLORS[log.node]} shrink-0 font-semibold select-none`}>
                  [{getNodeDisplayName(log.node)}]
                </span>

                {/* Message */}
                <span className="flex-1 break-words">{log.message}</span>
              </div>
            ))}

            {/* Blinking Cursor */}
            <div className="mt-1 flex gap-2">
              <span
                className={`inline-block h-4 w-2 bg-slate-400 transition-opacity ${
                  showCursor ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
