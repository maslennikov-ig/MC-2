'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { keepPreviousData } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc/react'
import { AuditSummary, type AuditSummaryData } from './audit-summary'
import { AuditFilterBar, type AuditFilters } from './audit-filter-bar'
import { AuditTable } from './audit-table'
import { AuditDetailSheet } from './audit-detail-sheet'

interface AuditClientProps {
  courseId: string
}

const DEFAULT_PAGE_SIZE = 50

/** Format duration in ms to human-readable */
function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${minutes}m ${secs}s`
}

/** Compute generation duration from course timestamps */
function computeCourseDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const ms = end - start
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

export function AuditClient({ courseId }: AuditClientProps) {
  const [filters, setFilters] = useState<AuditFilters>({})
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortBy, setSortBy] = useState<
    'created_at' | 'tokens_used' | 'cost_usd' | 'duration_ms' | 'stage' | 'model_used'
  >('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>()

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 300)
    return () => clearTimeout(t)
  }, [filters.search])

  const summaryQuery = trpc.admin.getAuditSummary.useQuery({ courseId })
  const tracesQuery = trpc.admin.getAuditTraces.useQuery(
    {
      courseId,
      ...filters,
      search: debouncedSearch,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset: pageIndex * pageSize,
    },
    { placeholderData: keepPreviousData }
  )

  const handleFilterChange = useCallback((newFilters: AuditFilters) => {
    setFilters(newFilters)
    setPageIndex(0)
  }, [])

  const handleRowClick = useCallback((traceId: string) => {
    setSelectedTraceId(traceId)
  }, [])

  const handleCloseSheet = useCallback(() => {
    setSelectedTraceId(null)
  }, [])

  const handlePageChange = useCallback((newPageIndex: number) => {
    setPageIndex(newPageIndex)
  }, [])

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPageIndex(0)
  }, [])

  const handleSortChange = useCallback((newSortBy: string, newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy as typeof sortBy)
    setSortOrder(newSortOrder)
    setPageIndex(0)
  }, [])

  // Transform backend summary data to AuditSummaryData shape
  const summaryData: AuditSummaryData | undefined = useMemo(() => {
    const raw = summaryQuery.data
    if (!raw) return undefined

    const course = raw.course as {
      generation_started_at?: string | null
      generation_completed_at?: string | null
    } | null

    return {
      totalTraces: raw.totals.traceCount,
      totalCost: raw.totals.totalCost,
      totalTokens: raw.totals.totalTokens,
      duration: computeCourseDuration(
        course?.generation_started_at ?? null,
        course?.generation_completed_at ?? null
      ),
      totalErrors: raw.totals.errorCount,
      totalRetries: raw.totals.retryCount,
      modelUsage: raw.modelBreakdown.map((m) => ({
        model: m.model,
        calls: m.calls,
        tokens: m.tokens,
        cost: m.cost,
      })),
      stageBreakdown: raw.stageBreakdown.map((s) => ({
        stage: s.stage,
        calls: s.calls,
        tokens: s.tokens,
        cost: s.cost,
        duration: formatDurationMs(s.duration),
        errors: s.errors,
      })),
    }
  }, [summaryQuery.data])

  // Build filter options from summary data
  const filterOptions = useMemo(
    () => ({
      stages: summaryQuery.data?.filterOptions?.stages ?? [],
      phases: summaryQuery.data?.filterOptions?.phases ?? [],
      models: summaryQuery.data?.filterOptions?.models ?? [],
      lessons: (summaryQuery.data?.filterOptions?.lessons ?? []).map((l) => ({
        id: l.id,
        title: l.title,
      })),
    }),
    [summaryQuery.data]
  )

  // Build lesson title record for stable reference (H7)
  const lessonTitleRecord = useMemo(() => {
    const lessons = summaryQuery.data?.filterOptions?.lessons ?? []
    const record: Record<string, string> = {}
    for (const l of lessons) record[l.id] = l.title
    return record
  }, [summaryQuery.data?.filterOptions?.lessons])

  if (summaryQuery.error || tracesQuery.error) {
    const errorMsg = summaryQuery.error?.message || tracesQuery.error?.message || 'Unknown error'
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2">
        <AlertTriangle className="h-8 w-8 text-red-500" />
        <p className="font-medium text-red-500">Failed to load audit data</p>
        <p className="text-muted-foreground text-sm">{errorMsg}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col space-y-6">
      <AuditSummary data={summaryData} isLoading={summaryQuery.isLoading} />

      <AuditFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        filterOptions={filterOptions}
      />

      <AuditTable
        traces={tracesQuery.data?.traces ?? []}
        totalCount={tracesQuery.data?.totalCount ?? 0}
        isLoading={tracesQuery.isLoading}
        pageIndex={pageIndex}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRowClick={handleRowClick}
        lessonTitleMap={new Map(Object.entries(lessonTitleRecord))}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />

      <AuditDetailSheet
        traceId={selectedTraceId}
        courseId={courseId}
        open={selectedTraceId !== null}
        onClose={handleCloseSheet}
      />
    </div>
  )
}
