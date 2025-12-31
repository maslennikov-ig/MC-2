'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { Loader2, AlertCircle, RotateCcw, Check, Trash2, FileQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { sanitizeErrorMessage } from '@/lib/utils/sanitize-error';
import { Button } from '@/components/ui/button';
import { QuizPreview, type QuizPreviewProps } from '../QuizPreview';
import { AudioPreview, type AudioPreviewProps } from '../AudioPreview';
import { VideoScriptPanel, type VideoScriptPanelProps } from '../VideoScriptPanel';
import { PresentationPreview, type PresentationPreviewProps } from '../PresentationPreview';
import { CoverPreview, type CoverPreviewProps } from '../CoverPreview';
import { DeleteConfirmationDialog } from '../components/DeleteConfirmationDialog';
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config';
import { cn } from '@/lib/utils';
import { useStaticGraph } from '../../../contexts/StaticGraphContext';
import { useEnrichmentInspectorStore } from '../../../stores/enrichment-inspector-store';
import { getEnrichment, deleteEnrichment } from '@/app/actions/enrichment-actions';

export interface DetailViewProps {
  enrichmentId: string;
  className?: string;
}

// Type aliases for each preview component's enrichment prop
type QuizEnrichment = QuizPreviewProps['enrichment'];
type VideoEnrichment = VideoScriptPanelProps['enrichment'];
type AudioEnrichment = AudioPreviewProps['enrichment'];
type PresentationEnrichment = PresentationPreviewProps['enrichment'];
type CoverEnrichment = CoverPreviewProps['enrichment'];

// Discriminated union for type-safe enrichment handling
interface EnrichmentBase {
  id: string;
  status: EnrichmentStatus;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  asset_url: string | null;
  draft_content: unknown | null;
}

interface QuizEnrichmentData extends EnrichmentBase {
  type: 'quiz';
  content: QuizEnrichment['content'];
}

interface VideoEnrichmentData extends EnrichmentBase {
  type: 'video';
  content: VideoEnrichment['content'];
}

interface AudioEnrichmentData extends EnrichmentBase {
  type: 'audio';
  content: AudioEnrichment['content'];
}

interface PresentationEnrichmentData extends EnrichmentBase {
  type: 'presentation';
  content: PresentationEnrichment['content'];
}

interface CoverEnrichmentData extends EnrichmentBase {
  type: 'cover';
  content: CoverEnrichment['content'];
}

// Discriminated union type
type EnrichmentData =
  | QuizEnrichmentData
  | VideoEnrichmentData
  | AudioEnrichmentData
  | PresentationEnrichmentData
  | CoverEnrichmentData;

// Data state for the enrichment detail
type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'not_found' }
  | { status: 'success'; data: EnrichmentData };

/**
 * Hook to fetch enrichment data from server action
 */
function useEnrichmentDetail(enrichmentId: string): DataState & { refetch: () => void } {
  const { courseInfo } = useStaticGraph();
  const [state, setState] = useState<DataState>({ status: 'loading' });

  const fetchEnrichment = useCallback(async () => {
    if (!enrichmentId || !courseInfo?.id) {
      setState({ status: 'not_found' });
      return;
    }

    setState({ status: 'loading' });

    try {
      const result = await getEnrichment({
        enrichmentId,
        courseId: courseInfo.id,
      });

      if (!result.success || !result.enrichment) {
        if (result.error === 'Enrichment not found') {
          setState({ status: 'not_found' });
        } else {
          setState({ status: 'error', error: result.error || 'Failed to load enrichment' });
        }
        return;
      }

      // Map database types to component types
      const enrichment = result.enrichment;
      const baseData: EnrichmentBase = {
        id: enrichment.id,
        status: enrichment.status as EnrichmentStatus,
        metadata: enrichment.metadata,
        error_message: enrichment.error_message,
        asset_url: enrichment.asset_url,
        draft_content: enrichment.draft_content,
      };

      // Create discriminated union based on type
      let enrichmentData: EnrichmentData;
      switch (enrichment.enrichment_type) {
        case 'quiz':
          enrichmentData = {
            ...baseData,
            type: 'quiz',
            content: enrichment.content as QuizEnrichment['content'],
          };
          break;
        case 'video':
          enrichmentData = {
            ...baseData,
            type: 'video',
            content: enrichment.content as VideoEnrichment['content'],
          };
          break;
        case 'audio':
          enrichmentData = {
            ...baseData,
            type: 'audio',
            content: enrichment.content as AudioEnrichment['content'],
          };
          break;
        case 'presentation':
          enrichmentData = {
            ...baseData,
            type: 'presentation',
            content: enrichment.content as PresentationEnrichment['content'],
          };
          break;
        case 'cover':
          enrichmentData = {
            ...baseData,
            type: 'cover',
            content: enrichment.content as CoverEnrichment['content'],
          };
          break;
        case 'document':
          // Document type not yet supported in preview, treat as not found
          setState({ status: 'not_found' });
          return;
        default:
          setState({ status: 'error', error: 'Unknown enrichment type' });
          return;
      }

      setState({ status: 'success', data: enrichmentData });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to load enrichment',
      });
    }
  }, [enrichmentId, courseInfo?.id]);

  useEffect(() => {
    fetchEnrichment();
  }, [fetchEnrichment]);

  return { ...state, refetch: fetchEnrichment };
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function NotFoundState() {
  const locale = useLocale();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <FileQuestion className="w-12 h-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">
        {locale === 'ru' ? 'Обогащение не найдено' : 'Enrichment Not Found'}
      </h3>
      <p className="text-sm text-muted-foreground">
        {locale === 'ru'
          ? 'Это обогащение могло быть удалено или перемещено.'
          : 'This enrichment may have been deleted or moved.'}
      </p>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  const locale = useLocale();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h3 className="text-lg font-medium text-red-700 dark:text-red-400 mb-2">
        {locale === 'ru' ? 'Ошибка генерации' : 'Generation Error'}
      </h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {sanitizeErrorMessage(error, { locale })}
      </p>
      <Button onClick={onRetry}>
        <RotateCcw className="w-4 h-4 mr-2" />
        {locale === 'ru' ? 'Повторить' : 'Retry'}
      </Button>
    </div>
  );
}

interface ActionBarProps {
  enrichment: EnrichmentData;
  onDelete: () => void;
  onRegenerate: () => void;
  onApprove: () => void;
}

function ActionBar({ enrichment, onDelete, onRegenerate, onApprove }: ActionBarProps) {
  const locale = useLocale();

  // Different actions based on status
  const showApprove = enrichment.status === 'draft_ready';
  const showRegenerate = enrichment.status === 'completed' || enrichment.status === 'failed';
  const showDelete = true;

  return (
    <div className="border-t p-4 bg-white dark:bg-slate-950">
      <div className="flex gap-2">
        {showApprove && (
          <Button onClick={onApprove} className="flex-1">
            <Check className="w-4 h-4 mr-2" />
            {locale === 'ru' ? 'Одобрить' : 'Approve'}
          </Button>
        )}
        {showRegenerate && (
          <Button variant="outline" onClick={onRegenerate}>
            <RotateCcw className="w-4 h-4 mr-2" />
            {locale === 'ru' ? 'Переделать' : 'Regenerate'}
          </Button>
        )}
        {showDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={locale === 'ru' ? 'Удалить' : 'Delete'}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Helper functions to extract preview props from enrichment data
 * These ensure type-safe narrowing from discriminated union
 */
function toQuizPreviewProps(e: QuizEnrichmentData): QuizEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  };
}

function toVideoPreviewProps(e: VideoEnrichmentData): VideoEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  };
}

function toAudioPreviewProps(e: AudioEnrichmentData): AudioEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  };
}

function toPresentationPreviewProps(e: PresentationEnrichmentData): PresentationEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    draft_content: e.draft_content,
    metadata: e.metadata,
    error_message: e.error_message,
  };
}

function toCoverPreviewProps(e: CoverEnrichmentData): CoverEnrichment {
  return {
    id: e.id,
    status: e.status,
    content: e.content,
    metadata: e.metadata,
    error_message: e.error_message,
  };
}

/**
 * Renders the appropriate preview component based on enrichment type.
 * Uses discriminated union pattern for type-safe rendering.
 */
function renderPreview(enrichment: EnrichmentData) {
  switch (enrichment.type) {
    case 'quiz':
      return <QuizPreview enrichment={toQuizPreviewProps(enrichment)} />;
    case 'video':
      return <VideoScriptPanel enrichment={toVideoPreviewProps(enrichment)} />;
    case 'audio':
      return <AudioPreview enrichment={toAudioPreviewProps(enrichment)} />;
    case 'presentation':
      return <PresentationPreview enrichment={toPresentationPreviewProps(enrichment)} />;
    case 'cover':
      return <CoverPreview enrichment={toCoverPreviewProps(enrichment)} />;
    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = enrichment;
      return <div>Unknown type: {(_exhaustive as EnrichmentData).type}</div>;
    }
  }
}

export function DetailView({ enrichmentId, className }: DetailViewProps) {
  const locale = useLocale();
  const { courseInfo } = useStaticGraph();
  const goBack = useEnrichmentInspectorStore((s) => s.goBack);

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch real enrichment data
  const dataState = useEnrichmentDetail(enrichmentId);

  // Handle delete confirmation
  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!courseInfo?.id) {
      toast.error(locale === 'ru' ? 'Курс не найден' : 'Course not found');
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteEnrichment({
        enrichmentId,
        courseId: courseInfo.id,
      });

      if (result.success) {
        toast.success(locale === 'ru' ? 'Активность удалена' : 'Activity deleted');
        setShowDeleteDialog(false);
        goBack();
      } else {
        toast.error(
          locale === 'ru'
            ? `Не удалось удалить: ${result.error}`
            : `Failed to delete: ${result.error}`
        );
      }
    } catch {
      toast.error(
        locale === 'ru' ? 'Не удалось удалить активность' : 'Failed to delete activity'
      );
    } finally {
      setIsDeleting(false);
    }
  }, [enrichmentId, courseInfo?.id, locale, goBack]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteDialog(false);
  }, []);

  // Handle regenerate action (Coming soon)
  const handleRegenerate = useCallback(() => {
    toast.info(locale === 'ru' ? 'Скоро будет доступно' : 'Coming soon');
  }, [locale]);

  // Handle approve action (Coming soon)
  const handleApprove = useCallback(() => {
    toast.info(locale === 'ru' ? 'Скоро будет доступно' : 'Coming soon');
  }, [locale]);

  // Render based on data state
  const renderContent = () => {
    switch (dataState.status) {
      case 'loading':
        return <LoadingState />;

      case 'not_found':
        return <NotFoundState />;

      case 'error':
        return <ErrorState error={dataState.error} onRetry={dataState.refetch} />;

      case 'success': {
        const enrichment = dataState.data;

        // Show error state for failed enrichments
        if (enrichment.status === 'failed') {
          return <ErrorState error={enrichment.error_message} onRetry={handleRegenerate} />;
        }

        // Render preview with action bar
        return (
          <>
            {/* Preview component */}
            <div data-testid="preview-content" className="flex-1 overflow-hidden">
              {renderPreview(enrichment)}
            </div>

            {/* Action bar */}
            <ActionBar
              enrichment={enrichment}
              onDelete={handleDeleteClick}
              onRegenerate={handleRegenerate}
              onApprove={handleApprove}
            />
          </>
        );
      }

      default:
        return null;
    }
  };

  return (
    <>
      <div data-testid="detail-view" className={cn('flex flex-col h-full', className)}>
        {renderContent()}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isDeleting={isDeleting}
      />
    </>
  );
}
