'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ENRICHMENT_TYPE_CONFIG } from '@/lib/generation-graph/enrichment-config';
import type { CreateEnrichmentType } from '../../../stores/enrichment-inspector-store';

export interface EnrichmentAddPopoverProps {
  onSelect: (type: CreateEnrichmentType) => void;
  disabledTypes?: CreateEnrichmentType[];
  className?: string;
}

interface EnrichmentTypeOption {
  type: CreateEnrichmentType;
  configKey: 'quiz' | 'video' | 'audio' | 'presentation' | 'document';
  disabled?: boolean;
  comingSoon?: boolean;
}

const ENRICHMENT_OPTIONS: EnrichmentTypeOption[] = [
  { type: 'quiz', configKey: 'quiz' },
  { type: 'video', configKey: 'video' },
  { type: 'podcast', configKey: 'audio' },
  { type: 'mindmap', configKey: 'presentation' },
  { type: 'reading', configKey: 'document', disabled: true, comingSoon: true },
];

/**
 * Popover for adding new enrichments to a lesson
 *
 * Shows available enrichment types with icons and descriptions.
 * Document type is disabled with "Coming Soon" indicator.
 *
 * @example
 * ```tsx
 * <EnrichmentAddPopover
 *   onSelect={(type) => openCreate(type)}
 *   disabledTypes={['quiz']} // Already has a quiz
 * />
 * ```
 */
export function EnrichmentAddPopover({ onSelect, disabledTypes = [], className }: EnrichmentAddPopoverProps) {
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);

  const addLabel = locale === 'ru' ? 'Добавить' : 'Add';
  const comingSoonLabel = locale === 'ru' ? 'Скоро' : 'Coming Soon';

  const handleSelect = (type: CreateEnrichmentType) => {
    onSelect(type);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Plus className="w-4 h-4 mr-2" />
          {addLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-1">
          {ENRICHMENT_OPTIONS.map((option) => {
            const config = ENRICHMENT_TYPE_CONFIG[option.configKey];
            const isDisabled = option.disabled || disabledTypes.includes(option.type);
            const label = locale === 'ru' ? config.labelRu : config.label;

            return (
              <button
                key={option.type}
                className={cn(
                  'flex items-center gap-3 w-full p-2 rounded-md text-left',
                  'hover:bg-accent transition-colors',
                  isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                )}
                onClick={() => !isDisabled && handleSelect(option.type)}
                disabled={isDisabled}
              >
                <div className={cn('p-1.5 rounded', config.bgClass)}>
                  {React.createElement(config.icon, { className: cn('w-4 h-4', config.colorClass) })}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{label}</div>
                  {option.comingSoon && (
                    <div className="text-xs text-amber-600 dark:text-amber-400">{comingSoonLabel}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Floating add button for mobile/bottom sheet use
 */
export function EnrichmentAddButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const locale = useLocale();
  const label = locale === 'ru' ? 'Добавить обогащение' : 'Add Enrichment';

  return (
    <Button onClick={onClick} className={cn('w-full', className)}>
      <Plus className="w-4 h-4 mr-2" />
      {label}
    </Button>
  );
}
