import React, { memo, useRef } from 'react';
import { NodeProps, useViewport } from '@xyflow/react';
import { RFDocumentNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { getNodeStatusStyles, getStatusColor, getStatusBorderClass } from '../hooks/useNodeStatusStyles';
import { NodeErrorTooltip } from '../components/shared';
import { FileText, Key, Star, FileIcon } from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useShallow } from 'zustand/react/shallow';

// Minimal Node for very low zoom (<0.3)
const MinimalDocumentNode = ({ id, data, onDoubleClick }: { id: string; data: RFDocumentNode['data']; onDoubleClick: () => void }) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div
      className={`
        relative w-4 h-4 rounded-sm transition-all duration-300 cursor-pointer
        ${getStatusColor(currentStatus)}
        ${currentStatus === 'active' ? 'animate-pulse' : ''}
      `}
      title={data.filename}
      data-testid={`node-minimal-${id}`}
      onDoubleClick={onDoubleClick}
    />
  );
};

// Medium Node for medium zoom (0.3-0.5)
const MediumDocumentNode = ({ id, data, selected, onDoubleClick }: { id: string; data: RFDocumentNode['data']; selected?: boolean; onDoubleClick: () => void }) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div
      className={`
        relative w-[90px] px-1.5 py-1 rounded border transition-all duration-300 cursor-pointer
        flex items-center justify-center text-center
        ${getNodeStatusStyles(currentStatus, 'document')}
        ${selected ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
      `}
      data-testid={`node-medium-${id}`}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex items-center gap-1 overflow-hidden">
        <FileText size={10} className="flex-shrink-0 text-slate-500" />
        <span className="text-[9px] font-medium text-slate-700 dark:text-slate-300 truncate">
          {data.filename}
        </span>
      </div>
    </div>
  );
};

// Priority badge styles
const PRIORITY_STYLES = {
  CORE: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-700',
    icon: Key,
  },
  IMPORTANT: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-800 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-700',
    icon: Star,
  },
  SUPPLEMENTARY: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-300 dark:border-gray-600',
    icon: FileIcon,
  },
} as const;

const DocumentNode = (props: NodeProps<RFDocumentNode>) => {
  const { id, data, selected } = props;
  const { zoom } = useViewport();
  const { selectNode } = useNodeSelection();

  // Double-click detection via timing (React Flow captures onDoubleClick)
  const lastClickTime = useRef(0);
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  // Subscribe to realtime status updates - MUST be called before any conditional returns (Rules of Hooks)
  const statusEntry = useNodeStatus(id);

  // Get progress and status from Zustand store (bypasses React batching for accurate counters)
  // Use useShallow to prevent infinite re-renders when getProgress returns new object
  const { completed, total } = useGenerationStore(
    useShallow(state => state.getDocumentProgress(data.documentId))
  );

  // Get document status from Zustand store for green highlighting when complete
  const docStatus = useGenerationStore(
    state => state.getDocumentStatus(data.documentId)
  );

  // Priority: Zustand store status > statusEntry > data.status (fallback)
  // Zustand store is the single source of truth for document processing status
  const currentStatus = docStatus !== 'pending' ? docStatus : (statusEntry?.status || data.status);

  // Semantic Zoom - switch to smaller representations at lower zoom levels
  if (zoom < 0.3) {
    return <MinimalDocumentNode id={id} data={data} onDoubleClick={() => selectNode(id)} />;
  }
  if (zoom < 0.5) {
    return <MediumDocumentNode id={id} data={data} selected={selected} onDoubleClick={() => selectNode(id)} />;
  }

  // Handle click with double-click detection
  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;

    if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
      // Double-click detected - open document inspector
      e.stopPropagation();
      selectNode(id);
      lastClickTime.current = 0; // Reset to prevent triple-click triggering
    } else {
      lastClickTime.current = now;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectNode(id);
    }
  };

  // Priority badge configuration (with null safety)
  const priorityKey = data.priority?.toUpperCase();
  const priorityConfig = priorityKey && priorityKey in PRIORITY_STYLES
    ? PRIORITY_STYLES[priorityKey as keyof typeof PRIORITY_STYLES]
    : null;
  const PriorityIcon = priorityConfig?.icon;

  return (
    <div
      className={`
        relative w-full h-[50px] rounded border transition-all duration-300 flex items-center cursor-pointer
        ${getStatusBorderClass(currentStatus)}
        ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
      `}
      data-testid={`node-${id}`}
      data-node-status={currentStatus}
      aria-label={`Документ: ${data.filename}, статус: ${currentStatus}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Error Tooltip */}
      {currentStatus === 'error' && (
        <NodeErrorTooltip message="Ошибка обработки документа" />
      )}

      {/* Left Icon Zone (36px) */}
      <div className="w-[36px] flex-shrink-0 flex items-center justify-center">
        <div className={`flex h-7 w-7 items-center justify-center rounded-full ${currentStatus === 'active' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'bg-slate-100 dark:bg-slate-700'}`}>
          <FileText size={14} className={`text-slate-600 dark:text-slate-300 ${currentStatus === 'active' ? 'text-blue-600 dark:text-blue-400' : ''}`} />
        </div>
      </div>

      {/* Content Zone (flex-1, two lines) */}
      <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
        {/* Line 1: Title with priority badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate" title={data.filename}>
            {data.filename}
          </span>
          {priorityConfig && PriorityIcon && (
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border} whitespace-nowrap flex-shrink-0`}
              title={`Priority: ${data.priority}`}
            >
              <PriorityIcon size={10} />
            </span>
          )}
        </div>

        {/* Line 2: Status info */}
        <div className="text-[10px] text-slate-500 dark:text-slate-400">
          {currentStatus === 'completed' ? (
            <span className="text-green-600 dark:text-green-400 font-medium">
              Обработан ({completed} из {total})
            </span>
          ) : currentStatus === 'error' ? (
            <span className="text-red-600 dark:text-red-400 font-medium">
              Ошибка ({completed} из {total})
            </span>
          ) : currentStatus === 'active' ? (
            <span className="text-blue-600 dark:text-blue-400">
              Обработка ({completed} из {total})...
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">В очереди</span>
          )}
        </div>
      </div>

      {/* Progress indicator for active status */}
      {currentStatus === 'active' && (
        <div className="w-[24px] flex-shrink-0 flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default memo(DocumentNode);
