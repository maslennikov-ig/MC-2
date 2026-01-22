import React, { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { RFStageNode } from '../types'
import { useNodeStatus } from '../hooks/useNodeStatus'
import { getNodeStatusStyles } from '../hooks/useNodeStatusStyles'

const MediumNode = ({ id, data, selected }: NodeProps<RFStageNode>) => {
  const statusEntry = useNodeStatus(id)
  const currentStatus = statusEntry?.status || data.status

  return (
    <div
      className={`relative flex min-w-[120px] items-center justify-center rounded-md border px-2 py-1.5 text-center transition-all duration-300 ${getNodeStatusStyles(currentStatus, 'stage')} ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''} `}
      data-testid={`node-medium-${id}`}
      tabIndex={0}
      role="button"
      aria-label={`Stage ${data.stageNumber}: ${data.label}, status: ${currentStatus}`}
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          // Trigger click/selection
        }
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-slate-400 dark:!bg-slate-500"
      />

      <div className="flex flex-col">
        <span
          className={`text-[10px] uppercase ${
            currentStatus === 'skipped'
              ? 'text-slate-400 dark:text-slate-500'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          Stage {data.stageNumber}
        </span>
        <span
          className={`max-w-[110px] truncate text-xs font-medium ${
            currentStatus === 'skipped'
              ? 'text-slate-500 line-through dark:text-slate-400'
              : 'text-slate-800 dark:text-slate-200'
          }`}
        >
          {data.label}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-slate-400 dark:!bg-slate-500"
      />
    </div>
  )
}

export default memo(MediumNode)
