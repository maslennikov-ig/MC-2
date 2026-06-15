'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type {
  CareerPlaybookBlockGroupKey,
  CareerPlaybookViewerPermissions,
  CareerPlaybookViewerSnapshot,
  CareerPlaybookVisibility,
} from '@megacampus/shared-types'

import { BlockEditor } from '@/components/career-playbook/viewer/BlockEditor'
import { CreateCourseFromPlaybookDialog } from '@/components/career-playbook/viewer/CreateCourseFromPlaybookDialog'
import { updateCareerPlaybookVisibility } from '@/components/career-playbook/library/client-adapter'
import { buildCareerPlaybookPublicUrl } from '@/components/career-playbook/library/public-url'
import { PlaybookViewer } from '@/components/career-playbook/viewer/PlaybookViewer'
import { StreamingView } from '@/components/career-playbook/viewer/StreamingView'
import Header from '@/components/layouts/header'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/utils/clipboard'
import type { Locale } from '@/src/i18n/config'
import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  useCareerPlaybookStore,
  type CareerPlaybookBlockId,
  type CareerPlaybookViewerBlock,
} from '@/stores/use-career-playbook-store'

type ReaderMode = 'standard' | 'reading'

interface CareerPlaybookViewerPageClientProps {
  locale: Locale
  playbookId: string
}

const VIEWER_BLOCK_TITLE_KEYS = {
  header: 'blocks.header',
  block_1: 'blocks.block_1',
  block_2: 'blocks.block_2',
  block_3: 'blocks.block_3',
  block_4: 'blocks.block_4',
  block_5: 'blocks.block_5',
  block_6: 'blocks.block_6',
  block_7: 'blocks.block_7',
  block_8: 'blocks.block_8',
  block_9: 'blocks.block_9',
  block_10: 'blocks.block_10',
  block_11: 'blocks.block_11',
  block_12: 'blocks.block_12',
  block_13: 'blocks.block_13',
  block_14: 'blocks.block_14',
  block_15: 'blocks.block_15',
  block_16: 'blocks.block_16',
  block_17: 'blocks.block_17',
  block_18: 'blocks.block_18',
  block_19: 'blocks.block_19',
  block_20: 'blocks.block_20',
  block_21: 'blocks.block_21',
  block_22: 'blocks.block_22',
  block_23: 'blocks.block_23',
  block_24: 'blocks.block_24',
  block_25: 'blocks.block_25',
  block_26: 'blocks.block_26',
} as const satisfies Record<CareerPlaybookBlockId, `blocks.${string}`>

const VIEWER_BLOCK_GROUP_KEYS = {
  group_1_foundation: 'blockGroups.group_1_foundation',
  group_2_operations: 'blockGroups.group_2_operations',
  group_3_people: 'blockGroups.group_3_people',
  group_4_growth: 'blockGroups.group_4_growth',
  group_5_system: 'blockGroups.group_5_system',
  group_6_wrap: 'blockGroups.group_6_wrap',
} as const satisfies Record<CareerPlaybookBlockGroupKey, `blockGroups.${string}`>

const VIEWER_STATUS_LABEL_KEYS = new Set([
  'draft',
  'answering_fixed',
  'awaiting_followups',
  'answering_followups',
  'ready_to_generate',
  'generating',
  'completed',
  'failed',
])

const VIEWER_BLOCK_STATUS_LABEL_KEYS = new Set([
  'pending',
  'generating',
  'generated',
  'failed',
  'regenerating',
])

function fallbackRuntimeStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function getViewerBlockTitleKey(blockId: CareerPlaybookBlockId) {
  const key = blockId as keyof typeof VIEWER_BLOCK_TITLE_KEYS
  return VIEWER_BLOCK_TITLE_KEYS[key]
}

function readViewerPermissions(value: unknown): CareerPlaybookViewerPermissions | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const canEdit = typeof record.canEdit === 'boolean' ? record.canEdit : null
  const canManageVisibility =
    typeof record.canManageVisibility === 'boolean' ? record.canManageVisibility : null
  const canCreateCourse =
    typeof record.canCreateCourse === 'boolean' ? record.canCreateCourse : null
  const canDelete = typeof record.canDelete === 'boolean' ? record.canDelete : null

  if (
    canEdit === null ||
    canManageVisibility === null ||
    canCreateCourse === null ||
    canDelete === null
  ) {
    return null
  }

  return {
    canEdit,
    canManageVisibility,
    canCreateCourse,
    canDelete,
  }
}

function readVisibilityUpdateResult(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const playbookId = typeof record.playbookId === 'string' ? record.playbookId : null
  const isPublic = typeof record.isPublic === 'boolean' ? record.isPublic : null
  const visibility: CareerPlaybookVisibility | null =
    record.visibility === 'private' ||
    record.visibility === 'organization' ||
    record.visibility === 'public'
      ? record.visibility
      : null
  const shareSlug = typeof record.shareSlug === 'string' ? record.shareSlug : null
  const organizationSlug =
    typeof record.organizationSlug === 'string' ? record.organizationSlug : null

  if (!playbookId || isPublic === null || !visibility) return null

  return {
    playbookId,
    isPublic,
    visibility,
    shareSlug,
    organizationSlug,
    viewerPermissions: readViewerPermissions(record.viewerPermissions),
  }
}

export default function CareerPlaybookViewerPageClient({
  locale,
  playbookId,
}: CareerPlaybookViewerPageClientProps) {
  const t = useTranslations('career-playbook.viewer')
  const tc = useTranslations('common')
  const state = useCareerPlaybookStore()
  const [selectedBlockId, setSelectedBlockId] = useState<CareerPlaybookBlockId | null>(null)
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false)
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    if (typeof window === 'undefined') return 'standard'
    return new URLSearchParams(window.location.search).get('mode') === 'reading'
      ? 'reading'
      : 'standard'
  })
  const playbookCopy = useMemo(
    () => ({
      productLabel: t('productLabel'),
      contents: t('contents'),
      contentsAriaLabel: t('contentsAriaLabel'),
      waitingBlock: t('waitingBlock'),
      statusLabel: (status: CareerPlaybookViewerSnapshot['status']) => {
        const statusKey = String(status)
        if (statusKey === 'waiting') return t('blockStatusLabels.pending')
        if (VIEWER_STATUS_LABEL_KEYS.has(statusKey)) {
          return t(`statusLabels.${statusKey}` as never)
        }

        return fallbackRuntimeStatusLabel(statusKey)
      },
      blockTitle: (blockId: CareerPlaybookBlockId, fallback: string) => {
        const key = getViewerBlockTitleKey(blockId)
        return key ? t(key) : fallback
      },
      blockGroupLabel: (groupKey: CareerPlaybookBlockGroupKey, fallback: string) =>
        t(VIEWER_BLOCK_GROUP_KEYS[groupKey]) || fallback,
      blockStatusLabel: (status: CareerPlaybookViewerBlock['state']['status']) => {
        const statusKey = String(status)
        if (statusKey === 'waiting') return t('blockStatusLabels.pending')
        if (VIEWER_BLOCK_STATUS_LABEL_KEYS.has(statusKey)) {
          return t(`blockStatusLabels.${statusKey}` as never)
        }

        return fallbackRuntimeStatusLabel(statusKey)
      },
      editBlock: (title: string) => t('editBlock', { title }),
      regenerateBlock: (title: string) => t('regenerateBlock', { title }),
      collapseBlock: (title: string) => t('collapseBlock', { title }),
      expandBlock: (title: string) => t('expandBlock', { title }),
      hideContents: t('hideContents'),
      showContents: t('showContents'),
      hideInspector: t('hideInspector'),
      showInspector: t('showInspector'),
      readingMode: t('readingMode'),
      exitReadingMode: t('exitReadingMode'),
      readingHint: t('readingHint'),
      inspectorLabel: t('inspectorLabel'),
      inspectorTitle: t('inspectorTitle'),
      inspectorStatusTitle: t('inspectorStatusTitle'),
      inspectorReadinessTitle: t('inspectorReadinessTitle'),
      inspectorWarningsTitle: t('inspectorWarningsTitle'),
      inspectorWarningsDescription: t('inspectorWarningsDescription'),
      visibilityLabel: tc('visibility.label'),
      visibilityValueLabel: (visibility: CareerPlaybookVisibility) =>
        tc(`visibility.${visibility}`),
      inspectorReadyBlocks: (ready: number, total: number) =>
        t('inspectorReadyBlocks', { ready, total }),
      inspectorLanguage: (language: string) => t('inspectorLanguage', { language }),
      inspectorNextStep: t('inspectorNextStep'),
      inspectorPrepare: t('inspectorPrepare'),
      numericFactsTitle: t('numericFactsTitle'),
      numericFactTotal: (count: number) => t('numericFactTotal', { count }),
      numericFactVerified: (count: number) => t('numericFactVerified', { count }),
      numericFactBenchmark: (count: number) => t('numericFactBenchmark', { count }),
      numericFactNeedsReview: (count: number) => t('numericFactNeedsReview', { count }),
      numericFactSuggested: (count: number) => t('numericFactSuggested', { count }),
      numericFactStructural: (count: number) => t('numericFactStructural', { count }),
      numericFactConflict: (count: number) => t('numericFactConflict', { count }),
      numericEditTitle: t('numericEditTitle'),
      numericEditDescription: (value: string) => t('numericEditDescription', { value }),
      numericReplacementLabel: t('numericReplacementLabel'),
      numericScopeLabel: t('numericScopeLabel'),
      numericScopeOccurrence: t('numericScopeOccurrence'),
      numericScopeBlock: t('numericScopeBlock'),
      numericSave: t('numericSave'),
      numericCancel: t('numericCancel'),
      actions: {
        actionsLabel: t('actionsLabel'),
        pdf: t('pdf'),
        share: t('share'),
        createCourse: t('createCourse'),
        delete: t('delete'),
      },
    }),
    [t, tc]
  )
  const editorCopy = useMemo(
    () => ({
      title: t('editorTitle'),
      description: t('editorDescription'),
      blockMarkdown: t('blockMarkdown'),
      saveChanges: t('saveChanges'),
      regenerationInstruction: t('regenerationInstruction'),
      regenerationPlaceholder: t('regenerationPlaceholder'),
      regenerateBlock: t('regenerateBlockButton'),
    }),
    [t]
  )
  const streamingCopy = useMemo(
    () => ({
      productLabel: t('productLabel'),
      generatingTitle: (title: string) => t('generatingTitle', { title }),
      blocksReady: (ready: number, total: number) => t('blocksReady', { ready, total }),
      thinkingStream: t('thinkingStream'),
      streamingBlockPending: t('streamingBlockPending'),
      blockTitle: (blockId: CareerPlaybookBlockId, fallback: string) => {
        const key = getViewerBlockTitleKey(blockId)
        return key ? t(key) : fallback
      },
      blockGroupLabel: (groupKey: CareerPlaybookBlockGroupKey, fallback: string) =>
        t(VIEWER_BLOCK_GROUP_KEYS[groupKey]) || fallback,
      blockStatusLabel: (status: CareerPlaybookViewerBlock['state']['status']) => {
        const statusKey = String(status)
        if (statusKey === 'waiting') return t('blockStatusLabels.pending')
        if (VIEWER_BLOCK_STATUS_LABEL_KEYS.has(statusKey)) {
          return t(`blockStatusLabels.${statusKey}` as never)
        }

        return fallbackRuntimeStatusLabel(statusKey)
      },
    }),
    [t]
  )

  useEffect(() => {
    let cancelled = false

    void useCareerPlaybookStore
      .getState()
      .loadCareerPlaybookViewer(playbookId)
      .then((result) => {
        if (cancelled || result.ok || !result.backendPending) return
        if (useCareerPlaybookStore.getState().viewer?.playbookId === playbookId) return

        useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer(
          createPendingViewerSnapshot(playbookId, locale, {
            title: t('localPreviewTitle'),
            content: t('localPreviewContent'),
          })
        )
        useCareerPlaybookStore.setState({
          viewerActionMessage: t('viewerBackendPending'),
        })
      })

    return () => {
      cancelled = true
    }
  }, [locale, playbookId, t])

  const selectedBlock = useMemo(
    () => state.viewerBlocks.find((block) => block.blockId === selectedBlockId),
    [selectedBlockId, state.viewerBlocks]
  )

  const setBackendPendingMessage = (message: string) => {
    useCareerPlaybookStore.setState({ viewerActionMessage: message })
  }

  const handleVisibilityChange = async (visibility: CareerPlaybookVisibility) => {
    const viewer = useCareerPlaybookStore.getState().viewer
    if (!viewer || isUpdatingVisibility) return

    const currentVisibility = viewer.visibility ?? (viewer.isPublic ? 'public' : 'private')
    if (visibility === currentVisibility) return

    setIsUpdatingVisibility(true)
    useCareerPlaybookStore.setState({ viewerActionMessage: null })

    try {
      const result = readVisibilityUpdateResult(
        await updateCareerPlaybookVisibility(viewer.playbookId, visibility, locale)
      )

      if (!result || result.playbookId !== viewer.playbookId) {
        setBackendPendingMessage(tc('visibility.changeError'))
        return
      }

      const currentViewer = useCareerPlaybookStore.getState().viewer
      if (!currentViewer || currentViewer.playbookId !== result.playbookId) return

      useCareerPlaybookStore.getState().hydrateCareerPlaybookViewer({
        ...currentViewer,
        isPublic: result.isPublic,
        visibility: result.visibility,
        shareSlug: result.shareSlug,
        organizationSlug: result.organizationSlug ?? currentViewer.organizationSlug ?? null,
        viewerPermissions: result.viewerPermissions ?? currentViewer.viewerPermissions,
      })
      setBackendPendingMessage(tc('visibility.changeSuccess'))
    } catch {
      setBackendPendingMessage(tc('visibility.changeError'))
    } finally {
      setIsUpdatingVisibility(false)
    }
  }

  const handleShare = async () => {
    const viewer = useCareerPlaybookStore.getState().viewer
    if (!viewer || viewer.visibility !== 'public') {
      setBackendPendingMessage(t('shareUnavailable'))
      return
    }

    const url = buildCareerPlaybookPublicUrl(locale, viewer.organizationSlug, viewer.shareSlug)
    if (!url) {
      setBackendPendingMessage(t('shareUnavailable'))
      return
    }

    const copied = await copyToClipboard(url)
    setBackendPendingMessage(copied ? t('shareCopied') : t('shareCopyError'))
  }

  if (state.isLoadingViewer && !state.viewer) {
    return (
      <>
        <Header sticky surface="glass" />
        <main className="career-playbook-zone flex min-h-[calc(100vh-73px)] items-center justify-center px-4">
          <p className="career-playbook-panel px-4 py-3 text-sm">{t('loading')}</p>
        </main>
      </>
    )
  }

  if (!state.viewer) {
    return (
      <>
        <Header sticky surface="glass" />
        <main className="career-playbook-zone flex min-h-[calc(100vh-73px)] items-center justify-center px-4">
          <div className="career-playbook-panel grid max-w-lg gap-3 p-5">
            <h1 className="text-xl font-semibold">{t('unavailableTitle')}</h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {state.viewerError ?? t('unavailableDescription')}
            </p>
            <Button type="button" onClick={() => void state.loadCareerPlaybookViewer(playbookId)}>
              {t('retry')}
            </Button>
          </div>
        </main>
      </>
    )
  }

  const canEditViewer = state.viewer.viewerPermissions?.canEdit ?? true
  const canCreateCourse = state.viewer.viewerPermissions?.canCreateCourse ?? true
  const commonEditor = canEditViewer ? (
    <BlockEditor
      open={Boolean(selectedBlock)}
      block={selectedBlock}
      isUpdating={state.isUpdatingViewerBlock}
      copy={editorCopy}
      onOpenChange={(open) => {
        if (!open) setSelectedBlockId(null)
      }}
      onSave={async (blockId, content) => {
        const result = await useCareerPlaybookStore
          .getState()
          .editCareerPlaybookViewerBlock(blockId, content)
        if (result.ok) {
          if (useCareerPlaybookStore.getState().viewerActionMessage) {
            useCareerPlaybookStore.setState({ viewerActionMessage: t('editLocal') })
          }
          setSelectedBlockId(null)
        }
      }}
      onRegenerate={async (blockId, instruction) => {
        const result = await useCareerPlaybookStore
          .getState()
          .regenerateCareerPlaybookViewerBlock(blockId, instruction)
        if (result.ok) {
          if (useCareerPlaybookStore.getState().viewerActionMessage) {
            useCareerPlaybookStore.setState({ viewerActionMessage: t('regenerateLocal') })
          }
          setSelectedBlockId(null)
        }
      }}
    />
  ) : null

  if (state.viewer.status === 'generating') {
    return (
      <>
        <Header sticky surface="glass" />
        <StreamingView
          snapshot={state.viewer}
          blocks={state.viewerBlocks}
          showThinkingStream={state.showCareerPlaybookThinkingStream}
          copy={streamingCopy}
          onToggleThinkingStream={state.toggleCareerPlaybookThinkingStream}
        />
        {commonEditor}
      </>
    )
  }

  return (
    <>
      {readerMode === 'standard' ? <Header sticky surface="glass" /> : null}
      <PlaybookViewer
        snapshot={state.viewer}
        blocks={state.viewerBlocks}
        actionMessage={state.viewerActionMessage}
        copy={playbookCopy}
        readerMode={readerMode}
        onReaderModeChange={setReaderMode}
        onEditBlock={(blockId) => {
          if (canEditViewer) setSelectedBlockId(blockId)
        }}
        onRegenerateBlock={(blockId) => {
          if (canEditViewer) setSelectedBlockId(blockId)
        }}
        onPdf={() =>
          void state.requestCareerPlaybookPdf().then((result) => {
            if (!result.ok) setBackendPendingMessage(t('pdfPending'))
          })
        }
        onShare={() => void handleShare()}
        onCreateCourse={() => setBackendPendingMessage(t('coursePending'))}
        createCourseAction={
          canCreateCourse
            ? (trigger) => (
                <CreateCourseFromPlaybookDialog
                  playbookId={state.viewer!.playbookId}
                  trigger={trigger}
                />
              )
            : undefined
        }
        onDelete={() => setBackendPendingMessage(t('deletePending'))}
        isUpdatingVisibility={isUpdatingVisibility}
        isUpdatingNumericFact={state.isUpdatingViewerBlock}
        onVisibilityChange={(visibility) => {
          void handleVisibilityChange(visibility)
        }}
        onUpdateNumericFact={async (input) => {
          if (!canEditViewer) return false
          const result = await useCareerPlaybookStore
            .getState()
            .updateCareerPlaybookNumericFact(input)
          if (!result.ok) {
            setBackendPendingMessage(result.error ?? t('numericSaveError'))
            return false
          }
          setBackendPendingMessage(t('numericSaved'))
          return true
        }}
      />
      {commonEditor}
    </>
  )
}

function createPendingViewerSnapshot(
  playbookId: string,
  locale: Locale,
  copy: {
    title: string
    content: string
  }
): CareerPlaybookViewerSnapshot {
  return {
    playbookId,
    title: copy.title,
    department: null,
    level: null,
    contentLanguage: locale,
    status: 'completed',
    visibility: 'private',
    organizationSlug: null,
    ownerId: null,
    viewerPermissions: {
      canEdit: true,
      canManageVisibility: true,
      canCreateCourse: true,
      canDelete: true,
    },
    blocks: Object.fromEntries(
      CAREER_PLAYBOOK_BLOCK_CATALOG.map((block) => [
        block.blockId,
        {
          content: block.blockId === 'header' ? copy.content : '',
          status: block.blockId === 'header' ? 'generated' : 'pending',
          attempt: 0,
        },
      ])
    ) as CareerPlaybookViewerSnapshot['blocks'],
  }
}
