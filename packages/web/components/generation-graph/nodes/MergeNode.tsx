import React, { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { RFMergeNode } from '../types'
import { GitMerge } from 'lucide-react'

const MergeNode = ({ id }: NodeProps<RFMergeNode>) => {
  return (
    <div
      className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 shadow-md dark:border-slate-600 dark:from-slate-700 dark:to-slate-800"
      data-testid={`node-merge-${id}`}
    >
      <GitMerge size={18} className="text-slate-500 dark:text-slate-400" />
      <Handle
        type="target"
        position={Position.Left}
        className="!-left-1 !h-2 !w-2 !border-2 !border-white !bg-slate-400 dark:!border-slate-800 dark:!bg-slate-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!-right-1 !h-2 !w-2 !border-2 !border-white !bg-slate-400 dark:!border-slate-800 dark:!bg-slate-500"
      />
    </div>
  )
}

export default memo(MergeNode)
