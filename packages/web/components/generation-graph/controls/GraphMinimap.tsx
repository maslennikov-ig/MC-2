import React, { memo } from 'react';
import { MiniMap } from '@xyflow/react';

interface GraphMinimapProps {
  isDark?: boolean;
}

export const GraphMinimap = memo(function GraphMinimap({ isDark }: GraphMinimapProps) {
  return (
    <MiniMap
      position="bottom-right"
      className={`!border !shadow-md !rounded-lg !overflow-hidden ${
        isDark
          ? '!bg-slate-800 !border-slate-700'
          : '!bg-white !border-slate-200'
      }`}
      maskColor={isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(241, 245, 249, 0.7)'}
      nodeColor={(n) => {
        if (n.type === 'stage') return isDark ? '#60a5fa' : '#3b82f6'; // blue-400/500
        if (n.type === 'merge') return isDark ? '#94a3b8' : '#64748b'; // slate-400/500
        if (n.type === 'end') return isDark ? '#34d399' : '#10b981';   // emerald-400/500
        if (n.type === 'document') return isDark ? '#818cf8' : '#6366f1'; // indigo
        return isDark ? '#475569' : '#cbd5e1'; // slate-600/300
      }}
      style={{
        // Fix for potential white square - ensure proper styling
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
      }}
    />
  );
});
