'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Image, ChevronDown, Coins } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ImageEnrichmentType = 'cover' | 'card'

const IMAGE_CONFIG: Record<
  ImageEnrichmentType,
  {
    color: string
    bgColor: string
    estimatedTokens: number
    aspectRatio: string
  }
> = {
  cover: {
    color: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
    estimatedTokens: 5000,
    aspectRatio: '16:9',
  },
  card: {
    color: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    estimatedTokens: 3000,
    aspectRatio: '1:1',
  },
}

interface ImagePlaceholderCardProps {
  type: ImageEnrichmentType
  onGenerate: (settings: Record<string, unknown>) => void
  disabled?: boolean
  isGenerating?: boolean
}

export function ImagePlaceholderCard({
  type,
  onGenerate,
  disabled = false,
  isGenerating = false,
}: ImagePlaceholderCardProps) {
  const t = useTranslations('enrichments')
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const [style, setStyle] = useState('realistic')
  const [colorScheme, setColorScheme] = useState('auto')

  const config = IMAGE_CONFIG[type]

  const getSettings = (): Record<string, unknown> => ({
    style,
    colorScheme,
  })

  const handleGenerate = () => {
    onGenerate(getSettings())
  }

  return (
    <Card className="overflow-hidden border-2 border-dashed bg-gray-50 transition-shadow hover:shadow-md dark:bg-gray-900/20">
      <CardHeader className={`${config.bgColor} py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-base font-medium">{t(`images.${type}.title`)}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {config.aspectRatio}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground text-xs">
              <Coins className="mr-1 h-3 w-3" />~{config.estimatedTokens.toLocaleString()}{' '}
              {t('images.tokens')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t(`images.${type}.description`)}
        </p>

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
              <label className="text-sm font-medium">{t('images.style.label')}</label>
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
              <label className="text-sm font-medium">{t('images.colorScheme.label')}</label>
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
          </CollapsibleContent>
        </Collapsible>

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
      </CardContent>
    </Card>
  )
}
