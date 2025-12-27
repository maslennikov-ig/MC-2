'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, CheckCircle, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { bulkUpdateLogStatusAction } from '@/app/actions/admin-logs';
import type { LogType, LogStatus } from '@/app/actions/admin-logs';

interface BulkActionBarProps {
  selectedItems: Array<{ logType: LogType; logId: string }>;
  onBulkAction: (status: LogStatus) => void;
  onClearSelection: () => void;
}

/**
 * Bulk action bar that appears when rows are selected
 */
export function BulkActionBar({
  selectedItems,
  onBulkAction,
  onClearSelection,
}: BulkActionBarProps) {
  const t = useTranslations('admin.logs');
  const [loading, setLoading] = useState<LogStatus | null>(null);

  const handleBulkUpdate = useCallback(
    async (status: LogStatus) => {
      if (selectedItems.length === 0) return;

      setLoading(status);
      try {
        await bulkUpdateLogStatusAction({
          items: selectedItems,
          status,
        });
        toast.success(
          `${selectedItems.length} logs marked as ${status.replace('_', ' ')}`
        );
        onBulkAction(status);
      } catch (err) {
        console.error('Bulk update failed:', err);
        toast.error(
          err instanceof Error ? err.message : 'Failed to update logs'
        );
      } finally {
        setLoading(null);
      }
    },
    [selectedItems, onBulkAction]
  );

  // Don't render if no items selected
  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-3 rounded-lg',
        'bg-purple-50 dark:bg-purple-500/10',
        'border border-purple-200 dark:border-purple-500/30',
        'animate-in fade-in slide-in-from-top-2 duration-200'
      )}
    >
      {/* Selection count */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
          {t('bulk.selected', { count: selectedItems.length })}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Mark Resolved */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkUpdate('resolved')}
          disabled={loading !== null}
          className="gap-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-500/30 dark:text-green-400 dark:hover:bg-green-500/10"
        >
          {loading === 'resolved' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          {t('bulk.markResolved')}
        </Button>

        {/* Mark Ignored */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkUpdate('ignored')}
          disabled={loading !== null}
          className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-500/30 dark:text-gray-400 dark:hover:bg-gray-500/10"
        >
          {loading === 'ignored' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          {t('bulk.markIgnored')}
        </Button>

        {/* Clear selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={loading !== null}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          {t('bulk.clearSelection')}
        </Button>
      </div>
    </div>
  );
}
