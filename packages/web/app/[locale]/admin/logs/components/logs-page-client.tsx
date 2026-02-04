'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { FilterBar, type ViewMode } from './filter-bar'
import { LogTable } from './log-table'
import { GroupedLogTable } from './grouped-log-table'
import { LogDetailDrawer } from './log-detail-drawer'
import { GroupDetailDrawer } from './group-detail-drawer'
import { BulkActionBar } from './bulk-action-bar'
import { LogsErrorBoundary } from './error-boundary'
import { LogsRealtimeProvider, useLogsRealtime } from './logs-realtime-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  UnifiedLogItem,
  LogFilters,
  LogType,
  LogStatus,
  LogLevel,
  LogEnvironment,
} from '@/app/actions/admin-logs'

// Placeholder type for grouped items
interface GroupedLogItem {
  fingerprint: string
  problemId: string | null
  count: number
  lastSeen: string
  firstSeen: string
  severity: string
  message: string
  environments: string[]
  status: LogStatus
}

/**
 * Client-side logs page with interactive filtering, selection, and detail view
 */
export function LogsPageClient() {
  return (
    <LogsErrorBoundary>
      <LogsRealtimeProvider>
        <LogsPageContent />
      </LogsRealtimeProvider>
    </LogsErrorBoundary>
  )
}

/**
 * Connection status indicator
 */
function ConnectionIndicator() {
  const { isConnected } = useLogsRealtime()

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <div
        className={cn('h-2 w-2 rounded-full', isConnected ? 'bg-green-500' : 'bg-red-500')}
        title={isConnected ? 'Connected to realtime updates' : 'Disconnected from realtime'}
      />
      <span className="hidden sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
    </div>
  )
}

/**
 * New logs notification banner
 */
function NewLogsBanner() {
  const { hasNewLogs, requestRefresh } = useLogsRealtime()

  if (!hasNewLogs) return null

  return (
    <div className="flex items-center justify-center">
      <Button
        variant="outline"
        size="sm"
        onClick={requestRefresh}
        className="gap-2 border-blue-500/50 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
      >
        <RefreshCw className="h-4 w-4" />
        Show new logs
      </Button>
    </div>
  )
}

// URL parameter keys for filter persistence
const URL_PARAM_KEYS = {
  level: 'level',
  source: 'source',
  status: 'status',
  environment: 'environment',
  search: 'search',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  viewMode: 'viewMode',
} as const

/**
 * Parse filters from URL search params
 */
function parseFiltersFromUrl(searchParams: URLSearchParams): LogFilters {
  const level = searchParams.get(URL_PARAM_KEYS.level)
  const source = searchParams.get(URL_PARAM_KEYS.source)
  const status = searchParams.get(URL_PARAM_KEYS.status)
  const environment = searchParams.get(URL_PARAM_KEYS.environment)
  const search = searchParams.get(URL_PARAM_KEYS.search)
  const dateFrom = searchParams.get(URL_PARAM_KEYS.dateFrom)
  const dateTo = searchParams.get(URL_PARAM_KEYS.dateTo)

  return {
    level: (level || undefined) as LogLevel | undefined,
    source: (source || undefined) as LogType | undefined,
    status: (status || undefined) as LogStatus | undefined,
    environment: (environment || undefined) as LogEnvironment | undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }
}

/**
 * Parse view mode from URL search params
 */
function parseViewModeFromUrl(searchParams: URLSearchParams): ViewMode {
  const viewMode = searchParams.get(URL_PARAM_KEYS.viewMode)
  return viewMode === 'flat' ? 'flat' : 'grouped'
}

/**
 * Inner content component wrapped by error boundary
 */
function LogsPageContent() {
  const { refreshTrigger, requestRefresh } = useLogsRealtime()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Parse filters from URL (with default status='new' if no status in URL and no other filters)
  const filters = useMemo<LogFilters>(() => {
    const parsed = parseFiltersFromUrl(searchParams)
    // Apply default status='new' only if no filters are set at all
    const hasAnyFilter = Object.values(parsed).some((v) => v !== undefined)
    if (!hasAnyFilter) {
      return { status: 'new' }
    }
    return parsed
  }, [searchParams])

  // Parse view mode from URL
  const viewMode = useMemo<ViewMode>(() => {
    return parseViewModeFromUrl(searchParams)
  }, [searchParams])

  // Selected rows state
  const [selectedItems, setSelectedItems] = useState<Array<{ logType: LogType; logId: string }>>([])

  // Drawer state for flat view
  const [selectedLog, setSelectedLog] = useState<UnifiedLogItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Drawer state for grouped view
  const [selectedGroup, setSelectedGroup] = useState<GroupedLogItem | null>(null)
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false)

  // Internal refresh key for bulk actions and status updates
  const [internalRefreshKey, setInternalRefreshKey] = useState(0)

  // Combined trigger: realtime trigger + internal key
  const combinedTrigger = refreshTrigger + internalRefreshKey

  // Update URL with new filters (shallow navigation)
  const updateUrlParams = useCallback(
    (newFilters: LogFilters, newViewMode?: ViewMode) => {
      const params = new URLSearchParams()

      // Set filter params
      if (newFilters.level) params.set(URL_PARAM_KEYS.level, newFilters.level)
      if (newFilters.source) params.set(URL_PARAM_KEYS.source, newFilters.source)
      if (newFilters.status) params.set(URL_PARAM_KEYS.status, newFilters.status)
      if (newFilters.environment) params.set(URL_PARAM_KEYS.environment, newFilters.environment)
      if (newFilters.search) params.set(URL_PARAM_KEYS.search, newFilters.search)
      if (newFilters.dateFrom) params.set(URL_PARAM_KEYS.dateFrom, newFilters.dateFrom)
      if (newFilters.dateTo) params.set(URL_PARAM_KEYS.dateTo, newFilters.dateTo)

      // Set view mode if provided and not default
      const effectiveViewMode = newViewMode ?? viewMode
      if (effectiveViewMode !== 'grouped') {
        params.set(URL_PARAM_KEYS.viewMode, effectiveViewMode)
      }

      const queryString = params.toString()
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname
      router.push(newUrl, { scroll: false })
    },
    [pathname, router, viewMode]
  )

  const handleFilterChange = useCallback(
    (newFilters: LogFilters) => {
      updateUrlParams(newFilters)
      setSelectedItems([]) // Clear selection on filter change
    },
    [updateUrlParams]
  )

  const handleViewModeChange = useCallback(
    (newViewMode: ViewMode) => {
      updateUrlParams(filters, newViewMode)
    },
    [updateUrlParams, filters]
  )

  const handleRowSelect = useCallback((item: UnifiedLogItem, selected: boolean) => {
    setSelectedItems((prev) => {
      if (selected) {
        return [...prev, { logType: item.logType, logId: item.id }]
      }
      return prev.filter((i) => i.logId !== item.id)
    })
  }, [])

  const handleSelectAll = useCallback((items: UnifiedLogItem[], selected: boolean) => {
    if (selected) {
      setSelectedItems(items.map((i) => ({ logType: i.logType, logId: i.id })))
    } else {
      setSelectedItems([])
    }
  }, [])

  const handleRowClick = useCallback((item: UnifiedLogItem) => {
    setSelectedLog(item)
    setDrawerOpen(true)
  }, [])

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false)
    setSelectedLog(null)
  }, [])

  const handleGroupSelect = useCallback((group: GroupedLogItem) => {
    setSelectedGroup(group)
    setGroupDrawerOpen(true)
  }, [])

  const handleGroupDrawerClose = useCallback(() => {
    setGroupDrawerOpen(false)
    setSelectedGroup(null)
  }, [])

  const handleStatusUpdate = useCallback(() => {
    // Trigger table refresh
    setInternalRefreshKey((k) => k + 1)
  }, [])

  const handleBulkAction = useCallback((_status: LogStatus) => {
    // Clear selection and refresh after bulk action
    setSelectedItems([])
    setInternalRefreshKey((k) => k + 1)
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedItems([])
  }, [])

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Action buttons row - above filters */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={requestRefresh} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <ConnectionIndicator />
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* New logs notification */}
      <NewLogsBanner />

      {/* Bulk actions bar (shows when items selected) */}
      <BulkActionBar
        selectedItems={selectedItems}
        onBulkAction={handleBulkAction}
        onClearSelection={handleClearSelection}
      />

      {/* Table - conditional rendering based on view mode */}
      <div className="min-h-0 flex-1">
        {viewMode === 'grouped' ? (
          <GroupedLogTable
            filters={filters}
            onGroupSelect={handleGroupSelect}
            triggerRefresh={combinedTrigger}
          />
        ) : (
          <LogTable
            filters={filters}
            selectedItems={selectedItems}
            onRowSelect={handleRowSelect}
            onSelectAll={handleSelectAll}
            onRowClick={handleRowClick}
            triggerRefresh={combinedTrigger}
          />
        )}
      </div>

      {/* Detail drawers */}
      <LogDetailDrawer
        logItem={selectedLog}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onStatusUpdate={handleStatusUpdate}
      />
      <GroupDetailDrawer
        groupItem={selectedGroup}
        open={groupDrawerOpen}
        onClose={handleGroupDrawerClose}
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  )
}
