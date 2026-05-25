'use client'

import { useMemo, useState } from 'react'
import { BookOpenCheck, ClipboardCheck, FileText, MessageSquareText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface CareerPlaybookDemoSection {
  id: string
  title: string
  excerpt: string
  annotation: string
  blockLabel: string
}

interface CareerPlaybookDemoBlock {
  id: string
  label: string
  example?: string
}

interface CareerPlaybookDemoBlockGroup {
  title: string
  blocks: CareerPlaybookDemoBlock[]
}

interface InteractiveDemoProps {
  eyebrow: string
  title: string
  subtitle: string
  previewTitle: string
  exampleLabel: string
  totalBlocksLabel: string
  shownBlocksLabel: string
  remainingBlocksLabel: string
  blockLabelPrefix: string
  outlineLabel: string
  sections: CareerPlaybookDemoSection[]
  fullStructureGroups: CareerPlaybookDemoBlockGroup[]
}

export function InteractiveDemo({
  eyebrow,
  title,
  subtitle,
  previewTitle,
  exampleLabel,
  totalBlocksLabel,
  shownBlocksLabel,
  remainingBlocksLabel,
  blockLabelPrefix,
  outlineLabel,
  sections,
  fullStructureGroups,
}: InteractiveDemoProps) {
  const exampleByBlockNumber = useMemo(() => {
    const examples = new Map<string, CareerPlaybookDemoSection>()

    sections.forEach((section) => {
      const blockNumber = section.blockLabel.match(/\d+/)?.[0]
      if (blockNumber) {
        examples.set(blockNumber, section)
      }
    })

    return examples
  }, [sections])
  const fullBlocks = useMemo(() => {
    return fullStructureGroups
      .flatMap((group) =>
        group.blocks.map((block) => {
          const blockNumber =
            block.id.match(/^block(\d+)$/)?.[1] ?? block.label.match(/^\s*(\d+)\./)?.[1]
          const demoSection = blockNumber ? exampleByBlockNumber.get(blockNumber) : undefined
          const fallbackBlockLabel = blockNumber
            ? `${blockLabelPrefix} ${blockNumber}`
            : (block.label.match(/^\s*(\d+\.)/)?.[1] ?? '')

          return {
            id: block.id,
            order: Number(blockNumber ?? 0),
            title: demoSection?.title ?? block.label.replace(/^\s*\d+\.\s*/, ''),
            label: block.label,
            blockLabel: demoSection?.blockLabel ?? fallbackBlockLabel,
            excerpt: block.example ?? demoSection?.excerpt ?? '',
            annotation: demoSection?.annotation ?? block.example ?? '',
          }
        })
      )
      .sort((current, next) => current.order - next.order)
  }, [blockLabelPrefix, exampleByBlockNumber, fullStructureGroups])
  const [activeBlockId, setActiveBlockId] = useState(fullBlocks[0]?.id ?? '')
  const activeBlock = useMemo(
    () => fullBlocks.find((block) => block.id === activeBlockId) ?? fullBlocks[0],
    [activeBlockId, fullBlocks]
  )

  if (!activeBlock) {
    return null
  }

  return (
    <section
      id="example"
      aria-labelledby="career-playbook-demo-title"
      className="relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20"
    >
      <div className="career-playbook-wide-container mx-auto max-w-[96rem]">
        <div className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div className="max-w-3xl">
            <p className="mb-3 text-sm font-semibold text-amber-200">{eyebrow}</p>
            <h2 id="career-playbook-demo-title" className="text-3xl font-bold md:text-4xl">
              {title}
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-300">{subtitle}</p>
          </div>

          <div className="rounded-lg border border-amber-300/25 bg-amber-200/10 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-2 text-amber-100">
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <p className="text-sm font-semibold">{totalBlocksLabel}</p>
            </div>
            <div className="mt-4 flex items-end gap-3">
              <span className="text-5xl leading-none font-bold text-white">26</span>
              <span className="pb-1 text-sm leading-5 text-slate-300">{shownBlocksLabel}</span>
            </div>
            <p className="mt-4 border-t border-amber-200/15 pt-4 text-sm leading-6 text-slate-300">
              {remainingBlocksLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="px-1 pb-2">
              <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                {outlineLabel}
              </p>
              <p className="mt-1 text-sm text-slate-300">{shownBlocksLabel}</p>
            </div>
            <div
              data-testid="career-playbook-demo-selector-list"
              className="grid max-h-[28rem] min-w-0 gap-2 overflow-y-auto pr-1"
            >
              {fullBlocks.map((block) => {
                const isActive = block.id === activeBlock.id

                return (
                  <Button
                    key={block.id}
                    type="button"
                    variant="ghost"
                    data-testid="career-playbook-demo-section-button"
                    className={cn(
                      '!h-auto !min-h-[4.75rem] w-full min-w-0 items-start justify-start rounded-md border p-3.5 text-left whitespace-normal',
                      'border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/40 hover:bg-white/10',
                      isActive && 'border-amber-300/60 bg-amber-300/15 text-white'
                    )}
                    onClick={() => setActiveBlockId(block.id)}
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <FileText
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm leading-5 font-semibold break-words">
                          {block.title}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {block.blockLabel}
                        </span>
                      </span>
                    </span>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <article className="min-h-[28rem] min-w-0 rounded-lg border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-black/30 md:p-8">
              <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">{previewTitle}</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">{activeBlock.title}</h3>
                  <p className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                    {activeBlock.blockLabel}
                  </p>
                </div>
                <BookOpenCheck className="h-6 w-6 text-violet-300" aria-hidden="true" />
              </div>

              <div className="space-y-5">
                <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
                  <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                    {exampleLabel}
                  </p>
                  <p className="mt-3 text-base leading-7 text-slate-100">{activeBlock.excerpt}</p>
                </div>

                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-medium text-violet-100 transition-colors hover:bg-violet-400/15"
                      >
                        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                        {activeBlock.blockLabel}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-72">
                      {activeBlock.annotation}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </article>

            <aside className="min-w-0 rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
              <p className="text-sm font-semibold text-amber-100">{activeBlock.blockLabel}</p>
              <p className="mt-4 text-sm leading-6 text-slate-200">{activeBlock.annotation}</p>
              <p className="mt-5 border-t border-amber-200/15 pt-5 text-xs leading-5 text-slate-400">
                {remainingBlocksLabel}
              </p>
            </aside>
          </div>
        </div>
      </div>
    </section>
  )
}
