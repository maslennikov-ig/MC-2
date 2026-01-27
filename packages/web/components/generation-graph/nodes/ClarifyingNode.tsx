'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { MessageCircleQuestion, Check, Bot, Loader2 } from 'lucide-react'
import { NodeProgressBar } from '../components/shared'
import { Badge } from '@/components/ui/badge'

export interface ClarifyingNodeData {
  status: 'pending' | 'active' | 'completed'
  questionsCount: number
  answeredCount: number
  criticalAnswered: number
  criticalTotal: number
  /** Whether questions were auto-answered in automatic mode */
  isAutomatic?: boolean
  /** Optional label for node display */
  label?: string
  /** Whether questions are still loading (fallback state when course is in stage_4_clarifying but questions not fetched yet) */
  isLoading?: boolean
  /** Index signature for React Flow Node<Data> compatibility */
  [key: string]: string | number | boolean | undefined
}

export const ClarifyingNode = memo(({ data, selected }: NodeProps) => {
  const t = useTranslations('generation.clarifyingNode')

  // Defensive type casting with validation (Issue #5)
  const rawData = data as unknown as ClarifyingNodeData | undefined

  // Handle missing or malformed data gracefully
  if (!rawData) {
    return (
      <div className="clarifying-node min-w-[200px] rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 dark:bg-red-950/20">
        <Handle type="target" position={Position.Top} className="!bg-red-500" />
        <span className="text-xs text-red-600">{t('invalidData')}</span>
        <Handle type="source" position={Position.Bottom} className="!bg-red-500" />
      </div>
    )
  }

  // Extract with fallback values for resilience
  const {
    status = 'pending',
    questionsCount = 0,
    answeredCount = 0,
    criticalAnswered = 0,
    criticalTotal = 0,
    isAutomatic = false,
    isLoading = false,
  } = rawData

  const isActive = status === 'active'
  const isComplete = answeredCount === questionsCount && questionsCount > 0 && !isLoading
  const progress = questionsCount > 0 ? (answeredCount / questionsCount) * 100 : 0

  return (
    <div
      className={cn(
        'clarifying-node min-w-[200px] rounded-xl border-2 px-4 py-3',
        'bg-white shadow-lg transition-all duration-300 dark:bg-slate-900',
        isActive && 'animate-pulse border-purple-400 ring-2 ring-purple-500',
        isComplete && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20',
        selected && 'ring-2 ring-blue-400',
        !isActive && !isComplete && 'border-slate-200 dark:border-slate-700'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-500" />

      <div className="mb-2 flex items-center gap-2">
        {isComplete ? (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
            <Check className="h-4 w-4 text-white" />
          </div>
        ) : (
          <MessageCircleQuestion
            className={cn('h-5 w-5', isActive ? 'text-purple-500' : 'text-slate-400')}
          />
        )}
        <span className="text-sm font-medium">{t('title')}</span>
        {isAutomatic && (
          <Badge variant="secondary" className="ml-auto flex items-center gap-1 text-xs">
            <Bot className="h-3 w-3" />
            {t('autoBadge')}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-purple-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('generating')}
        </div>
      ) : (
        <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          {t('progress', { answered: answeredCount, total: questionsCount })}
          {criticalTotal > 0 && (
            <span className="ml-2 text-red-600 dark:text-red-400">
              {t('critical', { answered: criticalAnswered, total: criticalTotal })}
            </span>
          )}
        </div>
      )}

      <NodeProgressBar
        progress={isLoading ? 0 : progress}
        variant={isComplete ? 'success' : isActive ? 'active' : 'default'}
      />

      <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
    </div>
  )
})

ClarifyingNode.displayName = 'ClarifyingNode'
export default ClarifyingNode
