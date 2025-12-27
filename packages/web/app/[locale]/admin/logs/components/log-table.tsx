'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  XCircle,
  AlertOctagon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { listLogsAction } from '@/app/actions/admin-logs';
import type {
  UnifiedLogItem,
  LogFilters,
  LogType,
  LogStatus,
  LogListResponse,
} from '@/app/actions/admin-logs';

/** Debounce timeout for filters in milliseconds */
const FILTER_DEBOUNCE_MS = 300;

/** Auto-refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL_MS = 5000;

interface LogTableProps {
  filters: LogFilters;
  selectedItems: Array<{ logType: LogType; logId: string }>;
  onRowSelect: (item: UnifiedLogItem, selected: boolean) => void;
  onSelectAll: (items: UnifiedLogItem[], selected: boolean) => void;
  onRowClick: (item: UnifiedLogItem) => void;
}

type SortField = 'created_at' | 'severity';
type SortDirection = 'asc' | 'desc';

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
  const t = useTranslations('admin.logs');

  // Data state
  const [data, setData] = useState<UnifiedLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [error, setError] = useState<string | null>(null);

  // Sort state
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Load data function
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: LogListResponse = await listLogsAction({
        page,
        limit: pageSize,
        filters,
        sort: {
          field: sortField,
          direction: sortDirection,
        },
      });

      setData(result.items);
      setTotalCount(result.total);
    } catch (err) {
      console.error('Failed to fetch logs', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load logs';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters, sortField, sortDirection]);

  // Initial load and filter change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Auto-refresh polling
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / pageSize);

  // Check if all current items are selected
  const allSelected = useMemo(() => {
    if (data.length === 0) return false;
    return data.every((item) =>
      selectedItems.some((s) => s.logId === item.id && s.logType === item.logType)
    );
  }, [data, selectedItems]);

  // Check if item is selected
  const isSelected = useCallback(
    (item: UnifiedLogItem) => {
      return selectedItems.some(
        (s) => s.logId === item.id && s.logType === item.logType
      );
    },
    [selectedItems]
  );

  // Toggle sort
  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('desc');
      }
    },
    [sortField]
  );

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 inline ml-1" />
    );
  };

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <Badge
            variant="destructive"
            className="gap-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            <AlertOctagon className="h-3 w-3" />
            {t('levels.CRITICAL')}
          </Badge>
        );
      case 'ERROR':
        return (
          <Badge
            variant="destructive"
            className="gap-1 bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800"
          >
            <XCircle className="h-3 w-3" />
            {t('levels.ERROR')}
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge
            variant="secondary"
            className="gap-1 bg-yellow-500/20 text-yellow-700 hover:bg-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400 dark:hover:bg-yellow-500/30"
          >
            <AlertTriangle className="h-3 w-3" />
            {t('levels.WARNING')}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{severity}</Badge>;
    }
  };

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
        );
      case 'in_progress':
        return (
          <Badge
            variant="secondary"
            className="bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400"
          >
            {t('status.in_progress')}
          </Badge>
        );
      case 'resolved':
        return (
          <Badge
            variant="secondary"
            className="bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400"
          >
            {t('status.resolved')}
          </Badge>
        );
      case 'ignored':
        return (
          <Badge
            variant="secondary"
            className="bg-gray-500/10 text-gray-600 hover:bg-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400"
          >
            {t('status.ignored')}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Truncate message
  const truncateMessage = (message: string, maxLength: number = 80) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Table */}
      <div className="rounded-md border bg-card shadow-sm overflow-hidden flex-1 min-h-0">
        <div className="relative w-full h-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b sticky top-0 bg-card z-10">
              <tr className="border-b transition-colors hover:bg-muted/50">
                {/* Select all checkbox */}
                <th className="h-12 w-12 px-4 align-middle">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => onSelectAll(data, !!checked)}
                    aria-label="Select all"
                    disabled={data.length === 0}
                  />
                </th>
                {/* Timestamp */}
                <th
                  className="h-12 px-4 text-left align-middle font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleSort('created_at')}
                >
                  {t('table.timestamp')}
                  {renderSortIndicator('created_at')}
                </th>
                {/* Level */}
                <th
                  className="h-12 px-4 text-left align-middle font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => toggleSort('severity')}
                >
                  {t('table.level')}
                  {renderSortIndicator('severity')}
                </th>
                {/* Source */}
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.source')}
                </th>
                {/* Message */}
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.message')}
                </th>
                {/* Course */}
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">
                  {t('table.course')}
                </th>
                {/* Status */}
                <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                  {t('table.status')}
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="h-24 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t('empty')}
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={`${item.logType}-${item.id}`}
                    className={cn(
                      'border-b transition-colors hover:bg-muted/50 cursor-pointer',
                      isSelected(item) && 'bg-muted/30'
                    )}
                    onClick={() => onRowClick(item)}
                  >
                    {/* Checkbox */}
                    <td
                      className="p-4 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected(item)}
                        onCheckedChange={(checked) =>
                          onRowSelect(item, !!checked)
                        }
                        aria-label={`Select log ${item.id}`}
                      />
                    </td>
                    {/* Timestamp */}
                    <td className="p-4 align-middle text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                    {/* Level */}
                    <td className="p-4 align-middle">
                      {getSeverityBadge(item.severity)}
                    </td>
                    {/* Source */}
                    <td className="p-4 align-middle">
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {item.source || item.logType}
                      </span>
                    </td>
                    {/* Message */}
                    <td className="p-4 align-middle max-w-[300px]">
                      <span className="text-sm" title={item.message}>
                        {truncateMessage(item.message)}
                      </span>
                    </td>
                    {/* Course */}
                    <td className="p-4 align-middle hidden lg:table-cell">
                      {item.courseId ? (
                        <span
                          className="text-xs font-mono text-muted-foreground"
                          title={item.courseId}
                        >
                          {item.courseId.substring(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="p-4 align-middle">
                      {getStatusBadge(item.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          {totalCount > 0 && (
            <>
              Showing {(page - 1) * pageSize + 1} to{' '}
              {Math.min(page * pageSize, totalCount)} of {totalCount} results
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
          <span className="text-sm text-muted-foreground">
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
  );
}
