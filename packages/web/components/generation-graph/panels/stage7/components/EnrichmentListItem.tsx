'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EnrichmentStatus, EnrichmentType } from '@megacampus/shared-types';
import { ENRICHMENT_TYPE_CONFIG } from '@/lib/generation-graph/enrichment-config';

export interface EnrichmentListItemData {
  id: string;
  type: EnrichmentType;
  status: EnrichmentStatus;
  display_order: number;
  error_message?: string | null;
}

export interface EnrichmentListItemProps {
  item: EnrichmentListItemData;
  isDragging?: boolean;
  onClick: () => void;
}

function StatusIndicator({ status }: { status: EnrichmentStatus }) {
  switch (status) {
    case 'pending':
    case 'draft_generating':
    case 'generating':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case 'draft_ready':
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case 'cancelled':
      return <AlertCircle className="w-4 h-4 text-slate-400" />;
    default:
      return null;
  }
}

function getStatusText(status: EnrichmentStatus, locale: string): string {
  const texts: Record<EnrichmentStatus, { en: string; ru: string }> = {
    pending: { en: 'Pending', ru: 'Ожидание' },
    draft_generating: { en: 'Generating draft...', ru: 'Генерация черновика...' },
    draft_ready: { en: 'Draft ready', ru: 'Черновик готов' },
    generating: { en: 'Generating...', ru: 'Генерация...' },
    completed: { en: 'Completed', ru: 'Завершено' },
    failed: { en: 'Failed', ru: 'Ошибка' },
    cancelled: { en: 'Cancelled', ru: 'Отменено' },
  };
  return locale === 'ru' ? texts[status].ru : texts[status].en;
}

/**
 * Sanitize error message for display.
 * - Truncates to reasonable length for UI
 * - Strips any HTML tags (though React escapes strings anyway)
 * - Provides user-friendly fallback
 */
function sanitizeErrorMessage(message: string | null | undefined, locale: string, maxLength = 80): string {
  if (!message) {
    return locale === 'ru' ? 'Произошла ошибка' : 'An error occurred';
  }
  // Strip any potential HTML tags
  const stripped = message.replace(/<[^>]*>/g, '');
  // Truncate long messages
  if (stripped.length > maxLength) {
    return stripped.slice(0, maxLength) + '...';
  }
  return stripped;
}

/**
 * Individual enrichment list item with drag handle and status indicator
 *
 * Supports @dnd-kit sortable for drag-and-drop reordering.
 * Shows enrichment type icon, name, and current status.
 *
 * @example
 * ```tsx
 * <EnrichmentListItem
 *   item={enrichment}
 *   isDragging={activeId === enrichment.id}
 *   onClick={() => openDetail(enrichment.id)}
 * />
 * ```
 */
export function EnrichmentListItem({ item, isDragging, onClick }: EnrichmentListItemProps) {
  const locale = useLocale();
  const config = ENRICHMENT_TYPE_CONFIG[item.type];

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeName = locale === 'ru' ? config.labelRu : config.label;
  const statusText = getStatusText(item.status, locale);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border rounded-lg',
        'cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg ring-2 ring-primary',
        item.status === 'failed' && 'border-red-200 dark:border-red-900'
      )}
      onClick={onClick}
    >
      {/* Drag Handle */}
      <button
        className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Type Icon */}
      <div className="p-2 rounded-md bg-primary/10 text-primary">
        {React.createElement(config.icon, { className: 'w-4 h-4' })}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{typeName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {item.status === 'failed'
            ? sanitizeErrorMessage(item.error_message, locale)
            : statusText}
        </div>
      </div>

      {/* Status Indicator */}
      <StatusIndicator status={item.status} />
    </div>
  );
}
