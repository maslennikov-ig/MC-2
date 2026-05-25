'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Pencil, RefreshCw } from 'lucide-react'
import type { CareerPlaybookViewerSnapshot } from '@megacampus/shared-types'

import { MarkdownRendererFull } from '@/components/markdown/MarkdownRendererFull'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  CareerPlaybookBlockId,
  CareerPlaybookViewerBlock,
} from '@/stores/use-career-playbook-store'
import { ActionsBar, type ActionsBarCopy } from './ActionsBar'

export interface PlaybookViewerCopy {
  productLabel?: string
  contents?: string
  contentsAriaLabel?: string
  waitingBlock?: string
  statusLabel?: (status: CareerPlaybookViewerSnapshot['status']) => string
  blockTitle?: (blockId: CareerPlaybookBlockId, fallback: string) => string
  blockGroupLabel?: (groupKey: CareerPlaybookViewerBlock['groupKey'], fallback: string) => string
  blockStatusLabel?: (status: CareerPlaybookViewerBlock['state']['status']) => string
  editBlock?: (title: string) => string
  regenerateBlock?: (title: string) => string
  collapseBlock?: (title: string) => string
  expandBlock?: (title: string) => string
  actions?: ActionsBarCopy
}

interface PlaybookViewerProps {
  snapshot: CareerPlaybookViewerSnapshot
  blocks: CareerPlaybookViewerBlock[]
  actionMessage?: string | null
  copy?: PlaybookViewerCopy
  onEditBlock: (blockId: CareerPlaybookBlockId) => void
  onRegenerateBlock: (blockId: CareerPlaybookBlockId) => void
  onPdf: () => void
  onShare: () => void
  onCreateCourse: () => void
  onDelete: () => void
}

const defaultCopy: Required<Omit<PlaybookViewerCopy, 'actions'>> = {
  productLabel: 'Role Guide',
  contents: 'Contents',
  contentsAriaLabel: 'Role guide contents',
  waitingBlock: 'This block is waiting for generation.',
  statusLabel: (status) => status.replaceAll('_', ' '),
  blockTitle: (_blockId, fallback) => fallback,
  blockGroupLabel: (_groupKey, fallback) => fallback,
  blockStatusLabel: (status) => status,
  editBlock: (title) => `Edit ${title}`,
  regenerateBlock: (title) => `Regenerate ${title}`,
  collapseBlock: (title) => `Collapse ${title}`,
  expandBlock: (title) => `Expand ${title}`,
}

export function PlaybookViewer({
  snapshot,
  blocks,
  actionMessage,
  copy,
  onEditBlock,
  onRegenerateBlock,
  onPdf,
  onShare,
  onCreateCourse,
  onDelete,
}: PlaybookViewerProps) {
  const labels = { ...defaultCopy, ...copy }
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<CareerPlaybookBlockId>>(new Set())
  const groupedBlocks = useMemo(() => groupBlocks(blocks), [blocks])

  return (
    <main className="career-playbook-zone" data-testid="career-playbook-viewer-shell">
      <section className="career-playbook-topbar">
        <div className="mx-auto grid max-w-[1760px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md">
                <FileText className="mr-1 h-3.5 w-3.5" aria-hidden />
                {labels.productLabel}
              </Badge>
              <Badge variant="outline" className="rounded-md capitalize">
                {labels.statusLabel(snapshot.status)}
              </Badge>
              {snapshot.department ? (
                <Badge variant="outline" className="rounded-md">
                  {snapshot.department}
                </Badge>
              ) : null}
              {snapshot.level ? (
                <Badge variant="outline" className="rounded-md">
                  {snapshot.level}
                </Badge>
              ) : null}
            </div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-normal md:text-[42px] md:leading-[3.2rem]">
              {snapshot.title}
            </h1>
          </div>

          <ActionsBar
            actionMessage={actionMessage}
            copy={labels.actions}
            onPdf={onPdf}
            onShare={onShare}
            onCreateCourse={onCreateCourse}
            onDelete={onDelete}
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-[1760px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[18rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)]">
        <nav
          aria-label={labels.contentsAriaLabel}
          className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
        >
          <div className="career-playbook-panel p-3">
            <p className="px-2 pb-2 text-xs font-semibold tracking-normal text-slate-500 uppercase dark:text-slate-400">
              {labels.contents}
            </p>
            <div className="grid gap-3">
              {groupedBlocks.map((group) => (
                <div key={group.groupKey} className="grid gap-1">
                  <p className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {labels.blockGroupLabel(group.groupKey, group.groupLabel)}
                  </p>
                  {group.blocks.map((block) => (
                    <a
                      key={block.blockId}
                      href={`#${block.blockId}`}
                      className="block min-w-0 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-[#f6efe4] hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                    >
                      <span className="block truncate">
                        {labels.blockTitle(block.blockId, block.title)}
                      </span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="grid min-w-0 gap-4">
          {blocks.map((block) => {
            const isCollapsed = collapsedBlocks.has(block.blockId)
            const hasContent = block.state.content.trim().length > 0
            const title = labels.blockTitle(block.blockId, block.title)
            const groupLabel = labels.blockGroupLabel(block.groupKey, block.groupLabel)
            const statusLabel = labels.blockStatusLabel(block.state.status)

            return (
              <article
                key={block.blockId}
                id={block.blockId}
                aria-label={title}
                className="career-playbook-document scroll-mt-24"
              >
                <header className="career-playbook-document-rule flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label={
                          isCollapsed ? labels.expandBlock(title) : labels.collapseBlock(title)
                        }
                        onClick={() =>
                          setCollapsedBlocks((current) => {
                            const next = new Set(current)
                            if (next.has(block.blockId)) next.delete(block.blockId)
                            else next.add(block.blockId)
                            return next
                          })
                        }
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" aria-hidden />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold">{title}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {groupLabel} · {statusLabel}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEditBlock(block.blockId)}
                      aria-label={labels.editBlock(title)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRegenerateBlock(block.blockId)}
                      aria-label={labels.regenerateBlock(title)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </header>

                {!isCollapsed ? (
                  <div className={cn('overflow-x-auto p-4', !hasContent && 'text-slate-500')}>
                    {hasContent ? (
                      <MarkdownRendererFull
                        content={block.state.content}
                        preset="preview"
                        features={{ mermaid: true }}
                        language={snapshot.contentLanguage}
                      />
                    ) : (
                      <p className="text-sm leading-6">{labels.waitingBlock}</p>
                    )}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

function groupBlocks(blocks: CareerPlaybookViewerBlock[]) {
  const groups = new Map<
    CareerPlaybookViewerBlock['groupKey'],
    {
      groupKey: CareerPlaybookViewerBlock['groupKey']
      groupLabel: string
      blocks: CareerPlaybookViewerBlock[]
    }
  >()

  for (const block of blocks) {
    const existing = groups.get(block.groupKey)
    if (existing) {
      existing.blocks.push(block)
      continue
    }
    groups.set(block.groupKey, {
      groupKey: block.groupKey,
      groupLabel: block.groupLabel,
      blocks: [block],
    })
  }

  return [...groups.values()]
}
