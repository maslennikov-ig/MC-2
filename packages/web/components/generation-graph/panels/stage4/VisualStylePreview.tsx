'use client';

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Palette, Sparkles, Shapes, Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VisualStyle } from '@megacampus/shared-types';

// ============================================================================
// TYPES
// ============================================================================

interface VisualStylePreviewProps {
  /** Visual style data from Stage 4 */
  visualStyle: VisualStyle;
  /** Locale for translations */
  locale?: 'ru' | 'en';
  /** Optional className */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * VisualStylePreview - Displays visual style recommendations for course imagery
 *
 * Shows the 4 key aspects of visual style generated in Stage 4:
 * - Color scheme: Palette description
 * - Aesthetic: Overall visual style
 * - Visual elements: Specific motifs and patterns
 * - Mood: Emotional tone
 *
 * Used in Stage 4 OutputTab to preview course branding direction.
 */
export const VisualStylePreview = memo<VisualStylePreviewProps>(
  function VisualStylePreview({ visualStyle, locale: _locale = 'ru', className }) {
    const t = useTranslations('generation.stage4');

    const styleItems = [
      {
        icon: Palette,
        label: t('visualStyleColorScheme'),
        value: visualStyle.colorScheme,
        iconColor: 'text-pink-500 dark:text-pink-400',
        bgColor: 'bg-pink-50 dark:bg-pink-950/30',
      },
      {
        icon: Sparkles,
        label: t('visualStyleAesthetic'),
        value: visualStyle.aesthetic,
        iconColor: 'text-violet-500 dark:text-violet-400',
        bgColor: 'bg-violet-50 dark:bg-violet-950/30',
      },
      {
        icon: Shapes,
        label: t('visualStyleVisualElements'),
        value: visualStyle.visualElements,
        iconColor: 'text-blue-500 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-950/30',
      },
      {
        icon: Heart,
        label: t('visualStyleMood'),
        value: visualStyle.mood,
        iconColor: 'text-amber-500 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      },
    ];

    return (
      <Card
        className={cn(
          'border-l-4 border-l-pink-500',
          'bg-gradient-to-r from-pink-50/50 to-violet-50/50',
          'dark:from-pink-950/20 dark:to-violet-950/20',
          className
        )}
        role="article"
        aria-labelledby="visual-style-title"
      >
        <CardHeader className="pb-2">
          <CardTitle
            id="visual-style-title"
            className="text-base font-semibold flex items-center gap-2"
          >
            <Palette className="h-4 w-4 text-pink-500" aria-hidden="true" />
            {t('visualStyleTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('visualStyleDescription')}
          </p>
        </CardHeader>
        <CardContent className="space-y-3" role="list">
          {styleItems.map((item) => (
            <div
              key={item.label}
              className={cn(
                'flex items-start gap-3 p-2.5 rounded-lg',
                item.bgColor
              )}
              role="listitem"
              aria-label={`${item.label}: ${item.value}`}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-md shrink-0',
                  'bg-white/80 dark:bg-slate-800/80'
                )}
                aria-hidden="true"
              >
                <item.icon className={cn('h-4 w-4', item.iconColor)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">
                  {item.label}
                </p>
                <p className="text-sm text-foreground leading-snug">
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }
);

export default VisualStylePreview;
