import React, { memo, useRef, useState } from 'react';
import { NodeProps, useViewport } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { RFLessonNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { RefreshCw, Play, Loader2, Check } from 'lucide-react';
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext';
import { NodeErrorTooltip, RetryBadge, NodeProgressBar } from '../components/shared';
import { getStatusColor, getStatusBorderClass, getNodeStatusStyles } from '../hooks/useNodeStatusStyles';
import { logger } from '@/lib/client-logger';
import { AssetDock } from './AssetDock';
import { EnrichmentNodeToolbar } from '../components/EnrichmentNodeToolbar';
import { useEnrichmentInspectorStore, type CreateEnrichmentType } from '../stores/enrichment-inspector-store';

// Minimal Node for very low zoom (<0.3)
const MinimalLessonNode = ({ id, data, onDoubleClick }: { id: string; data: RFLessonNode['data']; onDoubleClick: () => void }) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;

  return (
    <div
      className={`
        relative w-4 h-4 rounded-sm transition-all duration-300 cursor-pointer
        ${getStatusColor(currentStatus)}
        ${currentStatus === 'active' ? 'animate-pulse' : ''}
      `}
      title={data.title}
      data-testid={`node-minimal-lesson-${id}`}
      onDoubleClick={onDoubleClick}
    />
  );
};

// Medium Node for medium zoom (0.3-0.5)
const MediumLessonNode = ({ id, data, selected, onDoubleClick }: { id: string; data: RFLessonNode['data']; selected?: boolean; onDoubleClick: () => void }) => {
  const statusEntry = useNodeStatus(id);
  const currentStatus = statusEntry?.status || data.status;
  const hasEnrichments = (data.enrichmentCount ?? 0) > 0;

  return (
    <div
      className={`
        relative w-[90px] px-1.5 py-1 rounded border transition-all duration-300 cursor-pointer
        flex items-center justify-center text-center
        ${getNodeStatusStyles(currentStatus, 'lesson')}
        ${selected ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
      `}
      data-testid={`node-medium-lesson-${id}`}
      onDoubleClick={onDoubleClick}
    >
      <span className="text-[9px] font-medium text-slate-700 dark:text-slate-300 truncate">
        {data.title}
      </span>
      {/* Small dot indicator if enrichments exist */}
      {hasEnrichments && (
        <div
          className={`
            absolute top-1 right-1 w-1.5 h-1.5 rounded-full
            ${data.hasEnrichmentErrors ? 'bg-red-500' : data.enrichmentsGenerating ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}
          `}
          title={`${data.enrichmentCount} enrichment(s)`}
        />
      )}
    </div>
  );
};

const LessonNode = (props: NodeProps<RFLessonNode>) => {
  const { id, data, selected } = props;
  const { zoom } = useViewport();
  const { selectNode } = useNodeSelection();
  const [showToolbar, setShowToolbar] = useState(false);
  const { setPendingCreate, openCreate } = useEnrichmentInspectorStore(
    useShallow((s) => ({
      setPendingCreate: s.setPendingCreate,
      openCreate: s.openCreate,
    }))
  );
  const { selectedNodeId } = useNodeSelection();

  // Subscribe to realtime status updates - MUST be called before any conditional returns (Rules of Hooks)
  const statusEntry = useNodeStatus(id);
  const realtimeStatus = statusEntry?.status || data.status;

  // Partial generation context (optional - may not be in provider)
  const contextValue = useOptionalPartialGenerationContext();

  // Quick add handler - opens create view in enrichment inspector
  const handleQuickAdd = (type: CreateEnrichmentType) => {
    if (selectedNodeId === id) {
      // Node already selected - directly open create view
      openCreate(type);
    } else {
      // Node not selected - set pending and select (openRoot will pick it up)
      setPendingCreate(type);
      selectNode(id);
    }
    setShowToolbar(false);
  };
  const {
    generateLesson,
    isLessonGenerating = () => false,
    isSelectionMode = false,
    toggleLesson = () => {},
    selectedLessons = new Set<string>(),
  } = contextValue || {};

  // Convert lesson ID to API format for checking generating status
  const getLessonIdForApi = () => {
    const idStr = data.lessonId;
    const match = idStr.match(/lesson_(\d+)_(\d+)/);
    if (match) return `${match[1]}.${match[2]}`;
    if (/^\d+\.\d+$/.test(idStr)) return idStr;
    return idStr;
  };

  // Determine effective status: treat generating lessons as 'active'
  const isCurrentlyGenerating = isLessonGenerating(getLessonIdForApi());
  const currentStatus = isCurrentlyGenerating ? 'active' : realtimeStatus;

  // Workaround: React Flow captures onDoubleClick, so we detect it manually via click timing
  // MUST be called before any conditional returns (Rules of Hooks)
  const lastClickTime = useRef(0);
  const DOUBLE_CLICK_THRESHOLD = 300; // ms

  // Semantic Zoom - switch to smaller representations at lower zoom levels
  if (zoom < 0.3) {
    return <MinimalLessonNode id={id} data={data} onDoubleClick={() => {
      logger.devLog('[MinimalLessonNode] Double-click', { id, zoom });
      selectNode(id);
    }} />;
  }
  if (zoom < 0.5) {
    return <MediumLessonNode id={id} data={data} selected={selected} onDoubleClick={() => {
      logger.devLog('[MediumLessonNode] Double-click', { id, zoom });
      selectNode(id);
    }} />;
  }

  // Extract error message safely
  const errorMessage = statusEntry?.errorMessage ||
                       (data.errorData?.message as string) ||
                       (data.errorData?.error as string) ||
                       "Unknown error";

  // Get lesson number from data.lessonOrder (set in useGraphData)
  // Fallback: extract LAST number from lessonId (e.g., "lesson_1_3" -> 3)
  const lessonNumber = (data as { lessonOrder?: number }).lessonOrder ??
    (() => {
      const numbers = data.lessonId.match(/\d+/g);
      return numbers && numbers.length > 0 ? parseInt(numbers[numbers.length - 1]) : 1;
    })();

  // Status text for Line 2 - consistent with DocumentNode style
  const getStatusText = () => {
    if (currentStatus === 'completed') {
      return (
        <span className="text-green-600 dark:text-green-400 font-medium">
          Сгенерирован
        </span>
      );
    }
    if (currentStatus === 'error') {
      return (
        <span className="text-red-600 dark:text-red-400 font-medium">
          Ошибка генерации
        </span>
      );
    }
    if (currentStatus === 'active') {
      const progressText = data.progress !== undefined ? ` ${data.progress}%` : '';
      return (
        <span className="text-blue-600 dark:text-blue-400">
          Генерация{progressText}...
        </span>
      );
    }
    return <span className="text-slate-400 dark:text-slate-500">В очереди</span>;
  };

  const handleClick = (e: React.MouseEvent) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;

    if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
      // Double-click detected - open lesson inspector
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

  // Show AssetDock only when there are enrichments
  const hasEnrichments = (data.enrichmentCount ?? 0) > 0;

  return (
    <div
      className={`
        relative w-full rounded border border-slate-200 dark:border-slate-700
        transition-all duration-300 flex flex-col cursor-pointer group
        ${hasEnrichments ? 'h-[64px]' : 'h-[50px]'}
        ${getStatusBorderClass(currentStatus)}
        ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
      `}
      data-testid={`node-lesson-${id}`}
      data-node-status={currentStatus}
      aria-label={`Урок ${lessonNumber}: ${data.title}, статус: ${currentStatus}`}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => zoom >= 0.6 && setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      {/* Quick Add Toolbar - shows on hover at sufficient zoom */}
      {showToolbar && zoom >= 0.6 && (
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <EnrichmentNodeToolbar
            onCreateEnrichment={handleQuickAdd}
            existingTypes={(data.enrichmentsSummary || []).map(e => e.type as CreateEnrichmentType)}
            isCompact
          />
        </div>
      )}
      {/* Error Tooltip */}
      {currentStatus === 'error' && (
        <NodeErrorTooltip message={errorMessage} />
      )}

      {/* Main content row (50px) */}
      <div className="flex items-center h-[50px]">
        {/* Left Number Zone (36px) */}
        <div className="w-[36px] flex-shrink-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {lessonNumber}
          </span>
        </div>

        {/* Content Zone (flex-1, two lines) */}
        <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
          {/* Line 1: Title */}
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate" title={data.title}>
            {data.title}
          </div>

          {/* Line 2: Status info (consistent with DocumentNode) */}
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {getStatusText()}
          </div>
        </div>

        {/* Right Action Zone */}
        {contextValue && (
          <div className="w-[32px] flex-shrink-0 flex items-center justify-center">
            {isSelectionMode ? (
              // Checkbox in selection mode
              <button
                onClick={() => toggleLesson(getLessonIdForApi())}
                className={`
                  w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                  ${selectedLessons.has(getLessonIdForApi())
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-300'
                  }
                `}
                title="Выбрать урок"
              >
                {selectedLessons.has(getLessonIdForApi()) && <Check size={10} />}
              </button>
            ) : currentStatus !== 'active' ? (
              // Generate button (not in active status)
              <button
                onClick={() => {
                  if (generateLesson) {
                    generateLesson(getLessonIdForApi());
                  }
                }}
                disabled={isLessonGenerating(getLessonIdForApi())}
                className={`
                  p-1 rounded transition-colors
                  ${currentStatus === 'completed' || currentStatus === 'error'
                    ? 'text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/30'
                    : 'text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
                  }
                  ${isLessonGenerating(getLessonIdForApi()) ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                title={currentStatus === 'completed' ? 'Перегенерировать урок' : 'Сгенерировать урок'}
              >
                {isLessonGenerating(getLessonIdForApi()) ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : currentStatus === 'completed' || currentStatus === 'error' ? (
                  <RefreshCw size={14} />
                ) : (
                  <Play size={14} />
                )}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* AssetDock row (14px) - only shown when enrichments exist */}
      {hasEnrichments && (
        <div className="h-[14px] px-2 flex items-center">
          <AssetDock
            enrichments={data.enrichmentsSummary}
            hasErrors={data.hasEnrichmentErrors}
            isGenerating={data.enrichmentsGenerating}
            count={data.enrichmentCount}
            onClick={() => selectNode(id)}
          />
        </div>
      )}

      {/* Progress Bar (active only) - absolute positioned at bottom */}
      {currentStatus === 'active' && data.progress !== undefined && (
        <div className="absolute bottom-0 left-0 w-full">
          <NodeProgressBar
            progress={data.progress}
            variant="active"
            size="xs"
          />
        </div>
      )}

      {/* Retry Badge (if retryCount > 0) */}
      {(data.retryCount ?? 0) > 0 && (
        <RetryBadge
          count={data.retryCount!}
          size="sm"
          testId={`retry-badge-${id}`}
        />
      )}
    </div>
  );
};

export default memo(LessonNode);
