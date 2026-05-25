'use client'

import { useMemo, useState } from 'react'
import { BookOpenCheck, ClipboardCheck, FileText, MessageSquareText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  totalBlocksLabel: string
  shownBlocksLabel: string
  remainingBlocksLabel: string
  outlineLabel: string
  allBlocksButtonLabel: string
  allBlocksTitle: string
  allBlocksDescription: string
  exampleLabel: string
  sections: CareerPlaybookDemoSection[]
  fullStructureGroups: CareerPlaybookDemoBlockGroup[]
}

export function InteractiveDemo({
  eyebrow,
  title,
  subtitle,
  previewTitle,
  totalBlocksLabel,
  shownBlocksLabel,
  remainingBlocksLabel,
  outlineLabel,
  allBlocksButtonLabel,
  allBlocksTitle,
  allBlocksDescription,
  exampleLabel,
  sections,
  fullStructureGroups,
}: InteractiveDemoProps) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? '')
  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) ?? sections[0],
    [activeSectionId, sections]
  )
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

  if (!activeSection) {
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
              className="grid max-h-[20rem] min-w-0 gap-2 overflow-y-auto pr-1"
            >
              {sections.map((section) => {
                const isActive = section.id === activeSection.id

                return (
                  <Button
                    key={section.id}
                    type="button"
                    variant="ghost"
                    data-testid="career-playbook-demo-section-button"
                    className={cn(
                      '!h-auto !min-h-[4.75rem] w-full min-w-0 items-start justify-start rounded-md border p-3.5 text-left whitespace-normal',
                      'border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/40 hover:bg-white/10',
                      isActive && 'border-amber-300/60 bg-amber-300/15 text-white'
                    )}
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      <FileText
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm leading-5 font-semibold break-words">
                          {section.title}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {section.blockLabel}
                        </span>
                      </span>
                    </span>
                  </Button>
                )
              })}
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full justify-between rounded-md border-amber-300/30 bg-amber-200/10 text-sm font-semibold text-amber-100 hover:border-amber-300/50 hover:bg-amber-200/15 hover:text-white"
                >
                  <span>{allBlocksButtonLabel}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">
                    26
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden border-white/10 bg-slate-950 p-0 text-white shadow-2xl">
                <DialogHeader className="border-b border-white/10 px-6 pt-6 pb-4">
                  <DialogTitle className="text-2xl text-white">{allBlocksTitle}</DialogTitle>
                  <DialogDescription className="text-sm leading-6 text-slate-300">
                    {allBlocksDescription}
                  </DialogDescription>
                </DialogHeader>

                <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {fullStructureGroups.map((group) => (
                      <div
                        key={group.title}
                        className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
                      >
                        <p className="text-sm font-semibold text-amber-100">{group.title}</p>
                        <div className="mt-3 grid gap-2">
                          {group.blocks.map((block) => {
                            const blockNumber =
                              block.id.match(/^block(\d+)$/)?.[1] ??
                              block.label.match(/^\s*(\d+)\./)?.[1]
                            const example = blockNumber
                              ? exampleByBlockNumber.get(blockNumber)
                              : undefined

                            return (
                              <div
                                key={block.id}
                                className="rounded-md border border-white/10 bg-slate-900/80 p-3"
                              >
                                <p className="text-sm leading-5 font-semibold text-slate-100">
                                  {block.label}
                                </p>
                                {example ? (
                                  <div className="mt-2 border-t border-white/10 pt-2">
                                    <p className="text-xs font-semibold tracking-wide text-violet-200 uppercase">
                                      {exampleLabel}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-300">
                                      {example.excerpt}
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <article className="min-h-[28rem] min-w-0 rounded-lg border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-black/30 md:p-8">
              <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">{previewTitle}</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">{activeSection.title}</h3>
                  <p className="mt-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                    {activeSection.blockLabel}
                  </p>
                </div>
                <BookOpenCheck className="h-6 w-6 text-violet-300" aria-hidden="true" />
              </div>

              <div className="space-y-5">
                <p className="rounded-lg border border-white/10 bg-slate-950/55 p-4 text-base leading-7 text-slate-100">
                  {activeSection.excerpt}
                </p>

                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-medium text-violet-100 transition-colors hover:bg-violet-400/15"
                      >
                        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                        {activeSection.blockLabel}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-72">
                      {activeSection.annotation}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </article>

            <aside className="min-w-0 rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
              <p className="text-sm font-semibold text-amber-100">{activeSection.blockLabel}</p>
              <p className="mt-4 text-sm leading-6 text-slate-200">{activeSection.annotation}</p>
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
