import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RFStageNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getStatusColor } from '../hooks/useNodeStatusStyles';

const MinimalNode = ({ id, data, selected }: NodeProps<RFStageNode>) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div 
      className={`
        relative w-6 h-6 rounded-full transition-all duration-300
        ${getStatusColor(currentStatus)}
        ${selected ? 'ring-2 ring-offset-2 ring-blue-400 scale-125' : ''}
        ${currentStatus === 'active' ? 'animate-pulse' : ''}
      `}
      title={data.label}
      data-testid={`node-minimal-${id}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
};

export default memo(MinimalNode);
