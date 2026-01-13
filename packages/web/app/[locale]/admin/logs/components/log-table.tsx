'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { listLogsAction } from '@/app/actions/admin-logs'
import { SeverityBadge } from './severity-badge'
import type {
  UnifiedLogItem,
  LogFilters,
  LogType,
  LogStatus,
  LogListResponse,
} from '@/app/actions/admin-logs'

/** Debounce timeout for filters in milliseconds */
const FILTER_DEBOUNCE_MS = 300

/** Auto-refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL_MS = 5000

interface LogTableProps {
  filters: LogFilters
  selectedItems: Array<{ logType: LogType; logId: string }>
  onRowSelect: (item: UnifiedLogItem, selected: boolean) => void
  onSelectAll: (items: UnifiedLogItem[], selected: boolean) => void
  onRowClick: (item: UnifiedLogItem) => void
}

type SortField = 'created_at' | 'severity'
type SortDirection = 'asc' | 'desc'

/**
 * Log data table with sorting, selection, and pagination
 */
export function LogTable({
  filters,
  selectedItems,
  onRowSelect,
  onSelectAll,
  onRowClick,
}: LogTableProps) {
  const t = useTranslations('admin.logs')

  // Data state
  const [data, setData] = useState<UnifiedLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [error, setError] = useState<string | null>(null)

  // Sort state
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Load data function
  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const result: LogListResponse = await listLogsAction({
          page,
          limit: pageSize,
          filters,
          sort: {
            field: sortField,
            direction: sortDirection,
          },
        })

        // Check if request was aborted before setting state
        if (signal?.aborted) {
          return
        }

        setData(result.items)
        setTotalCount(result.total)
      } catch (err) {
        // Don't show error if request was aborted
        if (signal?.aborted) {
          return
        }

        console.error('Failed to fetch logs', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to load logs'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        // Don't update loading state if request was aborted
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [page, pageSize, filters, sortField, sortDirection]
  )

  // Ref to hold latest loadData for polling (avoids interval restart on filter change)
  const loadDataRef = useRef(loadData)
  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  // Initial load and filter change with debounce
  useEffect(() => {
    const abortController = new AbortController()

    const timer = setTimeout(() => {
      void loadData(abortController.signal)
    }, FILTER_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      abortController.abort()
    }
  }, [loadData])

  // Auto-refresh polling - uses ref to avoid restarting interval on filter changes
  useEffect(() => {
    const interval = setInterval(() => {
      void loadDataRef.current()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, []) // Empty deps - interval set once, uses latest loadData via ref

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filters])

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / pageSize)

  // Check if all current items are selected
  const allSelected = useMemo(() => {
    if (data.length === 0) return false
    return data.every((item) =>
      selectedItems.some((s) => s.logId === item.id && s.logType === item.logType)
    )
  }, [data, selectedItems])

  // Check if item is selected
  const isSelected = useCallback(
    (item: UnifiedLogItem) => {
      return selectedItems.some((s) => s.logId === item.id && s.logType === item.logType)
    },
    [selectedItems]
  )

  // Toggle sort
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDirection('desc')
      }
    },
    [sortField]
  )

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="ml-1 inline h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 inline h-4 w-4" />
    )
  }

  // Get status badge
  const getStatusBadge = (status: LogStatus) => {
    switch (status) {
      case 'new':
        return (
          <Badge
            variant="secondary"
            className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400"
          >
            {t('status.new')}
          </Badge>
        )
      case 'in_progress':
        return (
          <Badge
            variant="secondary"
            className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400"
          >
            {t('status.in_progress')}
          </Badge>
        )
      case 'resolved':
        return (
          <Badge
            variant="secondary"
            className="bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400"
          >
            {t('status.resolved')}
          </Badge>
        )
      case 'ignored':
        return (
          <Badge
            variant="secondary"
            className="bg-gray-500/10 text-gray-600 hover:bg-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400"
          >
            {t('status.ignored')}
          </Badge>
        )
      case 'to_verify':
        return (
          <Badge
            variant="secondary"
            className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400"
          >
            To Verify
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  // Get environment badge
  const getEnvironmentBadge = (environment: string | null) => {
    if (!environment) return null

    return (
      <Badge
        variant={environment === 'dev' ? 'outline' : 'secondary'}
        className={
          environment === 'dev'
            ? 'border-blue-500 text-blue-500'
            : 'bg-purple-500/10 text-purple-600'
        }
      >
        {environment}
      </Badge>
    )
  }

  // Truncate message
  const truncateMessage = (message: string, maxLength: number = 80) => {
    if (message.length <= maxLength) return message
    return message.substring(0, maxLength) + '...'
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Table */}
      <div className="bg-card min-h-0 flex-1 overflow-hidden rounded-md border shadow-sm">
        <div className="relative h-full w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="bg-card sticky top-0 z-10 [&_tr]:border-b">
              <tr className="hover:bg-muted/50 border-b transition-colors">
                {/* Select all checkbox */}
                <th className="h-12 w-12 px-4 align-middle">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => onSelectAll(data, !!checked)}
                    aria-label="Select all"
                    disabled={data.length === 0}
                  />
                </th>
                {/* Problem ID */}
                <th className="text-muted-foreground h-12 w-[140px] px-4 text-left align-middle font-medium">
                  Problem ID
                </th>
                {/* Timestamp */}
                <th
                  className="text-muted-foreground hover:text-foreground h-12 cursor-pointer px-4 text-left align-middle font-medium transition-colors"
                  onClick={() => toggleSort('created_at')}
                >
                  {t('table.timestamp')}
                  {renderSortIndicator('created_at')}
                </th>
                {/* Level */}
                <th
                  className="text-muted-foreground hover:text-foreground h-12 cursor-pointer px-4 text-left align-middle font-medium transition-colors"
                  onClick={() => toggleSort('severity')}
                >
                  {t('table.level')}
                  {renderSortIndicator('severity')}
                </th>
                {/* Source */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.source')}
                </th>
                {/* Message */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.message')}
                </th>
                {/* Course */}
                <th className="text-muted-foreground hidden h-12 px-4 text-left align-middle font-medium lg:table-cell">
                  {t('table.course')}
                </th>
                {/* Status */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.status')}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="h-24 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted-foreground h-24 text-center">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={`${item.logType}-${item.id}`}
                    className={cn(
                      'hover:bg-muted/50 cursor-pointer border-b transition-colors',
                      isSelected(item) && 'bg-muted/30'
                    )}
                    onClick={() => onRowClick(item)}
                  >
                    {/* Checkbox */}
                    <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected(item)}
                        onCheckedChange={(checked) => onRowSelect(item, !!checked)}
                        aria-label={`Select log ${item.id}`}
                      />
                    </td>
                    {/* Problem ID */}
                    <td className="p-4 align-middle">
                      <span className="text-primary font-mono text-sm font-semibold">
                        {item.problemId || '-'}
                      </span>
                    </td>
                    {/* Timestamp */}
                    <td className="text-muted-foreground p-4 align-middle whitespace-nowrap">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                    {/* Level */}
                    <td className="p-4 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={item.severity} />
                        {getEnvironmentBadge(item.environment)}
                      </div>
                    </td>
                    {/* Source */}
                    <td className="p-4 align-middle">
                      <span className="bg-muted rounded px-2 py-1 font-mono text-xs">
                        {item.source || item.logType}
                      </span>
                    </td>
                    {/* Message */}
                    <td className="max-w-[300px] p-4 align-middle">
                      <span className="text-sm" title={item.message}>
                        {truncateMessage(item.message)}
                      </span>
                    </td>
                    {/* Course */}
                    <td className="hidden p-4 align-middle lg:table-cell">
                      {item.courseId ? (
                        <span
                          className="text-muted-foreground font-mono text-xs"
                          title={item.courseId}
                        >
                          {item.courseId.substring(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="p-4 align-middle">{getStatusBadge(item.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground text-sm">
          {totalCount > 0 && (
            <>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of{' '}
              {totalCount} results
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || totalPages === 0 || loading}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
