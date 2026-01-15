'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow, format } from 'date-fns'
import { Loader2, Clock, Cpu, DollarSign, FileCode, Save, Copy, Check, Plus } from 'lucide-react'
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
import { toast } from 'sonner'
import { getLogByIdAction, updateLogStatusAction } from '@/app/actions/admin-logs'
import type { UnifiedLogItem, LogDetails, LogStatus } from '@/app/actions/admin-logs'

interface LogDetailDrawerProps {
  logItem: UnifiedLogItem | null
  open: boolean
  onClose: () => void
  onStatusUpdate: () => void
}

/**
 * Side drawer showing full log details with status update controls
 */
export function LogDetailDrawer({ logItem, open, onClose, onStatusUpdate }: LogDetailDrawerProps) {
  const t = useTranslations('admin.logs')

  // Full details state
  const [details, setDetails] = useState<LogDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Status update state
  const [status, setStatus] = useState<LogStatus>('new')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Copy to clipboard state
  const [copied, setCopied] = useState(false)

  // Auto-reset copied state with cleanup
  useEffect(() => {
    if (!copied) return
    const timeoutId = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timeoutId)
  }, [copied])

  // Fetch full details when drawer opens
  useEffect(() => {
    if (open && logItem) {
      setLoading(true)
      setError(null)
      setDetails(null)

      getLogByIdAction({
        logType: logItem.logType,
        logId: logItem.id,
      })
        .then((result) => {
          setDetails(result)
          setStatus(result.status)
          setNotes(result.statusNotes || '')
        })
        .catch((err) => {
          console.error('Failed to load log details:', err)
          setError(err instanceof Error ? err.message : 'Failed to load details')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [open, logItem])

  // Handle markdown copy to clipboard
  const handleCopyMarkdown = useCallback(async () => {
    if (!details) return

    const markdown = `[${details.problemId || details.id.substring(0, 8)}] ${details.severity} in ${details.source || details.logType}
Message: ${details.message}
Env: ${details.environment || 'unknown'}
Course: ${details.courseName || 'N/A'}${details.courseId ? ` (${details.courseId})` : ''}`

    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      toast.error('Failed to copy to clipboard')
    }
  }, [details])

  // Handle status save
  const handleSave = useCallback(async () => {
    if (!logItem) return

    setSaving(true)
    try {
      await updateLogStatusAction({
        logType: logItem.logType,
        logId: logItem.id,
        status,
        notes: notes || undefined,
      })
      toast.success('Status updated successfully')
      onStatusUpdate()
      onClose()
    } catch (err) {
      console.error('Failed to update status:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }, [logItem, status, notes, onStatusUpdate, onClose])

  // Format JSON for display
  const formatJson = (data: Record<string, unknown> | null) => {
    if (!data) return null
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t('drawer.title')}
            {details && <SeverityBadge severity={details.severity} />}
          </SheetTitle>
          <SheetDescription>
            {details && <span className="font-mono text-xs">{details.id}</span>}
          </SheetDescription>
          {/* Action buttons */}
          {details && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopyMarkdown()}
                className="gap-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled
                title="Beads integration coming soon"
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Issue
              </Button>
            </div>
          )}
        </SheetHeader>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-48 items-center justify-center text-red-500">{error}</div>
        ) : details ? (
          <div className="mt-6 space-y-6">
            {/* Problem ID Display */}
            {details.problemId && (
              <div className="bg-muted mb-4 flex items-center gap-2 rounded-lg p-3">
                <span className="text-muted-foreground text-sm">Problem ID:</span>
                <span className="text-primary font-mono text-lg font-bold">
                  {details.problemId}
                </span>
              </div>
            )}

            {/* Basic Info */}
            <section className="space-y-3">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
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
              <p className="bg-muted rounded-md p-3 text-sm break-words">{details.message}</p>
            </section>

            {/* Context - new enhanced fields */}
            {(details.requestId ||
              details.courseId ||
              details.lessonId ||
              details.trpcPath ||
              details.attemptedValue) && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Context</h3>
                <div className="bg-muted space-y-2 rounded-md p-3 text-sm">
                  {details.requestId && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[100px] font-medium">
                        Request ID:
                      </span>
                      <code className="font-mono text-xs">{details.requestId}</code>
                    </div>
                  )}
                  {details.courseId && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[100px] font-medium">
                        Course:
                      </span>
                      <span>{details.courseName || details.courseId}</span>
                      {details.courseName && (
                        <code className="text-muted-foreground font-mono text-xs">
                          ({details.courseId})
                        </code>
                      )}
                    </div>
                  )}
                  {details.lessonId && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[100px] font-medium">
                        Lesson ID:
                      </span>
                      <code className="font-mono text-xs">{details.lessonId}</code>
                    </div>
                  )}
                  {details.trpcPath && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[100px] font-medium">
                        tRPC Path:
                      </span>
                      <code className="font-mono text-xs">{details.trpcPath}</code>
                    </div>
                  )}
                  {details.attemptedValue && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground min-w-[100px] font-medium">
                        Attempted:
                      </span>
                      <code className="font-mono text-xs text-red-600">
                        {details.attemptedValue}
                      </code>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* tRPC Input */}
            {details.trpcInput && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">tRPC Input</h3>
                <pre className="bg-muted max-h-48 overflow-x-auto overflow-y-auto rounded-md p-3 font-mono text-xs">
                  {formatJson(details.trpcInput)}
                </pre>
              </section>
            )}

            {/* Generation trace info */}
            {details.logType === 'generation_trace' && (
              <section className="space-y-3">
                <h3 className="text-sm font-medium">Generation Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {details.modelUsed && (
                    <div className="flex items-center gap-2">
                      <Cpu className="text-muted-foreground h-4 w-4" />
                      <span>{details.modelUsed}</span>
                    </div>
                  )}
                  {details.tokensUsed && (
                    <div className="flex items-center gap-2">
                      <FileCode className="text-muted-foreground h-4 w-4" />
                      <span>{details.tokensUsed.toLocaleString()} tokens</span>
                    </div>
                  )}
                  {details.costUsd !== null && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="text-muted-foreground h-4 w-4" />
                      <span>${details.costUsd.toFixed(4)}</span>
                    </div>
                  )}
                  {details.durationMs !== null && (
                    <div className="flex items-center gap-2">
                      <Clock className="text-muted-foreground h-4 w-4" />
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
                <pre className="bg-muted max-h-48 overflow-x-auto overflow-y-auto rounded-md p-3 font-mono text-xs break-words whitespace-pre-wrap">
                  {details.stackTrace}
                </pre>
              </section>
            )}

            {/* Metadata */}
            {details.metadata && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t('drawer.metadata')}</h3>
                <pre className="bg-muted max-h-48 overflow-x-auto overflow-y-auto rounded-md p-3 font-mono text-xs">
                  {formatJson(details.metadata)}
                </pre>
              </section>
            )}

            {/* Error data */}
            {details.errorData && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Error Data</h3>
                <pre className="bg-muted max-h-48 overflow-x-auto overflow-y-auto rounded-md p-3 font-mono text-xs">
                  {formatJson(details.errorData)}
                </pre>
              </section>
            )}

            {/* Input/Output data for generation traces */}
            {details.inputData && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Input Data</h3>
                <pre className="bg-muted max-h-48 overflow-x-auto overflow-y-auto rounded-md p-3 font-mono text-xs">
                  {formatJson(details.inputData)}
                </pre>
              </section>
            )}

            {details.outputData && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Output Data</h3>
                <pre className="bg-muted max-h-48 overflow-x-auto overflow-y-auto rounded-md p-3 font-mono text-xs">
                  {formatJson(details.outputData)}
                </pre>
              </section>
            )}

            {/* Status update section */}
            <section className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-medium">Status Management</h3>

              {/* Last updated info */}
              {details.statusUpdatedBy && details.statusUpdatedAt && (
                <div className="text-muted-foreground text-xs">
                  Last updated by {details.statusUpdatedBy} on{' '}
                  {format(new Date(details.statusUpdatedAt), 'PPp')}
                </div>
              )}

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
                  placeholder="Add notes about this log..."
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
                {t('drawer.saveStatus')}
              </Button>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
