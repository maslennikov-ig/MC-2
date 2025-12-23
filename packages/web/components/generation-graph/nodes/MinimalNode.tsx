import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { RFStageNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getStatusColor } from '../hooks/useNodeStatusStyles';
import { useTranslation } from '@/lib/generation-graph/useTranslation';

const MinimalNode = ({ id, data, selected }: NodeProps<RFStageNode>) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;
  const { t } = useTranslation();

  return (
    <div
      className={`
        relative w-6 h-6 rounded-full transition-all duration-300
        ${getStatusColor(currentStatus)}
        ${selected ? 'ring-2 ring-offset-2 ring-blue-400 scale-125' : ''}
        ${currentStatus === 'active' ? 'animate-pulse' : ''}
        ${currentStatus === 'skipped' ? 'opacity-50' : ''}
      `}
      title={currentStatus === 'skipped' ? `${data.label} (${t('status.skipped').toLowerCase()})` : data.label}
      data-testid={`node-minimal-${id}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
};

export default memo(MinimalNode);
