'use client';

import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type StaleStatus = 'fresh' | 'potentially_stale' | 'stale';

interface StaleDataIndicatorProps {
  status: StaleStatus;
  lastModified?: Date;
  parentLastModified?: Date;
  locale?: 'ru' | 'en';
  className?: string;
  children?: React.ReactNode;
}

const translations = {
  ru: {
    fresh: 'Данные актуальны',
    potentially_stale: 'Родительские данные изменены. Рекомендуется проверить',
    stale: 'Данные могут быть неактуальны. Требуется обновление',
  },
  en: {
    fresh: 'Data is up to date',
    potentially_stale: 'Parent data modified. Review recommended',
    stale: 'Data may be outdated. Update required',
  },
};

function getTooltipText(status: StaleStatus, locale: 'ru' | 'en' = 'ru'): string {
  return translations[locale][status];
}

function formatTimeDiff(lastModified: Date, parentLastModified: Date): string {
  const diffMinutes = Math.floor(
    (parentLastModified.getTime() - lastModified.getTime()) / (1000 * 60)
  );

  if (diffMinutes < 1) return 'только что';
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дн назад`;
}

export const StaleDataIndicator: React.FC<StaleDataIndicatorProps> = ({
  status,
  lastModified,
  parentLastModified,
  locale = 'ru',
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        'rounded-md p-2',
        status === 'fresh' && 'ring-2 ring-green-500/50',
        status === 'potentially_stale' && 'ring-2 ring-yellow-500',
        status === 'stale' && 'ring-2 ring-red-500',
        className
      )}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-start gap-2">
              {status === 'potentially_stale' && (
                <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              )}
              {status === 'stale' && (
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{children}</div>
            </div>
          </TooltipTrigger>
          {status !== 'fresh' && (
            <TooltipContent>
              <p>{getTooltipText(status, locale)}</p>
              {lastModified && parentLastModified && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {formatTimeDiff(lastModified, parentLastModified)}
                </p>
              )}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

/**
 * Calculate the staleness status based on modification times
 * @param lastModified - When this data was last modified
 * @param parentLastModified - When parent data was last modified
 * @param thresholdMinutes - Threshold in minutes to consider data stale (default: 30)
 * @returns StaleStatus indicating freshness level
 */
export function calculateStaleStatus(
  lastModified: Date,
  parentLastModified: Date,
  thresholdMinutes: number = 30
): StaleStatus {
  if (parentLastModified <= lastModified) return 'fresh';

  const diffMinutes =
    (parentLastModified.getTime() - lastModified.getTime()) / (1000 * 60);

  if (diffMinutes < thresholdMinutes) return 'potentially_stale';
  return 'stale';
}
