import React, { memo } from 'react';
import { Handle, Position, NodeProps, useViewport } from '@xyflow/react';
import { RFDocumentNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getNodeStatusStyles, getStatusColor } from '../hooks/useNodeStatusStyles';
import { NodeErrorTooltip } from '../components/shared';
import { FileText, Key, Star, FileIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useShallow } from 'zustand/react/shallow';

// Minimal Node for very low zoom (<0.3)
const MinimalDocumentNode = ({ id, data }: { id: string; data: RFDocumentNode['data'] }) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div
      className={`
        relative w-5 h-5 rounded transition-all duration-300
        ${getStatusColor(currentStatus)}
        ${currentStatus === 'active' ? 'animate-pulse' : ''}
      `}
      title={data.filename}
      data-testid={`node-minimal-${id}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
};

// Medium Node for medium zoom (0.3-0.5)
const MediumDocumentNode = ({ id, data, selected }: { id: string; data: RFDocumentNode['data']; selected?: boolean }) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div
      className={`
        relative w-[100px] px-1.5 py-1 rounded border transition-all duration-300
        flex items-center justify-center text-center
        ${getNodeStatusStyles(currentStatus, 'document')}
        ${selected ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
      `}
      data-testid={`node-medium-${id}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-1 overflow-hidden">
        <FileText size={10} className="flex-shrink-0 text-slate-500" />
        <span className="text-[9px] font-medium text-slate-700 dark:text-slate-300 truncate">
          {data.filename}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-1.5 !h-1.5" />
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
    return <MinimalDocumentNode id={id} data={data} />;
  }
  if (zoom < 0.5) {
    return <MediumDocumentNode id={id} data={data} selected={selected} />;
  }

  // Header color
  const headerColor = data.color || '#3B82F6'; // Default blue if not set

  // Priority badge configuration (with null safety)
  const priorityKey = data.priority?.toUpperCase();
  const priorityConfig = priorityKey && priorityKey in PRIORITY_STYLES
    ? PRIORITY_STYLES[priorityKey as keyof typeof PRIORITY_STYLES]
    : null;
  const PriorityIcon = priorityConfig?.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative w-[180px] rounded-md border transition-all duration-300
        ${getNodeStatusStyles(currentStatus, 'document')}
        ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
      `}
      data-testid={`node-${id}`}
      data-node-status={currentStatus}
      aria-label={`Документ: ${data.filename}, статус: ${currentStatus}`}
      role="button"
      tabIndex={0}
    >
      {/* Header Strip */}
      <div
        className="h-1.5 w-full rounded-t-md opacity-80"
        style={{ backgroundColor: headerColor }}
      />

      {/* Error Tooltip */}
      {currentStatus === 'error' && (
        <NodeErrorTooltip message="Ошибка обработки документа" />
      )}

      {/* Input Handle */}
      <Handle 
        type="target" 
        position={Position.Left} 
        className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white"
        data-testid={`handle-input-${id}`}
      />

      {/* Body */}
      <div className="flex items-center gap-2.5 p-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 ${currentStatus === 'active' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'bg-slate-100 dark:bg-slate-700'}`}>
          <FileText size={16} className={currentStatus === 'active' ? 'text-blue-600 dark:text-blue-400 animate-spin-slow' : ''} />
        </div>
        <div className="flex flex-col overflow-hidden flex-1">
           <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Документ
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title={data.filename}>
              {data.filename}
            </span>
            {priorityConfig && PriorityIcon && (
              <span
                className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border} whitespace-nowrap`}
                title={`Priority: ${data.priority}`}
              >
                <PriorityIcon size={10} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status/Metrics Footer - shows stage progress */}
       {(currentStatus === 'active' || currentStatus === 'completed' || currentStatus === 'error') && (
        <div className="border-t border-black/5 dark:border-white/10 px-2.5 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex justify-between items-center">
             {currentStatus === 'completed' ? (
               <span className="text-green-600 dark:text-green-400 font-medium">
                 Обработан ({completed} из {total})
               </span>
             ) : currentStatus === 'error' ? (
               <span className="text-red-600 dark:text-red-400 font-medium">
                 Ошибка ({completed} из {total})
               </span>
             ) : currentStatus === 'active' ? (
               <>
                 <span className="capitalize font-medium text-slate-600 dark:text-slate-300 truncate max-w-[120px]">
                   {completed} из {total}
                 </span>
                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
               </>
             ) : null}
            </div>
        </div>
       )}


      {/* Output Handle */}
      <Handle 
        type="source" 
        position={Position.Right} 
        className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white"
        data-testid={`handle-output-${id}`}
      />
    </motion.div>
  );
};

export default memo(DocumentNode);
