'use client';

import { useState, useCallback } from 'react';
import { FilterBar } from './filter-bar';
import { LogTable } from './log-table';
import { LogDetailDrawer } from './log-detail-drawer';
import { BulkActionBar } from './bulk-action-bar';
import { LogsErrorBoundary } from './error-boundary';
import type {
  UnifiedLogItem,
  LogFilters,
  LogType,
  LogStatus,
} from '@/app/actions/admin-logs';

/**
 * Client-side logs page with interactive filtering, selection, and detail view
 */
export function LogsPageClient() {
  return (
    <LogsErrorBoundary>
      <LogsPageContent />
    </LogsErrorBoundary>
  );
}

/**
 * Inner content component wrapped by error boundary
 */
function LogsPageContent() {
  // Filter state
  const [filters, setFilters] = useState<LogFilters>({});

  // Selected rows state
  const [selectedItems, setSelectedItems] = useState<
    Array<{ logType: LogType; logId: string }>
  >([]);

  // Drawer state
  const [selectedLog, setSelectedLog] = useState<UnifiedLogItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFilterChange = useCallback((newFilters: LogFilters) => {
    setFilters(newFilters);
    setSelectedItems([]); // Clear selection on filter change
  }, []);

  const handleRowSelect = useCallback(
    (item: UnifiedLogItem, selected: boolean) => {
      setSelectedItems((prev) => {
        if (selected) {
          return [...prev, { logType: item.logType, logId: item.id }];
        }
        return prev.filter((i) => i.logId !== item.id);
      });
    },
    []
  );

  const handleSelectAll = useCallback(
    (items: UnifiedLogItem[], selected: boolean) => {
      if (selected) {
        setSelectedItems(items.map((i) => ({ logType: i.logType, logId: i.id })));
      } else {
        setSelectedItems([]);
      }
    },
    []
  );

  const handleRowClick = useCallback((item: UnifiedLogItem) => {
    setSelectedLog(item);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setSelectedLog(null);
  }, []);

  const handleStatusUpdate = useCallback(() => {
    // Trigger table refresh
    setRefreshKey((k) => k + 1);
  }, []);

  const handleBulkAction = useCallback((_status: LogStatus) => {
    // Clear selection and refresh after bulk action
    setSelectedItems([]);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedItems([]);
  }, []);

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Filters */}
      <FilterBar filters={filters} onFilterChange={handleFilterChange} />

      {/* Bulk actions bar (shows when items selected) */}
      <BulkActionBar
        selectedItems={selectedItems}
        onBulkAction={handleBulkAction}
        onClearSelection={handleClearSelection}
      />

      {/* Table */}
      <div className="flex-1 min-h-0">
        <LogTable
          key={refreshKey}
          filters={filters}
          selectedItems={selectedItems}
          onRowSelect={handleRowSelect}
          onSelectAll={handleSelectAll}
          onRowClick={handleRowClick}
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
  );
}
