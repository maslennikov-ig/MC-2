'use client'

import { useGenerationRealtime } from './realtime-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Check, Copy, XCircle, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export function TraceViewer() {
  const { traces, selectedTraceId, fetchTraceDetails } = useGenerationRealtime()
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const trace = traces.find((t) => t.id === selectedTraceId)

  // Lazy load full trace details when a trace is selected
  useEffect(() => {
    if (!selectedTraceId) return

    const loadDetails = async () => {
      const existing = traces.find((t) => t.id === selectedTraceId)
      // Skip if already has input_data loaded (not just undefined from skeleton)
      if (existing?.input_data !== undefined) return

      setIsLoadingDetails(true)
      try {
        await fetchTraceDetails(selectedTraceId)
      } finally {
        setIsLoadingDetails(false)
      }
    }

    void loadDetails()
  }, [selectedTraceId, fetchTraceDetails, traces])

  if (!trace) {
    return (
      <div className="text-muted-foreground bg-muted/10 flex h-full items-center justify-center rounded-xl border-2 border-dashed p-8">
        <div className="space-y-2 text-center">
          <p className="text-lg font-medium">No Trace Selected</p>
          <p className="text-sm">Click on an item in the timeline to view details</p>
        </div>
      </div>
    )
  }

  return (
    <Card className="flex h-full flex-col border-none bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              {trace.phase}
              {trace.error_data && <Badge variant="destructive">Error</Badge>}
            </CardTitle>
            <CardDescription className="font-mono text-xs">{trace.id}</CardDescription>
          </div>
          <Badge variant="outline" className="uppercase">
            {trace.stage}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <MetadataItem label="Duration" value={`${trace.duration_ms || 0}ms`} />
          <MetadataItem label="Tokens" value={trace.tokens_used || '-'} />
          <MetadataItem
            label="Cost"
            value={trace.cost_usd ? `$${trace.cost_usd.toFixed(5)}` : '-'}
          />
          <MetadataItem
            label="Model"
            value={trace.model_used || '-'}
            className="col-span-2 sm:col-span-1"
          />
          <MetadataItem label="Quality" value={trace.quality_score || '-'} />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden px-0">
        <ScrollArea className="h-full pr-4">
          <Accordion type="multiple" defaultValue={['input', 'output', 'error']} className="w-full">
            {trace.error_data && (
              <AccordionItem value="error" className="border-red-200">
                <AccordionTrigger className="text-red-500 hover:text-red-600">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Error Details
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CodeBlock
                    content={JSON.stringify(trace.error_data, null, 2)}
                    language="json"
                    className="bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200"
                  />
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="input">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  Input Data
                  {isLoadingDetails && <Loader2 className="h-3 w-3 animate-spin" />}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <CodeBlock
                  content={
                    trace.input_data != null ? JSON.stringify(trace.input_data, null, 2) : ''
                  }
                  language="json"
                />
              </AccordionContent>
            </AccordionItem>

            {trace.output_data && (
              <AccordionItem value="output">
                <AccordionTrigger>Output Data</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock content={JSON.stringify(trace.output_data, null, 2)} language="json" />
                </AccordionContent>
              </AccordionItem>
            )}

            {trace.prompt_text && (
              <AccordionItem value="prompt">
                <AccordionTrigger>LLM Prompt</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock content={trace.prompt_text} language="text" />
                </AccordionContent>
              </AccordionItem>
            )}

            {trace.completion_text && (
              <AccordionItem value="completion">
                <AccordionTrigger>LLM Completion</AccordionTrigger>
                <AccordionContent>
                  <CodeBlock content={trace.completion_text} language="text" />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </ScrollArea>
      </CardContent>
    </Card>
  )
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

function CodeBlock({
  content,
  className,
}: {
  content: string
  language: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className={cn('group bg-muted/50 relative overflow-hidden rounded-md border', className)}>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="bg-background/50 h-8 w-8 backdrop-blur-sm"
          onClick={handleCopy}
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
