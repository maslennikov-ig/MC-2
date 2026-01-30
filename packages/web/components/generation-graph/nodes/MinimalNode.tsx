import React, { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { RFStageNode } from '../types'
import { useNodeStatus } from '../hooks/useNodeStatus'
import { getStatusColor } from '../hooks/useNodeStatusStyles'
import { useTranslations } from 'next-intl'

const MinimalNode = ({ id, data, selected }: NodeProps<RFStageNode>) => {
  const statusEntry = useNodeStatus(id)
  const currentStatus = statusEntry?.status || data.status
  const t = useTranslations('generation')

  return (
    <div
      className={`relative h-6 w-6 rounded-full transition-all duration-300 ${getStatusColor(currentStatus)} ${selected ? 'scale-125 ring-2 ring-blue-400 ring-offset-2' : ''} ${currentStatus === 'active' ? 'animate-pulse' : ''} ${currentStatus === 'skipped' ? 'opacity-50' : ''} `}
      title={
        currentStatus === 'skipped'
          ? `${data.label} (${t('status.skipped').toLowerCase()})`
          : data.label
      }
      data-testid={`node-minimal-${id}`}
      tabIndex={0}
      role="button"
      aria-label={`${data.label}, status: ${currentStatus}${currentStatus === 'skipped' ? ', skipped' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
}

export default memo(MinimalNode)
