import React, { memo } from 'react'
import { LessonEditProvider } from '../contexts/LessonEditContext'
import { LessonPanelErrorBoundary } from './NodeDetailsDrawer.error'
import { LessonPanelWithTabs } from './lesson/LessonPanelWithTabs'
import { RefinementChat } from './RefinementChat'
import type {
  LessonInspectorData,
  LessonInspectorDataRefinementExtension,
} from '@megacampus/shared-types'
import type { Proposal } from '@megacampus/shared-types/chat-types'
import type { ChatMessage } from '../hooks/useRefinement'
import type { ParsedLessonContent } from '@/lib/markdown-content-parser'

// Extended data type that includes refinement fields (matches LessonPanelWithTabs requirement)
type LessonInspectorDataWithRefinement = LessonInspectorData &
  Partial<LessonInspectorDataRefinementExtension>

interface NodeDetailsDrawerLessonProps {
  /** Lesson ID in format "1.2" */
  lessonId: string
  /** Course ID */
  courseId: string
  /** Course tier (enterprise maps to premium for UI purposes) */
  tier?: 'trial' | 'free' | 'basic' | 'standard' | 'premium'
  /** Lesson inspector data */
  data: LessonInspectorDataWithRefinement | null | undefined
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error: Error | null
  /** Is lesson maximized */
  isMaximized: boolean
  /** Is editing lesson */
  isEditing: boolean
  /** Is saving lesson */
  isSaving: boolean
  /** Is approving lesson */
  isApproving: boolean
  /** Is regenerating lesson */
  isRegenerating: boolean
  /** Is deleting lesson */
  isDeleting: boolean
  /** Selected node ID */
  selectedNodeId: string | null
  /** Pending enrichment create type */
  pendingCreateType: string | null
  /** Chat history */
  chatHistory: ChatMessage[]
  /** Is refining */
  isRefining: boolean
  /** Latest proposal */
  latestProposal: Proposal | null
  /** Is applying proposal */
  isApplying: boolean
  /** Accepted proposal */
  acceptedProposal: Proposal | null
  /** Proposal error */
  proposalError: string | null
  /** Is generation active */
  isGenerating: boolean
  /** Blocked message */
  blockedMessage: string
  /** Refinement chat ref */
  refinementChatRef: React.RefObject<HTMLDivElement | null>
  /** Back handler */
  onBack: () => void
  /** Close handler */
  onClose: () => void
  /** Approve handler */
  onApprove: () => void
  /** Edit handler */
  onEdit: () => void
  /** Regenerate handler */
  onRegenerate: () => void
  /** Delete handler */
  onDelete: () => void
  /** Retry node handler */
  onRetryNode: (nodeName: string) => void
  /** Toggle maximize handler */
  onToggleMaximize: () => void
  /** Save edit handler */
  onSaveEdit: (content: ParsedLessonContent) => Promise<void>
  /** Cancel edit handler */
  onCancelEdit: () => void
  /** Refine for lesson handler */
  onRefineForLesson: (message: string, intent: 'refine' | 'regenerate') => void
  /** Accept proposal handler */
  onAcceptProposal: () => void
  /** Retry proposal handler */
  onRetryProposal: () => void
  /** Reject proposal handler */
  onRejectProposal: () => void
}

/**
 * Stage 6 Lesson Panel wrapper with context providers and chat
 *
 * Wraps:
 * - LessonEditProvider (editing state)
 * - LessonPanelErrorBoundary (error handling)
 * - LessonPanelWithTabs (main content)
 * - RefinementChat (per-lesson chat)
 */
export const NodeDetailsDrawerLesson = memo(function NodeDetailsDrawerLesson({
  lessonId,
  courseId,
  tier,
  data,
  isLoading,
  error,
  isMaximized,
  isEditing,
  isSaving,
  isApproving,
  isRegenerating,
  isDeleting,
  selectedNodeId,
  pendingCreateType,
  chatHistory,
  isRefining,
  latestProposal,
  isApplying,
  acceptedProposal,
  proposalError,
  isGenerating,
  blockedMessage,
  refinementChatRef,
  onBack,
  onClose,
  onApprove,
  onEdit,
  onRegenerate,
  onDelete,
  onRetryNode,
  onToggleMaximize,
  onSaveEdit,
  onCancelEdit,
  onRefineForLesson,
  onAcceptProposal,
  onRetryProposal,
  onRejectProposal,
}: NodeDetailsDrawerLessonProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <LessonPanelErrorBoundary lessonId={lessonId} onBack={onBack}>
          <LessonEditProvider
            isEditing={isEditing}
            isSaving={isSaving}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
          >
            <LessonPanelWithTabs
              lessonId={lessonId}
              courseId={courseId}
              data={data as LessonInspectorDataWithRefinement | null}
              isLoading={isLoading}
              error={error}
              onBack={onBack}
              onClose={onClose}
              onApprove={onApprove}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
              onRetryNode={onRetryNode}
              isMaximized={isMaximized}
              onToggleMaximize={onToggleMaximize}
              className="h-full"
              isApproving={isApproving}
              isRegenerating={isRegenerating}
              isDeleting={isDeleting}
              tier={tier}
              defaultTab={pendingCreateType ? 'enrichments' : 'content'}
            />
          </LessonEditProvider>
        </LessonPanelErrorBoundary>
      </div>
      {/* Per-lesson chat for Stage 6 refinement */}
      <div className="shrink-0 border-t" ref={refinementChatRef}>
        <RefinementChat
          courseId={courseId}
          stageId="stage_6"
          nodeId={selectedNodeId || undefined}
          attemptNumber={1}
          onRefine={(msg, intent) => onRefineForLesson(msg, intent)}
          history={chatHistory}
          isProcessing={isRefining}
          latestProposal={latestProposal}
          isApplying={isApplying}
          onAcceptProposal={onAcceptProposal}
          acceptedProposal={acceptedProposal}
          proposalError={proposalError}
          onRetryProposal={onRetryProposal}
          onRejectProposal={onRejectProposal}
          isGenerating={isGenerating}
          blockedMessage={blockedMessage}
        />
      </div>
    </div>
  )
})
