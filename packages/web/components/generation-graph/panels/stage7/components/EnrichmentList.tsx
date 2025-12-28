'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { EnrichmentListItem, EnrichmentListItemData } from './EnrichmentListItem';

/**
 * Minimum drag distance in pixels before activation.
 * Prevents accidental drags when user is just clicking.
 * 8px is optimal for touch and mouse (@dnd-kit recommendation)
 */
const DRAG_ACTIVATION_DISTANCE_PX = 8;

export interface EnrichmentListProps {
  items: EnrichmentListItemData[];
  onItemClick: (id: string) => void;
  onReorder?: (items: EnrichmentListItemData[]) => void;
  className?: string;
}

/**
 * Sortable enrichment list with drag-and-drop reordering
 *
 * Uses @dnd-kit for accessible drag-and-drop functionality.
 * Calls onReorder when items are reordered by the user.
 *
 * @example
 * ```tsx
 * <EnrichmentList
 *   items={enrichments}
 *   onItemClick={(id) => openDetail(id)}
 *   onReorder={(items) => reorderMutation.mutate(items)}
 * />
 * ```
 */
export function EnrichmentList({ items, onItemClick, onReorder, className }: EnrichmentListProps) {
  const t = useTranslations('enrichments');
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: DRAG_ACTIVATION_DISTANCE_PX,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(items, oldIndex, newIndex);
        onReorder?.(newItems);
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-32 text-muted-foreground', className)}>
        {t('inspector.empty')}
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => setActiveId(event.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-2">
            {items.map((item) => (
              <EnrichmentListItem
                key={item.id}
                item={item}
                isDragging={activeId === item.id}
                onClick={() => onItemClick(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </ScrollArea>
  );
}
