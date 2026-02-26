'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Coins,
  BrainCircuit,
  Timer,
  Activity,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useState } from 'react'

export interface ModelUsageRow {
  model: string
  calls: number
  tokens: number
  cost: number
}

export interface StageBreakdownRow {
  stage: string
  calls: number
  tokens: number
  cost: number
  duration: string
  errors: number
}

export interface AuditSummaryData {
  totalTraces: number
  totalCost: number
  totalTokens: number
  duration: string
  totalErrors: number
  totalRetries: number
  modelUsage: ModelUsageRow[]
  stageBreakdown: StageBreakdownRow[]
}

interface AuditSummaryProps {
  data: AuditSummaryData | undefined
  isLoading: boolean
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export function AuditSummary({ data, isLoading }: AuditSummaryProps) {
  const [modelUsageOpen, setModelUsageOpen] = useState(false)
  const [stageBreakdownOpen, setStageBreakdownOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="mb-1 h-7 w-24" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!data) return null

  const stats = [
    {
      title: 'Traces',
      value: data.totalTraces.toLocaleString(),
      subtitle: 'Total LLM calls',
      icon: Activity,
      className: '',
    },
    {
      title: 'Total Cost',
      value: `$${data.totalCost.toFixed(4)}`,
      subtitle: 'Cumulative LLM cost',
      icon: Coins,
      className: '',
    },
    {
      title: 'Total Tokens',
      value: data.totalTokens.toLocaleString(),
      subtitle: 'Tokens processed',
      icon: BrainCircuit,
      className: '',
    },
    {
      title: 'Duration',
      value: data.duration,
      subtitle: 'Generation time',
      icon: Timer,
      className: '',
    },
    {
      title: 'Errors',
      value: data.totalErrors.toLocaleString(),
      subtitle: 'Failed calls',
      icon: AlertTriangle,
      className: data.totalErrors > 0 ? 'text-red-500' : '',
    },
    {
      title: 'Retries',
      value: data.totalRetries.toLocaleString(),
      subtitle: 'Retried calls',
      icon: RefreshCw,
      className: data.totalRetries > 0 ? 'text-yellow-500' : '',
    },
  ]

  return (
    <div className="space-y-4">
      <motion.div
        className="grid gap-4 md:grid-cols-3 lg:grid-cols-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {stats.map((stat) => (
          <motion.div key={stat.title} variants={item}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className={cn('text-2xl font-bold', stat.className)}>{stat.value}</div>
                <p className="text-muted-foreground text-xs">{stat.subtitle}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Model Usage Collapsible */}
      <Collapsible open={modelUsageOpen} onOpenChange={setModelUsageOpen}>
        <CollapsibleTrigger className="bg-card hover:bg-muted/50 flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium transition-colors dark:border-slate-700">
          <span>Model Usage</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              modelUsageOpen && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="bg-card mt-1 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-muted-foreground px-4 py-2 text-left font-medium">Model</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Calls</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Tokens</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.modelUsage.map((row) => (
                  <tr
                    key={row.model}
                    className="border-b border-gray-200 last:border-0 dark:border-slate-700"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-2 text-right">{row.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{row.tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">${row.cost.toFixed(4)}</td>
                  </tr>
                ))}
                {data.modelUsage.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground px-4 py-4 text-center">
                      No model usage data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Stage Breakdown Collapsible */}
      <Collapsible open={stageBreakdownOpen} onOpenChange={setStageBreakdownOpen}>
        <CollapsibleTrigger className="bg-card hover:bg-muted/50 flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium transition-colors dark:border-slate-700">
          <span>Stage Breakdown</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              stageBreakdownOpen && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="bg-card mt-1 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-muted-foreground px-4 py-2 text-left font-medium">Stage</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Calls</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Tokens</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Cost</th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                    Duration
                  </th>
                  <th className="text-muted-foreground px-4 py-2 text-right font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {data.stageBreakdown.map((row) => (
                  <tr
                    key={row.stage}
                    className="border-b border-gray-200 last:border-0 dark:border-slate-700"
                  >
                    <td className="px-4 py-2 font-medium">{row.stage}</td>
                    <td className="px-4 py-2 text-right">{row.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{row.tokens.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">${row.cost.toFixed(4)}</td>
                    <td className="text-muted-foreground px-4 py-2 text-right">{row.duration}</td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right',
                        row.errors > 0 && 'font-medium text-red-500'
                      )}
                    >
                      {row.errors}
                    </td>
                  </tr>
                ))}
                {data.stageBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-4 py-4 text-center">
                      No stage breakdown data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
