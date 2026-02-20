'use client'

import { useCallback, useMemo } from 'react'
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSearch,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface AuditTrace {
  id: string
  stage: string
  phase: string
  step_name: string
  model_used: string | null
  lesson_id: string | null
  tokens_used: number | null
  cost_usd: number | null
  duration_ms: number | null
  error_data: unknown
  retry_attempt: number | null
  quality_score: number | null
  temperature: number | null
  was_cached: boolean | null
  created_at: string
}

interface AuditTableProps {
  traces: AuditTrace[]
  totalCount: number
  isLoading: boolean
  pageIndex: number
  pageSize: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  onRowClick: (traceId: string) => void
  lessonTitleMap?: Map<string, string>
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void
}

const stageColors: Record<string, string> = {
  stage_2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_3: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  stage_4: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  stage_5: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  stage_6: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
}

function getStageColor(stage: string): string {
  // Match exact or prefix (e.g. "stage_2" or "stage_2_init")
  for (const [key, color] of Object.entries(stageColors)) {
    if (stage === key || stage.startsWith(key + '_')) return color
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

/** Extract short model name from provider/model format (e.g. "moonshotai/kimi-k2-thinking" -> "kimi-k2-thinking") */
function shortModelName(model: string | null): string {
  if (!model) return '-'
  const parts = model.split('/')
  return parts.length > 1 ? parts[parts.length - 1] : model
}

/** Format duration in ms to human-readable (e.g. "1.2s", "45s") */
function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.round(seconds)}s`
}

export function AuditTable({
  traces,
  totalCount,
  isLoading,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  lessonTitleMap,
  sortBy,
  sortOrder,
  onSortChange,
}: AuditTableProps) {
  const sortableHeader = useCallback(
    (key: string, label: string) => {
      const active = sortBy === key
      return (
        <button
          className="hover:text-foreground flex items-center gap-1"
          onClick={() => onSortChange(key, active && sortOrder === 'desc' ? 'asc' : 'desc')}
        >
          {label}
          {active ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-30" />
          )}
        </button>
      )
    },
    [sortBy, sortOrder, onSortChange]
  )

  const columns = useMemo<ColumnDef<AuditTrace>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: () => sortableHeader('created_at', 'Time'),
        cell: ({ row }) => {
          const dateStr = row.original.created_at
          const date = new Date(dateStr)
          return (
            <span
              className="cursor-default font-mono text-xs text-gray-700 dark:text-gray-300"
              title={format(date, 'yyyy-MM-dd HH:mm:ss.SSS')}
            >
              {format(date, 'HH:mm:ss')}
            </span>
          )
        },
      },
      {
        accessorKey: 'stage',
        header: () => sortableHeader('stage', 'Stage'),
        cell: ({ row }) => (
          <Badge variant="secondary" className={cn('text-xs', getStageColor(row.original.stage))}>
            {row.original.stage}
          </Badge>
        ),
      },
      {
        accessorKey: 'phase',
        header: 'Phase',
        cell: ({ row }) => (
          <span
            className="block max-w-[120px] truncate text-sm text-gray-600 dark:text-gray-300"
            title={row.original.phase}
          >
            {row.original.phase}
          </span>
        ),
      },
      {
        accessorKey: 'step_name',
        header: 'Step',
        cell: ({ row }) => (
          <span
            className="block max-w-[140px] truncate text-sm text-gray-600 dark:text-gray-300"
            title={row.original.step_name}
          >
            {row.original.step_name}
          </span>
        ),
      },
      {
        accessorKey: 'model_used',
        header: () => sortableHeader('model_used', 'Model'),
        cell: ({ row }) => (
          <span
            className="block max-w-[150px] truncate font-mono text-xs text-gray-700 dark:text-gray-300"
            title={row.original.model_used || undefined}
          >
            {shortModelName(row.original.model_used)}
          </span>
        ),
      },
      {
        accessorKey: 'lesson_id',
        header: 'Lesson',
        cell: ({ row }) => {
          const lessonId = row.original.lesson_id
          if (!lessonId) return <span className="text-muted-foreground">-</span>
          const title = lessonTitleMap?.get(lessonId)
          return (
            <span
              className="block max-w-[140px] truncate text-sm text-gray-600 dark:text-gray-300"
              title={title || lessonId}
            >
              {title || lessonId.substring(0, 8)}
            </span>
          )
        },
      },
      {
        accessorKey: 'tokens_used',
        header: () => sortableHeader('tokens_used', 'Tokens'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
            {row.original.tokens_used !== null ? row.original.tokens_used.toLocaleString() : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'cost_usd',
        header: () => sortableHeader('cost_usd', 'Cost'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
            {row.original.cost_usd !== null ? `$${row.original.cost_usd.toFixed(5)}` : '-'}
          </span>
        ),
      },
      {
        accessorKey: 'duration_ms',
        header: () => sortableHeader('duration_ms', 'Duration'),
        cell: ({ row }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {formatDurationMs(row.original.duration_ms)}
          </span>
        ),
      },
      {
        accessorKey: 'retry_attempt',
        header: 'Retry',
        cell: ({ row }) => {
          const retry = row.original.retry_attempt
          if (!retry || retry === 0) return <span className="text-muted-foreground">-</span>
          return (
            <Badge
              variant="secondary"
              className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            >
              {retry}
            </Badge>
          )
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const hasError = row.original.error_data !== null && row.original.error_data !== undefined
          return hasError ? (
            <Badge
              variant="secondary"
              className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            >
              Error
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            >
              OK
            </Badge>
          )
        },
      },
    ],
    [lessonTitleMap, sortableHeader]
  )

  const pageCount = Math.ceil(totalCount / pageSize)

  const table = useReactTable({
    data: traces,
    columns,
    state: {
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    pageCount,
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize })
        onPageChange(newState.pageIndex)
        onPageSizeChange(newState.pageSize)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="h-12 px-4 text-left align-middle font-medium text-gray-600 dark:text-gray-300"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {isLoading && traces.length === 0 ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((_, colIdx) => (
                      <td key={colIdx} className="p-4 align-middle">
                        <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : traces.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-500">
                      <FileSearch className="h-8 w-8" />
                      <div className="font-medium">No traces found</div>
                      <div className="text-sm text-gray-400 dark:text-gray-600">
                        Adjust your filters or wait for new generation traces
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const hasError =
                    row.original.error_data !== null && row.original.error_data !== undefined
                  const hasRetry =
                    row.original.retry_attempt !== null && row.original.retry_attempt > 0

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-slate-800',
                        hasError && 'bg-red-50 dark:bg-red-950/20',
                        !hasError && hasRetry && 'bg-yellow-50 dark:bg-yellow-950/20'
                      )}
                      onClick={() => onRowClick(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="p-4 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {totalCount > 0
            ? `${pageIndex * pageSize + 1}-${Math.min((pageIndex + 1) * pageSize, totalCount)} of ${totalCount.toLocaleString()} total`
            : 'No results'}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSizeChange(Number(value))
              onPageChange(0)
            }}
          >
            <SelectTrigger className="w-[100px] border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
            disabled={pageIndex === 0 || isLoading}
            className="border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={totalCount === 0 || pageIndex >= pageCount - 1 || isLoading}
            className="border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
