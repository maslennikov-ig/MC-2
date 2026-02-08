'use client'

import { useGenerationRealtime, GenerationTrace } from './realtime-provider'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Clock, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

export function GenerationTimeline({ traces: propTraces }: { traces?: GenerationTrace[] }) {
  const { traces: contextTraces, isConnected, refetch } = useGenerationRealtime()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const traces = propTraces || contextTraces

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  // Sort traces by created_at desc
  const sortedTraces = [...traces].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Live Generation Log</h3>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="hover:bg-muted rounded-md p-1.5 transition-colors disabled:opacity-50"
            title="Refresh traces"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </button>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'h-2 w-2 rounded-full',
                isConnected ? 'animate-pulse bg-green-500' : 'bg-red-500'
              )}
            />
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground mb-2 text-xs">
        {traces.length} trace{traces.length !== 1 ? 's' : ''} loaded
      </div>

      <div className="border-border relative space-y-8 border-l pl-6">
        <AnimatePresence initial={false}>
          {sortedTraces.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-muted-foreground py-4 text-sm italic"
            >
              No generation traces yet. Click refresh to check for new traces.
            </motion.div>
          ) : (
            sortedTraces.map((trace) => <TimelineItem key={trace.id} trace={trace} />)
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function TimelineItem({ trace }: { trace: GenerationTrace }) {
  const { selectedTraceId, setSelectedTraceId } = useGenerationRealtime()
  const isError = !!trace.error_data
  const isSelected = selectedTraceId === trace.id

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'group relative -ml-2 cursor-pointer rounded-lg p-2 transition-all duration-200',
        isSelected ? 'bg-muted/50 ring-border shadow-sm ring-1' : 'hover:bg-muted/30'
      )}
      onClick={() => setSelectedTraceId(trace.id)}
    >
      {/* Dot indicator */}
      <div
        className={cn(
          'bg-background absolute top-3 -left-[21px] z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors',
          isError
            ? 'border-red-500 text-red-500'
            : isSelected
              ? 'border-primary text-primary'
              : 'border-blue-500 text-blue-500'
        )}
      >
        {isError ? (
          <AlertCircle className="h-2.5 w-2.5" />
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-foreground/90 flex items-center gap-2 text-sm font-semibold">
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs tracking-wider uppercase">
            {trace.stage}
          </span>
          <span>{trace.phase}</span>
          <span className="text-muted-foreground font-normal">/ {trace.step_name}</span>
        </div>

        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(trace.created_at), { addSuffix: true, locale: ru })}
          </span>
          {trace.duration_ms && <span>{trace.duration_ms}ms</span>}
          {trace.model_used && (
            <span className="rounded bg-blue-500/10 px-1.5 text-blue-500">{trace.model_used}</span>
          )}
        </div>

        {trace.error_data && (
          <div className="mt-2 overflow-x-auto rounded-md border border-red-500/20 bg-red-500/10 p-3 font-mono text-xs text-red-400">
            {JSON.stringify(trace.error_data, null, 2)}
          </div>
        )}
      </div>
    </motion.div>
  )
}
