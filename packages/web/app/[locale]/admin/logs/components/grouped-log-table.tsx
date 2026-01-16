'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { SeverityBadge } from './severity-badge'
import {
  listGroupedLogsAction,
  type LogFilters,
  type LogStatus,
  type ErrorGroupItem,
} from '@/app/actions/admin-logs'

/** Debounce timeout for filters in milliseconds */
const FILTER_DEBOUNCE_MS = 300

// Extend ErrorGroupItem with computed fields for UI
interface GroupedLogItem extends Omit<ErrorGroupItem, 'latestProblemId'> {
  problemId: string | null
}

interface GroupedLogTableProps {
  filters: LogFilters
  onGroupSelect?: (group: GroupedLogItem) => void
  /** Optional trigger to force a data refresh - increment to trigger reload */
  triggerRefresh?: number
}

/**
 * Grouped log data table showing errors grouped by fingerprint with occurrence count
 */
export function GroupedLogTable({ filters, onGroupSelect, triggerRefresh }: GroupedLogTableProps) {
  const t = useTranslations('admin.logs')

  // Data state
  const [data, setData] = useState<GroupedLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [error, setError] = useState<string | null>(null)

  // Expanded rows state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Selected groups state
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  // Load data function - calls real backend API
  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const result = await listGroupedLogsAction({
          page,
          limit: pageSize,
          filters,
        })

        if (signal?.aborted) {
          return
        }

        // Transform API response to UI format
        const items: GroupedLogItem[] = result.items.map((item) => ({
          ...item,
          problemId: item.latestProblemId,
        }))

        setData(items)
        setTotalCount(result.total)
      } catch (err) {
        if (signal?.aborted) {
          return
        }

        console.error('Failed to fetch grouped logs', err)
        const errorMessage = err instanceof Error ? err.message : 'Failed to load grouped logs'
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [page, pageSize, filters]
  )

  // Ref to hold latest loadData
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

  // Trigger refresh when triggerRefresh prop changes
  useEffect(() => {
    if (triggerRefresh !== undefined && triggerRefresh > 0) {
      void loadDataRef.current()
    }
  }, [triggerRefresh])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filters])

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / pageSize)

  // Check if all current groups are selected
  const allSelected = useMemo(() => {
    if (data.length === 0) return false
    return data.every((group) => selectedGroups.has(group.fingerprint))
  }, [data, selectedGroups])

  // Toggle row expansion
  const toggleRowExpansion = useCallback((fingerprint: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(fingerprint)) {
        newSet.delete(fingerprint)
      } else {
        newSet.add(fingerprint)
      }
      return newSet
    })
  }, [])

  // Toggle group selection
  const toggleGroupSelection = useCallback((fingerprint: string) => {
    setSelectedGroups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(fingerprint)) {
        newSet.delete(fingerprint)
      } else {
        newSet.add(fingerprint)
      }
      return newSet
    })
  }, [])

  // Toggle select all
  const toggleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedGroups(new Set(data.map((g) => g.fingerprint)))
      } else {
        setSelectedGroups(new Set())
      }
    },
    [data]
  )

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

  // Get count badge with color based on count
  const getCountBadge = (count: number) => {
    let className = 'font-semibold'
    if (count > 100) {
      className += ' bg-red-500/20 text-red-700 dark:bg-red-500/30 dark:text-red-400'
    } else if (count > 10) {
      className += ' bg-amber-500/20 text-amber-700 dark:bg-amber-500/30 dark:text-amber-400'
    } else {
      className += ' bg-blue-500/20 text-blue-700 dark:bg-blue-500/30 dark:text-blue-400'
    }

    return (
      <Badge variant="secondary" className={className}>
        {count}× {t('grouped.occurrences')}
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
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    disabled={data.length === 0}
                  />
                </th>
                {/* Expand/collapse */}
                <th className="h-12 w-12 px-2 align-middle"></th>
                {/* Problem ID */}
                <th className="text-muted-foreground h-12 w-[140px] px-4 text-left align-middle font-medium">
                  Problem ID
                </th>
                {/* Count */}
                <th className="text-muted-foreground h-12 w-[140px] px-4 text-left align-middle font-medium">
                  {t('grouped.count')}
                </th>
                {/* Last Seen */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('grouped.lastSeen')}
                </th>
                {/* Severity */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.level')}
                </th>
                {/* Message */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('table.message')}
                </th>
                {/* Environments */}
                <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
                  {t('filters.environment')}
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
                  <td colSpan={9} className="h-24 text-center">
                    <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="h-24 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-muted-foreground h-24 text-center">
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                data.map((group) => {
                  const isExpanded = expandedRows.has(group.fingerprint)
                  const isSelected = selectedGroups.has(group.fingerprint)

                  return (
                    <tr
                      key={group.fingerprint}
                      className={cn(
                        'hover:bg-muted/50 cursor-pointer border-b transition-colors',
                        isSelected && 'bg-muted/30'
                      )}
                      onClick={() => onGroupSelect?.(group)}
                    >
                      {/* Checkbox */}
                      <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleGroupSelection(group.fingerprint)}
                          aria-label={`Select group ${group.fingerprint}`}
                        />
                      </td>
                      {/* Expand/collapse button */}
                      <td className="p-2 align-middle" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => toggleRowExpansion(group.fingerprint)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                      {/* Problem ID */}
                      <td className="p-4 align-middle">
                        <span className="text-primary font-mono text-sm font-semibold">
                          {group.problemId || '-'}
                        </span>
                      </td>
                      {/* Count */}
                      <td className="p-4 align-middle">{getCountBadge(group.count)}</td>
                      {/* Last Seen */}
                      <td className="text-muted-foreground p-4 align-middle whitespace-nowrap">
                        {formatDistanceToNow(new Date(group.lastSeen), {
                          addSuffix: true,
                        })}
                      </td>
                      {/* Severity */}
                      <td className="p-4 align-middle">
                        <SeverityBadge severity={group.severity} />
                      </td>
                      {/* Message */}
                      <td className="max-w-[300px] p-4 align-middle">
                        <span className="text-sm" title={group.message}>
                          {truncateMessage(group.message)}
                        </span>
                      </td>
                      {/* Environments */}
                      <td className="p-4 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {group.environments.map((env) => (
                            <Badge
                              key={env}
                              variant={env === 'dev' ? 'outline' : 'secondary'}
                              className={
                                env === 'dev'
                                  ? 'border-blue-500 text-blue-500'
                                  : 'bg-purple-500/10 text-purple-600'
                              }
                            >
                              {env}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="p-4 align-middle">{getStatusBadge(group.status)}</td>
                    </tr>
                  )
                })
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
              {totalCount} groups
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
