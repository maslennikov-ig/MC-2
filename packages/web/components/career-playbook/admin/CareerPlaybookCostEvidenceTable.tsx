import { Fragment } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface CareerPlaybookCostNodeEvidence {
  stage: string
  node: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
}

export interface CareerPlaybookCostPlaybookEvidence {
  playbookId: string
  title: string | null
  status: string
  costBreakdownValid: boolean
  language: string
  organizationId: string
  userId: string
  createdAt: string | null
  completedAt: string | null
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  nodes: CareerPlaybookCostNodeEvidence[]
}

export interface CareerPlaybookCostEvidence {
  totalCount: number
  pageCount: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  playbooks: CareerPlaybookCostPlaybookEvidence[]
}

interface CareerPlaybookCostEvidenceTableProps {
  evidence: CareerPlaybookCostEvidence
  locale: string
  emptyLabel?: string
  labels?: Partial<CareerPlaybookCostEvidenceLabels>
}

interface CareerPlaybookCostEvidenceLabels {
  playbooks: string
  playbookSingular: string
  playbookPlural: string
  totalCost: string
  tokens: string
  inputOutput: string
  stage: string
  node: string
  model: string
  input: string
  output: string
  cost: string
  created: string
  invalidCostBreakdown: string
}

const DASH = '-'
const DEFAULT_LABELS: CareerPlaybookCostEvidenceLabels = {
  playbooks: 'Playbooks',
  playbookSingular: 'playbook',
  playbookPlural: 'playbooks',
  totalCost: 'Total cost',
  tokens: 'Tokens',
  inputOutput: 'Input / output',
  stage: 'Stage',
  node: 'Node',
  model: 'Model',
  input: 'Input',
  output: 'Output',
  cost: 'Cost',
  created: 'Created',
  invalidCostBreakdown: 'Invalid cost data',
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return DASH

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function playbookLabel(
  pageCount: number,
  totalCount: number,
  labels: CareerPlaybookCostEvidenceLabels
): string {
  const noun = totalCount === 1 ? labels.playbookSingular : labels.playbookPlural
  if (pageCount === totalCount) {
    return `${totalCount} ${noun}`
  }

  return `${pageCount} of ${totalCount} ${noun}`
}

export function CareerPlaybookCostEvidenceTable({
  evidence,
  locale,
  emptyLabel = 'No Career Playbook costs found',
  labels: labelOverrides,
}: CareerPlaybookCostEvidenceTableProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }

  if (evidence.playbooks.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-300">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {labels.playbooks}
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {playbookLabel(evidence.pageCount, evidence.totalCount, labels)}
          </div>
        </div>
        <div className="rounded-md border bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {labels.totalCost}
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatUsd(evidence.totalCostUsd)}
          </div>
        </div>
        <div className="rounded-md border bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {labels.tokens}
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatNumber(evidence.totalTokens, locale)}
          </div>
        </div>
        <div className="rounded-md border bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {labels.inputOutput}
          </div>
          <div className="mt-1 text-2xl font-semibold text-gray-950 dark:text-gray-50">
            {formatNumber(evidence.totalInputTokens, locale)} /{' '}
            {formatNumber(evidence.totalOutputTokens, locale)}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white dark:border-slate-800 dark:bg-slate-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.stage}</TableHead>
              <TableHead>{labels.node}</TableHead>
              <TableHead>{labels.model}</TableHead>
              <TableHead className="text-right">{labels.input}</TableHead>
              <TableHead className="text-right">{labels.output}</TableHead>
              <TableHead className="text-right">{labels.tokens}</TableHead>
              <TableHead className="text-right">{labels.cost}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evidence.playbooks.map((playbook) => (
              <Fragment key={playbook.playbookId}>
                <TableRow className="bg-gray-50 hover:bg-gray-50 dark:bg-slate-900/60 dark:hover:bg-slate-900/60">
                  <TableCell colSpan={3}>
                    <div className="max-w-[32rem] space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-gray-950 dark:text-gray-50">
                          {playbook.title || playbook.playbookId}
                        </span>
                        <Badge variant="outline" className="capitalize">
                          {playbook.status}
                        </Badge>
                        {!playbook.costBreakdownValid && (
                          <Badge variant="destructive">{labels.invalidCostBreakdown}</Badge>
                        )}
                      </div>
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {playbook.playbookId}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {labels.created} {formatDate(playbook.createdAt, locale)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(playbook.totalInputTokens, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(playbook.totalOutputTokens, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(playbook.totalTokens, locale)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatUsd(playbook.totalCostUsd)}
                  </TableCell>
                </TableRow>
                {playbook.nodes.map((node) => (
                  <TableRow key={`${playbook.playbookId}-${node.stage}-${node.node}`}>
                    <TableCell>{node.stage}</TableCell>
                    <TableCell className="font-mono text-xs">{node.node}</TableCell>
                    <TableCell className="max-w-[18rem] truncate">{node.model}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(node.inputTokens, locale)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(node.outputTokens, locale)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(node.totalTokens, locale)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatUsd(node.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
