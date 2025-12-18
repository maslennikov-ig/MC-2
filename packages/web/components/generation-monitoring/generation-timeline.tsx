'use client';

import { useGenerationRealtime, GenerationTrace } from './realtime-provider';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

export function GenerationTimeline({ traces: propTraces }: { traces?: GenerationTrace[] }) {
  const { traces: contextTraces, isConnected, refetch } = useGenerationRealtime();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const traces = propTraces || contextTraces;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Sort traces by created_at desc
  const sortedTraces = [...traces].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Live Generation Log</h3>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            title="Refresh traces"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </button>
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
        </div>
      </div>

      <div className="mb-2 text-xs text-muted-foreground">
        {traces.length} trace{traces.length !== 1 ? 's' : ''} loaded
      </div>

      <div className="relative pl-6 border-l border-border space-y-8">
        <AnimatePresence initial={false}>
          {sortedTraces.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-muted-foreground italic py-4"
            >
              No generation traces yet. Click refresh to check for new traces.
            </motion.div>
          ) : (
            sortedTraces.map((trace) => (
              <TimelineItem key={trace.id} trace={trace} />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TimelineItem({ trace }: { trace: GenerationTrace }) {
  const { selectedTraceId, setSelectedTraceId } = useGenerationRealtime();
  const isError = !!trace.error_data;
  const isSelected = selectedTraceId === trace.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative group cursor-pointer transition-all duration-200 rounded-lg p-2 -ml-2",
        isSelected ? "bg-muted/50 shadow-sm ring-1 ring-border" : "hover:bg-muted/30"
      )}
      onClick={() => setSelectedTraceId(trace.id)}
    >
      {/* Dot indicator */}
      <div className={cn(
        "absolute -left-[21px] top-3 h-4 w-4 rounded-full border-2 bg-background flex items-center justify-center z-10 transition-colors",
        isError ? "border-red-500 text-red-500" : isSelected ? "border-primary text-primary" : "border-blue-500 text-blue-500"
      )}>
        {isError ? <AlertCircle className="h-2.5 w-2.5" /> : <div className="h-1.5 w-1.5 rounded-full bg-current" />}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
          <span className="uppercase tracking-wider text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            {trace.stage}
          </span>
          <span>{trace.phase}</span>
          <span className="text-muted-foreground font-normal">/ {trace.step_name}</span>
        </div>
        
        <div className="text-xs text-muted-foreground flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(trace.created_at), { addSuffix: true, locale: ru })}
          </span>
          {trace.duration_ms && (
            <span>{trace.duration_ms}ms</span>
          )}
          {trace.model_used && (
            <span className="bg-blue-500/10 text-blue-500 px-1.5 rounded">
              {trace.model_used}
            </span>
          )}
        </div>

        {trace.error_data && (
          <div className="mt-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-mono overflow-x-auto">
            {JSON.stringify(trace.error_data, null, 2)}
          </div>
        )}
      </div>
    </motion.div>
  );
}