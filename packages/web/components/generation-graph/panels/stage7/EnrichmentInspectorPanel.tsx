/**
 * EnrichmentInspectorPanel Component
 *
 * Main inspector view router for Stage 7 enrichments.
 * Acts as a stack navigator, rendering different views based on state
 * from enrichment-inspector-store.
 *
 * Navigation flow:
 * - root: List of enrichments for a lesson
 * - create: Form to create new enrichment
 * - detail: Enrichment detail view
 *
 * @module components/generation-graph/panels/stage7/EnrichmentInspectorPanel
 */

'use client';

import React, { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useEnrichmentInspectorStore,
  useInspectorView,
  useSelectedEnrichmentId,
  useCreateEnrichmentType,
  useCanGoBack,
  type InspectorView,
  type CreateEnrichmentType,
} from '../../stores/enrichment-inspector-store';
import { RootView } from './views/RootView';
import { EnrichmentInspectorErrorBoundary } from './EnrichmentInspectorErrorBoundary';

/**
 * Props for EnrichmentInspectorPanel
 */
export interface EnrichmentInspectorPanelProps {
  /** Lesson ID to inspect enrichments for */
  lessonId: string;
  /** Optional className override */
  className?: string;
}

/**
 * InspectorHeader Sub-Component
 *
 * Displays header with title and optional back button
 */
function InspectorHeader({
  view,
  createType,
  canGoBack,
  onBack,
}: {
  view: InspectorView;
  createType: CreateEnrichmentType | null;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const locale = useLocale();

  // View titles (ru/en)
  const titles: Record<InspectorView, { ru: string; en: string }> = {
    root: { ru: 'Обогащения', en: 'Enrichments' },
    create: { ru: 'Создание', en: 'Create' },
    detail: { ru: 'Детали', en: 'Details' },
  };

  // Create type labels (ru/en)
  const createTypeLabels: Record<CreateEnrichmentType, { ru: string; en: string }> = {
    video: { ru: 'видео', en: 'video' },
    podcast: { ru: 'подкаст', en: 'podcast' },
    mindmap: { ru: 'майндмэп', en: 'mindmap' },
    case_study: { ru: 'кейс', en: 'case study' },
    quiz: { ru: 'тест', en: 'quiz' },
    flashcards: { ru: 'карточки', en: 'flashcards' },
    project: { ru: 'проект', en: 'project' },
    discussion: { ru: 'обсуждение', en: 'discussion' },
    reading: { ru: 'чтение', en: 'reading' },
    exercise: { ru: 'упражнение', en: 'exercise' },
  };

  // Build title based on view
  let title = titles[view][locale as 'ru' | 'en'];
  if (view === 'create' && createType) {
    const typeLabel = createTypeLabels[createType][locale as 'ru' | 'en'];
    title = locale === 'ru' ? `Создание: ${typeLabel}` : `Create ${typeLabel}`;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background/50 backdrop-blur-sm">
      {canGoBack && (
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      )}
      <h2 className="font-medium text-sm text-foreground">
        {title}
      </h2>
    </div>
  );
}


/**
 * CreateView Stub Component
 *
 * Placeholder for enrichment creation form
 */
function CreateView({
  type,
  lessonId,
}: {
  type: CreateEnrichmentType;
  lessonId: string;
}) {
  return (
    <div className="flex items-center justify-center h-full p-4 text-muted-foreground text-sm">
      Create {type} for lessonId: {lessonId}
    </div>
  );
}

/**
 * DetailView Stub Component
 *
 * Placeholder for enrichment detail view
 */
function DetailView({ enrichmentId }: { enrichmentId: string }) {
  return (
    <div className="flex items-center justify-center h-full p-4 text-muted-foreground text-sm">
      Details for enrichmentId: {enrichmentId}
    </div>
  );
}

/**
 * EnrichmentInspectorPanel
 *
 * Main inspector panel component with stack-based navigation.
 * Renders different views based on enrichment-inspector-store state.
 *
 * @example
 * ```tsx
 * <EnrichmentInspectorPanel lessonId="lesson-123" />
 * ```
 */
export function EnrichmentInspectorPanel({
  lessonId,
  className,
}: EnrichmentInspectorPanelProps) {
  // Store hooks
  const currentView = useInspectorView();
  const selectedEnrichmentId = useSelectedEnrichmentId();
  const createType = useCreateEnrichmentType();
  const canGoBack = useCanGoBack();
  const goBack = useEnrichmentInspectorStore((s) => s.goBack);

  // Initialize on lessonId change
  // Using getState() to avoid putting openRoot in deps (causes infinite loop)
  useEffect(() => {
    useEnrichmentInspectorStore.getState().openRoot(lessonId);
  }, [lessonId]);

  // Render view based on current state
  const renderView = () => {
    switch (currentView) {
      case 'root':
        return <RootView lessonId={lessonId} />;
      case 'create':
        return createType ? (
          <CreateView type={createType} lessonId={lessonId} />
        ) : null;
      case 'detail':
        return selectedEnrichmentId ? (
          <DetailView enrichmentId={selectedEnrichmentId} />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <EnrichmentInspectorErrorBoundary>
      <div className={cn('flex flex-col h-full bg-background', className)}>
        {/* Header with back button */}
        <InspectorHeader
          view={currentView}
          createType={createType}
          canGoBack={canGoBack}
          onBack={goBack}
        />

        {/* View content */}
        <div className="flex-1 overflow-hidden">
          {renderView()}
        </div>
      </div>
    </EnrichmentInspectorErrorBoundary>
  );
}

export default EnrichmentInspectorPanel;
