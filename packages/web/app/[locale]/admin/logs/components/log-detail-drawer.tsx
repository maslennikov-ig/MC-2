'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Loader2,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  Clock,
  Cpu,
  DollarSign,
  FileCode,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { getLogByIdAction, updateLogStatusAction } from '@/app/actions/admin-logs';
import type {
  UnifiedLogItem,
  LogDetails,
  LogStatus,
} from '@/app/actions/admin-logs';

interface LogDetailDrawerProps {
  logItem: UnifiedLogItem | null;
  open: boolean;
  onClose: () => void;
  onStatusUpdate: () => void;
}

/**
 * Side drawer showing full log details with status update controls
 */
export function LogDetailDrawer({
  logItem,
  open,
  onClose,
  onStatusUpdate,
}: LogDetailDrawerProps) {
  const t = useTranslations('admin.logs');

  // Full details state
  const [details, setDetails] = useState<LogDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status update state
  const [status, setStatus] = useState<LogStatus>('new');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch full details when drawer opens
  useEffect(() => {
    if (open && logItem) {
      setLoading(true);
      setError(null);
      setDetails(null);

      getLogByIdAction({
        logType: logItem.logType,
        logId: logItem.id,
      })
        .then((result) => {
          setDetails(result);
          setStatus(result.status);
          setNotes(result.statusNotes || '');
        })
        .catch((err) => {
          console.error('Failed to load log details:', err);
          setError(err instanceof Error ? err.message : 'Failed to load details');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, logItem]);

  // Handle status save
  const handleSave = useCallback(async () => {
    if (!logItem) return;

    setSaving(true);
    try {
      await updateLogStatusAction({
        logType: logItem.logType,
        logId: logItem.id,
        status,
        notes: notes || undefined,
      });
      toast.success('Status updated successfully');
      onStatusUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }, [logItem, status, notes, onStatusUpdate, onClose]);

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

  // Format JSON for display
  const formatJson = (data: Record<string, unknown> | null) => {
    if (!data) return null;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t('drawer.title')}
            {details && getSeverityBadge(details.severity)}
          </SheetTitle>
          <SheetDescription>
            {details && (
              <span className="text-xs font-mono">{details.id}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-red-500">
            {error}
          </div>
        ) : details ? (
          <div className="space-y-6 mt-6">
            {/* Basic Info */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {format(new Date(details.createdAt), 'PPpp')} (
                  {formatDistanceToNow(new Date(details.createdAt), {
                    addSuffix: true,
                  })}
                  )
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="font-mono">
                  {details.logType}
                </Badge>
                {details.source && (
                  <Badge variant="outline" className="font-mono">
                    {details.source}
                  </Badge>
                )}
                {details.stage && (
                  <Badge variant="outline" className="font-mono">
                    Stage: {details.stage}
                  </Badge>
                )}
                {details.phase && (
                  <Badge variant="outline" className="font-mono">
                    Phase: {details.phase}
                  </Badge>
                )}
              </div>
            </section>

            {/* Message */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Message</h3>
              <p className="text-sm bg-muted p-3 rounded-md break-words">
                {details.message}
              </p>
            </section>

            {/* Generation trace info */}
            {details.logType === 'generation_trace' && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Generation Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {details.modelUsed && (
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <span>{details.modelUsed}</span>
                    </div>
                  )}
                  {details.tokensUsed && (
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-muted-foreground" />
                      <span>{details.tokensUsed.toLocaleString()} tokens</span>
                    </div>
                  )}
                  {details.costUsd !== null && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span>${details.costUsd.toFixed(4)}</span>
                    </div>
                  )}
                  {details.durationMs !== null && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{(details.durationMs / 1000).toFixed(2)}s</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Stack trace */}
            {details.stackTrace && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t('drawer.stackTrace')}</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre-wrap break-words">
                  {details.stackTrace}
                </pre>
              </section>
            )}

            {/* Metadata */}
            {details.metadata && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t('drawer.metadata')}</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto font-mono">
                  {formatJson(details.metadata)}
                </pre>
              </section>
            )}

            {/* Error data */}
            {details.errorData && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Error Data</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto font-mono">
                  {formatJson(details.errorData)}
                </pre>
              </section>
            )}

            {/* Input/Output data for generation traces */}
            {details.inputData && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Input Data</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto font-mono">
                  {formatJson(details.inputData)}
                </pre>
              </section>
            )}

            {details.outputData && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Output Data</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto font-mono">
                  {formatJson(details.outputData)}
                </pre>
              </section>
            )}

            {/* Status update section */}
            <section className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-medium">Status Management</h3>

              {/* Last updated info */}
              {details.statusUpdatedBy && details.statusUpdatedAt && (
                <div className="text-xs text-muted-foreground">
                  Last updated by {details.statusUpdatedBy} on{' '}
                  {format(new Date(details.statusUpdatedAt), 'PPp')}
                </div>
              )}

              {/* Status select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('filters.status')}
                </label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as LogStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">{t('status.new')}</SelectItem>
                    <SelectItem value="in_progress">
                      {t('status.in_progress')}
                    </SelectItem>
                    <SelectItem value="resolved">{t('status.resolved')}</SelectItem>
                    <SelectItem value="ignored">{t('status.ignored')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes textarea */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('drawer.notes')}</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this log..."
                  className="min-h-[100px]"
                />
              </div>

              {/* Save button */}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('drawer.saveStatus')}
              </Button>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
