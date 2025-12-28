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

import React, { useEffect, Suspense, lazy } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Loader2 } from 'lucide-react';
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
import type { CreateViewProps } from './views/CreateView';

// Lazy load heavy views to reduce initial bundle
const CreateViewLazy = lazy(() => import('./views/CreateView').then(m => ({ default: m.CreateView })));
const DetailViewLazy = lazy(() => import('./views/DetailView').then(m => ({ default: m.DetailView })));

/**
 * CreateView supported types - subset of CreateEnrichmentType
 * Maps store types to CreateView types where applicable
 */
type SupportedCreateType = CreateViewProps['type'];
const SUPPORTED_CREATE_TYPES = new Set<string>(['quiz', 'video']);

/**
 * Map CreateEnrichmentType to CreateView type if supported
 * Returns null for unsupported types
 */
function mapToCreateViewType(type: CreateEnrichmentType): SupportedCreateType | null {
  if (SUPPORTED_CREATE_TYPES.has(type)) {
    return type as SupportedCreateType;
  }
  // Map podcast to audio (same form)
  if (type === 'podcast') {
    return 'audio';
  }
  return null;
}

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
  const t = useTranslations('enrichments');

  // Build title based on view
  let title = t(`inspector.views.${view}`);
  if (view === 'create' && createType) {
    title = `${t('inspector.createPrefix')} ${t(`types.${createType}`)}`;
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
 * Loading spinner for lazy-loaded views
 */
function ViewLoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Placeholder for unsupported create types (forms not yet implemented)
 */
function UnsupportedCreateTypePlaceholder({ type }: { type: string }) {
  return (
    <div className="flex items-center justify-center h-full p-4 text-muted-foreground text-sm">
      Form for &quot;{type}&quot; coming soon
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
      case 'create': {
        if (!createType) return null;
        const mappedType = mapToCreateViewType(createType);
        if (mappedType) {
          return (
            <Suspense fallback={<ViewLoadingSpinner />}>
              <CreateViewLazy type={mappedType} lessonId={lessonId} />
            </Suspense>
          );
        }
        // Fallback for unsupported types
        return <UnsupportedCreateTypePlaceholder type={createType} />;
      }
      case 'detail':
        return selectedEnrichmentId ? (
          <Suspense fallback={<ViewLoadingSpinner />}>
            <DetailViewLazy enrichmentId={selectedEnrichmentId} />
          </Suspense>
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
