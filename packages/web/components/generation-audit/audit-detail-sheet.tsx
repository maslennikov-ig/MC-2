'use client'

import { useState, useRef, useEffect } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, XCircle, Check, Copy } from 'lucide-react'
import { trpc } from '@/lib/trpc/react'
import { cn } from '@/lib/utils'

interface AuditDetailSheetProps {
  traceId: string | null
  courseId: string
  open: boolean
  onClose: () => void
}

interface TraceDetail {
  id: string
  stage: string
  phase: string
  step_name: string
  model_used: string | null
  tokens_used: number | null
  cost_usd: number | null
  duration_ms: number | null
  quality_score: number | null
  temperature: number | null
  retry_attempt: number | null
  was_cached: boolean | null
  error_data: unknown
  input_data: unknown
  output_data: unknown
  prompt_text: string | null
  completion_text: string | null
  created_at: string
}

function MetadataItem({
  label,
  value,
  className,
}: {
  label: string
  value: string | number
  className?: string
}) {
  return (
    <div className={cn('bg-muted/30 flex flex-col gap-1 rounded-md p-2', className)}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function CodeBlock({ content, className }: { content: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('group bg-muted/50 relative overflow-hidden rounded-md border', className)}>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="bg-background/50 h-8 w-8 backdrop-blur-sm"
          onClick={() => void handleCopy()}
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <pre className="text-foreground max-h-[500px] overflow-x-auto p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
        {content || <span className="text-muted-foreground italic">No data</span>}
      </pre>
    </div>
  )
}

function formatJson(data: unknown): string {
  if (data === null || data === undefined) return ''
  try {
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  } catch {
    return typeof data === 'object'
      ? JSON.stringify(data)
      : String(data as string | number | boolean)
  }
}

/** Inner content rendered only when traceId is non-null */
function TraceDetailContent({ traceId, courseId }: { traceId: string; courseId: string }) {
  const { data: rawTrace, isLoading } = trpc.admin.getAuditTraceDetail.useQuery(
    { traceId, courseId },
    { enabled: true }
  )
  const trace = rawTrace as TraceDetail | undefined

  if (isLoading) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>
            <Skeleton className="h-5 w-48" />
          </SheetTitle>
          <SheetDescription>
            <Skeleton className="h-4 w-32" />
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </>
    )
  }

  if (!trace) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Trace Detail</SheetTitle>
        </SheetHeader>
        <div className="flex h-48 items-center justify-center">
          <span className="text-muted-foreground">No trace data available</span>
        </div>
      </>
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {trace.phase}
          {trace.error_data != null && <Badge variant="destructive">Error</Badge>}
        </SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <Badge variant="outline" className="uppercase">
            {trace.stage}
          </Badge>
          <span className="font-mono text-xs">{trace.step_name}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        {/* Metadata Grid */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <MetadataItem
            label="Model"
            value={trace.model_used || '-'}
            className="col-span-2 sm:col-span-1"
          />
          <MetadataItem
            label="Tokens"
            value={trace.tokens_used !== null ? trace.tokens_used.toLocaleString() : '-'}
          />
          <MetadataItem
            label="Cost"
            value={trace.cost_usd !== null ? `$${trace.cost_usd.toFixed(5)}` : '-'}
          />
          <MetadataItem
            label="Duration"
            value={
              trace.duration_ms !== null
                ? trace.duration_ms < 1000
                  ? `${trace.duration_ms}ms`
                  : `${(trace.duration_ms / 1000).toFixed(1)}s`
                : '-'
            }
          />
          <MetadataItem
            label="Quality Score"
            value={trace.quality_score !== null ? trace.quality_score : '-'}
          />
          <MetadataItem
            label="Temperature"
            value={trace.temperature !== null ? trace.temperature : '-'}
          />
          <MetadataItem
            label="Retry Attempt"
            value={trace.retry_attempt !== null ? trace.retry_attempt : '-'}
          />
          <MetadataItem
            label="Cached"
            value={trace.was_cached !== null ? (trace.was_cached ? 'Yes' : 'No') : '-'}
          />
        </div>

        {/* Accordion Sections */}
        <Accordion
          type="multiple"
          defaultValue={[...(trace.error_data ? ['error'] : []), 'input', 'output']}
          className="w-full"
        >
          {trace.error_data != null && (
            <AccordionItem value="error" className="border-red-200 dark:border-red-800">
              <AccordionTrigger className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Error
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CodeBlock
                  content={formatJson(trace.error_data)}
                  className="bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200"
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {trace.input_data !== undefined && trace.input_data !== null && (
            <AccordionItem value="input">
              <AccordionTrigger>Input Data</AccordionTrigger>
              <AccordionContent>
                <CodeBlock content={formatJson(trace.input_data)} />
              </AccordionContent>
            </AccordionItem>
          )}

          {trace.output_data !== undefined && trace.output_data !== null && (
            <AccordionItem value="output">
              <AccordionTrigger>Output Data</AccordionTrigger>
              <AccordionContent>
                <CodeBlock content={formatJson(trace.output_data)} />
              </AccordionContent>
            </AccordionItem>
          )}

          {trace.prompt_text && (
            <AccordionItem value="prompt">
              <AccordionTrigger>LLM Prompt</AccordionTrigger>
              <AccordionContent>
                <CodeBlock content={trace.prompt_text} />
              </AccordionContent>
            </AccordionItem>
          )}

          {trace.completion_text && (
            <AccordionItem value="completion">
              <AccordionTrigger>LLM Completion</AccordionTrigger>
              <AccordionContent>
                <CodeBlock content={trace.completion_text} />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </>
  )
}

export function AuditDetailSheet({ traceId, courseId, open, onClose }: AuditDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {traceId ? <TraceDetailContent traceId={traceId} courseId={courseId} /> : null}
      </SheetContent>
    </Sheet>
  )
}
