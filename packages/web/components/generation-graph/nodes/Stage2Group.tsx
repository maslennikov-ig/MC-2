import React, { memo, useRef, useMemo, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow, useViewport, useUpdateNodeInternals } from '@xyflow/react';
import { RFStage2GroupNode } from '../types';
import { ChevronDown, ChevronRight, FileStack } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  getNodeStatusStyles,
  getStatusColor
} from '../hooks/useNodeStatusStyles';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { useNodeSelection } from '../hooks/useNodeSelection';
import {
  NodeErrorTooltip,
  RetryBadge,
  NodeProgressBar,
  StatusBadge
} from '../components/shared';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { NodeStatus } from '@megacampus/shared-types';

// Minimal Node for very low zoom (<0.3)
const MinimalStage2Node = ({ id, data }: { id: string; data: RFStage2GroupNode['data'] }) => {
  const { t } = useTranslation();
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status || 'pending';

  return (
    <div
      className={`
        relative w-5 h-5 rounded transition-all duration-300
        ${getStatusColor(currentStatus)}
        ${currentStatus === 'active' ? 'animate-pulse' : ''}
      `}
      title={t('stage2.groupTitle')}
      data-testid={`node-minimal-stage2group-${id}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
};

// Medium Node for medium zoom (0.3-0.5)
const MediumStage2Node = ({ id, data, selected, completedDocs }: { id: string; data: RFStage2GroupNode['data']; selected?: boolean; completedDocs: number }) => {
  const { t } = useTranslation();
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status || 'pending';
  const progressPercent = data.totalDocuments > 0
    ? Math.round((completedDocs / data.totalDocuments) * 100)
    : 0;

  return (
    <div
      className={`
        relative w-[120px] px-2 py-1.5 rounded border transition-all duration-300
        flex flex-col gap-1
        ${getNodeStatusStyles(currentStatus, 'module')}
        ${selected ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
      `}
      data-testid={`node-medium-stage2group-${id}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-1.5">
        <div className="h-5 w-5 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
          <FileStack size={10} />
        </div>
        <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate flex-1">
          {t('stage2.documentsLabel')}
        </span>
      </div>

      {/* Progress Badge */}
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-slate-500 dark:text-slate-400">
          {completedDocs}/{data.totalDocuments}
        </span>
        <span className={`font-medium ${
          currentStatus === 'completed' ? 'text-emerald-600 dark:text-emerald-400' :
          currentStatus === 'active' ? 'text-blue-600 dark:text-blue-400' :
          'text-slate-500 dark:text-slate-400'
        }`}>
          {progressPercent}%
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-slate-400 !w-1.5 !h-1.5" />
    </div>
  );
};

const Stage2Group = ({ id, data, selected }: NodeProps<RFStage2GroupNode>) => {
  const { t } = useTranslation();
  const { setNodes } = useReactFlow();
  const { zoom } = useViewport();
  const { selectNode } = useNodeSelection();
  const updateNodeInternals = useUpdateNodeInternals();

  // Double-click detection via timing (React Flow captures onDoubleClick)
  const lastClickTime = useRef(0);
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  // Track zoom mode for semantic zoom - notify React Flow when node dimensions change
  // This ensures edges are recalculated when crossing zoom thresholds
  const prevZoomModeRef = useRef<'minimal' | 'medium' | 'full'>('full');
  const currentZoomMode = zoom < 0.3 ? 'minimal' : zoom < 0.5 ? 'medium' : 'full';

  useEffect(() => {
    if (prevZoomModeRef.current !== currentZoomMode) {
      prevZoomModeRef.current = currentZoomMode;
      // Notify React Flow to recalculate node dimensions and edge positions
      updateNodeInternals(id);
    }
  }, [currentZoomMode, id, updateNodeInternals]);

  // Subscribe to realtime status updates - MUST be called before any conditional returns (Rules of Hooks)
  const statusEntry = useNodeStatus(id);

  // Get documents from Zustand store - SINGLE SOURCE OF TRUTH
  // This ensures Stage2Group shows the same data as child DocumentNode components
  // Both use useGenerationStore for document status, preventing sync issues
  const documentsMap = useGenerationStore(state => state.documents);

  // Calculate document counts from Zustand store (memoized)
  const { totalDocs, completedDocs, failedDocs, groupStatus } = useMemo(() => {
    const docs = Array.from(documentsMap.values());
    const total = docs.length || data.totalDocuments || 0;
    const completed = docs.filter(d => d.status === 'completed').length;
    const failed = docs.filter(d => d.status === 'error').length;
    const active = docs.filter(d => d.status === 'active').length;

    // Calculate group status from documents
    let status: NodeStatus = 'pending';
    if (failed > 0) {
      status = 'error';
    } else if (active > 0) {
      status = 'active';
    } else if (total > 0 && completed === total) {
      status = 'completed';
    } else if (completed > 0) {
      status = 'active';
    }

    return {
      totalDocs: total,
      completedDocs: completed,
      failedDocs: failed,
      groupStatus: status
    };
  }, [documentsMap, data.totalDocuments]);

  // Priority: Zustand calculated status > statusEntry > data.status (fallback)
  // Zustand store is the single source of truth for document processing status
  const currentStatus = groupStatus !== 'pending' ? groupStatus : (statusEntry?.status || data.status || 'pending');

  // Extract error information safely
  const errorMessage = statusEntry?.errorMessage ||
                       (data.errorData?.message as string) ||
                       (data.errorData?.error as string) ||
                       (Array.isArray(data.errorData) ? (data.errorData[0]?.message || data.errorData[0]) : null) ||
                       t('stage2.unknownError') || "Unknown error";
  const hasErrors = currentStatus === 'error';
  const retryCount = data.retryCount || 0;

  // Count failed documents for error tooltip
  const errorCount = failedDocs;

  // Semantic Zoom - switch to smaller representations at lower zoom levels
  if (zoom < 0.3) {
    return <MinimalStage2Node id={id} data={data} />;
  }
  if (zoom < 0.5) {
    return <MediumStage2Node id={id} data={data} selected={selected} completedDocs={completedDocs} />;
  }

  // Handle click with double-click detection
  // Single click: toggle collapse
  // Double click: open node details panel
  const handleHeaderClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;

    if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
      // Double-click detected - open node details panel
      selectNode(id);
      lastClickTime.current = 0; // Reset to prevent triple-click triggering
    } else {
      // Single click - toggle collapse
      lastClickTime.current = now;

      const newCollapsed = !data.isCollapsed;

      // Update stage2group collapse state and child visibility
      // This triggers nodes change -> GraphView useEffect -> layoutNodes
      // Two-Phase Layout will recalculate group dimensions and document positions
      setNodes((nodes) => nodes.map(n => {
        if (n.id === id) {
          // Update isCollapsed state - this triggers relayout with new group dimensions
          return {
            ...n,
            data: { ...n.data, isCollapsed: newCollapsed },
            // Force new object reference to trigger React Flow re-render
            style: { ...n.style }
          };
        }
        // Toggle visibility of children (documents inside group)
        if (data.childIds && data.childIds.includes(n.id)) {
          return { ...n, hidden: newCollapsed };
        }
        return n;
      }));
    }
  };

  // Calculate progress percentage using dynamic count
  const progressPercent = totalDocs > 0
    ? Math.round((completedDocs / totalDocs) * 100)
    : 0;

  return (
    <>
      {data.isCollapsed ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`
            relative w-[300px] min-h-[90px] rounded-md border-2 transition-all duration-300
            ${currentStatus === 'active'
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 shadow-[0_0_10px_rgba(59,130,246,0.3)] animate-pulse'
              : currentStatus === 'completed'
              ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20'
              : currentStatus === 'error'
              ? 'border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/20'
              : currentStatus === 'awaiting'
              ? 'border-yellow-400 dark:border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/20'
              : currentStatus === 'skipped'
              ? 'border-slate-300 dark:border-slate-600 bg-slate-100/50 dark:bg-slate-800/50 opacity-60'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-70'
            }
            ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
          `}
          data-testid={`node-stage2group-${id}`}
          data-node-status={currentStatus}
          aria-label={`${t('stage2.groupTitle')}: ${completedDocs} из ${totalDocs} ${t('stage2.documentsCount')} обработано, статус: ${currentStatus}`}
          role="group"
          tabIndex={0}
        >

          {/* Error Tooltip */}
          {hasErrors && (
            <NodeErrorTooltip
              message={errorCount > 0 ? `${errorCount} ${t('stage2.documentsWithErrors')}` : errorMessage}
            />
          )}

          {/* Retry Badge */}
          {retryCount > 0 && (
            <RetryBadge
              count={retryCount}
              position="top-left"
              testId={`retry-badge-${id}`}
            />
          )}

          <Handle
            type="target"
            position={Position.Left}
            className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-800"
          />

          {/* Clickable header area for expand/collapse (single click) or open details (double click) */}
          <div
            onClick={handleHeaderClick}
            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
            data-testid={`expand-stage2group-${id}`}
            role="button"
            aria-expanded="false"
            aria-label={t('stage2.clickToExpand')}
          >
            <div className={`
              h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0
              ${currentStatus === 'active'
                ? 'bg-white dark:bg-slate-700 shadow-sm'
                : 'bg-indigo-100 dark:bg-indigo-900/30'
              }
            `}>
              <FileStack
                size={18}
                className="text-indigo-600 dark:text-indigo-400"
              />
            </div>

            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t('stage2.stageLabel')}
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate" title={t('stage2.groupTitle')}>
                {t('stage2.groupTitle')}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {completedDocs}/{totalDocs} {t('stage2.documentsCount')}
                </span>
                <StatusBadge
                  status={currentStatus}
                  label={currentStatus === 'completed' ? t('stage2.statusReady') : undefined}
                  size="xs"
                />
              </div>

              {/* Progress Bar */}
              {totalDocs > 0 && (
                <NodeProgressBar
                  progress={progressPercent}
                  variant={currentStatus === 'completed' ? 'success' : currentStatus === 'error' ? 'error' : currentStatus === 'active' ? 'active' : 'default'}
                  size="sm"
                  className="mt-1.5"
                />
              )}
            </div>

            {/* Chevron on the right - indicates expandable */}
            <ChevronRight
              size={20}
              className="text-slate-400 dark:text-slate-500 flex-shrink-0 transition-transform duration-200"
            />
          </div>

          {/* Metrics Footer */}
          {(currentStatus === 'active' || currentStatus === 'completed' || currentStatus === 'error') && (
            <div className="border-t border-black/5 dark:border-white/10 px-2.5 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="flex justify-between items-center">
                <span>{completedDocs} / {totalDocs} {t('stage2.documentsCount')}</span>
                {currentStatus === 'completed' ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">{t('stage2.statusReady')}</span>
                ) : currentStatus === 'active' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-blue-600 dark:text-blue-400">{t('stage2.statusProcessing')}</span>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  </div>
                ) : currentStatus === 'error' ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">{t('stage2.statusError')}</span>
                ) : null}
              </div>
            </div>
          )}

          <Handle
            type="source"
            position={Position.Right}
            className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-800"
          />
        </motion.div>
      ) : (
        // EXPANDED STATE: Stage2 container with header (60px) + space for nested documents
        // Documents are positioned by useGraphLayout Phase 2 starting at y=60px
        // CRITICAL: w-full h-full to fill React Flow wrapper (which has correct dimensions from layout)
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`
            w-full h-full relative rounded-md border-2 transition-all duration-300
            ${currentStatus === 'active'
              ? 'border-blue-400 dark:border-blue-500 bg-blue-50/20 dark:bg-blue-900/10'
              : currentStatus === 'completed'
              ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50/20 dark:bg-emerald-900/10'
              : currentStatus === 'error'
              ? 'border-red-400 dark:border-red-500 bg-red-50/20 dark:bg-red-900/10'
              : 'border-indigo-300 dark:border-indigo-600 bg-indigo-50/20 dark:bg-indigo-900/10'
            }
            ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
          `}
          data-testid={`node-stage2group-expanded-${id}`}
          data-node-status={currentStatus}
          aria-label={`${t('stage2.documentProcessingExpanded')}: ${completedDocs} из ${totalDocs}`}
        >
          {/* Header (70px) - single click: collapse, double click: open details */}
          <div
            onClick={handleHeaderClick}
            className="h-[70px] px-3 flex items-center gap-3 border-b border-indigo-200/50 dark:border-indigo-700/30 relative overflow-hidden cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-colors"
            data-testid={`collapse-stage2group-${id}`}
            role="button"
            aria-expanded="true"
            aria-label={t('stage2.clickToCollapse')}
          >
            {/* Progress Background Fill */}
            <div
              className="absolute inset-0 bg-indigo-100/50 dark:bg-indigo-900/20 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Content (above progress background) */}
            <div className={`
              h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0
              bg-indigo-100 dark:bg-indigo-900/30 relative z-10
            `}>
              <FileStack size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>

            <div className="flex flex-col flex-1 min-w-0 relative z-10">
              <span className="text-[10px] font-medium text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">
                {t('stage2.stageLabel')}
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {t('stage2.groupTitle')}
              </span>
            </div>

            <span className={`
              text-[10px] px-2 py-1 rounded-full font-medium flex-shrink-0 relative z-10
              ${currentStatus === 'completed'
                ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/30'
                : currentStatus === 'active'
                ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30'
                : currentStatus === 'error'
                ? 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30'
                : 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30'
              }
            `}>
              {completedDocs}/{totalDocs}
            </span>

            {hasErrors && (
              <NodeErrorTooltip
                message={errorCount > 0 ? `${errorCount} ${t('stage2.documentsWithErrors')}` : errorMessage}
                className="relative top-auto right-auto flex-shrink-0"
              />
            )}

            {/* Chevron pointing down when expanded - on the right */}
            <ChevronDown
              size={20}
              className="text-slate-400 dark:text-slate-500 flex-shrink-0 relative z-10 transition-transform duration-200"
            />
          </div>

          {/* Handles for edges */}
          <Handle
            type="target"
            position={Position.Left}
            className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-800"
          />
          <Handle
            type="source"
            position={Position.Right}
            className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-800"
          />
        </motion.div>
      )}
    </>
  );
};

export default memo(Stage2Group);
