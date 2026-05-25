'use client'

import { useMemo, useState } from 'react'
import { Boxes, GitBranch, IdCard, Network, ShieldCheck, UsersRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CareerPlaybookMethodology {
  id: string
  title: string
  description: string
  affectedBlocks: string[]
}

export interface CareerPlaybookBlockItem {
  id: string
  label: string
}

export interface CareerPlaybookBlockGroup {
  title: string
  blocks: CareerPlaybookBlockItem[]
}

interface MethodologySectionProps {
  eyebrow: string
  title: string
  subtitle: string
  blocksTitle: string
  selectedBlocksLabel: string
  methodologies: CareerPlaybookMethodology[]
  blockGroups: CareerPlaybookBlockGroup[]
}

const iconByMethodology: Record<string, typeof Network> = {
  netflix: Network,
  amazon: ShieldCheck,
  toyota: Boxes,
  spotify: GitBranch,
  bridgewater: IdCard,
  google: UsersRound,
}

export function MethodologySection({
  eyebrow,
  title,
  subtitle,
  blocksTitle,
  selectedBlocksLabel,
  methodologies,
  blockGroups,
}: MethodologySectionProps) {
  const [activeMethodologyId, setActiveMethodologyId] = useState(methodologies[0]?.id ?? '')
  const activeMethodology = useMemo(
    () => methodologies.find((methodology) => methodology.id === activeMethodologyId),
    [activeMethodologyId, methodologies]
  )

  return (
    <section
      id="methodology"
      aria-labelledby="career-playbook-methodology-title"
      className="relative z-10 border-t border-white/10 bg-slate-950/92 px-4 py-16 text-white md:py-20"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="mb-3 text-sm font-semibold text-cyan-200">{eyebrow}</p>
            <h2
              id="career-playbook-methodology-title"
              className="max-w-xl text-3xl font-bold text-white md:text-4xl"
            >
              {title}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">{subtitle}</p>

            {activeMethodology && (
              <div className="mt-8 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
                <p className="text-sm font-semibold text-cyan-100">{selectedBlocksLabel}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeMethodology.affectedBlocks.map((block) => (
                    <Badge
                      key={`${activeMethodology.id}-${block}`}
                      variant="secondary"
                      className="rounded-md border border-white/10 bg-white/10 text-slate-100"
                    >
                      {block}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {methodologies.map((methodology) => {
              const Icon = iconByMethodology[methodology.id] ?? Network
              const isActive = methodology.id === activeMethodologyId

              return (
                <Button
                  key={methodology.id}
                  type="button"
                  variant="ghost"
                  data-testid="career-playbook-methodology-card"
                  className={cn(
                    'h-auto min-h-36 min-w-0 justify-start rounded-lg border p-5 text-left transition-colors',
                    'border-white/10 bg-white/5 text-white hover:border-cyan-300/40 hover:bg-white/10',
                    isActive && 'border-cyan-300/60 bg-cyan-300/15'
                  )}
                  onClick={() => setActiveMethodologyId(methodology.id)}
                >
                  <span className="flex w-full min-w-0 gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900/80 text-cyan-200">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base leading-6 font-semibold whitespace-normal text-white">
                        {methodology.title}
                      </span>
                      <span className="mt-2 block text-sm leading-6 whitespace-normal text-slate-300">
                        {methodology.description}
                      </span>
                    </span>
                  </span>
                </Button>
              )
            })}
          </div>
        </div>

        <div className="mt-14 rounded-lg border border-white/10 bg-white/5 p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-white">{blocksTitle}</h3>
            <Badge className="rounded-md bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/15">
              26
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {blockGroups.map((group) => (
              <div
                key={group.title}
                className="rounded-lg border border-white/10 bg-slate-950/60 p-4"
              >
                <p className="mb-3 text-sm font-semibold text-slate-200">{group.title}</p>
                <div className="flex flex-wrap gap-2">
                  {group.blocks.map((block) => (
                    <span
                      key={block.id}
                      data-testid="career-playbook-block-chip"
                      className="min-h-8 rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs leading-5 text-slate-200"
                    >
                      {block.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
