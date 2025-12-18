'use client';

import { useGenerationRealtime } from './realtime-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Check, Copy, XCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function TraceViewer() {
  const { traces, selectedTraceId } = useGenerationRealtime();
  const trace = traces.find((t) => t.id === selectedTraceId);

  if (!trace) {
    return (
      <div className="h-full flex items-center justify-center p-8 border-2 border-dashed rounded-xl text-muted-foreground bg-muted/10">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">No Trace Selected</p>
          <p className="text-sm">Click on an item in the timeline to view details</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              {trace.phase}
              {trace.error_data && <Badge variant="destructive">Error</Badge>}
            </CardTitle>
            <CardDescription className="font-mono text-xs">{trace.id}</CardDescription>
          </div>
          <Badge variant="outline" className="uppercase">
            {trace.stage}
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 text-sm">
          <MetadataItem label="Duration" value={`${trace.duration_ms || 0}ms`} />
          <MetadataItem label="Tokens" value={trace.tokens_used || '-'} />
          <MetadataItem label="Cost" value={trace.cost_usd ? `$${trace.cost_usd.toFixed(5)}` : '-'} />
          <MetadataItem label="Model" value={trace.model_used || '-'} className="col-span-2 sm:col-span-1" />
          <MetadataItem label="Quality" value={trace.quality_score || '-'} />
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 overflow-hidden">
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
                  <CodeBlock content={JSON.stringify(trace.error_data, null, 2)} language="json" className="bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" />
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="input">
              <AccordionTrigger>Input Data</AccordionTrigger>
              <AccordionContent>
                <CodeBlock content={JSON.stringify(trace.input_data, null, 2)} language="json" />
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
  );
}

function MetadataItem({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 p-2 bg-muted/30 rounded-md", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CodeBlock({ content, className }: { content: string; language: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative group rounded-md overflow-hidden border bg-muted/50", className)}>
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="ghost" className="h-8 w-8 bg-background/50 backdrop-blur-sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs font-mono leading-relaxed whitespace-pre-wrap break-words max-h-[500px]">
        {content}
      </pre>
    </div>
  );
}
