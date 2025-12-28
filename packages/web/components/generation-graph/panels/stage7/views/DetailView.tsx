import React from 'react';
import { useLocale } from 'next-intl';
import { Loader2, AlertCircle, RotateCcw, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizPreview } from '../QuizPreview';
import { AudioPreview } from '../AudioPreview';
import { VideoScriptPanel } from '../VideoScriptPanel';
import { PresentationPreview } from '../PresentationPreview';
import { cn } from '@/lib/utils';

export interface DetailViewProps {
  enrichmentId: string;
  className?: string;
}

interface EnrichmentData {
  id: string;
  type: 'quiz' | 'video' | 'audio' | 'presentation';
  status: 'pending' | 'draft_generating' | 'draft_ready' | 'generating' | 'completed' | 'failed';
  content: unknown | null;
  draft_content: unknown | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  asset_url: string | null;
}

function useMockEnrichment(id: string): EnrichmentData | null {
  // Return mock completed quiz for demo
  return {
    id,
    type: 'quiz',
    status: 'completed',
    content: {
      type: 'quiz',
      quiz_title: 'Assessment: React Fundamentals',
      instructions: 'Answer all questions. 70% to pass.',
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          bloom_level: 'remember',
          difficulty: 'easy',
          question: 'What is React?',
          options: [
            { id: 'a', text: 'A JavaScript library' },
            { id: 'b', text: 'A programming language' },
            { id: 'c', text: 'A database' },
          ],
          correct_answer: 'a',
          explanation: 'React is a JavaScript library for building UIs.',
          points: 1,
        },
      ],
      passing_score: 70,
      shuffle_questions: true,
      shuffle_options: true,
      metadata: { total_points: 1, estimated_minutes: 5, bloom_coverage: { remember: 1 } },
    },
    draft_content: null,
    metadata: { generated_at: new Date().toISOString(), generation_duration_ms: 1500 },
    error_message: null,
    asset_url: null,
  };
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
      <p className="text-sm text-muted-foreground mb-4">
        {error || (locale === 'ru' ? 'Неизвестная ошибка' : 'Unknown error')}
      </p>
      <Button onClick={onRetry}>
        <RotateCcw className="w-4 h-4 mr-2" />
        {locale === 'ru' ? 'Повторить' : 'Retry'}
      </Button>
    </div>
  );
}

function ActionBar({ enrichment }: { enrichment: EnrichmentData }) {
  const locale = useLocale();

  // Different actions based on status
  const showApprove = enrichment.status === 'draft_ready';
  const showRegenerate = enrichment.status === 'completed' || enrichment.status === 'failed';
  const showDelete = true;

  return (
    <div className="border-t p-4 bg-white dark:bg-slate-950">
      <div className="flex gap-2">
        {showApprove && (
          <Button onClick={() => console.log('Approve draft')} className="flex-1">
            <Check className="w-4 h-4 mr-2" />
            {locale === 'ru' ? 'Одобрить' : 'Approve'}
          </Button>
        )}
        {showRegenerate && (
          <Button variant="outline" onClick={() => console.log('Regenerate')}>
            <RotateCcw className="w-4 h-4 mr-2" />
            {locale === 'ru' ? 'Переделать' : 'Regenerate'}
          </Button>
        )}
        {showDelete && (
          <Button variant="ghost" size="icon" onClick={() => console.log('Delete')}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

function renderPreview(enrichment: EnrichmentData) {
  // Type assertions needed because EnrichmentData.content is unknown
  // Preview components expect specific content types
  switch (enrichment.type) {
    case 'quiz':
      return <QuizPreview enrichment={enrichment as never} />;
    case 'video':
      return <VideoScriptPanel enrichment={enrichment as never} />;
    case 'audio':
      return <AudioPreview enrichment={enrichment as never} />;
    case 'presentation':
      return <PresentationPreview enrichment={enrichment as never} />;
    default:
      return <div>Unknown type</div>;
  }
}

export function DetailView({ enrichmentId, className }: DetailViewProps) {

  // For now, use mock data - will be connected to real data later
  // TODO: Connect to useEnrichmentData or tRPC query
  const enrichment = useMockEnrichment(enrichmentId);

  // Loading state
  if (!enrichment) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (enrichment.status === 'failed') {
    return (
      <ErrorState
        error={enrichment.error_message}
        onRetry={() => console.log('Retry')} // TODO: Connect to regenerate mutation
      />
    );
  }

  // Render preview based on type
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Preview component */}
      <div className="flex-1 overflow-hidden">
        {renderPreview(enrichment)}
      </div>

      {/* Action bar */}
      <ActionBar enrichment={enrichment} />
    </div>
  );
}
