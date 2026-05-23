'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { CareerPlaybookViewerSnapshot } from '@megacampus/shared-types'

import { BlockEditor } from '@/components/career-playbook/viewer/BlockEditor'
import { PlaybookViewer } from '@/components/career-playbook/viewer/PlaybookViewer'
import { StreamingView } from '@/components/career-playbook/viewer/StreamingView'
import Header from '@/components/layouts/header'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/src/i18n/config'
import {
  CAREER_PLAYBOOK_BLOCK_CATALOG,
  useCareerPlaybookStore,
  type CareerPlaybookBlockId,
} from '@/stores/use-career-playbook-store'

interface CareerPlaybookViewerPageClientProps {
  locale: Locale
  playbookId: string
}

export default function CareerPlaybookViewerPageClient({
  locale,
  playbookId,
}: CareerPlaybookViewerPageClientProps) {
  const t = useTranslations('career-playbook.viewer')
  const state = useCareerPlaybookStore()
  const [selectedBlockId, setSelectedBlockId] = useState<CareerPlaybookBlockId | null>(null)
  const playbookCopy = useMemo(
    () => ({
      productLabel: t('productLabel'),
      contents: t('contents'),
      waitingBlock: t('waitingBlock'),
      editBlock: (title: string) => t('editBlock', { title }),
      regenerateBlock: (title: string) => t('regenerateBlock', { title }),
      collapseBlock: (title: string) => t('collapseBlock', { title }),
      expandBlock: (title: string) => t('expandBlock', { title }),
      actions: {
        pdf: t('pdf'),
        share: t('share'),
        createCourse: t('createCourse'),
        delete: t('delete'),
      },
    }),
    [t]
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

  if (state.isLoadingViewer && !state.viewer) {
    return (
      <>
        <Header sticky surface="glass" />
        <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-slate-100 px-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
          <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
            {t('loading')}
          </p>
        </main>
      </>
    )
  }

  if (!state.viewer) {
    return (
      <>
        <Header sticky surface="glass" />
        <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-slate-100 px-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
          <div className="grid max-w-lg gap-3 rounded-md border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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

  const commonEditor = (
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
  )

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
      <Header sticky surface="glass" />
      <PlaybookViewer
        snapshot={state.viewer}
        blocks={state.viewerBlocks}
        actionMessage={state.viewerActionMessage}
        copy={playbookCopy}
        onEditBlock={setSelectedBlockId}
        onRegenerateBlock={setSelectedBlockId}
        onPdf={() =>
          void state.requestCareerPlaybookPdf().then((result) => {
            if (!result.ok) setBackendPendingMessage(t('pdfPending'))
          })
        }
        onShare={() => setBackendPendingMessage(t('sharePending'))}
        onCreateCourse={() => setBackendPendingMessage(t('coursePending'))}
        onDelete={() => setBackendPendingMessage(t('deletePending'))}
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
