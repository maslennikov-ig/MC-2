import React, { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface ParameterData {
  name: string
  value: unknown
  status: 'pending' | 'active' | 'completed' | 'failed'
}

export interface ParameterStageNodeData {
  label: string
  stageNumber: number
  parameters: ParameterData[]
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped'
}

const statusColors: Record<string, string> = {
  pending: 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-600',
  active:
    'bg-blue-50 border-blue-400 dark:bg-blue-900/30 dark:border-blue-500 ring-2 ring-blue-400/50',
  completed: 'bg-green-50 border-green-400 dark:bg-green-900/30 dark:border-green-500',
  failed: 'bg-red-50 border-red-400 dark:bg-red-900/30 dark:border-red-500',
  skipped: 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700 opacity-50',
}

const paramStatusColors: Record<string, string> = {
  pending: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

export const ParameterStageNode = memo(({ data }: { data: ParameterStageNodeData }) => {
  return (
    <div
      className={cn(
        'min-w-[160px] rounded-lg border-2 p-3 shadow-sm transition-all',
        statusColors[data.status]
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />

      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium text-slate-500 uppercase dark:text-slate-400">
          Stage {data.stageNumber}
        </span>
        {data.status === 'active' && (
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        )}
      </div>

      {/* Label */}
      <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {data.label}
      </h3>

      {/* Parameters */}
      {data.parameters.length > 0 && (
        <div className="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-600">
          {data.parameters.slice(0, 4).map((param) => (
            <Badge
              key={param.name}
              variant="secondary"
              className={cn('px-1.5 py-0 text-[10px]', paramStatusColors[param.status])}
              aria-label={`Parameter ${param.name}, status: ${param.status}`}
            >
              {param.name}
            </Badge>
          ))}
          {data.parameters.length > 4 && (
            <span className="text-[10px] text-slate-500">+{data.parameters.length - 4} more</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  )
})

ParameterStageNode.displayName = 'ParameterStageNode'
