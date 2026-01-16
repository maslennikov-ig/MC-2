import React, { memo, useRef, useEffect, useCallback } from 'react'
import {
  Handle,
  Position,
  NodeProps,
  useReactFlow,
  useViewport,
  useUpdateNodeInternals,
} from '@xyflow/react'
import { RFModuleNode } from '../types'
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Play,
  RefreshCw,
  Loader2,
  Check,
  PanelRight,
} from 'lucide-react'
import { useViewportPreservation } from '../hooks/useViewportPreservation'
import { motion } from 'framer-motion'
import {
  getNodeStatusStyles,
  getStatusColor,
  getStatusBorderClass,
} from '../hooks/useNodeStatusStyles'
import { useNodeStatus } from '../hooks/useNodeStatus'
import { useNodeSelection } from '../hooks/useNodeSelection'
import { NodeErrorTooltip, RetryBadge, NodeProgressBar, StatusBadge } from '../components/shared'
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext'

// Minimal Node for very low zoom (<0.3)
const MinimalModuleNode = ({ id, data }: { id: string; data: RFModuleNode['data'] }) => {
  const statusEntry = useNodeStatus(id)
  const currentStatus = statusEntry?.status || data.status || 'pending'

  return (
    <div
      className={`relative h-5 w-5 rounded transition-all duration-300 ${getStatusColor(currentStatus)} ${currentStatus === 'active' ? 'animate-pulse' : ''} `}
      title={data.title}
      data-testid={`node-minimal-module-${id}`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
}

// Medium Node for medium zoom (0.3-0.5)
const MediumModuleNode = ({
  id,
  data,
  selected,
}: {
  id: string
  data: RFModuleNode['data']
  selected?: boolean
}) => {
  const statusEntry = useNodeStatus(id)
  const currentStatus = statusEntry?.status || data.status || 'pending'
  const progressPercent =
    data.totalLessons > 0 ? Math.round((data.completedLessons / data.totalLessons) * 100) : 0

  return (
    <div
      className={`relative flex w-[120px] flex-col gap-1 rounded border px-2 py-1.5 transition-all duration-300 ${getNodeStatusStyles(currentStatus, 'module')} ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''} `}
      data-testid={`node-medium-${id}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-slate-400" />

      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
          <Layers size={10} />
        </div>
        <span className="flex-1 truncate text-[10px] font-semibold text-slate-700 dark:text-slate-300">
          {data.title}
        </span>
      </div>

      {/* Progress Badge */}
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-slate-500 dark:text-slate-400">
          {data.completedLessons}/{data.totalLessons}
        </span>
        <span
          className={`font-medium ${
            currentStatus === 'completed'
              ? 'text-emerald-600 dark:text-emerald-400'
              : currentStatus === 'active'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {progressPercent}%
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-slate-400" />
    </div>
  )
}

const ModuleGroup = ({ id, data, selected }: NodeProps<RFModuleNode>) => {
  const { setNodes } = useReactFlow()
  const { zoom } = useViewport()
  const { selectNode } = useNodeSelection()
  const updateNodeInternals = useUpdateNodeInternals()
  const { preserveViewport } = useViewportPreservation()

  // Removed double-click detection - now using dedicated PanelRight button

  // Track zoom mode for semantic zoom - notify React Flow when node dimensions change
  // This ensures edges are recalculated when crossing zoom thresholds
  const prevZoomModeRef = useRef<'minimal' | 'medium' | 'full'>('full')
  const currentZoomMode = zoom < 0.3 ? 'minimal' : zoom < 0.5 ? 'medium' : 'full'

  useEffect(() => {
    if (prevZoomModeRef.current !== currentZoomMode) {
      prevZoomModeRef.current = currentZoomMode
      // Notify React Flow to recalculate node dimensions and edge positions
      updateNodeInternals(id)
    }
  }, [currentZoomMode, id, updateNodeInternals])

  // Subscribe to realtime status updates - MUST be called before any conditional returns (Rules of Hooks)
  const statusEntry = useNodeStatus(id)
  const currentStatus = statusEntry?.status || data.status || 'pending'

  // Partial generation context (optional - may not be in provider)
  const contextValue = useOptionalPartialGenerationContext()
  const {
    generateSection,
    isSectionGenerating = () => false,
    isSelectionMode = false,
    toggleModule = () => {},
    selectedModules = new Set<number>(),
  } = contextValue || {}

  // Extract error information safely
  const errorMessage =
    statusEntry?.errorMessage ||
    (data.errorData?.message as string) ||
    (data.errorData?.error as string) ||
    'Unknown error'
  const hasErrors = currentStatus === 'error'
  const retryCount = data.retryCount || 0

  // Count failed lessons for error tooltip
  const errorCount = data.childIds?.length || 0

  // Handle header click - only toggle collapse/expand
  // useCallback to prevent unnecessary re-renders (memo optimization)
  const handleHeaderClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      const newCollapsed = !data.isCollapsed

      // CRITICAL: Preserve viewport BEFORE setNodes to prevent scroll jump
      // This captures the current viewport state before React Flow processes node changes
      preserveViewport()

      // Update module collapse state and child visibility
      // This triggers nodes change → GraphView useEffect → layoutNodes
      // Two-Phase Layout will recalculate module dimensions and lesson positions
      setNodes((nodes) =>
        nodes.map((n) => {
          if (n.id === id) {
            // Update isCollapsed state - this triggers relayout with new module dimensions
            return {
              ...n,
              data: { ...n.data, isCollapsed: newCollapsed },
              // Force new object reference to trigger React Flow re-render
              style: { ...n.style },
            }
          }
          // Toggle visibility of children (lessons inside module)
          if (data.childIds && data.childIds.includes(n.id)) {
            return { ...n, hidden: newCollapsed }
          }
          return n
        })
      )
    },
    [id, data.isCollapsed, data.childIds, setNodes, preserveViewport]
  )

  // Handle opening details panel via dedicated button
  // useCallback to prevent unnecessary re-renders (memo optimization)
  const handleOpenPanel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      selectNode(id)
    },
    [id, selectNode]
  )

  // Semantic Zoom - switch to smaller representations at lower zoom levels
  if (zoom < 0.3) {
    return <MinimalModuleNode id={id} data={data} />
  }
  if (zoom < 0.5) {
    return <MediumModuleNode id={id} data={data} selected={selected} />
  }

  // Calculate progress percentage
  const progressPercent =
    data.totalLessons > 0 ? Math.round((data.completedLessons / data.totalLessons) * 100) : 0

  // Extract module number from moduleId (simple approach for now)
  // Expected format: "module_N" or similar, extract digits
  const moduleNumberMatch = data.moduleId.match(/\d+/)
  const moduleNumber = moduleNumberMatch ? parseInt(moduleNumberMatch[0]) : 1

  return (
    <>
      {data.isCollapsed ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={`relative min-h-[90px] w-[300px] rounded-md border transition-all duration-300 ${getStatusBorderClass(currentStatus)} ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''} `}
          data-testid={`node-module-${id}`}
          data-node-status={currentStatus}
          aria-label={`Модуль: ${data.title}, ${data.completedLessons} из ${data.totalLessons} уроков завершено, статус: ${currentStatus}`}
          role="group"
          tabIndex={0}
        >
          {/* Error Tooltip */}
          {hasErrors && (
            <NodeErrorTooltip
              message={errorCount > 0 ? `${errorCount} урок(ов) с ошибками` : errorMessage}
            />
          )}

          {/* Retry Badge */}
          {retryCount > 0 && (
            <RetryBadge count={retryCount} position="top-left" testId={`retry-badge-${id}`} />
          )}

          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-white !bg-slate-400 dark:!border-slate-800"
          />

          {/* Clickable header area for expand/collapse */}
          {/* nopan nodrag: prevent React Flow from panning/dragging when clicking header */}
          <div
            onClick={handleHeaderClick}
            className="nopan nodrag flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
            data-testid={`expand-module-${id}`}
            role="button"
            aria-expanded="false"
            aria-label="Развернуть модуль"
          >
            {/* Left side: Action buttons (stop propagation to not trigger expand) */}
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Selection Checkbox */}
              {contextValue && isSelectionMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    // Get all lesson IDs for this module from childIds
                    const lessonIds = (data.childIds || []).map((id: string) => {
                      // Convert node ID to lesson format "section.lesson"
                      // Assuming childIds are in format "lesson_1_2" -> "1.2"
                      const match = id.match(/lesson_(\d+)_(\d+)/)
                      return match ? `${match[1]}.${match[2]}` : id
                    })
                    toggleModule(moduleNumber, lessonIds)
                  }}
                  className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                    selectedModules.has(moduleNumber)
                      ? 'border-purple-500 bg-purple-500 text-white'
                      : 'border-slate-300 hover:border-purple-300 dark:border-slate-600'
                  } `}
                  title="Выбрать все уроки модуля"
                >
                  {selectedModules.has(moduleNumber) && <Check size={14} />}
                </button>
              )}

              {/* Generate Module Button */}
              {contextValue && !isSelectionMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (generateSection) {
                      generateSection(moduleNumber)
                    }
                  }}
                  disabled={isSectionGenerating(moduleNumber) || currentStatus === 'active'}
                  className={`rounded-md p-1.5 transition-colors ${
                    currentStatus === 'active'
                      ? 'cursor-not-allowed text-slate-400'
                      : currentStatus === 'completed' || currentStatus === 'error'
                        ? 'text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/30'
                        : 'text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
                  } `}
                  title={
                    currentStatus === 'completed'
                      ? 'Перегенерировать модуль'
                      : 'Сгенерировать модуль'
                  }
                >
                  {isSectionGenerating(moduleNumber) ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : currentStatus === 'completed' || currentStatus === 'error' ? (
                    <RefreshCw size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                </button>
              )}
            </div>

            <div
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                currentStatus === 'active'
                  ? 'bg-white shadow-sm dark:bg-slate-700'
                  : 'bg-purple-100 dark:bg-purple-900/30'
              } `}
            >
              <Layers size={18} className="text-purple-600 dark:text-purple-400" />
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[10px] font-medium tracking-wider text-slate-500 uppercase dark:text-slate-400">
                Модуль {moduleNumber}
              </span>
              <span
                className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
                title={data.title}
              >
                {data.title}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {data.completedLessons}/{data.totalLessons} •
                </span>
                <StatusBadge
                  status={currentStatus}
                  label={currentStatus === 'completed' ? '✓ Готово' : undefined}
                  size="xs"
                />
              </div>

              {/* Progress Bar */}
              {data.totalLessons > 0 && (
                <NodeProgressBar
                  progress={progressPercent}
                  variant={
                    currentStatus === 'completed'
                      ? 'success'
                      : currentStatus === 'error'
                        ? 'error'
                        : currentStatus === 'active'
                          ? 'active'
                          : 'default'
                  }
                  size="sm"
                  className="mt-1.5"
                />
              )}
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-1">
              {/* Open details panel button */}
              <button
                onClick={handleOpenPanel}
                className="nopan nodrag rounded p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                title="Открыть панель результатов"
                aria-label="Открыть панель результатов"
              >
                <PanelRight size={18} className="text-slate-500 dark:text-slate-400" />
              </button>
              {/* Chevron indicates expandable */}
              <ChevronRight
                size={20}
                className="nopan nodrag flex-shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500"
              />
            </div>
          </div>

          {/* Metrics Footer */}
          {(currentStatus === 'active' ||
            currentStatus === 'completed' ||
            currentStatus === 'error') && (
            <div className="border-t border-black/5 bg-slate-50/50 px-2.5 py-1.5 text-[10px] text-slate-500 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span>
                  {data.completedLessons} / {data.totalLessons} уроков
                </span>
                {currentStatus === 'completed' ? (
                  <span className="font-medium text-green-600 dark:text-green-400">Готово</span>
                ) : currentStatus === 'active' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-blue-600 dark:text-blue-400">Обработка</span>
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  </div>
                ) : currentStatus === 'error' ? (
                  <span className="font-medium text-red-600 dark:text-red-400">Ошибка</span>
                ) : null}
              </div>
            </div>
          )}

          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-white !bg-slate-400 dark:!border-slate-800"
          />
        </motion.div>
      ) : (
        // EXPANDED STATE: Module container with header (60px) + space for nested lessons
        // Lessons are positioned by useGraphLayout Phase 2 starting at y=60px
        // CRITICAL: w-full h-full to fill React Flow wrapper (which has correct dimensions from layout)
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={`relative h-full w-full rounded-md border-2 transition-all duration-300 ${
            currentStatus === 'active'
              ? 'border-blue-400 bg-blue-50/20 dark:border-blue-500 dark:bg-blue-900/10'
              : currentStatus === 'completed'
                ? 'border-emerald-400 bg-emerald-50/20 dark:border-emerald-500 dark:bg-emerald-900/10'
                : currentStatus === 'error'
                  ? 'border-red-400 bg-red-50/20 dark:border-red-500 dark:bg-red-900/10'
                  : 'border-purple-300 bg-purple-50/20 dark:border-purple-600 dark:bg-purple-900/10'
          } ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''} `}
          data-testid={`node-module-expanded-${id}`}
          data-node-status={currentStatus}
          aria-label={`Модуль развернут: ${data.title}`}
        >
          {/* Header (60px) - click to collapse */}
          {/* nopan nodrag: prevent React Flow from panning/dragging when clicking header */}
          <div
            onClick={handleHeaderClick}
            className="nopan nodrag relative flex h-[60px] cursor-pointer items-center gap-3 overflow-hidden border-b border-purple-200/50 px-3 transition-colors hover:bg-purple-50/30 dark:border-purple-700/30 dark:hover:bg-purple-900/20"
            data-testid={`collapse-module-${id}`}
            role="button"
            aria-expanded="true"
            aria-label="Свернуть модуль"
          >
            {/* Progress Background Fill */}
            <div
              className="absolute inset-0 bg-purple-100/50 transition-all duration-500 dark:bg-purple-900/20"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Content (above progress background) */}
            <div
              className={`relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30`}
            >
              <Layers size={18} className="text-purple-600 dark:text-purple-400" />
            </div>

            <div className="relative z-10 flex min-w-0 flex-1 flex-col">
              <span className="text-[10px] font-medium tracking-wider text-purple-500 uppercase dark:text-purple-400">
                Модуль {moduleNumber}
              </span>
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {data.title}
              </span>
            </div>

            <span
              className={`relative z-10 flex-shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${
                currentStatus === 'completed'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : currentStatus === 'active'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : currentStatus === 'error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
              } `}
            >
              {data.completedLessons}/{data.totalLessons}
            </span>

            {hasErrors && (
              <NodeErrorTooltip
                message={errorCount > 0 ? `${errorCount} урок(ов) с ошибками` : errorMessage}
                className="relative top-auto right-auto flex-shrink-0"
              />
            )}

            {/* Right side controls */}
            <div className="relative z-10 flex items-center gap-1">
              {/* Open details panel button */}
              <button
                onClick={handleOpenPanel}
                className="nopan nodrag rounded p-1 transition-colors hover:bg-purple-100 dark:hover:bg-purple-800"
                title="Открыть панель результатов"
                aria-label="Открыть панель результатов"
              >
                <PanelRight size={18} className="text-slate-500 dark:text-slate-400" />
              </button>
              {/* Chevron pointing down when expanded */}
              <ChevronDown
                size={20}
                className="nopan nodrag flex-shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500"
              />
            </div>
          </div>

          {/* Handles for edges */}
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-white !bg-purple-400 dark:!border-slate-800"
          />
          <Handle
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-white !bg-purple-400 dark:!border-slate-800"
          />
        </motion.div>
      )}
    </>
  )
}

export default memo(ModuleGroup)
