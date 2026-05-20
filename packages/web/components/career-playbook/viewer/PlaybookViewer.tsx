'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, WandSparkles } from 'lucide-react'
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
  waitingBlock?: string
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
  productLabel: 'Career Playbook',
  contents: 'Contents',
  waitingBlock: 'This block is waiting for generation.',
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
    <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 md:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md">
                {labels.productLabel}
              </Badge>
              <Badge variant="outline" className="rounded-md capitalize">
                {snapshot.status.replaceAll('_', ' ')}
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
            <h1 className="text-3xl font-semibold tracking-normal md:text-4xl">{snapshot.title}</h1>
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

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav
          aria-label="Playbook table of contents"
          className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
        >
          <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="px-2 pb-2 text-xs font-semibold tracking-normal text-slate-500 uppercase dark:text-slate-400">
              {labels.contents}
            </p>
            <div className="grid gap-3">
              {groupedBlocks.map((group) => (
                <div key={group.groupKey} className="grid gap-1">
                  <p className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {group.groupLabel}
                  </p>
                  {group.blocks.map((block) => (
                    <a
                      key={block.blockId}
                      href={`#${block.blockId}`}
                      className="block min-w-0 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                    >
                      <span className="block truncate">{block.title}</span>
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

            return (
              <article
                key={block.blockId}
                id={block.blockId}
                aria-label={block.title}
                className="scroll-mt-24 rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <header className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label={
                          isCollapsed
                            ? labels.expandBlock(block.title)
                            : labels.collapseBlock(block.title)
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
                        <h2 className="truncate text-lg font-semibold">{block.title}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {block.groupLabel} · {block.state.status}
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
                      aria-label={labels.editBlock(block.title)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRegenerateBlock(block.blockId)}
                      aria-label={labels.regenerateBlock(block.title)}
                    >
                      <WandSparkles className="h-4 w-4" aria-hidden />
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
    string,
    {
      groupKey: string
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
