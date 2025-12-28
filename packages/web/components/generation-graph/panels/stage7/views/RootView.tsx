/**
 * RootView Component
 *
 * Displays list of enrichments for a lesson with add button.
 * Shows empty state with discovery cards when no enrichments exist.
 *
 * @module components/generation-graph/panels/stage7/views/RootView
 */

'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Layers, Plus, Video, HelpCircle, Volume2, Presentation, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useEnrichmentInspectorStore,
  type CreateEnrichmentType,
} from '../../../stores/enrichment-inspector-store';
import { EnrichmentStatusBadge } from '../EnrichmentStatusBadge';
import {
  ENRICHMENT_TYPE_CONFIG,
  type EnrichmentType,
  type EnrichmentStatus,
} from '@/lib/generation-graph/enrichment-config';
import { cn } from '@/lib/utils';

/**
 * Props for RootView
 */
export interface RootViewProps {
  /** Lesson ID to show enrichments for */
  lessonId: string;
  /** Optional className override */
  className?: string;
}

/**
 * Enrichment list item data structure
 */
interface EnrichmentListItemData {
  id: string;
  type: EnrichmentType;
  status: EnrichmentStatus;
  createdAt: string;
}

/**
 * EnrichmentTypeIcon Component
 *
 * Displays icon for enrichment type with appropriate color
 */
function EnrichmentTypeIcon({ type }: { type: EnrichmentType }) {
  const config = ENRICHMENT_TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center justify-center w-8 h-8 rounded', config.bgColor)}>
      <Icon className={cn('w-4 h-4', config.color)} />
    </div>
  );
}

/**
 * EnrichmentListItem Component
 *
 * Displays single enrichment in the list
 */
function EnrichmentListItem({
  enrichment,
  onClick,
}: {
  enrichment: EnrichmentListItemData;
  onClick: () => void;
}) {
  const t = useTranslations('enrichments');

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border',
        'hover:bg-slate-50 dark:hover:bg-slate-900',
        'hover:border-primary/50 transition-colors'
      )}
    >
      <EnrichmentTypeIcon type={enrichment.type} />
      <div className="flex-1 text-left">
        <span className="font-medium text-sm">{t(`types.${enrichment.type}`)}</span>
      </div>
      <EnrichmentStatusBadge status={enrichment.status} size="sm" />
    </button>
  );
}

/**
 * EnrichmentAddPopover Component
 *
 * Simple button to add enrichments (will be enhanced later with popover)
 */
function EnrichmentAddPopover({
  onSelect,
}: {
  onSelect: (type: CreateEnrichmentType) => void;
}) {
  const t = useTranslations('enrichments');

  return (
    <Button onClick={() => onSelect('quiz')} className="w-full">
      <Plus className="w-4 h-4 mr-2" />
      {t('inspector.addEnrichment')}
    </Button>
  );
}

/**
 * DiscoveryCard Component
 *
 * Card for discovering and creating enrichment types in empty state
 */
function DiscoveryCard({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-lg border',
        'bg-white dark:bg-slate-900',
        'hover:bg-slate-50 dark:hover:bg-slate-800',
        'hover:border-primary/50 transition-colors'
      )}
    >
      <Icon className="w-6 h-6 text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
    </button>
  );
}

/**
 * LoadingState Component
 *
 * Skeleton loading state while enrichments are being fetched
 */
function LoadingState() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
          <Skeleton className="w-8 h-8 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * ErrorState Component
 *
 * Shown when enrichments fail to load
 */
function ErrorState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  const t = useTranslations('enrichments');

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h3 className="text-lg font-medium text-red-700 dark:text-red-400 mb-2">{t('errors.loadFailed')}</h3>
      <p className="text-sm text-muted-foreground mb-4">{t('inspector.error')}</p>
      <Button onClick={onRetry} variant="outline">
        {t('inspector.retry')}
      </Button>
    </div>
  );
}

/**
 * EmptyState Component
 *
 * Shown when lesson has no enrichments yet
 */
function EmptyState({ onAddClick }: { onAddClick: (type: CreateEnrichmentType) => void }) {
  const t = useTranslations('enrichments');

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <Layers className="w-12 h-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">{t('inspector.empty')}</h3>
      <p className="text-sm text-muted-foreground mb-6">{t('inspector.emptyDescription')}</p>

      {/* Discovery cards */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <DiscoveryCard
          icon={Video}
          title={t('types.video')}
          onClick={() => onAddClick('video')}
        />
        <DiscoveryCard
          icon={HelpCircle}
          title={t('types.quiz')}
          onClick={() => onAddClick('quiz')}
        />
        <DiscoveryCard
          icon={Volume2}
          title={t('types.audio')}
          onClick={() => onAddClick('podcast')}
        />
        <DiscoveryCard
          icon={Presentation}
          title={t('types.presentation')}
          onClick={() => onAddClick('reading')}
        />
      </div>
    </div>
  );
}

/**
 * Data state for enrichment list
 */
type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: EnrichmentListItemData[] };

/**
 * Mock data hook - will be replaced with tRPC query
 */
function useEnrichmentList(_lessonId: string): DataState {
  // TODO: Replace with actual tRPC query:
  // const { data, isLoading, error } = trpc.enrichment.list.useQuery({ lessonId });
  //
  // For now, return empty success state to show empty state UI
  return { status: 'success', data: [] };
}

/**
 * RootView
 *
 * Main view for enrichment list. Shows:
 * - Loading state with skeletons while fetching
 * - Error state with retry button on failure
 * - Empty state with discovery cards when no enrichments
 * - List with add button when enrichments exist
 *
 * @example
 * ```tsx
 * <RootView lessonId="lesson-123" />
 * ```
 */
export function RootView({ lessonId, className }: RootViewProps) {
  const { openCreate, openDetail } = useEnrichmentInspectorStore();

  const dataState = useEnrichmentList(lessonId);

  // Render based on data state
  const renderContent = () => {
    switch (dataState.status) {
      case 'loading':
        return <LoadingState />;

      case 'error':
        return (
          <ErrorState
            onRetry={() => {
              // TODO: Trigger refetch when connected to tRPC
              console.log('Retry loading enrichments');
            }}
          />
        );

      case 'success': {
        const enrichments = dataState.data;
        const isEmpty = enrichments.length === 0;

        if (isEmpty) {
          return <EmptyState onAddClick={(type) => openCreate(type)} />;
        }

        return (
          <>
            {/* Enrichment list */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {enrichments.map((enrichment) => (
                  <EnrichmentListItem
                    key={enrichment.id}
                    enrichment={enrichment}
                    onClick={() => openDetail(enrichment.id)}
                  />
                ))}
              </div>
            </ScrollArea>

            {/* Add button */}
            <div className="border-t p-4">
              <EnrichmentAddPopover onSelect={(type) => openCreate(type)} />
            </div>
          </>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {renderContent()}
    </div>
  );
}

export default RootView;
