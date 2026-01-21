'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Image as ImageIcon, ChevronDown, Coins, HelpCircle, RefreshCw, Expand } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Database } from '@/types/database.generated'
import type { CoverEnrichmentContent, CardEnrichmentContent } from '@megacampus/shared-types'

type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row']
type ImageEnrichmentType = 'cover' | 'card'

const IMAGE_CONFIG: Record<
  ImageEnrichmentType,
  {
    color: string
    bgColor: string
    estimatedTokens: number
    aspectRatio: string
    previewAspectRatio: string
  }
> = {
  cover: {
    color: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    estimatedTokens: 5000,
    aspectRatio: '16:9',
    previewAspectRatio: 'aspect-video',
  },
  card: {
    color: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    estimatedTokens: 3000,
    aspectRatio: '1:1',
    previewAspectRatio: 'aspect-square',
  },
}

interface ImagePlaceholderCardProps {
  type: ImageEnrichmentType
  /** Existing enrichment if already generated */
  existingEnrichment?: EnrichmentRow | null
  onGenerate: (settings: Record<string, unknown>) => void
  disabled?: boolean
  isGenerating?: boolean
}

/** Helper component for field label with tooltip */
function LabelWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

export function ImagePlaceholderCard({
  type,
  existingEnrichment,
  onGenerate,
  disabled = false,
  isGenerating = false,
}: ImagePlaceholderCardProps) {
  const t = useTranslations('enrichments')
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [isRegenerateOpen, setIsRegenerateOpen] = useState(false)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [style, setStyle] = useState('realistic')
  const [colorScheme, setColorScheme] = useState('auto')
  const [customPrompt, setCustomPrompt] = useState('')

  const config = IMAGE_CONFIG[type]

  // Extract image URL from content if enrichment exists
  const content = existingEnrichment?.content as
    | CoverEnrichmentContent
    | CardEnrichmentContent
    | null
  const imageUrl = content?.imageUrl
  const hasImage = existingEnrichment?.status === 'completed' && imageUrl

  const getSettings = (): Record<string, unknown> => ({
    style,
    colorScheme,
    customPrompt: customPrompt.trim() || undefined,
  })

  const handleGenerate = () => {
    onGenerate(getSettings())
  }

  const handleRegenerate = () => {
    onGenerate({
      ...getSettings(),
      regenerate: true,
    })
    setCustomPrompt('')
    setIsRegenerateOpen(false)
  }

  return (
    <Card
      className={`overflow-hidden border-2 ${hasImage ? 'border-solid' : 'border-dashed'} bg-gray-50 transition-shadow hover:shadow-md dark:bg-gray-900/20`}
    >
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-base font-medium">{t(`images.${type}.title`)}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {config.aspectRatio}
            </Badge>
            {!hasImage && (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                <Coins className="mr-1 h-3 w-3" />~{config.estimatedTokens.toLocaleString()}{' '}
                {t('images.tokens')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        {/* Show preview if image exists */}
        {hasImage && (
          <>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className={`group relative w-full overflow-hidden rounded-lg border bg-gray-100 dark:bg-gray-800 ${config.previewAspectRatio} hover:ring-primary/50 max-h-48 cursor-pointer transition-all hover:ring-2`}
            >
              <Image
                src={imageUrl}
                alt={content?.altText || t(`images.${type}.title`)}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 300px"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                <Expand className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </button>

            {/* Lightbox Dialog */}
            <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
              <DialogContent className="max-w-4xl p-2">
                <DialogTitle className="sr-only">{t(`images.${type}.title`)}</DialogTitle>
                <div className={`relative w-full ${config.previewAspectRatio}`}>
                  <Image
                    src={imageUrl}
                    alt={content?.altText || t(`images.${type}.title`)}
                    fill
                    className="object-contain"
                    sizes="(max-width: 1024px) 100vw, 900px"
                    priority
                  />
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Description - only show if no image */}
        {!hasImage && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t(`images.${type}.description`)}
            </p>
            <p className="text-xs text-gray-400 italic dark:text-gray-500">
              {t(`images.${type}.usageHint`)}
            </p>
          </>
        )}

        {/* Options/Regenerate Section */}
        {hasImage ? (
          /* Regenerate section for existing images */
          <Collapsible open={isRegenerateOpen} onOpenChange={setIsRegenerateOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <RefreshCw className={`h-4 w-4 ${isRegenerateOpen ? 'text-primary' : ''}`} />
                  {t('images.regenerateSection')}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isRegenerateOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <LabelWithTooltip
                  label={t('images.regeneratePrompt.label')}
                  tooltip={t('images.regeneratePrompt.tooltip')}
                />
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={t('images.regeneratePrompt.placeholder')}
                  className="min-h-[80px] resize-none text-sm"
                  disabled={disabled || isGenerating}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleRegenerate}
                  size="sm"
                  disabled={disabled || isGenerating}
                  aria-label={`Regenerate ${type} image`}
                  aria-busy={isGenerating}
                >
                  <RefreshCw
                    className={`mr-1.5 h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`}
                  />
                  {isGenerating ? t('generating') : t('images.regenerateButton')}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          /* Options section for new images */
          <Collapsible open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2">
                <span className="text-sm font-medium">{t('options')}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOptionsOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <LabelWithTooltip
                  label={t('images.style.label')}
                  tooltip={t('images.style.tooltip')}
                />
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="realistic">{t('images.style.realistic')}</SelectItem>
                    <SelectItem value="abstract">{t('images.style.abstract')}</SelectItem>
                    <SelectItem value="minimalist">{t('images.style.minimalist')}</SelectItem>
                    {type === 'cover' && (
                      <SelectItem value="dramatic">{t('images.style.dramatic')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <LabelWithTooltip
                  label={t('images.colorScheme.label')}
                  tooltip={t('images.colorScheme.tooltip')}
                />
                <Select value={colorScheme} onValueChange={setColorScheme}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('images.colorScheme.auto')}</SelectItem>
                    <SelectItem value="warm">{t('images.colorScheme.warm')}</SelectItem>
                    <SelectItem value="cool">{t('images.colorScheme.cool')}</SelectItem>
                    <SelectItem value="monochrome">{t('images.colorScheme.monochrome')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom prompt field */}
              <div className="space-y-1.5">
                <LabelWithTooltip
                  label={t('images.customPrompt.label')}
                  tooltip={t('images.customPrompt.tooltip')}
                />
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={t('images.customPrompt.placeholder')}
                  className="min-h-[80px] resize-none text-sm"
                  disabled={disabled || isGenerating}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Generate button - only show if no image */}
        {!hasImage && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleGenerate}
              size="sm"
              disabled={disabled || isGenerating}
              aria-label={`Generate ${type} image`}
              aria-busy={isGenerating}
            >
              {isGenerating ? t('generating') : t('images.generateButton')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
