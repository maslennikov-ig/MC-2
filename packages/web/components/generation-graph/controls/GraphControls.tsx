import React, { memo, useCallback, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Plus, Minus, Focus, Wand2 } from 'lucide-react';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { AppNode, AppEdge } from '../types';

interface GraphControlsProps {
  isDark?: boolean;
}

export const GraphControls = memo(function GraphControls({ isDark }: GraphControlsProps) {
  const { zoomIn, zoomOut, fitView, getNodes, getEdges, setNodes } = useReactFlow();
  const { layoutNodes } = useGraphLayout();
  const [isArranging, setIsArranging] = useState(false);

  const handleAutoArrange = useCallback(async () => {
    if (isArranging) return;

    setIsArranging(true);
    try {
      const currentNodes = getNodes() as AppNode[];
      const currentEdges = getEdges() as AppEdge[];

      const layoutedNodes = await layoutNodes(currentNodes, currentEdges);
      setNodes(layoutedNodes);

      // Fit view after layout with slight delay for smooth animation
      requestAnimationFrame(() => {
        fitView({ padding: 0.15, duration: 400 });
      });
    } finally {
      setIsArranging(false);
    }
  }, [isArranging, getNodes, getEdges, layoutNodes, setNodes, fitView]);

  const buttonClass = isDark
    ? 'p-2 hover:bg-slate-600 text-slate-300 rounded transition-colors disabled:opacity-50'
    : 'p-2 hover:bg-slate-100 text-slate-600 rounded transition-colors disabled:opacity-50';

  return (
    <div className={`absolute bottom-4 left-4 flex flex-col gap-1 shadow-md p-1 rounded-lg z-10 border ${
      isDark
        ? 'bg-slate-800 border-slate-700'
        : 'bg-white border-slate-200'
    }`}>
      <button
        onClick={() => zoomIn()}
        className={buttonClass}
        title="Увеличить"
        aria-label="Увеличить"
        data-testid="graph-zoom-in"
      >
        <Plus size={16} />
      </button>
      <button
        onClick={() => zoomOut()}
        className={buttonClass}
        title="Уменьшить"
        aria-label="Уменьшить"
        data-testid="graph-zoom-out"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={() => fitView({ padding: 0.15, duration: 300 })}
        className={buttonClass}
        title="Показать всё"
        aria-label="Показать всё"
        data-testid="graph-fit-view"
      >
        <Focus size={16} />
      </button>
      <div className={`h-px my-1 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
      <button
        onClick={handleAutoArrange}
        disabled={isArranging}
        className={`${buttonClass} ${isArranging ? 'animate-pulse' : ''}`}
        title="Выровнять"
        aria-label="Выровнять"
        data-testid="graph-auto-arrange"
      >
        <Wand2 size={16} className={isArranging ? 'animate-spin' : ''} />
      </button>
    </div>
  );
});
