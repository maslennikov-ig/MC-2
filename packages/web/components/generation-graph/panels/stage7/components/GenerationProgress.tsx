'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Terminal, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { GenerationPhase } from '../../../hooks/useGenerationStatus';

export interface GenerationProgressProps {
  phase: GenerationPhase;
  progress?: number | null;
  statusMessage: string;
  logs?: string[];
  onCancel?: () => void;
  canCancel?: boolean;
  className?: string;
}

/**
 * Terminal-style progress display for enrichment generation
 *
 * Shows real-time progress with optional log output and cancel button.
 * Animates status updates and shows completion/failure states.
 *
 * @example
 * ```tsx
 * <GenerationProgress
 *   phase="generating"
 *   progress={45}
 *   statusMessage="Generating quiz questions..."
 *   logs={['Processing lesson content...', 'Generating question 3/10...']}
 *   onCancel={() => cancelMutation.mutate()}
 *   canCancel
 * />
 * ```
 */
export function GenerationProgress({
  phase,
  progress,
  statusMessage,
  logs = [],
  onCancel,
  canCancel,
  className,
}: GenerationProgressProps) {
  const t = useTranslations('enrichments');
  const [dots, setDots] = useState('');

  // Animate dots for generating states
  useEffect(() => {
    if (phase === 'generating' || phase === 'finalizing' || phase === 'queued') {
      const interval = setInterval(() => {
        setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
      }, 500);
      return () => clearInterval(interval);
    }
    setDots('');
    return; // Explicit return to satisfy TypeScript
  }, [phase]);

  const cancelLabel = t('actions.cancel');

  const isActive = phase === 'queued' || phase === 'generating' || phase === 'finalizing';
  const isComplete = phase === 'completed';
  const isFailed = phase === 'failed';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Status Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-3">
          {isActive && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
          {isComplete && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          {isFailed && <XCircle className="w-5 h-5 text-red-500" />}

          <div className="flex-1">
            <div className="font-medium">
              {statusMessage}
              {isActive && <span className="text-muted-foreground">{dots}</span>}
            </div>
            {progress !== null && progress !== undefined && (
              <div className="text-sm text-muted-foreground">{progress}%</div>
            )}
          </div>

          {canCancel && isActive && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        {progress !== null && progress !== undefined && isActive && (
          <Progress value={progress} className="mt-3 h-2" />
        )}
      </div>

      {/* Terminal-style Log Output */}
      <div className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-sm">
        <div className="flex items-center gap-2 text-slate-400 mb-3">
          <Terminal className="w-4 h-4" />
          <span>{t('generationLog.title')}</span>
        </div>

        <div className="space-y-1">
          {logs.length === 0 ? (
            <div className="text-slate-500">
              {t('generationLog.waiting')}
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="text-slate-300">
                <span className="text-slate-500">[{String(idx + 1).padStart(2, '0')}]</span>{' '}
                {log}
              </div>
            ))
          )}

          {isActive && (
            <div className="text-green-400 animate-pulse">▌</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline progress indicator
 */
export function InlineProgress({ phase, progress }: { phase: GenerationPhase; progress?: number | null }) {
  if (phase === 'idle' || phase === 'completed' || phase === 'draft_review') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      {progress !== null && progress !== undefined && (
        <span className="text-xs text-muted-foreground">{progress}%</span>
      )}
    </div>
  );
}
