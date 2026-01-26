import React, { memo, useState, useEffect, useRef } from 'react'
import { Handle, Position, NodeProps, useViewport, useUpdateNodeInternals } from '@xyflow/react'
import { useParams } from 'next/navigation'
import { RFStageNode } from '../types'
import { useNodeStatus } from '../hooks/useNodeStatus'
import { getNodeStatusStyles } from '../hooks/useNodeStatusStyles'
import * as Icons from 'lucide-react'
import { LucideIcon } from 'lucide-react'
import MinimalNode from './MinimalNode'
import MediumNode from './MediumNode'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { RestartConfirmDialog } from '../controls/RestartConfirmDialog'
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext'
import { useGenerationStore, type StageId } from '@/stores/useGenerationStore'
import { NodeErrorTooltip, NodeErrorPanel, RetryBadge, NodeProgressBar } from '../components/shared'

const StageNode = (props: NodeProps<RFStageNode>) => {
  const { id, data, selected } = props
  const { zoom } = useViewport()
  const statusEntry = useNodeStatus(id)
  const t = useTranslations('generation')
  const params = useParams()
  const orgSlug = params?.orgSlug as string | undefined
  const courseSlug = params?.courseSlug as string | undefined
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const updateNodeInternals = useUpdateNodeInternals()

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

  // Get partial generation context for Stage 6 active state detection (optional - may not be in provider)
  const partialGenContext = useOptionalPartialGenerationContext()

  // Get optimistic status from Zustand store (for immediate UI feedback)
  const stageId = `stage_${data.stageNumber}` as StageId
  const zustandStatus = useGenerationStore((state) => state.getStageStatus(stageId))

  // Semantic Zoom - thresholds adjusted for better initial visibility
  if (zoom < 0.3) {
    return <MinimalNode {...props} />
  }
  if (zoom < 0.5) {
    return <MediumNode {...props} />
  }

  // Subscribe to realtime status updates
  // Priority logic for optimistic updates:
  // - If Realtime shows 'pending' but Zustand shows 'active' → show 'active' (optimistic)
  // - If Realtime shows 'completed'/'active'/etc → use Realtime (backend has confirmed)
  // This ensures optimistic updates show immediately, but don't override backend confirmations
  const realtimeStatus = statusEntry?.status || data.status
  const baseStatus =
    zustandStatus === 'active' && realtimeStatus === 'pending' ? 'active' : realtimeStatus

  // For Stage 6: show as 'active' if any lesson is currently generating
  const isStage6Generating = data.stageNumber === 6 && partialGenContext?.isGenerating
  const currentStatus = isStage6Generating ? 'active' : baseStatus
  // Extract error message safely
  const errorMessage =
    statusEntry?.errorMessage ||
    (data.errorData?.message as string) ||
    (data.errorData?.error as string) ||
    'Unknown error'

  // Resolve Icon safely
  const iconName = (data.icon || 'HelpCircle') as keyof typeof Icons
  const IconComponent = (Icons[iconName] || Icons.HelpCircle) as LucideIcon

  // Get translated stage name
  const stageName = t(`stages.stage_${data.stageNumber}`)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`relative min-w-[180px] rounded-lg border transition-all duration-300 ${getNodeStatusStyles(currentStatus, 'stage')} ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''} `}
      data-testid={`node-${id}`}
      data-node-status={currentStatus}
      aria-label={`Этап ${data.stageNumber}: ${stageName}, статус: ${t(`status.${currentStatus}`)}`}
      role="button"
      tabIndex={0}
    >
      {/* Header Strip */}
      <div className="h-2 w-full rounded-t-lg opacity-80" style={{ backgroundColor: data.color }} />

      {/* Error Tooltip (FIX-019) */}
      {currentStatus === 'error' && <NodeErrorTooltip message={errorMessage} />}

      {/* Error State with Prominent Restart Button */}
      {currentStatus === 'error' && (
        <NodeErrorPanel
          message={errorMessage}
          onRestart={() => setShowRestartDialog(true)}
          restartLabel={t('restart.restartFromError')}
          testId={`restart-error-btn-${id}`}
        />
      )}

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-400"
        data-testid={`handle-input-${id}`}
      />

      {/* Note: Restart button moved to NodeDetailsDrawer per spec */}

      {/* Retry Badge */}
      {(data.retryCount ?? 0) > 0 && (
        <RetryBadge count={data.retryCount!} testId={`retry-badge-${id}`} />
      )}

      {/* Body */}
      <div className="flex items-center gap-3 p-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            currentStatus === 'skipped'
              ? 'bg-slate-200 text-slate-400 dark:bg-slate-600 dark:text-slate-500'
              : currentStatus === 'active'
                ? 'bg-white text-slate-600 shadow-sm dark:bg-slate-700 dark:text-slate-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          <IconComponent
            size={20}
            className={
              currentStatus === 'active'
                ? 'animate-spin-slow text-blue-600 dark:text-blue-400'
                : currentStatus === 'skipped'
                  ? 'text-slate-400 dark:text-slate-500'
                  : ''
            }
          />
        </div>
        <div className="flex flex-col">
          <span
            className={`text-xs font-medium tracking-wider uppercase ${
              currentStatus === 'skipped'
                ? 'text-slate-400 dark:text-slate-500'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Этап {data.stageNumber}
          </span>
          <span
            className={`text-sm font-semibold ${
              currentStatus === 'skipped'
                ? 'text-slate-500 line-through dark:text-slate-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {stageName}
          </span>
          {/* Substeps Display (T124) */}
          {data.progress !== undefined && currentStatus === 'active' && (
            <NodeProgressBar progress={data.progress} variant="active" size="xs" className="mt-1" />
          )}
        </div>
      </div>

      {/* Status/Metrics Footer */}
      <div className="border-t border-black/5 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        <div className="flex items-center justify-between">
          {currentStatus === 'completed' ? (
            <span className="font-medium text-green-600 dark:text-green-400">
              {t(`completionMessages.stage_${data.stageNumber}`)}
            </span>
          ) : currentStatus === 'active' ? (
            <span className="animate-pulse text-blue-600 dark:text-blue-400">
              {data.currentStep ? data.currentStep.replace(/_/g, ' ') : t('metrics.processing')}
            </span>
          ) : currentStatus === 'error' ? (
            <span className="font-medium text-red-600 dark:text-red-400">
              {t('restart.errorDescription')}
            </span>
          ) : currentStatus === 'skipped' ? (
            <span className="text-slate-400 italic dark:text-slate-500">{t('status.skipped')}</span>
          ) : (
            <span className="font-medium">{t(`status.${currentStatus}`)}</span>
          )}
        </div>

        {/* Compact Preview (FR-N07) - Visible when selected or active/completed */}
        {(selected || currentStatus === 'completed') && (
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-dashed border-slate-200 pt-2 text-[10px] text-slate-400 dark:border-slate-600 dark:text-slate-500">
            <div>
              {t('metrics.duration')}:{' '}
              {data.duration ? `${Math.round(data.duration / 1000)}с` : '-'}
            </div>
            <div>
              {t('metrics.tokens')}: {data.tokens?.toLocaleString('ru-RU') || '-'}
            </div>
          </div>
        )}
      </div>

      {/* Output Handle (Right) */}
      <Handle
        type="source"
        id="right"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-400"
        data-testid={`handle-output-${id}`}
      />

      {/* Bottom Handle for Stage 4 (clarifying branch) */}
      {data.stageNumber === 4 && (
        <Handle
          type="source"
          id="bottom"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-white !bg-purple-400"
          data-testid={`handle-bottom-${id}`}
        />
      )}

      {/* Restart Confirmation Dialog */}
      {orgSlug && courseSlug && data.stageNumber && (
        <RestartConfirmDialog
          open={showRestartDialog}
          onClose={() => setShowRestartDialog(false)}
          orgSlug={orgSlug}
          courseSlug={courseSlug}
          stageNumber={data.stageNumber}
          stageName={stageName}
          onSuccess={() => {
            // State updates automatically via realtime subscription or polling
          }}
        />
      )}
    </motion.div>
  )
}

export default memo(StageNode)
