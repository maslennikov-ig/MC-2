'use client';

/**
 * VideoScriptPanel Component
 *
 * Unified panel for video script enrichments with mode switching:
 * - Edit mode: status === 'draft_ready' (editable sections via Accordion)
 * - Preview mode: status === 'completed' (read-only tabs: Script | Metadata)
 * - Loading state: status === 'generating' | 'draft_generating' (Skeleton)
 * - Error state: status === 'failed' (error message with retry option)
 *
 * @module components/generation-graph/panels/stage7/VideoScriptPanel
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Loader2,
  Clock,
  FileText,
  Mic,
  Eye,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRendererFull } from '@/components/markdown';
import { JsonViewer } from '../shared/JsonViewer';
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge';
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

/**
 * VideoScriptOutput structure from video-prompt.ts (two-stage draft)
 */
interface VideoScriptSection {
  title: string;
  narration: string;
  key_points: string[];
  visual_suggestions: string;
  duration_seconds: number;
}

interface VideoScriptOutput {
  script: {
    intro: { text: string; duration_seconds: number };
    sections: VideoScriptSection[];
    conclusion: { text: string; duration_seconds: number };
  };
  metadata: {
    total_duration_seconds: number;
    tone: 'professional' | 'conversational' | 'energetic';
    pacing: 'slow' | 'moderate' | 'fast';
    word_count: number;
  };
}

/**
 * VideoEnrichmentContent structure for completed enrichments
 */
interface VideoEnrichmentContent {
  type: 'video';
  script: string;
  avatar_id?: string;
  estimated_duration_seconds?: number;
}

/**
 * Props for VideoScriptPanel component
 */
export interface VideoScriptPanelProps {
  /** The enrichment record with content and status */
  enrichment: {
    id: string;
    status: EnrichmentStatus;
    content: VideoEnrichmentContent | VideoScriptOutput | null;
    metadata: Record<string, unknown> | null;
    error_message?: string | null;
  };

  /** Called when user approves the draft (two-stage flow) */
  onApprove?: () => void;

  /** Called when user wants to regenerate */
  onRegenerate?: () => void;

  /** Called when user edits draft content (before approval) */
  onDraftEdit?: (updatedDraft: VideoScriptOutput) => void;

  /** Loading state for actions */
  isApproving?: boolean;
  isRegenerating?: boolean;

  /** Optional className */
  className?: string;
}

// ============================================================================
// Translations
// ============================================================================

const TRANSLATIONS = {
  ru: {
    // Header
    videoScript: 'Сценарий видео',
    totalDuration: 'Длительность',
    wordCount: 'Слов',
    tone: 'Тон',
    pacing: 'Темп',

    // Tone values
    toneProfessional: 'Профессиональный',
    toneConversational: 'Разговорный',
    toneEnergetic: 'Энергичный',

    // Pacing values
    pacingSlow: 'Медленный',
    pacingModerate: 'Умеренный',
    pacingFast: 'Быстрый',

    // Edit mode sections
    intro: 'Вступление',
    section: 'Секция',
    conclusion: 'Заключение',
    narration: 'Текст',
    keyPoints: 'Ключевые моменты',
    visualSuggestions: 'Визуальные рекомендации',
    duration: 'Длительность',
    seconds: 'сек',

    // Preview mode tabs
    tabScript: 'Сценарий',
    tabMetadata: 'Метаданные',

    // Actions
    approve: 'Одобрить',
    approving: 'Одобрение...',
    regenerate: 'Переделать',
    regenerating: 'Переделка...',
    retry: 'Повторить',

    // States
    generatingDraft: 'Генерация черновика...',
    generatingFinal: 'Генерация финального видео...',
    errorTitle: 'Ошибка генерации',
    errorDetails: 'Технические детали',
    noContent: 'Контент недоступен',
    noMetadata: 'Метаданные недоступны',
  },
  en: {
    // Header
    videoScript: 'Video Script',
    totalDuration: 'Duration',
    wordCount: 'Words',
    tone: 'Tone',
    pacing: 'Pacing',

    // Tone values
    toneProfessional: 'Professional',
    toneConversational: 'Conversational',
    toneEnergetic: 'Energetic',

    // Pacing values
    pacingSlow: 'Slow',
    pacingModerate: 'Moderate',
    pacingFast: 'Fast',

    // Edit mode sections
    intro: 'Introduction',
    section: 'Section',
    conclusion: 'Conclusion',
    narration: 'Text',
    keyPoints: 'Key Points',
    visualSuggestions: 'Visual Suggestions',
    duration: 'Duration',
    seconds: 'sec',

    // Preview mode tabs
    tabScript: 'Script',
    tabMetadata: 'Metadata',

    // Actions
    approve: 'Approve',
    approving: 'Approving...',
    regenerate: 'Regenerate',
    regenerating: 'Regenerating...',
    retry: 'Retry',

    // States
    generatingDraft: 'Generating draft...',
    generatingFinal: 'Generating final video...',
    errorTitle: 'Generation Error',
    errorDetails: 'Technical Details',
    noContent: 'Content unavailable',
    noMetadata: 'Metadata unavailable',
  },
};

/** Translations type */
type Translations = typeof TRANSLATIONS.ru;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if status indicates draft phase (edit mode)
 */
function isDraftPhase(status: EnrichmentStatus): boolean {
  return status === 'draft_ready';
}

/**
 * Check if status indicates loading state
 */
function isLoadingStatus(status: EnrichmentStatus): boolean {
  return status === 'generating' || status === 'draft_generating';
}

/**
 * Check if content is VideoScriptOutput (has script.sections)
 */
function isVideoScriptOutput(
  content: VideoEnrichmentContent | VideoScriptOutput | null
): content is VideoScriptOutput {
  if (!content) return false;
  return (
    'script' in content &&
    typeof content.script === 'object' &&
    content.script !== null &&
    'sections' in content.script &&
    Array.isArray(content.script.sections)
  );
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Convert VideoScriptOutput to full script text (for preview)
 */
function scriptOutputToText(output: VideoScriptOutput): string {
  const parts: string[] = [];

  // Intro
  if (output.script.intro?.text) {
    parts.push(`## Вступление\n\n${output.script.intro.text}`);
  }

  // Sections
  output.script.sections.forEach((section, index) => {
    parts.push(`## ${section.title || `Секция ${index + 1}`}\n\n${section.narration}`);

    if (section.key_points?.length > 0) {
      parts.push(`\n**Ключевые моменты:**\n${section.key_points.map((p) => `- ${p}`).join('\n')}`);
    }
  });

  // Conclusion
  if (output.script.conclusion?.text) {
    parts.push(`## Заключение\n\n${output.script.conclusion.text}`);
  }

  return parts.join('\n\n');
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Metadata chip component for header
 */
function MetadataChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * Editable section component for draft mode
 */
function EditableSection({
  title,
  narration,
  keyPoints,
  visualSuggestions,
  durationSeconds,
  onChange,
  t,
}: {
  title: string;
  narration: string;
  keyPoints: string[];
  visualSuggestions: string;
  durationSeconds: number;
  onChange: (text: string) => void;
  t: Translations;
}): React.JSX.Element {
  // title is available but currently unused (could be shown in future enhancement)
  void title;
  return (
    <div className="space-y-4">
      {/* Narration textarea */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mic className="w-4 h-4" />
          {t.narration}
        </label>
        <Textarea
          value={narration}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[120px] resize-none"
          placeholder={t.narration}
        />
      </div>

      {/* Key points (read-only) */}
      {keyPoints && keyPoints.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Lightbulb className="w-4 h-4" />
            {t.keyPoints}
          </label>
          <ul className="space-y-1 pl-4">
            {keyPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <ChevronRight className="w-3 h-3 mt-1 text-muted-foreground flex-shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Visual suggestions (read-only) */}
      {visualSuggestions && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Eye className="w-4 h-4" />
            {t.visualSuggestions}
          </label>
          <p className="text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 p-3 rounded-md">
            {visualSuggestions}
          </p>
        </div>
      )}

      {/* Duration badge */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {t.duration}: {durationSeconds} {t.seconds}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * VideoScriptPanel
 *
 * Unified panel for video script enrichments with automatic mode switching
 * based on enrichment status.
 *
 * @param props - Component props
 * @returns React element
 */
export function VideoScriptPanel({
  enrichment,
  onApprove,
  onRegenerate,
  onDraftEdit,
  isApproving = false,
  isRegenerating = false,
  className,
}: VideoScriptPanelProps): React.JSX.Element {
  const locale = useLocale() as 'ru' | 'en';
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.ru;

  const [activeTab, setActiveTab] = useState<'script' | 'metadata'>('script');
  const [expandedSections, setExpandedSections] = useState<string[]>(['intro']);

  // Local draft state for editing
  const [localDraft, setLocalDraft] = useState<VideoScriptOutput | null>(() => {
    if (isDraftPhase(enrichment.status) && isVideoScriptOutput(enrichment.content)) {
      return enrichment.content;
    }
    return null;
  });

  // Sync local draft when enrichment changes
  React.useEffect(() => {
    if (isDraftPhase(enrichment.status) && isVideoScriptOutput(enrichment.content)) {
      setLocalDraft(enrichment.content);
    }
  }, [enrichment.content, enrichment.status]);

  // Determine mode based on status
  const isEditMode = isDraftPhase(enrichment.status);
  const isLoading = isLoadingStatus(enrichment.status);
  const isError = enrichment.status === 'failed';
  const isCompleted = enrichment.status === 'completed';

  // Get script output for edit mode
  const scriptOutput = useMemo(() => {
    if (localDraft) return localDraft;
    if (isVideoScriptOutput(enrichment.content)) return enrichment.content;
    return null;
  }, [localDraft, enrichment.content]);

  // Get full script text for preview mode
  const fullScriptText = useMemo(() => {
    if (isVideoScriptOutput(enrichment.content)) {
      return scriptOutputToText(enrichment.content);
    }
    if (
      enrichment.content &&
      'script' in enrichment.content &&
      typeof enrichment.content.script === 'string'
    ) {
      return enrichment.content.script;
    }
    return null;
  }, [enrichment.content]);

  // Handler for updating draft sections
  const handleSectionUpdate = useCallback(
    (sectionType: 'intro' | 'conclusion' | number, newText: string) => {
      if (!localDraft) return;

      const updatedDraft = { ...localDraft };

      if (sectionType === 'intro') {
        updatedDraft.script = {
          ...updatedDraft.script,
          intro: { ...updatedDraft.script.intro, text: newText },
        };
      } else if (sectionType === 'conclusion') {
        updatedDraft.script = {
          ...updatedDraft.script,
          conclusion: { ...updatedDraft.script.conclusion, text: newText },
        };
      } else if (typeof sectionType === 'number') {
        const newSections = [...updatedDraft.script.sections];
        newSections[sectionType] = {
          ...newSections[sectionType],
          narration: newText,
        };
        updatedDraft.script = { ...updatedDraft.script, sections: newSections };
      }

      setLocalDraft(updatedDraft);
      onDraftEdit?.(updatedDraft);
    },
    [localDraft, onDraftEdit]
  );

  // Get tone/pacing labels
  const getToneLabel = (tone: string): string => {
    switch (tone) {
      case 'professional':
        return t.toneProfessional;
      case 'conversational':
        return t.toneConversational;
      case 'energetic':
        return t.toneEnergetic;
      default:
        return tone;
    }
  };

  const getPacingLabel = (pacing: string): string => {
    switch (pacing) {
      case 'slow':
        return t.pacingSlow;
      case 'moderate':
        return t.pacingModerate;
      case 'fast':
        return t.pacingFast;
      default:
        return pacing;
    }
  };

  // --------------------------------------------------------------------------
  // Render: Loading State
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t.videoScript}</h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Loading content */}
        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground mb-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">
              {enrichment.status === 'draft_generating' ? t.generatingDraft : t.generatingFinal}
            </span>
          </div>

          {/* Skeleton loaders */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="pt-4">
              <Skeleton className="h-5 w-1/4" />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="pt-4">
              <Skeleton className="h-5 w-1/4" />
              <div className="mt-2 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Error State
  // --------------------------------------------------------------------------
  if (isError) {
    return (
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t.videoScript}</h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Error content */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div>
            <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">
              {t.errorTitle}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {enrichment.error_message || t.errorTitle}
            </p>
            {enrichment.error_message && (
              <details className="text-left max-w-md mx-auto">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {t.errorDetails}
                </summary>
                <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto max-h-40">
                  {enrichment.error_message}
                </pre>
              </details>
            )}
          </div>
        </div>

        {/* Action bar */}
        {onRegenerate && (
          <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t.retry}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Edit Mode (draft_ready)
  // --------------------------------------------------------------------------
  if (isEditMode && scriptOutput) {
    return (
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Header with status and metadata chips */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t.videoScript}</h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>

          {/* Metadata chips */}
          <div className="flex flex-wrap gap-2">
            <MetadataChip
              icon={Clock}
              label={t.totalDuration}
              value={formatDuration(scriptOutput.metadata.total_duration_seconds)}
            />
            <MetadataChip
              icon={FileText}
              label={t.wordCount}
              value={scriptOutput.metadata.word_count}
            />
            <Badge variant="outline" className="text-xs">
              {t.tone}: {getToneLabel(scriptOutput.metadata.tone)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {t.pacing}: {getPacingLabel(scriptOutput.metadata.pacing)}
            </Badge>
          </div>
        </div>

        {/* Editable content */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            <Accordion
              type="multiple"
              value={expandedSections}
              onValueChange={setExpandedSections}
              className="space-y-2"
            >
              {/* Intro section */}
              <AccordionItem value="intro" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.intro}</span>
                    <Badge variant="secondary" className="text-xs">
                      {scriptOutput.script.intro.duration_seconds} {t.seconds}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <EditableSection
                    title={t.intro}
                    narration={scriptOutput.script.intro.text}
                    keyPoints={[]}
                    visualSuggestions=""
                    durationSeconds={scriptOutput.script.intro.duration_seconds}
                    onChange={(text) => handleSectionUpdate('intro', text)}
                    t={t}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Main sections */}
              {scriptOutput.script.sections.map((section, index) => (
                <AccordionItem
                  key={index}
                  value={`section-${index}`}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {section.title || `${t.section} ${index + 1}`}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {section.duration_seconds} {t.seconds}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <EditableSection
                      title={section.title}
                      narration={section.narration}
                      keyPoints={section.key_points}
                      visualSuggestions={section.visual_suggestions}
                      durationSeconds={section.duration_seconds}
                      onChange={(text) => handleSectionUpdate(index, text)}
                      t={t}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}

              {/* Conclusion section */}
              <AccordionItem value="conclusion" className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.conclusion}</span>
                    <Badge variant="secondary" className="text-xs">
                      {scriptOutput.script.conclusion.duration_seconds} {t.seconds}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <EditableSection
                    title={t.conclusion}
                    narration={scriptOutput.script.conclusion.text}
                    keyPoints={[]}
                    visualSuggestions=""
                    durationSeconds={scriptOutput.script.conclusion.duration_seconds}
                    onChange={(text) => handleSectionUpdate('conclusion', text)}
                    t={t}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </ScrollArea>

        {/* Action bar */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
          <div className="flex items-center justify-end gap-2">
            {onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                disabled={isRegenerating || isApproving}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.regenerating}
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t.regenerate}
                  </>
                )}
              </Button>
            )}

            {onApprove && (
              <Button
                variant="default"
                size="sm"
                onClick={onApprove}
                disabled={isApproving || isRegenerating}
              >
                {isApproving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t.approving}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {t.approve}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Preview Mode (completed)
  // --------------------------------------------------------------------------
  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
      {/* Header with tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">{t.videoScript}</h3>
          <EnrichmentStatusBadge status={enrichment.status} size="sm" />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'script' | 'metadata')}>
          <TabsList>
            <TabsTrigger value="script">{t.tabScript}</TabsTrigger>
            <TabsTrigger value="metadata">{t.tabMetadata}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'script' && (
          <ScrollArea className="h-full">
            <div className="p-6">
              {fullScriptText ? (
                <MarkdownRendererFull content={fullScriptText} preset="preview" />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">{t.noContent}</p>
              )}
            </div>
          </ScrollArea>
        )}

        {activeTab === 'metadata' && (
          <ScrollArea className="h-full">
            <div className="p-6">
              {enrichment.metadata ? (
                <JsonViewer
                  data={enrichment.metadata}
                  title={t.tabMetadata}
                  defaultExpanded={false}
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">{t.noMetadata}</p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Action bar (only regenerate for completed) */}
      {isCompleted && onRegenerate && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t.regenerating}
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  {t.regenerate}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoScriptPanel;
