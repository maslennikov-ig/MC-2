'use client'

import { useMemo, useState } from 'react'
import { BookOpenCheck, FileText, MessageSquareText } from 'lucide-react'

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

interface InteractiveDemoProps {
  eyebrow: string
  title: string
  subtitle: string
  previewTitle: string
  sections: CareerPlaybookDemoSection[]
}

export function InteractiveDemo({
  eyebrow,
  title,
  subtitle,
  previewTitle,
  sections,
}: InteractiveDemoProps) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? '')
  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) ?? sections[0],
    [activeSectionId, sections]
  )

  if (!activeSection) {
    return null
  }

  return (
    <section
      aria-labelledby="career-playbook-demo-title"
      className="relative z-10 border-t border-white/10 bg-slate-950 px-4 py-16 text-white md:py-20"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold text-amber-200">{eyebrow}</p>
          <h2 id="career-playbook-demo-title" className="text-3xl font-bold md:text-4xl">
            {title}
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-300">{subtitle}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="grid content-start gap-2">
            {sections.map((section) => {
              const isActive = section.id === activeSection.id

              return (
                <Button
                  key={section.id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-auto min-h-16 justify-start rounded-lg border p-4 text-left',
                    'border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/40 hover:bg-white/10',
                    isActive && 'border-amber-300/60 bg-amber-300/15 text-white'
                  )}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span className="flex items-start gap-3">
                    <FileText
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-200"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-semibold">{section.title}</span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {section.blockLabel}
                      </span>
                    </span>
                  </span>
                </Button>
              )
            })}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <article className="min-h-[26rem] rounded-lg border border-white/10 bg-white/95 p-6 text-slate-950 shadow-2xl md:p-8">
              <div className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">{previewTitle}</p>
                  <h3 className="mt-1 text-2xl font-bold text-slate-950">{activeSection.title}</h3>
                </div>
                <BookOpenCheck className="h-6 w-6 text-violet-600" aria-hidden="true" />
              </div>

              <div className="space-y-5">
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-base leading-7 text-slate-800">
                  {activeSection.excerpt}
                </p>

                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100"
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

            <aside className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
              <p className="text-sm font-semibold text-amber-100">{activeSection.blockLabel}</p>
              <p className="mt-4 text-sm leading-6 text-slate-200">{activeSection.annotation}</p>
            </aside>
          </div>
        </div>
      </div>
    </section>
  )
}
