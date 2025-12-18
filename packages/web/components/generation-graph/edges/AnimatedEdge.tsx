import React, { memo } from 'react';
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react';
import { RFGraphEdge } from '../types';

const AnimatedEdge = ({
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

  // Status-based styling
  let strokeColor = '#cbd5e1'; // slate-300 (idle)
  let strokeWidth = 2;
  // Safe access to data
  const isAnimated = !!(data?.animated || data?.status === 'active');

  if (data?.status === 'active') {
    strokeColor = '#3b82f6'; // blue-500
    strokeWidth = 3;
  } else if (data?.status === 'completed') {
    strokeColor = '#10b981'; // emerald-500
    strokeWidth = 2;
  } else if (data?.status === 'error') {
    strokeColor = '#ef4444'; // red-500
    strokeWidth = 2;
  }

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...(style || {}),
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: isAnimated ? '5 5' : undefined,
        animation: isAnimated ? 'edge-flow 1s linear infinite' : undefined,
      }}
      className={isAnimated ? 'animated-edge' : ''}
    />
  );
};

export default memo(AnimatedEdge);