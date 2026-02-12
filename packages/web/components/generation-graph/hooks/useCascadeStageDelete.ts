'use client'

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { deleteDownstreamStagesAction } from '@/app/actions/admin-generation'
import { trpc } from '@/lib/trpc/react'
import type { DownstreamStagesInfo } from '../panels/output/CascadeStageDeleteModal'

interface UseCascadeStageDeleteResult {
  /** Whether the cascade delete modal is open */
  cascadeModalOpen: boolean
  /** Information about downstream stages that would be deleted */
  downstreamInfo: DownstreamStagesInfo | null
  /** Whether a delete operation is in progress */
  isDeleting: boolean
  /** Key to force re-render of EditableFields when cascade is canceled */
  fieldResetKey: number
  /** Save handler that checks for downstream stages first */
  handleFieldSave: (fieldPath: string, value: unknown) => void
  /** Handler for confirming cascade delete */
  handleCascadeConfirm: () => void
  /** Handler for canceling cascade delete */
  handleCascadeCancel: () => void
}

/**
 * Hook for handling cascade deletion of downstream stages when editing stage output.
 *
 * When editing Stage 4, this prompts for deletion of Stage 5 and Stage 6.
 * When editing Stage 5, this prompts for deletion of Stage 6 only.
 *
 * The hook manages:
 * - Checking for downstream stages before saving
 * - Modal state for the confirmation dialog
 * - Pending change state (stored until user confirms/cancels)
 * - Session memory (skips check after first confirmation)
 * - Reset key for reverting EditableField local state on cancel
 *
 * @param courseId - The course ID (required for downstream check)
 * @param sourceStage - Which stage is being edited (4 or 5)
 * @param performSave - Function to call when save is confirmed
 * @param locale - Locale for toast messages
 * @returns Object with modal state, handlers, and reset key
 *
 * @example
 * ```tsx
 * const { performSave, getFieldStatus } = useFieldStatusTracking(save, status)
 * const {
 *   cascadeModalOpen,
 *   downstreamInfo,
 *   isDeleting,
 *   fieldResetKey,
 *   handleFieldSave,
 *   handleCascadeConfirm,
 *   handleCascadeCancel,
 * } = useCascadeStageDelete(courseId, 4, performSave, locale)
 *
 * <EditableField
 *   key={fieldResetKey}
 *   onChange={(v) => handleFieldSave('field.path', v)}
 *   status={getFieldStatus('field.path')}
 * />
 *
 * <CascadeStageDeleteModal
 *   isOpen={cascadeModalOpen}
 *   onClose={handleCascadeCancel}
 *   onConfirm={handleCascadeConfirm}
 *   downstreamInfo={downstreamInfo}
 *   isDeleting={isDeleting}
 * />
 * ```
 */
export function useCascadeStageDelete(
  courseId: string | undefined,
  sourceStage: 4 | 5,
  performSave: (fieldPath: string, value: unknown) => void,
  locale: 'ru' | 'en' = 'ru'
): UseCascadeStageDeleteResult {
  const utils = trpc.useUtils()

  // Cascade delete modal state
  const [cascadeModalOpen, setCascadeModalOpen] = useState(false)
  const [downstreamInfo, setDownstreamInfo] = useState<DownstreamStagesInfo | null>(null)
  const [pendingChange, setPendingChange] = useState<{ fieldPath: string; value: unknown } | null>(
    null
  )
  const [isDeleting, setIsDeleting] = useState(false)
  // Track if we've already checked and confirmed deletion for this session
  const downstreamDeletedRef = useRef(false)
  // Key to force re-render of EditableFields when cascade is canceled (resets local state to original values)
  const [fieldResetKey, setFieldResetKey] = useState(0)

  // Async handler that checks for downstream stages first
  const handleFieldSaveAsync = useCallback(
    async (fieldPath: string, value: unknown) => {
      // If we've already deleted downstream stages in this session, just save
      if (downstreamDeletedRef.current) {
        performSave(fieldPath, value)
        return
      }

      // Check for downstream stages
      if (!courseId) {
        performSave(fieldPath, value)
        return
      }

      try {
        const info = await utils.generation.checkDownstreamStages.fetch({ courseId })

        // Determine if we need to show the modal based on source stage
        const shouldShowModal =
          sourceStage === 4
            ? info.hasStage5 || info.hasStage6 // Stage 4 edits affect both Stage 5 and 6
            : info.hasStage6 // Stage 5 edits only affect Stage 6

        if (!shouldShowModal) {
          performSave(fieldPath, value)
          return
        }

        // Downstream stages exist - show modal
        setDownstreamInfo(info)
        setPendingChange({ fieldPath, value })
        setCascadeModalOpen(true)
      } catch (error) {
        console.error('Failed to check downstream stages:', error)
        // On error, proceed with save anyway (fail open for UX)
        performSave(fieldPath, value)
      }
    },
    [courseId, sourceStage, performSave]
  )

  // Sync wrapper for EditableField onChange (avoids @typescript-eslint/no-misused-promises)
  const handleFieldSave = useCallback(
    (fieldPath: string, value: unknown) => {
      void handleFieldSaveAsync(fieldPath, value)
    },
    [handleFieldSaveAsync]
  )

  // Handle cascade delete confirmation (async handler)
  const handleCascadeConfirmAsync = useCallback(async () => {
    if (!courseId || !pendingChange) return

    setIsDeleting(true)
    try {
      // Delete downstream stages
      const result = await deleteDownstreamStagesAction(courseId, sourceStage)

      // Show appropriate toast based on source stage
      if (sourceStage === 4) {
        toast.success(
          locale === 'ru'
            ? `Удалено: ${result.deletedLessonsCount} уроков, ${result.deletedSectionsCount} модулей`
            : `Deleted: ${result.deletedLessonsCount} lessons, ${result.deletedSectionsCount} sections`
        )
      } else {
        toast.success(
          locale === 'ru'
            ? `Удалено: ${result.deletedLessonsCount} уроков`
            : `Deleted: ${result.deletedLessonsCount} lessons`
        )
      }

      // Mark as deleted for this session so we don't ask again
      downstreamDeletedRef.current = true

      // Now apply the pending change
      performSave(pendingChange.fieldPath, pendingChange.value)

      // Close modal and clear state
      setCascadeModalOpen(false)
      setPendingChange(null)
      setDownstreamInfo(null)
    } catch (error) {
      console.error('Failed to delete downstream stages:', error)
      toast.error(
        locale === 'ru' ? 'Ошибка при удалении данных' : 'Failed to delete downstream data'
      )
    } finally {
      setIsDeleting(false)
    }
  }, [courseId, pendingChange, performSave, sourceStage, locale])

  // Sync wrapper for void callback (avoids @typescript-eslint/no-misused-promises)
  const handleCascadeConfirm = useCallback(() => {
    void handleCascadeConfirmAsync()
  }, [handleCascadeConfirmAsync])

  // Handle cascade delete cancellation
  const handleCascadeCancel = useCallback(() => {
    setCascadeModalOpen(false)
    setPendingChange(null)
    setDownstreamInfo(null)
    // Force re-render of EditableFields to revert their local state to original values
    setFieldResetKey((prev) => prev + 1)
  }, [])

  return {
    cascadeModalOpen,
    downstreamInfo,
    isDeleting,
    fieldResetKey,
    handleFieldSave,
    handleCascadeConfirm,
    handleCascadeCancel,
  }
}
