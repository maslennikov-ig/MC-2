'use client'

import { useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ActivityEntry, CourseStatus } from '@/types/course-generation'
import { cn } from '@/lib/utils'
import { Info, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react'

interface ActivityLogProps {
  entries: ActivityEntry[]
  status: CourseStatus
  maxHeight?: number
}

function getEntryIcon(type: ActivityEntry['type']) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    default:
      return <Info className="h-4 w-4 text-blue-500" />
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - new Date(date).getTime()
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return 'Только что'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`

  // Format as time if today, otherwise show date
  const entryDate = new Date(date)
  if (entryDate.toDateString() === now.toDateString()) {
    return entryDate.toLocaleTimeString('ru-RU', { hour: 'numeric', minute: '2-digit' })
  }
  return entryDate.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const typeStyles = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  }

  const textStyles = {
    info: 'text-blue-900 dark:text-blue-100',
    success: 'text-green-900 dark:text-green-100',
    warning: 'text-yellow-900 dark:text-yellow-100',
    error: 'text-red-900 dark:text-red-100',
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-all duration-200 hover:shadow-sm',
        typeStyles[entry.type]
      )}
    >
      <div className="mt-0.5 flex-shrink-0">{getEntryIcon(entry.type)}</div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', textStyles[entry.type])}>{entry.message}</p>
        {entry.details && (
          <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        )}
      </div>
      <time className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
        {formatTimestamp(entry.timestamp)}
      </time>
    </div>
  )
}

export default function ActivityLog({ entries, status, maxHeight = 400 }: ActivityLogProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScroll = useRef(true)

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (shouldAutoScroll.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [entries])

  // Check if user has scrolled up
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      // If user is near the bottom (within 50px), enable auto-scroll
      shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50
    }
  }

  // Sort entries by timestamp (newest first for display, but we'll reverse for auto-scroll)
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Журнал активности</span>
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            {entries.length}{' '}
            {entries.length === 1 ? 'запись' : entries.length < 5 ? 'записи' : 'записей'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <Info className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">Пока нет активности</p>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Журнал активности"
            className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent space-y-2 overflow-y-auto pr-2"
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {sortedEntries.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} />
            ))}

            {/* Auto-scroll indicator */}
            {!shouldAutoScroll.current && sortedEntries.length > 5 && (
              <div className="from-background sticky right-0 bottom-0 left-0 bg-gradient-to-t to-transparent py-2">
                <button
                  onClick={() => {
                    shouldAutoScroll.current = true
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
                    }
                  }}
                  className="text-primary hover:text-primary/80 w-full text-xs font-medium"
                >
                  ↓ К последним записям
                </button>
              </div>
            )}
          </div>
        )}

        {/* Status indicator */}
        {status === 'processing_documents' ||
        status === 'generating_content' ||
        status === 'analyzing_task' ? (
          <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Обновление в реальном времени
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
