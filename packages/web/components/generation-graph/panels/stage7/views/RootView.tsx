/**
 * RootView Component
 *
 * Displays list of enrichments for a lesson with add button.
 * Shows empty state with discovery cards when no enrichments exist.
 * Supports drag-and-drop reordering via @dnd-kit.
 * Subscribes to Supabase Realtime for live updates.
 *
 * @module components/generation-graph/panels/stage7/views/RootView
 */

'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  Layers,
  Video,
  HelpCircle,
  Volume2,
  Presentation,
  AlertCircle,
  ImageIcon,
  PanelTop,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { DeleteConfirmationDialog } from '../components/DeleteConfirmationDialog'
import { trpc } from '@/lib/trpc/react'
import {
  useEnrichmentInspectorStore,
  type CreateEnrichmentType,
} from '../../../stores/enrichment-inspector-store'
import type { EnrichmentType, EnrichmentStatus } from '@megacampus/shared-types'
import { cn } from '@/lib/utils'
import { useSupabase } from '@/lib/supabase/browser-client'
import { useStaticGraph } from '../../../contexts/StaticGraphContext'
import { EnrichmentList } from '../components/EnrichmentList'
import { type EnrichmentListItemData } from '../components/EnrichmentListItem'
import { reorderEnrichments } from '@/app/actions/enrichment-actions'
// deleteEnrichment is imported above
import { logger } from '@/lib/client-logger'

/**
 * Props for RootView
 */
export interface RootViewProps {
  /** Lesson ID to show enrichments for */
  lessonId: string
  /** Optional className override */
  className?: string
}

/**
 * EnrichmentAddGrid Component
 *
 * Always-visible grid of buttons to add different enrichment types
 * Better discoverability than dropdown - all options visible at once
 */
function EnrichmentAddGrid({ onSelect }: { onSelect: (type: CreateEnrichmentType) => void }) {
  const t = useTranslations('enrichments')

  const enrichmentTypes: Array<{
    type: CreateEnrichmentType
    icon: React.ComponentType<{ className?: string }>
    labelKey: string
    colorClass: string
  }> = [
    { type: 'cover', icon: ImageIcon, labelKey: 'cover', colorClass: 'text-cyan-500' },
    { type: 'banner', icon: PanelTop, labelKey: 'banner', colorClass: 'text-rose-500' },
    { type: 'video', icon: Video, labelKey: 'video', colorClass: 'text-blue-500' },
    { type: 'quiz', icon: HelpCircle, labelKey: 'quiz', colorClass: 'text-purple-500' },
    { type: 'audio', icon: Volume2, labelKey: 'audio', colorClass: 'text-green-500' },
    {
      type: 'presentation',
      icon: Presentation,
      labelKey: 'presentation',
      colorClass: 'text-orange-500',
    },
  ]

  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
      <p className="text-muted-foreground mb-2 px-1 text-xs">{t('inspector.addEnrichment')}</p>
      <div className="grid grid-cols-6 gap-1.5">
        {enrichmentTypes.map(({ type, icon: Icon, labelKey, colorClass }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={cn(
              'flex flex-col items-center gap-1 rounded p-2',
              'hover:bg-white dark:hover:bg-slate-800',
              'transition-colors'
            )}
          >
            <Icon className={cn('h-4 w-4', colorClass)} />
            <span className="w-full truncate text-center text-[10px] font-medium">
              {t(`types.${labelKey}` as Parameters<typeof t>[0])}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * DiscoveryCard Component
 *
 * Card for discovering and creating enrichment types in empty state
 */
function DiscoveryCard({
  icon: Icon,
  title,
  onClick,
  testId,
  ariaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  onClick: () => void
  testId?: string
  ariaLabel?: string
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      aria-label={ariaLabel || `Create ${title}`}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border p-4',
        'bg-white dark:bg-slate-900',
        'hover:bg-slate-50 dark:hover:bg-slate-800',
        'hover:border-primary/50 transition-colors'
      )}
    >
      <Icon className="text-muted-foreground h-6 w-6" aria-hidden="true" />
      <span className="text-sm font-medium">{title}</span>
    </button>
  )
}

/**
 * LoadingState Component
 *
 * Skeleton loading state while enrichments are being fetched
 */
function LoadingState() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/**
 * ErrorState Component
 *
 * Shown when enrichments fail to load
 */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('enrichments')

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h3 className="mb-2 text-lg font-medium text-red-700 dark:text-red-400">
        {t('errors.loadFailed')}
      </h3>
      <p className="text-muted-foreground mb-4 text-sm">{t('inspector.error')}</p>
      <Button onClick={onRetry} variant="outline">
        {t('inspector.retry')}
      </Button>
    </div>
  )
}

/**
 * EmptyState Component
 *
 * Shown when lesson has no enrichments yet
 */
function EmptyState({ onAddClick }: { onAddClick: (type: CreateEnrichmentType) => void }) {
  const t = useTranslations('enrichments')

  return (
    <div
      data-testid="empty-state"
      className="flex h-full flex-col items-center justify-center p-8 text-center"
    >
      <Layers className="text-muted-foreground mb-4 h-12 w-12" />
      <h3 className="mb-2 text-lg font-medium">{t('inspector.empty')}</h3>
      <p className="text-muted-foreground mb-6 text-sm">{t('inspector.emptyDescription')}</p>

      {/* Discovery cards */}
      <div data-testid="discovery-cards" className="grid w-full max-w-sm grid-cols-2 gap-3">
        <DiscoveryCard
          icon={ImageIcon}
          title={t('types.cover')}
          onClick={() => onAddClick('cover')}
          testId="discovery-card-cover"
        />
        <DiscoveryCard
          icon={Video}
          title={t('types.video')}
          onClick={() => onAddClick('video')}
          testId="discovery-card-video"
        />
        <DiscoveryCard
          icon={HelpCircle}
          title={t('types.quiz')}
          onClick={() => onAddClick('quiz')}
          testId="discovery-card-quiz"
        />
        <DiscoveryCard
          icon={Volume2}
          title={t('types.audio')}
          onClick={() => onAddClick('audio')}
          testId="discovery-card-audio"
        />
        <DiscoveryCard
          icon={Presentation}
          title={t('types.presentation')}
          onClick={() => onAddClick('presentation')}
          testId="discovery-card-presentation"
        />
      </div>
    </div>
  )
}

/**
 * Data state for enrichment list
 */
type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: EnrichmentListItemData[] }

/** Debounce delay for batching rapid realtime updates */
const REFETCH_DEBOUNCE_MS = 300

/**
 * Fetch enrichments for a specific lesson from Supabase with realtime subscription
 *
 * Converts lesson label (e.g., "1.2") to lesson UUID by:
 * 1. Finding the section (module) by order_index
 * 2. Finding the lesson by section_id and order_index
 * 3. Fetching enrichments for that lesson
 * 4. Subscribing to realtime updates for that lesson
 *
 * @param lessonId - Lesson label in format "module.lesson" (e.g., "1.2")
 * @returns Data state with enrichments, refetch function, and connection status
 */
function useEnrichmentsByLesson(
  lessonId: string
): DataState & { refetch: () => void; isConnected: boolean } {
  const { supabase, session } = useSupabase()
  const { courseInfo } = useStaticGraph()
  const [state, setState] = useState<DataState>({ status: 'loading' })
  const [isConnected, setIsConnected] = useState(false)

  // Refs for managing async operations
  const abortControllerRef = useRef<AbortController | null>(null)
  const lessonUuidRef = useRef<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Store fetch function in ref for stable reference in realtime callback
  const fetchEnrichmentsRef = useRef<(() => Promise<void>) | null>(null)

  const fetchEnrichments = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (!lessonId || !courseInfo?.id || !session) {
      setState({ status: 'success', data: [] })
      return
    }

    // Create new AbortController for this request
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setState({ status: 'loading' })

    try {
      // lessonId is in format "1.2" - need to find the lesson UUID first
      const [moduleNum, lessonNum] = lessonId.split('.').map(Number)

      // Get section (module) by order_index
      const { data: section, error: sectionError } = await supabase
        .from('sections')
        .select('id')
        .eq('course_id', courseInfo.id)
        .eq('order_index', moduleNum)
        .abortSignal(abortController.signal)
        .single()

      // Check if request was aborted
      if (abortController.signal.aborted) return

      if (sectionError || !section) {
        setState({ status: 'success', data: [] })
        return
      }

      // Get lesson by section_id and order_index
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select('id')
        .eq('section_id', section.id)
        .eq('order_index', lessonNum)
        .abortSignal(abortController.signal)
        .single()

      // Check if request was aborted
      if (abortController.signal.aborted) return

      if (lessonError || !lesson) {
        setState({ status: 'success', data: [] })
        return
      }

      // Store the resolved lesson UUID for realtime subscription
      lessonUuidRef.current = lesson.id

      // Fetch enrichments for this lesson
      const { data: enrichments, error } = await supabase
        .from('lesson_enrichments')
        .select('id, enrichment_type, status, title, created_at, order_index')
        .eq('lesson_id', lesson.id)
        .order('order_index', { ascending: true })
        .abortSignal(abortController.signal)

      // Check if request was aborted
      if (abortController.signal.aborted) return

      if (error) {
        setState({ status: 'error', error: error.message })
        return
      }

      // Filter out 'card' enrichments - they're auto-generated and shown in the pipeline
      const enrichmentList: EnrichmentListItemData[] = (enrichments || [])
        .filter((e) => e.enrichment_type !== 'card')
        .map((e, index) => ({
          id: e.id,
          type: e.enrichment_type,
          status: e.status,
          display_order: e.order_index ?? index,
        }))

      setState({ status: 'success', data: enrichmentList })
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') return

      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to load enrichments',
      })
    }
  }, [lessonId, courseInfo?.id, session, supabase])

  // Keep fetch function ref up to date
  useEffect(() => {
    fetchEnrichmentsRef.current = fetchEnrichments
  }, [fetchEnrichments])

  // Initial fetch
  useEffect(() => {
    void fetchEnrichments()

    // Cleanup: abort on unmount or dependency change
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchEnrichments])

  // Realtime subscription - set up after we have the lesson UUID
  useEffect(() => {
    // Wait until we have a lesson UUID from the first fetch
    const lessonUuid = lessonUuidRef.current
    if (!lessonUuid || !session) {
      return
    }

    let isMounted = true

    logger.debug('[useEnrichmentsByLesson] Setting up realtime subscription', {
      lessonId,
      lessonUuid,
    })

    // Debounced refetch to batch rapid realtime updates
    const debouncedRefetch = () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }

      debounceTimeoutRef.current = setTimeout(() => {
        if (isMounted && fetchEnrichmentsRef.current) {
          void fetchEnrichmentsRef.current()
        }
      }, REFETCH_DEBOUNCE_MS)
    }

    // Create realtime channel
    const channel = supabase
      .channel(`enrichments:lesson:${lessonUuid}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'lesson_enrichments',
          filter: `lesson_id=eq.${lessonUuid}`,
        },
        (payload) => {
          logger.debug('[useEnrichmentsByLesson] Enrichment change received', {
            event: payload.eventType,
            lessonId,
            lessonUuid,
          })

          // Refetch to get updated data (debounced to batch rapid updates)
          debouncedRefetch()
        }
      )
      .subscribe((status: string, err) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[useEnrichmentsByLesson] Realtime subscription active', {
            lessonId,
            lessonUuid,
          })
          if (isMounted) {
            setIsConnected(true)
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const errorMessage =
            err?.message ||
            (typeof err === 'object' ? JSON.stringify(err) : String(err)) ||
            'Unknown error'

          logger.warn('[useEnrichmentsByLesson] Realtime subscription failed', {
            status,
            error: errorMessage,
            lessonId,
            lessonUuid,
          })

          if (isMounted) {
            setIsConnected(false)
          }
        } else if (status === 'CLOSED') {
          logger.debug('[useEnrichmentsByLesson] Realtime connection closed', {
            lessonId,
            lessonUuid,
          })
          if (isMounted) {
            setIsConnected(false)
          }
        }
      })

    channelRef.current = channel

    return () => {
      isMounted = false

      // Clear any pending debounced refetch
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
        debounceTimeoutRef.current = null
      }

      logger.debug('[useEnrichmentsByLesson] Unsubscribing from realtime channel', {
        lessonId,
        lessonUuid,
      })

      if (channelRef.current) {
        void channelRef.current.unsubscribe()
        channelRef.current = null
      }

      setIsConnected(false)
    }
  }, [lessonId, session, supabase, state.status]) // Re-subscribe when state becomes success (we have UUID)

  return { ...state, refetch: () => void fetchEnrichments(), isConnected }
}

/**
 * RootView
 *
 * Main view for enrichment list. Shows:
 * - Loading state with skeletons while fetching
 * - Error state with retry button on failure
 * - Empty state with discovery cards when no enrichments
 * - Sortable list with drag-and-drop when enrichments exist
 *
 * @example
 * ```tsx
 * <RootView lessonId="lesson-123" />
 * ```
 */
export function RootView({ lessonId, className }: RootViewProps) {
  const t = useTranslations('enrichments')
  const locale = useLocale()
  const { openCreate, openDetail } = useEnrichmentInspectorStore()
  const { courseInfo } = useStaticGraph()
  const dataState = useEnrichmentsByLesson(lessonId)

  // Local state for optimistic reordering
  const [localEnrichments, setLocalEnrichments] = useState<EnrichmentListItemData[]>([])

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // tRPC mutation for delete
  const deleteMutation = trpc.enrichment.delete.useMutation({
    onSuccess: () => {
      toast.success(locale === 'ru' ? 'Активность удалена' : 'Activity deleted')
      // Optimistically remove from local state
      if (deleteTarget) {
        setLocalEnrichments((prev) => prev.filter((e) => e.id !== deleteTarget))
      }
      setDeleteTarget(null)
    },
    onError: (error) => {
      toast.error(
        locale === 'ru'
          ? `Не удалось удалить: ${error.message}`
          : `Failed to delete: ${error.message}`
      )
    },
  })

  const isDeleting = deleteMutation.isPending

  // Sync local state with fetched data
  useEffect(() => {
    if (dataState.status === 'success') {
      setLocalEnrichments(dataState.data)
    }
  }, [dataState])

  /**
   * Handle reorder from EnrichmentList
   * Performs optimistic update then persists to server
   * Note: reorderEnrichments uses admin Supabase client (RLS bypass), stays as Server Action
   */
  const handleReorder = useCallback(
    async (newItems: EnrichmentListItemData[]) => {
      // Save previous state for rollback
      const previousItems = localEnrichments

      // Optimistic update
      setLocalEnrichments(newItems)

      // Persist to server
      try {
        const result = await reorderEnrichments({
          courseId: courseInfo?.id || '',
          lessonId,
          orderedIds: newItems.map((e) => e.id),
        })

        if (!result.success) {
          // Rollback on error
          setLocalEnrichments(previousItems)
          toast.error(t('inspector.reorderFailed'))
          console.error('Failed to reorder enrichments:', result.error)
        }
      } catch (err) {
        // Rollback on error
        setLocalEnrichments(previousItems)
        toast.error(t('inspector.reorderFailed'))
        console.error('Failed to reorder enrichments:', err)
      }
    },
    [localEnrichments, courseInfo?.id, lessonId, t]
  )

  /**
   * Handle delete button click - show confirmation dialog
   */
  const handleDeleteClick = useCallback((enrichmentId: string) => {
    setDeleteTarget(enrichmentId)
  }, [])

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget || !courseInfo?.id) {
      return
    }

    deleteMutation.mutate({ enrichmentId: deleteTarget })
  }, [deleteTarget, courseInfo?.id, deleteMutation])

  /**
   * Handle delete cancel
   */
  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null)
  }, [])

  // Render based on data state
  const renderContent = () => {
    switch (dataState.status) {
      case 'loading':
        return <LoadingState />

      case 'error':
        return <ErrorState onRetry={dataState.refetch} />

      case 'success': {
        const isEmpty = localEnrichments.length === 0

        if (isEmpty) {
          return <EmptyState onAddClick={openCreate} />
        }

        return (
          <>
            {/* Sortable enrichment list */}
            <div data-testid="enrichment-list" className="flex-1 overflow-hidden">
              <EnrichmentList
                items={localEnrichments}
                onItemClick={openDetail}
                onReorder={(items) => void handleReorder(items)}
                onDelete={handleDeleteClick}
              />
            </div>

            {/* Add enrichment grid - always visible */}
            <div className="border-t p-3">
              <EnrichmentAddGrid onSelect={openCreate} />
            </div>
          </>
        )
      }

      default:
        return null
    }
  }

  return (
    <>
      <div className={cn('flex h-full flex-col', className)}>{renderContent()}</div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && handleDeleteCancel()}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={isDeleting}
      />
    </>
  )
}

export default RootView
