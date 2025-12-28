'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Video, HelpCircle, Headphones, Presentation, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { CreateEnrichmentType } from '../stores/enrichment-inspector-store';

export interface EnrichmentNodeToolbarProps {
  onCreateEnrichment: (type: CreateEnrichmentType) => void;
  existingTypes?: CreateEnrichmentType[];
  isCompact?: boolean;
  className?: string;
}

interface ToolbarButton {
  type: CreateEnrichmentType;
  icon: React.ReactNode;
  label: { en: string; ru: string };
  disabled?: boolean;
  comingSoon?: boolean;
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { type: 'quiz', icon: <HelpCircle className="w-4 h-4" />, label: { en: 'Add Quiz', ru: 'Добавить тест' } },
  { type: 'video', icon: <Video className="w-4 h-4" />, label: { en: 'Add Video', ru: 'Добавить видео' } },
  { type: 'podcast', icon: <Headphones className="w-4 h-4" />, label: { en: 'Add Audio', ru: 'Добавить аудио' } },
  { type: 'mindmap', icon: <Presentation className="w-4 h-4" />, label: { en: 'Add Presentation', ru: 'Добавить презентацию' } },
  { type: 'reading', icon: <FileText className="w-4 h-4" />, label: { en: 'Add Document', ru: 'Добавить документ' }, disabled: true, comingSoon: true },
];

/**
 * Node toolbar for quick enrichment creation via deep-links
 *
 * Appears when a lesson node is selected, providing quick access
 * to create each enrichment type.
 *
 * @example
 * ```tsx
 * <EnrichmentNodeToolbar
 *   onCreateEnrichment={(type) => {
 *     inspectorStore.openCreate(type);
 *   }}
 *   existingTypes={['quiz']} // Quiz button will be dimmed
 * />
 * ```
 */
export function EnrichmentNodeToolbar({
  onCreateEnrichment,
  existingTypes = [],
  isCompact = false,
  className,
}: EnrichmentNodeToolbarProps) {
  const locale = useLocale();

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-1 bg-white dark:bg-slate-900 rounded-lg shadow-lg border',
        className
      )}
    >
      {TOOLBAR_BUTTONS.map((btn) => {
        const hasExisting = existingTypes.includes(btn.type);
        const isDisabled = btn.disabled;
        const label = locale === 'ru' ? btn.label.ru : btn.label.en;
        const comingSoonLabel = locale === 'ru' ? '(Скоро)' : '(Coming Soon)';

        return (
          <Tooltip key={btn.type}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isCompact ? 'icon' : 'sm'}
                className={cn(
                  'h-8',
                  hasExisting && 'opacity-50',
                  isDisabled && 'opacity-30 cursor-not-allowed'
                )}
                onClick={() => !isDisabled && onCreateEnrichment(btn.type)}
                disabled={isDisabled}
              >
                {btn.icon}
                {!isCompact && <span className="ml-1 text-xs sr-only">{label}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {label}
              {btn.comingSoon && ` ${comingSoonLabel}`}
              {hasExisting && ` (${locale === 'ru' ? 'есть' : 'exists'})`}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {/* Add more button (opens popover) */}
      <div className="w-px h-6 bg-border mx-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onCreateEnrichment('quiz')} // Default to quiz
          >
            <Plus className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {locale === 'ru' ? 'Добавить обогащение' : 'Add Enrichment'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Minimal version for inline use in nodes
 */
export function EnrichmentQuickAdd({
  onAdd,
  className,
}: {
  onAdd: () => void;
  className?: string;
}) {
  const locale = useLocale();
  const label = locale === 'ru' ? 'Добавить обогащение' : 'Add enrichment';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
            className
          )}
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
        >
          <Plus className="w-4 h-4 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
