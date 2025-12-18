import React, { memo } from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';
import { RFGraphEdge } from '../types';

const DataFlowEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps<RFGraphEdge>) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isFlowing = data?.status === 'active';

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {isFlowing && (
        <circle r="3" fill="#3b82f6">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
};

export default memo(DataFlowEdge);