'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import {
  ImageIcon,
  RefreshCw,
  AlertCircle,
  Clock,
  Check,
  Loader2,
  Palette,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutoCard, type CardData, type CardContent as CardContentType } from '@/hooks/useAutoCard';

// ============================================================================
// Types
// ============================================================================

export interface AutoCardPreviewProps {
  /** Card type: course or lesson */
  cardType: 'course' | 'lesson';
  /** Course UUID */
  courseId: string;
  /** Lesson UUID (required for lesson cards) */
  lessonId?: string;
  /** Compact mode (smaller image, less metadata) */
  compact?: boolean;
  /** External regenerate callback */
  onRegenerate?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// Props validation schema (dev mode only)
const autoCardPreviewPropsSchema = z.object({
  cardType: z.enum(['course', 'lesson']),
  courseId: z.string().uuid(),
  lessonId: z.string().uuid().optional(),
  compact: z.boolean().optional(),
  onRegenerate: z.function().optional(),
  className: z.string().optional(),
}).refine(
  (data) => data.cardType === 'lesson' ? !!data.lessonId : true,
  { message: 'lessonId required for lesson cards', path: ['lessonId'] }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format date for display
 */
function formatDate(dateString: string, locale: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return dateString;
  }
}

/**
 * Get status config for display
 */
function getStatusConfig(status: CardData['status'], t: ReturnType<typeof useTranslations>) {
  switch (status) {
    case 'completed':
      return {
        label: t('autoCard.ready'),
        variant: 'default' as const,
        icon: Check,
        color: 'text-green-600',
      };
    case 'pending':
    case 'generating':
      return {
        label: t('autoCard.generating'),
        variant: 'secondary' as const,
        icon: Loader2,
        color: 'text-amber-500',
        animate: true,
      };
    case 'failed':
      return {
        label: t('autoCard.error'),
        variant: 'destructive' as const,
        icon: AlertCircle,
        color: 'text-red-500',
      };
    case 'cancelled':
      return {
        label: t('autoCard.cancelled'),
        variant: 'outline' as const,
        icon: AlertCircle,
        color: 'text-muted-foreground',
      };
    default:
      return {
        label: status,
        variant: 'outline' as const,
        icon: Clock,
        color: 'text-muted-foreground',
      };
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Loading skeleton state
 */
function LoadingState({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-16 ml-auto" />
      </div>
      <Skeleton className={cn('w-full aspect-square rounded-lg', compact && 'max-w-[200px]')} />
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/**
 * Pending/Generating state
 */
function PendingState({
  status,
  compact,
  t,
}: {
  status: CardData['status'];
  compact?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const statusConfig = getStatusConfig(status, t);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-4">
      {/* Skeleton image with loading indicator */}
      <div
        className={cn(
          'relative w-full aspect-square bg-muted rounded-lg flex items-center justify-center',
          compact && 'max-w-[200px]'
        )}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <StatusIcon
            className={cn('w-8 h-8', statusConfig.animate && 'animate-spin')}
          />
          <span className="text-sm">{t('autoCard.generating')}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Error state
 */
function ErrorState({
  errorMessage,
  onRetry,
  isRetrying,
  t,
}: {
  errorMessage: string | null;
  onRetry: () => void;
  isRetrying: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-4">
      {/* Error placeholder */}
      <div className="relative w-full aspect-square bg-red-50 dark:bg-red-950/20 rounded-lg flex items-center justify-center border border-red-200 dark:border-red-900">
        <div className="flex flex-col items-center gap-3 text-center p-4">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {t('autoCard.error')}
            </p>
            {errorMessage && (
              <p className="text-xs text-red-500/80 max-w-[200px] line-clamp-2">
                {typeof errorMessage === 'string' ? errorMessage.slice(0, 200) : 'Unknown error'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Retry button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={isRetrying}
        className="w-full"
      >
        {isRetrying ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t('autoCard.generating')}
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('autoCard.retry')}
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * Completed state with image
 */
function CompletedState({
  content,
  metadata,
  updatedAt,
  locale,
  compact,
  onRegenerate,
  isRegenerating,
  t,
}: {
  content: CardContentType;
  metadata: CardData['metadata'];
  updatedAt: string;
  locale: string;
  compact?: boolean;
  onRegenerate: () => void;
  isRegenerating: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const visualStyle = metadata?.visualStyle;

  return (
    <div className="space-y-4">
      {/* Image container */}
      <div className={cn('flex gap-4', compact ? 'flex-col' : 'flex-row')}>
        {/* Image */}
        <div
          className={cn(
            'relative aspect-square rounded-lg overflow-hidden bg-muted',
            compact ? 'w-full max-w-[200px]' : 'w-32 h-32 flex-shrink-0'
          )}
        >
          <Image
            src={content.image_url}
            alt={content.alt_text || 'Generated card image'}
            fill
            className="object-cover"
            sizes={compact
              ? '(max-width: 640px) 100vw, 200px'
              : '128px'
            }
            unoptimized // External URL from storage
          />
        </div>

        {/* Metadata */}
        <div className={cn('flex-1 space-y-3', compact && 'pt-2')}>
          {/* Visual style badges */}
          {visualStyle && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Palette className="w-3 h-3" />
                {t('autoCard.visualStyle')}
              </div>
              <div className="flex flex-wrap gap-1">
                {visualStyle.colorScheme && (
                  <Badge variant="outline" className="text-xs">
                    {visualStyle.colorScheme}
                  </Badge>
                )}
                {visualStyle.aesthetic && (
                  <Badge variant="outline" className="text-xs">
                    {visualStyle.aesthetic}
                  </Badge>
                )}
                {visualStyle.mood && (
                  <Badge variant="outline" className="text-xs">
                    {visualStyle.mood}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Generation info */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>{t('autoCard.generatedAt')}:</span>
              <span className="font-medium">{formatDate(updatedAt, locale)}</span>
            </div>
            {metadata?.model && (
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3" />
                <span>{t('autoCard.model')}:</span>
                <span className="font-medium">{metadata.model}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Regenerate button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onRegenerate}
        disabled={isRegenerating}
        className="w-full"
      >
        {isRegenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t('autoCard.generating')}
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('autoCard.regenerate')}
          </>
        )}
      </Button>
    </div>
  );
}

/**
 * Empty state (no card found)
 */
function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <ImageIcon className="w-12 h-12 mb-3 opacity-40" />
      <p className="text-sm">{t('autoCard.notFound')}</p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * AutoCardPreview Component
 *
 * Displays automatically generated cards (course or lesson) with various states:
 * - Loading: Skeleton placeholders
 * - Pending/Generating: Animated loading indicator
 * - Completed: Image with metadata and regenerate option
 * - Error: Error message with retry button
 *
 * @example
 * ```tsx
 * // Course card
 * <AutoCardPreview
 *   cardType="course"
 *   courseId="uuid"
 * />
 *
 * // Lesson card (compact)
 * <AutoCardPreview
 *   cardType="lesson"
 *   courseId="uuid"
 *   lessonId="uuid"
 *   compact
 * />
 * ```
 */
export const AutoCardPreview = memo<AutoCardPreviewProps>(function AutoCardPreview({
  cardType,
  courseId,
  lessonId,
  compact = false,
  onRegenerate: externalRegenerate,
  className,
}) {
  const locale = (useLocale() as 'ru' | 'en') || 'en';
  const t = useTranslations('common');

  // Validate props in development mode
  if (process.env.NODE_ENV === 'development') {
    const validation = autoCardPreviewPropsSchema.safeParse({
      cardType, courseId, lessonId, compact, onRegenerate: externalRegenerate, className
    });
    if (!validation.success) {
      console.error('[AutoCardPreview] Invalid props:', validation.error.format());
    }
  }

  const {
    card,
    isLoading,
    isRegenerating,
    error,
    regenerate,
  } = useAutoCard({
    courseId,
    lessonId,
    cardType,
    enabled: true,
  });

  // Handle regenerate
  const handleRegenerate = async () => {
    await regenerate();
    externalRegenerate?.();
  };

  // Get card title based on type
  const cardTitle = cardType === 'course'
    ? t('autoCard.courseCard')
    : t('autoCard.lessonCard');

  // Determine status display
  const status = card?.status || (error ? 'failed' : 'pending');
  const statusConfig = getStatusConfig(status, t);
  const StatusIcon = statusConfig.icon;

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-cyan-500" />
            <span className="font-medium text-sm">{cardTitle}</span>
          </div>

          {/* Status badge */}
          {!isLoading && (
            <Badge
              variant={statusConfig.variant}
              className={cn(
                'text-xs gap-1',
                statusConfig.color
              )}
            >
              <StatusIcon
                className={cn(
                  'w-3 h-3',
                  statusConfig.animate && 'animate-spin'
                )}
              />
              {statusConfig.label}
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="pt-0">
        {/* Loading state */}
        {isLoading && <LoadingState compact={compact} />}

        {/* Error state (from hook) */}
        {!isLoading && error && !card && (
          <ErrorState
            errorMessage={error.message}
            onRetry={handleRegenerate}
            isRetrying={isRegenerating}
            t={t}
          />
        )}

        {/* Card not found */}
        {!isLoading && !error && !card && <EmptyState t={t} />}

        {/* Card exists - show appropriate state */}
        {!isLoading && card && (
          <>
            {/* Pending/Generating */}
            {['pending', 'generating'].includes(card.status) && (
              <PendingState status={card.status} compact={compact} t={t} />
            )}

            {/* Failed */}
            {card.status === 'failed' && (
              <ErrorState
                errorMessage={card.errorMessage}
                onRetry={handleRegenerate}
                isRetrying={isRegenerating}
                t={t}
              />
            )}

            {/* Completed */}
            {card.status === 'completed' && card.content && (
              <CompletedState
                content={card.content as CardContentType}
                metadata={card.metadata}
                updatedAt={card.updatedAt}
                locale={locale}
                compact={compact}
                onRegenerate={handleRegenerate}
                isRegenerating={isRegenerating}
                t={t}
              />
            )}

            {/* Cancelled - treat like error */}
            {card.status === 'cancelled' && (
              <ErrorState
                errorMessage={t('autoCard.cancelledMessage')}
                onRetry={handleRegenerate}
                isRetrying={isRegenerating}
                t={t}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
});
