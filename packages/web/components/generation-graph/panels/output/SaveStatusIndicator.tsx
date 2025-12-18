'use client';

import React from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { SaveStatus } from '../../hooks/useAutoSave';
import { cn } from '@/lib/utils';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error?: string | null;
  className?: string;
}

export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status,
  error,
  className,
}) => {
  if (status === 'idle') return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs transition-opacity duration-200',
        className
      )}
    >
      {status === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-blue-500 dark:text-blue-400" />
          <span className="text-slate-500 dark:text-slate-400">Сохранение...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="h-3 w-3 text-green-500 dark:text-green-400" />
          <span className="text-green-600 dark:text-green-400">Сохранено</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="h-3 w-3 text-red-500 dark:text-red-400" />
          <span className="text-red-600 dark:text-red-400" title={error || 'Ошибка сохранения'}>
            Ошибка
          </span>
        </>
      )}
    </div>
  );
};
