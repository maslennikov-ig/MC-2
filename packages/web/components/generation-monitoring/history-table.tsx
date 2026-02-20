'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from '@/src/i18n/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ru, enUS } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  ClipboardList,
  Play,
  Shield,
  ArrowUpDown,
  X,
} from 'lucide-react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  SortingState,
  ColumnFiltersState,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { keepPreviousData } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/react'
import { cn } from '@/lib/utils'
import { buildCourseGeneratingUrl } from '@/lib/helpers/course-urls'

interface CourseHistoryItem {
  id: string
  slug: string
  org_slug: string
  generation_code: string | null
  title: string
  generation_status: string | null
  language: string | null
  difficulty: string | null
  generation_started_at: string | null
  generation_completed_at: string | null
  created_at: string | null
  error_message: string | null
  user_email: string
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400',
  stage_2_init: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_2_processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_2_complete: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_2_awaiting_approval:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  stage_3_init: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_3_summarizing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_3_complete: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_3_awaiting_approval:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  stage_4_init: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_4_analyzing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_4_complete: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_4_awaiting_approval:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  stage_5_init: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_5_generating: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_5_complete: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  stage_5_awaiting_approval:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  finalizing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400',
}

interface DurationLabels {
  lessThanMinute: string
  minutes: (count: number) => string
  hoursMinutes: (hours: number, minutes: number) => string
  inProgress: string
}

function calculateDuration(
  startedAt: string | null,
  completedAt: string | null,
  labels: DurationLabels
): string {
  if (!startedAt) return '-'
  if (!completedAt) return labels.inProgress

  const start = new Date(startedAt)
  const end = new Date(completedAt)
  const diffMs = end.getTime() - start.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return labels.lessThanMinute
  if (diffMinutes < 60) return labels.minutes(diffMinutes)
  const hours = Math.floor(diffMinutes / 60)
  const mins = diffMinutes % 60
  return labels.hoursMinutes(hours, mins)
}

// Status keys for type-safe translations
const STATUS_KEYS = [
  'pending',
  'stage_2_processing',
  'stage_3_summarizing',
  'stage_4_analyzing',
  'stage_5_generating',
  'finalizing',
  'completed',
  'failed',
  'cancelled',
] as const
type StatusKey = (typeof STATUS_KEYS)[number]

export function HistoryTable() {
  const router = useRouter()
  const t = useTranslations('admin.history')
  const locale = useLocale()
  const dateLocale = locale === 'ru' ? ru : enUS

  // Pre-compute duration labels for type safety
  const durationLabels: DurationLabels = useMemo(
    () => ({
      lessThanMinute: t('duration.lessThanMinute'),
      minutes: (count: number) => t('duration.minutes', { count }),
      hoursMinutes: (hours: number, minutes: number) =>
        t('duration.hoursMinutes', { hours, minutes }),
      inProgress: t('duration.inProgress'),
    }),
    [t]
  )

  // Pre-compute status labels for type safety
  const statusLabels = useMemo(
    () => ({
      pending: t('status.pending'),
      stage_2_processing: t('status.stage_2_processing'),
      stage_3_summarizing: t('status.stage_3_summarizing'),
      stage_4_analyzing: t('status.stage_4_analyzing'),
      stage_5_generating: t('status.stage_5_generating'),
      finalizing: t('status.finalizing'),
      completed: t('status.completed'),
      failed: t('status.failed'),
      cancelled: t('status.cancelled'),
    }),
    [t]
  )

  // Pre-compute language labels
  const languageLabels = useMemo(
    () => ({
      ru: t('languages.ru'),
      en: t('languages.en'),
    }),
    [t]
  )

  // Pre-compute difficulty labels
  const difficultyLabels = useMemo(
    () => ({
      beginner: t('difficulty.beginner'),
      intermediate: t('difficulty.intermediate'),
      advanced: t('difficulty.advanced'),
    }),
    [t]
  )

  const [pageSize, setPageSize] = useState(20)
  const [pageIndex, setPageIndex] = useState(0)
  const [globalFilter, setGlobalFilter] = useState('')
  const [debouncedFilter, setDebouncedFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Debounce search filter
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter(globalFilter)
    }, 300)
    return () => clearTimeout(timer)
  }, [globalFilter])

  const {
    data: historyData,
    isLoading: loading,
    error: queryError,
  } = trpc.admin.getGenerationHistory.useQuery(
    {
      limit: pageSize,
      offset: pageIndex * pageSize,
      search: debouncedFilter || undefined,
      status:
        statusFilter !== 'all'
          ? (statusFilter as 'pending' | 'completed' | 'failed' | 'cancelled')
          : undefined,
      language: languageFilter !== 'all' ? (languageFilter as 'ru' | 'en') : undefined,
    },
    {
      placeholderData: keepPreviousData,
    }
  )

  const data: CourseHistoryItem[] = historyData?.courses ?? []
  const totalCount = historyData?.totalCount ?? 0
  const error = queryError ? queryError.message || 'Failed to load history' : null
  const utils = trpc.useUtils()

  const columns = useMemo<ColumnDef<CourseHistoryItem>[]>(
    () => [
      {
        accessorKey: 'generation_code',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.code')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
            {row.original.generation_code || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'user_email',
        header: t('table.user'),
        cell: ({ row }) => (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {row.original.user_email}
          </span>
        ),
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.title')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'generation_status',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.status')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => {
          const status = row.original.generation_status || 'pending'
          const statusLabel = statusLabels[status as StatusKey] || status
          return (
            <Badge variant="secondary" className={cn(statusColors[status])}>
              {statusLabel}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'language',
        header: t('table.language'),
        cell: ({ row }) => {
          const lang = row.original.language as 'ru' | 'en' | null
          if (!lang) return <span className="text-gray-400 dark:text-gray-600">-</span>
          return (
            <Badge variant="outline" className="text-xs">
              {languageLabels[lang] || lang.toUpperCase()}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'difficulty',
        header: t('table.difficulty'),
        cell: ({ row }) => {
          const difficulty = row.original.difficulty as
            | 'beginner'
            | 'intermediate'
            | 'advanced'
            | null
          if (!difficulty) return <span className="text-gray-400 dark:text-gray-600">-</span>
          return (
            <Badge variant="outline" className="text-xs">
              {difficultyLabels[difficulty] || difficulty}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'generation_started_at',
        header: ({ column }) => (
          <div
            className="flex cursor-pointer items-center gap-2 select-none"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('table.started')}
            <ArrowUpDown className="h-4 w-4 text-gray-500 dark:text-gray-500" />
          </div>
        ),
        cell: ({ row }) => {
          const started = row.original.generation_started_at
          if (!started) return <span className="text-gray-400 dark:text-gray-600">-</span>
          return (
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {formatDistanceToNow(new Date(started), { addSuffix: true, locale: dateLocale })}
            </span>
          )
        },
      },
      {
        accessorKey: 'duration',
        header: t('table.duration'),
        cell: ({ row }) => {
          const duration = calculateDuration(
            row.original.generation_started_at,
            row.original.generation_completed_at,
            durationLabels
          )
          return <span className="text-sm text-gray-600 dark:text-gray-300">{duration}</span>
        },
      },
      {
        id: 'actions',
        header: t('table.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-purple-500 dark:hover:text-cyan-400"
              onClick={(e) => {
                e.stopPropagation()
                router.push(
                  buildCourseGeneratingUrl(row.original.org_slug, row.original.slug, true)
                )
              }}
              title={t('actions.openWorkflow')}
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-purple-500 dark:hover:text-cyan-400"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/admin/generation/${row.original.id}`)
              }}
              title={t('actions.adminPanel')}
            >
              <Shield className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-purple-500 dark:hover:text-cyan-400"
              onClick={(e) => {
                e.stopPropagation()
                router.push(`/admin/generation/${row.original.id}/audit`)
              }}
              title="Audit"
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [router, t, dateLocale, statusLabels, languageLabels, difficultyLabels, durationLabels]
  )

  const loadData = useCallback(() => {
    void utils.admin.getGenerationHistory.invalidate()
  }, [utils])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    pageCount: Math.ceil(totalCount / pageSize),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize })
        setPageIndex(newState.pageIndex)
        setPageSize(newState.pageSize)
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center dark:border-slate-700 dark:bg-slate-950">
        <div className="relative w-full sm:w-96">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-500" />
          <Input
            placeholder={t('filters.searchPlaceholder')}
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value)
              setPageIndex(0) // Reset to first page on search
            }}
            className="border-gray-200 bg-gray-50 pr-9 pl-9 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value)
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[200px] border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100">
              <SelectValue placeholder={t('table.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
              <SelectItem value="pending">{t('status.pending')}</SelectItem>
              <SelectItem value="stage_2_processing">{t('status.stage_2_processing')}</SelectItem>
              <SelectItem value="stage_3_summarizing">{t('status.stage_3_summarizing')}</SelectItem>
              <SelectItem value="stage_4_analyzing">{t('status.stage_4_analyzing')}</SelectItem>
              <SelectItem value="stage_5_generating">{t('status.stage_5_generating')}</SelectItem>
              <SelectItem value="finalizing">{t('status.finalizing')}</SelectItem>
              <SelectItem value="completed">{t('status.completed')}</SelectItem>
              <SelectItem value="failed">{t('status.failed')}</SelectItem>
              <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={languageFilter}
            onValueChange={(value) => {
              setLanguageFilter(value)
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[160px] border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100">
              <SelectValue placeholder={t('table.language')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allLanguages')}</SelectItem>
              <SelectItem value="ru">{t('languages.ru')}</SelectItem>
              <SelectItem value="en">{t('languages.en')}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={loadData}
            disabled={loading}
            className="border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900"
          >
            <Loader2
              className={cn('h-4 w-4 text-gray-500 dark:text-gray-500', loading && 'animate-spin')}
            />
          </Button>
        </div>
      </div>

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
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-500 dark:text-gray-500" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-32 text-center text-red-500 dark:text-red-400"
                  >
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-500">
                      <FileSearch className="h-8 w-8" />
                      <div className="font-medium">{t('empty.title')}</div>
                      <div className="text-sm text-gray-400 dark:text-gray-600">
                        {t('empty.subtitle')}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors even:bg-gray-50 hover:bg-gray-100 dark:even:bg-slate-900/50 dark:hover:bg-slate-800"
                    onClick={() =>
                      router.push(
                        buildCourseGeneratingUrl(row.original.org_slug, row.original.slug, true)
                      )
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="p-4 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {t('pagination.showing', {
            from: pageIndex * pageSize + 1,
            to: Math.min((pageIndex + 1) * pageSize, totalCount),
            total: totalCount,
          })}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPageIndex(0)
            }}
          >
            <SelectTrigger className="w-[100px] border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0 || loading}
            className="border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageIndex((p) => p + 1)}
            disabled={pageIndex >= Math.ceil(totalCount / pageSize) - 1 || loading}
            className="border-gray-200 bg-gray-50 text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
          >
            {t('pagination.next')}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
