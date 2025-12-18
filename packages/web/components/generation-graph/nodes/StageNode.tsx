import React, { memo, useState } from 'react';
import { Handle, Position, NodeProps, useViewport } from '@xyflow/react';
import { useParams } from 'next/navigation';
import { RFStageNode } from '../types';
import { useNodeStatus } from '../hooks/useNodeStatus';
import { getNodeStatusStyles } from '../hooks/useNodeStatusStyles';
import * as Icons from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import MinimalNode from './MinimalNode';
import MediumNode from './MediumNode';
import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/generation-graph/useTranslation';
import { RestartConfirmDialog } from '../controls/RestartConfirmDialog';
import { useOptionalPartialGenerationContext } from '../contexts/PartialGenerationContext';
import {
  NodeErrorTooltip,
  NodeErrorPanel,
  RetryBadge,
  NodeProgressBar
} from '../components/shared';

const StageNode = (props: NodeProps<RFStageNode>) => {
  const { id, data, selected } = props;
  const { zoom } = useViewport();
  const statusEntry = useNodeStatus(id);
  const { t } = useTranslation();
  const params = useParams();
  const courseSlug = params?.slug as string | undefined;
  const [showRestartDialog, setShowRestartDialog] = useState(false);

  // Get partial generation context for Stage 6 active state detection (optional - may not be in provider)
  const partialGenContext = useOptionalPartialGenerationContext();

  // Semantic Zoom - thresholds adjusted for better initial visibility
  if (zoom < 0.3) {
      return <MinimalNode {...props} />;
  }
  if (zoom < 0.5) {
      return <MediumNode {...props} />;
  }

  // Subscribe to realtime status updates
  const realtimeStatus = statusEntry?.status || data.status;

  // For Stage 6: show as 'active' if any lesson is currently generating
  const isStage6Generating = data.stageNumber === 6 && partialGenContext?.isGenerating;
  const currentStatus = isStage6Generating ? 'active' : realtimeStatus;
  // Extract error message safely
  const errorMessage = statusEntry?.errorMessage ||
                       (data.errorData?.message as string) ||
                       (data.errorData?.error as string) ||
                       "Unknown error";

  // Resolve Icon safely
  const iconName = (data.icon || 'HelpCircle') as keyof typeof Icons;
  const IconComponent = (Icons[iconName] || Icons.HelpCircle) as LucideIcon;

  // Get translated stage name
  const stageName = t(`stages.stage_${data.stageNumber}`);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative min-w-[180px] rounded-lg border transition-all duration-300
        ${getNodeStatusStyles(currentStatus, 'stage')}
        ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
      `}
      data-testid={`node-${id}`}
      data-node-status={currentStatus}
      aria-label={`Этап ${data.stageNumber}: ${stageName}, статус: ${t(`status.${currentStatus}`)}`}
      role="button"
      tabIndex={0}
    >
      {/* Header Strip */}
      <div 
        className="h-2 w-full rounded-t-lg opacity-80" 
        style={{ backgroundColor: data.color }} 
      />

      {/* Error Tooltip (FIX-019) */}
      {currentStatus === 'error' && (
        <NodeErrorTooltip message={errorMessage} />
      )}

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
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
        data-testid={`handle-input-${id}`}
      />

      {/* Note: Restart button moved to NodeDetailsDrawer per spec */}


      {/* Retry Badge */}
      {(data.retryCount ?? 0) > 0 && (
        <RetryBadge
          count={data.retryCount!}
          testId={`retry-badge-${id}`}
        />
      )}

      {/* Body */}
      <div className="flex items-center gap-3 p-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 ${currentStatus === 'active' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'bg-slate-100 dark:bg-slate-700'}`}>
          <IconComponent size={20} className={currentStatus === 'active' ? 'text-blue-600 dark:text-blue-400 animate-spin-slow' : ''} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Этап {data.stageNumber}
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {stageName}
          </span>
          {/* Substeps Display (T124) */}
          {data.progress !== undefined && currentStatus === 'active' && (
            <NodeProgressBar
              progress={data.progress}
              variant="active"
              size="xs"
              className="mt-1"
            />
          )}
        </div>
      </div>

      {/* Status/Metrics Footer */}
      <div className="border-t border-black/5 dark:border-white/10 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex justify-between items-center">
          {currentStatus === 'completed' ? (
            <span className="text-green-600 dark:text-green-400 font-medium">
              {t(`completionMessages.stage_${data.stageNumber}`)}
            </span>
          ) : currentStatus === 'active' ? (
            <span className="text-blue-600 dark:text-blue-400 animate-pulse">
              {data.currentStep ? data.currentStep.replace(/_/g, ' ') : t('metrics.processing')}
            </span>
          ) : currentStatus === 'error' ? (
            <span className="text-red-600 dark:text-red-400 font-medium">{t('restart.errorDescription')}</span>
          ) : (
            <span className="font-medium">{t(`status.${currentStatus}`)}</span>
          )}
        </div>

        {/* Compact Preview (FR-N07) - Visible when selected or active/completed */}
        {(selected || currentStatus === 'completed') && (
          <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-600 grid grid-cols-2 gap-1 text-[10px] text-slate-400 dark:text-slate-500">
            <div>{t('metrics.duration')}: {data.duration ? `${Math.round(data.duration/1000)}с` : '-'}</div>
            <div>{t('metrics.tokens')}: {data.tokens?.toLocaleString('ru-RU') || '-'}</div>
          </div>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
        data-testid={`handle-output-${id}`}
      />

      {/* Restart Confirmation Dialog */}
      {courseSlug && data.stageNumber && (
        <RestartConfirmDialog
          open={showRestartDialog}
          onClose={() => setShowRestartDialog(false)}
          courseSlug={courseSlug}
          stageNumber={data.stageNumber}
          stageName={stageName}
          onSuccess={() => {
            // State updates automatically via realtime subscription or polling
          }}
        />
      )}
    </motion.div>
  );
};

export default memo(StageNode);
