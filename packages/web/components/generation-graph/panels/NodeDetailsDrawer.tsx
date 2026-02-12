import React, { memo } from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { RestartConfirmDialog } from '../controls/RestartConfirmDialog'
import { cn } from '@/lib/utils'
import { useFullscreenContext } from '../contexts/FullscreenContext'
// Stage 2 "Document Processing" UI components
import { Stage2Dashboard } from './stage2'
// Stage 6 "Glass Factory" UI components
import { ModuleDashboard } from './module/ModuleDashboard'
// Extracted components and hooks
import { useNodeDetailsDrawer } from '../hooks/useNodeDetailsDrawer'
import { NodeDetailsDrawerHeader } from './NodeDetailsDrawer.header'
import { NodeDetailsDrawerLesson } from './NodeDetailsDrawer.lesson'
import { StageContent } from './NodeDetailsDrawer.content'

export const NodeDetailsDrawer = memo(function NodeDetailsDrawer() {
  const { portalContainerRef } = useFullscreenContext()

  // Extract all drawer logic into custom hook
  const {
    nodes,
    state,
    dashboard,
    refinement,
    handlers,
    courseInfo,
    courseSlug,
    orgSlug,
    isAdmin,
    realtimeStatus,
    generationStatus,
    pendingCreateType,
    t,
  } = useNodeDetailsDrawer()

  // Calculate SheetContent width based on node type
  const getSheetWidthClass = () => {
    if (nodes.isStage6Lesson) {
      if (state.isLessonMaximized) {
        return 'w-screen max-w-none'
      }
      return 'w-full sm:w-[85vw] sm:max-w-[85vw]'
    }
    return state.isExpanded ? 'max-w-[100vw]' : 'max-w-[50vw]'
  }

  // Map tier value (enterprise -> premium for UI components)
  const uiTier = (() => {
    const tier = courseInfo.tier as string | undefined
    if (!tier) return undefined
    // Map enterprise to premium, otherwise pass through if valid
    if (tier === 'enterprise' || tier === 'premium') return 'premium' as const
    if (tier === 'standard') return 'standard' as const
    if (tier === 'basic') return 'basic' as const
    if (tier === 'free') return 'free' as const
    if (tier === 'trial') return 'trial' as const
    return undefined
  })()

  return (
    <Sheet
      open={!!nodes.selectedNodeId}
      onOpenChange={(open) => !open && handlers.deselectNode()}
      aria-expanded={!!nodes.selectedNodeId}
    >
      <SheetContent
        side="right"
        className={cn(
          'w-full overflow-y-auto transition-all duration-300 ease-in-out',
          getSheetWidthClass(),
          nodes.isStage6Lesson && 'p-0'
        )}
        hideCloseButton={nodes.isStage6Lesson}
        container={portalContainerRef.current}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement
          if (target.hasAttribute('data-sheet-overlay')) {
            return
          }
          e.preventDefault()
        }}
        data-testid="node-details-drawer"
      >
        {/* Accessibility: Hidden title for lesson nodes */}
        {nodes.isStage6Lesson && (
          <SheetTitle className="sr-only">{nodes.data?.label || 'Lesson Details'}</SheetTitle>
        )}

        {/* Header for non-lesson nodes */}
        {!nodes.isStage6Lesson && (
          <NodeDetailsDrawerHeader
            stageNumber={nodes.data?.stageNumber ?? undefined}
            label={nodes.data?.label}
            selectedNodeId={nodes.selectedNodeId}
            isExpanded={state.isExpanded}
            canRestart={state.canRestart}
            courseSlug={courseSlug}
            t={t as (key: string) => string}
            onToggleExpand={handlers.toggleExpand}
            onShowRestartDialog={() => handlers.setShowRestartDialog(true)}
          />
        )}

        {/* Main content */}
        <div className={cn(nodes.isStage6Lesson ? 'h-full' : 'mt-6 h-[calc(100vh-140px)]')}>
          {nodes.isStage2Group ? (
            <Stage2Dashboard
              data={dashboard.stage2DashboardData}
              isLoading={dashboard.isLoadingStage2Dashboard}
              error={dashboard.stage2DashboardError}
              onRetryFailed={() => void handlers.handleRetryFailedDocs()}
              className="h-full"
            />
          ) : nodes.isStage6Module ? (
            <ModuleDashboard
              data={dashboard.moduleDashboardData}
              courseId={courseInfo.id}
              isLoading={dashboard.isLoadingModuleDashboard}
              error={dashboard.moduleDashboardError}
              onExportAll={() => void handlers.handleExportAll()}
              onRegenerateFailed={() => void handlers.handleRegenerateFailedLessons()}
              onImproveQuality={() => void handlers.handleImproveQuality()}
              onApproveAll={() => void handlers.handleApproveAllLessons()}
              isApproving={state.isApprovingAll}
              isExporting={state.isExporting}
              isRegenerating={state.isRegenerating}
              className="h-full"
            />
          ) : nodes.isStage6Lesson ? (
            <NodeDetailsDrawerLesson
              lessonId={nodes.lessonInfoForInspector?.lessonId ?? ''}
              courseId={courseInfo.id}
              tier={uiTier}
              data={dashboard.lessonInspectorData}
              isLoading={dashboard.isLoadingLessonInspector}
              error={dashboard.lessonInspectorError}
              isMaximized={state.isLessonMaximized}
              isEditing={state.isEditingLesson}
              isSaving={state.isSavingLesson}
              isApproving={state.isApproving}
              isRegenerating={state.isRetrying}
              isDeleting={state.isDeleting}
              selectedNodeId={nodes.selectedNodeId}
              pendingCreateType={pendingCreateType}
              chatHistory={refinement.chatHistory}
              isRefining={refinement.isRefining}
              latestProposal={refinement.latestProposal}
              isApplying={refinement.isApplying}
              acceptedProposal={refinement.acceptedProposal}
              proposalError={refinement.proposalError}
              isGenerating={state.isGenerationActive}
              blockedMessage={t('refinementChat.generationInProgress')}
              refinementChatRef={refinement.refinementChatRef}
              onBack={handlers.deselectNode}
              onClose={handlers.deselectNode}
              onApprove={() => void handlers.handleApproveLesson()}
              onEdit={handlers.handleEditLesson}
              onRegenerate={() => void handlers.handleRegenerateLesson()}
              onDelete={() => void handlers.handleDeleteLesson()}
              onRetryNode={(nodeName) => void handlers.handleRetryNode(nodeName)}
              onToggleMaximize={() => handlers.setIsLessonMaximized(!state.isLessonMaximized)}
              onSaveEdit={handlers.handleSaveEdit}
              onCancelEdit={handlers.handleCancelEdit}
              onRefineForLesson={(msg, intent) => void handlers.handleRefineForLesson(msg, intent)}
              onAcceptProposal={() => void handlers.acceptProposal()}
              onRetryProposal={() => void handlers.retryProposal()}
              onRejectProposal={() => handlers.rejectProposal()}
              stage6ContentReady={refinement.stage6ContentReady}
            />
          ) : (
            <StageContent
              selectedNodeId={nodes.selectedNodeId}
              selectedNode={nodes.selectedNode}
              displayData={nodes.displayData}
              hasPhases={nodes.hasPhases}
              phases={nodes.phases}
              selectedPhaseId={state.selectedPhaseId}
              selectedAttemptNum={state.selectedAttemptNum}
              onSelectPhase={handlers.setSelectedPhaseId}
              onSelectAttempt={handlers.setSelectedAttemptNum}
              courseId={courseInfo.id}
              courseSlug={courseSlug}
              orgSlug={orgSlug}
              courseTitle={courseInfo.title}
              moduleCount={courseInfo.moduleCount || 0}
              lessonCount={courseInfo.lessonCount || 0}
              tier={courseInfo.tier || 'standard'}
              readOnly={courseInfo.readOnly || false}
              isAwaitingApproval={state.isAwaitingApproval}
              canEdit={state.canEdit}
              isAdmin={isAdmin}
              autoOpened={state.autoOpened}
              generationStatus={generationStatus}
              realtimeStatus={realtimeStatus || null}
              isGenerationActive={state.isGenerationActive}
              documentId={nodes.documentId}
              isAIStage={state.isAIStage}
              refinementChatRef={refinement.refinementChatRef}
              onRefine={(msg) => void handlers.handleRefine(msg)}
              chatHistory={refinement.chatHistory}
              isRefining={refinement.isRefining}
              latestProposal={refinement.latestProposal}
              isApplying={refinement.isApplying}
              acceptedProposal={refinement.acceptedProposal}
              proposalError={refinement.proposalError}
              onAcceptProposal={() => void handlers.acceptProposal()}
              onRetryProposal={() => void handlers.retryProposal()}
              onRejectProposal={handlers.rejectProposal}
              stage6ContentReady={refinement.stage6ContentReady}
              onStageApproved={handlers.handleStageApproved}
              onDeselectNode={handlers.deselectNode}
            />
          )}
        </div>

        {/* Restart Dialog */}
        {orgSlug && courseSlug && nodes.data?.stageNumber && (
          <RestartConfirmDialog
            open={state.showRestartDialog}
            onClose={() => handlers.setShowRestartDialog(false)}
            orgSlug={orgSlug}
            courseSlug={courseSlug}
            stageNumber={nodes.data.stageNumber}
            stageName={t(`stages.stage_${nodes.data.stageNumber}`)}
            onSuccess={() => {
              // State updates automatically via realtime subscription
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
})
