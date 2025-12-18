import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RFMergeNode } from '../types';
import { GitMerge } from 'lucide-react';

const MergeNode = ({ id }: NodeProps<RFMergeNode>) => {
  return (
    <div
      className="relative w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 rounded-full flex items-center justify-center border-2 border-slate-300 dark:border-slate-600 shadow-md"
      data-testid={`node-merge-${id}`}
    >
      <GitMerge size={18} className="text-slate-500 dark:text-slate-400" />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-400 dark:!bg-slate-500 !w-2 !h-2 !border-2 !border-white dark:!border-slate-800 !-left-1"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400 dark:!bg-slate-500 !w-2 !h-2 !border-2 !border-white dark:!border-slate-800 !-right-1"
      />
    </div>
  );
};

export default memo(MergeNode);
