'use client'

import { useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { FilterBar } from './filter-bar'
import { LogTable } from './log-table'
import { LogDetailDrawer } from './log-detail-drawer'
import { BulkActionBar } from './bulk-action-bar'
import { LogsErrorBoundary } from './error-boundary'
import { LogsRealtimeProvider, useLogsRealtime } from './logs-realtime-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UnifiedLogItem, LogFilters, LogType, LogStatus } from '@/app/actions/admin-logs'

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

/**
 * Inner content component wrapped by error boundary
 */
function LogsPageContent() {
  const { refreshTrigger, requestRefresh } = useLogsRealtime()

  // Filter state
  const [filters, setFilters] = useState<LogFilters>({})

  // Selected rows state
  const [selectedItems, setSelectedItems] = useState<Array<{ logType: LogType; logId: string }>>([])

  // Drawer state
  const [selectedLog, setSelectedLog] = useState<UnifiedLogItem | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Internal refresh key for bulk actions and status updates
  const [internalRefreshKey, setInternalRefreshKey] = useState(0)

  // Combined trigger: realtime trigger + internal key
  const combinedTrigger = refreshTrigger + internalRefreshKey

  const handleFilterChange = useCallback((newFilters: LogFilters) => {
    setFilters(newFilters)
    setSelectedItems([]) // Clear selection on filter change
  }, [])

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
      <FilterBar filters={filters} onFilterChange={handleFilterChange} />

      {/* New logs notification */}
      <NewLogsBanner />

      {/* Bulk actions bar (shows when items selected) */}
      <BulkActionBar
        selectedItems={selectedItems}
        onBulkAction={handleBulkAction}
        onClearSelection={handleClearSelection}
      />

      {/* Table */}
      <div className="min-h-0 flex-1">
        <LogTable
          filters={filters}
          selectedItems={selectedItems}
          onRowSelect={handleRowSelect}
          onSelectAll={handleSelectAll}
          onRowClick={handleRowClick}
          triggerRefresh={combinedTrigger}
        />
      </div>

      {/* Detail drawer */}
      <LogDetailDrawer
        logItem={selectedLog}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onStatusUpdate={handleStatusUpdate}
      />
    </div>
  )
}
