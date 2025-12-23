import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RFStageNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getNodeStatusStyles } from '../hooks/useNodeStatusStyles';

const MediumNode = ({ id, data, selected }: NodeProps<RFStageNode>) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div 
      className={`
        relative min-w-[120px] px-2 py-1.5 rounded-md border transition-all duration-300
        flex items-center justify-center text-center
        ${getNodeStatusStyles(currentStatus, 'stage')}
        ${selected ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
      `}
      data-testid={`node-medium-${id}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 dark:!bg-slate-500 !w-2 !h-2" />

      <div className="flex flex-col">
        <span className={`text-[10px] uppercase ${
          currentStatus === 'skipped'
            ? 'text-slate-400 dark:text-slate-500'
            : 'text-slate-500 dark:text-slate-400'
        }`}>Stage {data.stageNumber}</span>
        <span className={`text-xs font-medium truncate max-w-[110px] ${
          currentStatus === 'skipped'
            ? 'text-slate-500 dark:text-slate-400 line-through'
            : 'text-slate-800 dark:text-slate-200'
        }`}>
            {data.label}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-slate-400 dark:!bg-slate-500 !w-2 !h-2" />
    </div>
  );
};

export default memo(MediumNode);
