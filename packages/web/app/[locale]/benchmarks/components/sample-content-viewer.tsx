'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, Clock, Hash, Loader2 } from 'lucide-react'
import { benchmarkQueries } from '@/lib/queries/benchmarks'

interface SampleContentViewerProps {
  modelSlug: string
  modelName: string
}

export function SampleContentViewer({ modelSlug, modelName }: SampleContentViewerProps) {
  const t = useTranslations('benchmarks.sampleViewer')
  const [open, setOpen] = useState(false)

  const { data: sample, isLoading: loading } = useQuery({
    ...benchmarkQueries.sample(modelSlug),
    enabled: open,
  })

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
  }

  const getTierColor = (tier: string | null) => {
    switch (tier) {
      case 'S':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
      case 'A':
        return 'bg-green-500/20 text-green-400 border-green-500/50'
      case 'B':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      case 'C':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/50'
      case 'D':
        return 'bg-red-500/20 text-red-400 border-red-500/50'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50'
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <FileText className="h-3 w-3" />
          {t('viewContent')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {modelName}
            {sample?.tier && (
              <Badge variant="outline" className={getTierColor(sample.tier)}>
                {sample.tier}-Tier
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4 text-sm">
            {sample && (
              <>
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {sample.finalScore} {t('points')}
                </span>
                {sample.wordCount && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {sample.wordCount} {t('words')}
                  </span>
                )}
                {sample.generationTimeMs && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {(sample.generationTimeMs / 1000).toFixed(1)}s
                  </span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : sample ? (
          <Tabs defaultValue="content" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="content">{t('generatedContent')}</TabsTrigger>
              <TabsTrigger value="scores">{t('judgeScores')}</TabsTrigger>
              <TabsTrigger value="prompt">{t('inputPrompt')}</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-4">
              <ScrollArea className="bg-muted/30 h-[60vh] rounded-md border p-4">
                <div className="prose prose-sm prose-invert max-w-none font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {sample.outputContent}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="scores" className="mt-4">
              <ScrollArea className="bg-muted/30 h-[60vh] rounded-md border p-4">
                {sample.scoreBreakdown ? (
                  <div className="space-y-4">
                    <h4 className="font-semibold">{t('scoreBreakdown')}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(sample.scoreBreakdown).map(([key, value]) => (
                        <div
                          key={key}
                          className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2"
                        >
                          <span className="text-muted-foreground text-sm capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="font-mono font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>

                    {sample.judgeScores && (
                      <>
                        <h4 className="mt-6 font-semibold">{t('judgeDetails')}</h4>
                        <pre className="bg-muted/50 overflow-auto rounded-lg p-3 text-xs">
                          {JSON.stringify(sample.judgeScores, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('noScoreData')}</p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="prompt" className="mt-4">
              <ScrollArea className="bg-muted/30 h-[60vh] rounded-md border p-4">
                {sample.inputPrompt ? (
                  <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {sample.inputPrompt}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('noPromptData')}</p>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">{t('noSampleData')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
