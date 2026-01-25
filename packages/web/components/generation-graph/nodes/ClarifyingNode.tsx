'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { MessageCircleQuestion, Check } from 'lucide-react'
import { NodeProgressBar } from '../components/shared'

export interface ClarifyingNodeData {
  status: 'pending' | 'active' | 'completed'
  questionsCount: number
  answeredCount: number
  criticalAnswered: number
  criticalTotal: number
}

export const ClarifyingNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as ClarifyingNodeData
  const isActive = nodeData.status === 'active'
  const isComplete =
    nodeData.answeredCount === nodeData.questionsCount && nodeData.questionsCount > 0
  const progress =
    nodeData.questionsCount > 0 ? (nodeData.answeredCount / nodeData.questionsCount) * 100 : 0

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
        <span className="text-sm font-medium">Уточняющие вопросы</span>
      </div>

      <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {nodeData.answeredCount} / {nodeData.questionsCount} отвечено
        {nodeData.criticalTotal > 0 && (
          <span className="ml-2 text-red-600 dark:text-red-400">
            ({nodeData.criticalAnswered}/{nodeData.criticalTotal} обязательных)
          </span>
        )}
      </div>

      <NodeProgressBar
        progress={progress}
        variant={isComplete ? 'success' : isActive ? 'active' : 'default'}
      />

      <Handle type="source" position={Position.Bottom} className="!bg-purple-500" />
    </div>
  )
})

ClarifyingNode.displayName = 'ClarifyingNode'
export default ClarifyingNode
