'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow, format } from 'date-fns'
import { Loader2, Clock, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { SeverityBadge } from './severity-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { toast } from 'sonner'
import {
  getGroupLogsAction,
  updateGroupStatusAction,
  type LogStatus,
  type UnifiedLogItem,
} from '@/app/actions/admin-logs'

// UI type for group item (mapped from ErrorGroupItem)
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

interface GroupDetailDrawerProps {
  groupItem: GroupedLogItem | null
  open: boolean
  onClose: () => void
  onStatusUpdate: () => void
}

/**
 * Side drawer showing full group details with recent occurrences and bulk status update
 */
export function GroupDetailDrawer({
  groupItem,
  open,
  onClose,
  onStatusUpdate,
}: GroupDetailDrawerProps) {
  const t = useTranslations('admin.logs')

  // Recent logs state
  const [recentLogs, setRecentLogs] = useState<UnifiedLogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Status update state
  const [status, setStatus] = useState<LogStatus>('new')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Fetch recent logs when drawer opens
  useEffect(() => {
    if (open && groupItem) {
      setLoading(true)
      setError(null)
      setRecentLogs([])
      setStatus(groupItem.status)
      setNotes('')

      // Fetch real data from backend
      getGroupLogsAction({
        fingerprint: groupItem.fingerprint,
        page: 1,
        limit: 5,
      })
        .then((result) => {
          setRecentLogs(result.items)
          setLoading(false)
        })
        .catch((err) => {
          console.error('Failed to fetch group logs:', err)
          setError(err instanceof Error ? err.message : 'Failed to load logs')
          setLoading(false)
        })
    }
  }, [open, groupItem])

  // Handle bulk status save
  const handleSave = useCallback(async () => {
    if (!groupItem) return

    setSaving(true)
    try {
      const result = await updateGroupStatusAction({
        fingerprint: groupItem.fingerprint,
        status,
        notes: notes || undefined,
      })

      toast.success(`Updated status for ${result.updatedCount} logs`)
      onStatusUpdate()
      onClose()
    } catch (err) {
      console.error('Failed to update group status:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }, [groupItem, status, notes, onStatusUpdate, onClose])

  // Get environment badge
  const getEnvironmentBadge = (environment: string) => {
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

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t('grouped.groupDetails')}
            {groupItem && <SeverityBadge severity={groupItem.severity} />}
          </SheetTitle>
          <SheetDescription>
            {groupItem && (
              <div className="flex flex-col gap-1 pt-1">
                <span className="font-mono text-xs">{groupItem.fingerprint}</span>
                <span className="text-sm">
                  {groupItem.count} {t('grouped.occurrences')}
                </span>
              </div>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-48 items-center justify-center text-red-500">{error}</div>
        ) : groupItem ? (
          <div className="mt-6 space-y-6">
            {/* Summary section */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">{t('grouped.summary')}</h3>
              <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
                {/* Problem ID */}
                {groupItem.problemId && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground min-w-[100px] font-medium">
                      Problem ID:
                    </span>
                    <span className="text-primary font-mono font-semibold">
                      {groupItem.problemId}
                    </span>
                  </div>
                )}

                {/* Count */}
                <div className="flex gap-2">
                  <span className="text-muted-foreground min-w-[100px] font-medium">
                    {t('grouped.count')}:
                  </span>
                  <span className="font-semibold">{groupItem.count}</span>
                </div>

                {/* First seen */}
                <div className="flex gap-2">
                  <span className="text-muted-foreground min-w-[100px] font-medium">
                    {t('grouped.firstSeen')}:
                  </span>
                  <span>
                    {format(new Date(groupItem.firstSeen), 'PPp')} (
                    {formatDistanceToNow(new Date(groupItem.firstSeen), {
                      addSuffix: true,
                    })}
                    )
                  </span>
                </div>

                {/* Last seen */}
                <div className="flex gap-2">
                  <span className="text-muted-foreground min-w-[100px] font-medium">
                    {t('grouped.lastSeen')}:
                  </span>
                  <span>
                    {format(new Date(groupItem.lastSeen), 'PPp')} (
                    {formatDistanceToNow(new Date(groupItem.lastSeen), {
                      addSuffix: true,
                    })}
                    )
                  </span>
                </div>

                {/* Environments */}
                <div className="flex gap-2">
                  <span className="text-muted-foreground min-w-[100px] font-medium">
                    {t('filters.environment')}:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {groupItem.environments.map((env) => (
                      <span key={env}>{getEnvironmentBadge(env)}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Full error message */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('table.message')}</h3>
              <p className="bg-muted rounded-md p-3 text-sm break-words">{groupItem.message}</p>
            </section>

            {/* Recent occurrences */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('grouped.recentOccurrences')} (Last 5)</h3>
              <Accordion type="single" collapsible className="w-full">
                {recentLogs.map((log) => (
                  <AccordionItem key={log.id} value={log.id}>
                    <AccordionTrigger className="text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="text-muted-foreground h-3 w-3" />
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(log.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                        {log.environment && getEnvironmentBadge(log.environment)}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px] font-medium">
                            Log ID:
                          </span>
                          <code className="font-mono text-xs">{log.id}</code>
                        </div>
                        {log.problemId && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground min-w-[80px] font-medium">
                              Problem:
                            </span>
                            <span className="text-primary font-mono font-semibold">
                              {log.problemId}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="text-muted-foreground min-w-[80px] font-medium">
                            Time:
                          </span>
                          <span>{format(new Date(log.createdAt), 'PPpp')}</span>
                        </div>
                        {log.courseId && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground min-w-[80px] font-medium">
                              Course:
                            </span>
                            <span>{log.courseName || log.courseId}</span>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>

            {/* Status update section */}
            <section className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-medium">{t('grouped.bulkStatusUpdate')}</h3>

              {/* Status select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('filters.status')}</label>
                <Select value={status} onValueChange={(v) => setStatus(v as LogStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">{t('status.new')}</SelectItem>
                    <SelectItem value="in_progress">{t('status.in_progress')}</SelectItem>
                    <SelectItem value="to_verify">To Verify</SelectItem>
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
                  placeholder="Add notes about this error group..."
                  className="min-h-[100px]"
                />
              </div>

              {/* Save button */}
              <Button onClick={() => void handleSave()} disabled={saving} className="w-full gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('grouped.updateAll')} ({groupItem.count} {t('grouped.logs')})
              </Button>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
