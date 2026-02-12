import React, { memo } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApprovalControls } from '../controls/ApprovalControls'
import { InputTab } from './InputTab'
import { ProcessTab } from './ProcessTab'
import { OutputTab } from './OutputTab'
import { ActivityTab } from './ActivityTab'
import { PhaseSelector } from './PhaseSelector'
import { AttemptSelector } from './AttemptSelector'
import { RefinementChat } from './RefinementChat'
import type { ChatMessage } from '../hooks/useRefinement'
import type { Proposal as RefinementProposal } from '@megacampus/shared-types/chat-types'
// Stage 1 "Course Passport" UI components
import { Stage1InputTab, Stage1ProcessTab, Stage1OutputTab, Stage1ActivityTab } from './stage1'
import type { Stage1InputData, Stage1OutputData } from './stage1/types'
// Stage 2 "Document Processing" UI components
import { Stage2InputTab, Stage2ProcessTab, Stage2OutputTab, Stage2ActivityTab } from './stage2'
// Stage 3 "Document Classification" UI components
import { Stage3InputTab, Stage3ProcessTab, Stage3OutputTab, Stage3ActivityTab } from './stage3'
// Stage 4 "Deep Analysis" UI components
import { Stage4InputTab, Stage4ProcessTab, Stage4OutputTab, Stage4ActivityTab } from './stage4'
import type { Stage4InputData } from './stage4/types'
// Stage 5 "Generation" UI components
import { Stage5InputTab, Stage5ProcessTab, Stage5OutputTab, Stage5ActivityTab } from './stage5'
// End Node completion panel
import { EndNodePanel } from './EndNodePanel'
import { PhaseData } from '@megacampus/shared-types'
import type { AppNode } from '../types'
import type { DisplayData } from './NodeDetailsDrawer.helpers'

// Stage 4 Clarifying Questions panel - Dynamic import to avoid SSR issues with isomorphic-dompurify
const ClarifyingPanel = dynamic(
  () => import('./clarifying/ClarifyingPanel').then((mod) => mod.ClarifyingPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600" />
      </div>
    ),
  }
)

interface StageContentProps {
  // Node data
  selectedNodeId: string | null
  selectedNode: AppNode | null
  displayData: DisplayData | undefined

  // Stage/phase/attempt selection
  hasPhases: boolean
  phases: PhaseData[]
  selectedPhaseId: string | null
  selectedAttemptNum: number | null
  onSelectPhase: (phaseId: string | null) => void
  onSelectAttempt: (attemptNum: number | null) => void

  // Course info
  courseId: string
  courseSlug?: string
  orgSlug?: string
  courseTitle: string
  moduleCount: number
  lessonCount: number
  tier: string
  readOnly: boolean

  // Permissions & status
  isAwaitingApproval: boolean
  canEdit: boolean
  isAdmin: boolean
  autoOpened: boolean
  generationStatus: string | null
  realtimeStatus: { status: string } | null
  isGenerationActive: boolean

  // Document-specific
  documentId: string | undefined

  // Refinement chat
  isAIStage: boolean
  refinementChatRef: React.RefObject<HTMLDivElement | null>
  onRefine: (message: string, intent?: 'refine' | 'regenerate') => void
  chatHistory: ChatMessage[]
  isRefining: boolean
  latestProposal: RefinementProposal | null
  isApplying: boolean
  acceptedProposal: RefinementProposal | null
  proposalError: string | null
  onAcceptProposal: () => void
  onRetryProposal: () => void
  onRejectProposal: () => void
  stage6ContentReady: boolean

  // Handlers
  onStageApproved: () => void
  onDeselectNode: () => void
}

export const StageContent = memo(function StageContent({
  selectedNodeId,
  selectedNode,
  displayData,
  hasPhases,
  phases,
  selectedPhaseId,
  selectedAttemptNum,
  onSelectPhase,
  onSelectAttempt,
  courseId,
  courseSlug,
  orgSlug,
  courseTitle,
  moduleCount,
  lessonCount,
  readOnly,
  isAwaitingApproval,
  canEdit,
  isAdmin,
  autoOpened,
  generationStatus,
  realtimeStatus,
  isGenerationActive,
  documentId,
  isAIStage,
  refinementChatRef,
  onRefine,
  chatHistory,
  isRefining,
  latestProposal,
  isApplying,
  acceptedProposal,
  proposalError,
  onAcceptProposal,
  onRetryProposal,
  onRejectProposal,
  stage6ContentReady,
  onStageApproved,
  onDeselectNode,
}: StageContentProps) {
  const t = useTranslations('generation')
  const data = selectedNode?.data
  const isDocumentNode = selectedNode?.type === 'document'
  const isEndNode = selectedNode?.type === 'end'

  // End Node - Course Completion Panel
  if (isEndNode) {
    return (
      <EndNodePanel
        courseSlug={courseSlug}
        orgSlug={orgSlug}
        courseTitle={courseTitle}
        moduleCount={moduleCount}
        lessonCount={lessonCount}
        isCompleted={realtimeStatus?.status === 'completed' || generationStatus === 'completed'}
      />
    )
  }

  // ClarifyingNode selected - show questions panel
  if (selectedNodeId === 'stage_4_clarifying') {
    return (
      <ClarifyingPanel
        courseId={courseId}
        readOnly={generationStatus !== 'stage_4_clarifying'}
        onComplete={onDeselectNode}
      />
    )
  }

  // Stage 4 node clicked while still in clarifying phase - show questions
  if (generationStatus === 'stage_4_clarifying' && data?.stageNumber === 4) {
    return <ClarifyingPanel courseId={courseId} onComplete={onDeselectNode} />
  }

  // Skipped Stage - show informative message
  if (realtimeStatus?.status === 'skipped' || data?.status === 'skipped') {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <svg
            className="h-8 w-8 text-slate-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 9l6 6m0-6l-6 6" strokeLinecap="round" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-700 dark:text-slate-300">
          {t('status.skipped')}
        </h3>
        <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
          {t('status.skippedDescription')}
        </p>
      </div>
    )
  }

  // Default tab-based UI for stages
  return (
    <>
      {/* Approval Controls - show when stage is awaiting approval */}
      {isAwaitingApproval && courseSlug && data?.stageNumber && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 dark:border-purple-700 dark:from-purple-900/20 dark:to-indigo-900/20">
          <p className="mb-3 text-sm text-purple-700 dark:text-purple-300">
            {t('drawer.awaitingMessage')}
          </p>
          <ApprovalControls
            courseId={courseId}
            orgSlug={orgSlug || ''}
            courseSlug={courseSlug}
            stageNumber={data.stageNumber}
            onApproved={onStageApproved}
            onRegenerated={onDeselectNode}
            variant="prominent"
          />
        </div>
      )}

      {/* Phase Selector for stages with phases (4, 5) */}
      {hasPhases && phases.length > 0 && (
        <PhaseSelector
          stageId={`stage_${data?.stageNumber}`}
          phases={phases.map((p: PhaseData) => ({
            phaseId: p.phaseId,
            attemptNumber: 1,
            timestamp: p.timestamp.toISOString(),
            // PhaseSelector only handles core statuses, map other statuses appropriately
            status: (['pending', 'active', 'completed', 'error'].includes(p.status)
              ? p.status
              : 'completed') as 'pending' | 'active' | 'completed' | 'error',
          }))}
          selectedPhase={selectedPhaseId}
          onSelectPhase={onSelectPhase}
          locale="ru"
        />
      )}

      {/* Attempt Selector only for actual retries (not phases) */}
      {!hasPhases && data?.attempts && data.attempts.length > 1 && (
        <AttemptSelector
          attempts={data.attempts}
          selectedAttempt={selectedAttemptNum || 1}
          onSelectAttempt={onSelectAttempt}
        />
      )}

      <Tabs defaultValue="output" className="w-full" data-testid="drawer-tabs">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="input" data-testid="tab-input">
            {t('drawer.input')}
          </TabsTrigger>
          <TabsTrigger value="process" data-testid="tab-process">
            {t('drawer.process')}
          </TabsTrigger>
          <TabsTrigger value="output" data-testid="tab-output">
            {t('drawer.output')}
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            {t('drawer.activity')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-4 space-y-4" data-testid="content-input">
          {data?.stageNumber === 1 ? (
            <Stage1InputTab inputData={displayData?.inputData as Stage1InputData | undefined} />
          ) : isDocumentNode ? (
            <Stage2InputTab documentId={documentId} inputData={displayData?.inputData} />
          ) : data?.stageNumber === 3 ? (
            <Stage3InputTab courseId={courseId} inputData={displayData?.inputData} />
          ) : data?.stageNumber === 4 ? (
            <Stage4InputTab
              courseId={courseId}
              inputData={displayData?.inputData as Stage4InputData | undefined}
            />
          ) : data?.stageNumber === 5 ? (
            <Stage5InputTab courseId={courseId} inputData={displayData?.inputData} />
          ) : (
            <InputTab inputData={displayData?.inputData} />
          )}
        </TabsContent>

        <TabsContent value="process" className="mt-4 space-y-4" data-testid="content-process">
          {data?.stageNumber === 1 ? (
            <Stage1ProcessTab
              status={displayData?.status as 'pending' | 'completed' | 'error' | undefined}
              totalDurationMs={displayData?.duration}
            />
          ) : isDocumentNode ? (
            <Stage2ProcessTab
              documentId={documentId}
              status={
                displayData?.status as 'pending' | 'active' | 'completed' | 'error' | undefined
              }
            />
          ) : data?.stageNumber === 3 ? (
            <Stage3ProcessTab
              courseId={courseId}
              status={
                displayData?.status as 'pending' | 'active' | 'completed' | 'error' | undefined
              }
            />
          ) : data?.stageNumber === 4 ? (
            <Stage4ProcessTab
              courseId={courseId}
              outputData={displayData?.outputData}
              status={
                displayData?.status as 'pending' | 'active' | 'completed' | 'error' | undefined
              }
            />
          ) : data?.stageNumber === 5 ? (
            <Stage5ProcessTab
              courseId={courseId}
              status={
                displayData?.status as 'pending' | 'active' | 'completed' | 'error' | undefined
              }
              outputData={displayData?.outputData}
              processingTimeMs={displayData?.duration}
              totalTokens={displayData?.tokens}
            />
          ) : (
            <ProcessTab
              duration={displayData?.duration}
              tokens={displayData?.tokens}
              model={displayData?.model}
              status={displayData?.status}
              attemptNumber={displayData?.attemptNumber}
              retryCount={displayData?.retryCount}
              qualityScore={displayData?.qualityScore}
            />
          )}
        </TabsContent>

        <TabsContent value="output" className="mt-4 space-y-4" data-testid="content-output">
          {data?.stageNumber === 1 ? (
            <Stage1OutputTab
              outputData={displayData?.outputData as Stage1OutputData | undefined}
              courseId={courseId}
            />
          ) : isDocumentNode ? (
            <Stage2OutputTab
              outputData={displayData?.outputData}
              courseId={courseId}
              documentId={documentId}
            />
          ) : data?.stageNumber === 3 ? (
            <Stage3OutputTab
              courseId={courseId}
              outputData={displayData?.outputData}
              isEditable={canEdit}
              onApprove={onDeselectNode}
            />
          ) : data?.stageNumber === 4 ? (
            <Stage4OutputTab
              courseId={courseId}
              outputData={displayData?.outputData}
              editable={canEdit}
              readOnly={readOnly || (isAdmin && !isAwaitingApproval)}
              autoFocus={autoOpened}
              onApproved={onStageApproved}
            />
          ) : data?.stageNumber === 5 ? (
            <Stage5OutputTab
              courseId={courseId}
              outputData={displayData?.outputData}
              editable={canEdit}
            />
          ) : (
            <OutputTab
              outputData={displayData?.outputData}
              stageId={`stage_${data?.stageNumber}`}
              courseId={courseId}
              editable={canEdit}
              readOnly={readOnly || (isAdmin && !isAwaitingApproval)}
              autoFocus={autoOpened}
              onApproved={onDeselectNode}
              nodeType={selectedNode?.type}
              isLoading={false}
            />
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4" data-testid="content-activity">
          {data?.stageNumber === 1 ? (
            <Stage1ActivityTab
              nodeId={selectedNodeId}
              courseId={courseId}
              inputData={data?.inputData as Stage1InputData | undefined}
              outputData={data?.outputData as Stage1OutputData | undefined}
            />
          ) : isDocumentNode ? (
            <Stage2ActivityTab
              nodeId={selectedNodeId}
              courseId={courseId}
              documentId={documentId}
            />
          ) : data?.stageNumber === 3 ? (
            <Stage3ActivityTab nodeId={selectedNodeId} courseId={courseId} />
          ) : data?.stageNumber === 4 ? (
            <Stage4ActivityTab nodeId={selectedNodeId} courseId={courseId} />
          ) : data?.stageNumber === 5 ? (
            <Stage5ActivityTab nodeId={selectedNodeId} courseId={courseId} />
          ) : (
            <ActivityTab nodeId={selectedNodeId} />
          )}
        </TabsContent>
      </Tabs>

      {/* Refinement Chat (T084) */}
      {isAIStage && (
        <div ref={refinementChatRef}>
          <RefinementChat
            courseId={courseId}
            stageId={`stage_${data?.stageNumber}`}
            nodeId={selectedNodeId || undefined}
            attemptNumber={selectedAttemptNum || 1}
            onRefine={(msg, intent) => void onRefine(msg, intent)}
            history={chatHistory}
            isProcessing={isRefining}
            latestProposal={latestProposal}
            isApplying={isApplying}
            acceptedProposal={acceptedProposal}
            onAcceptProposal={() => void onAcceptProposal()}
            proposalError={proposalError}
            onRetryProposal={() => void onRetryProposal()}
            onRejectProposal={() => onRejectProposal()}
            stage6ContentReady={stage6ContentReady}
            isGenerating={isGenerationActive}
            blockedMessage={t('refinementChat.generationInProgress')}
          />
        </div>
      )}
    </>
  )
})
