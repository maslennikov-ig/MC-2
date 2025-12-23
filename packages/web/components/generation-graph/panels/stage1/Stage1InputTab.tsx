'use client';

import React, { useState, useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  FileText,
  Headphones,
  Video,
  Presentation,
  ClipboardCheck,
  Users,
  Eye,
  FolderOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getLearningStyleByValue } from '@/lib/constants/learning-styles';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import type { Stage1InputTabProps, Stage1InputData } from './types';

// ============================================================================
// HELPERS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STRATEGY_COLORS: Record<string, string> = {
  auto: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  create_from_scratch: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  expand_and_enhance: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  default: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
} as const;

function getStrategyColor(strategy: Stage1InputData['content_strategy']): string {
  return STRATEGY_COLORS[strategy] || STRATEGY_COLORS.default;
}

function getStrategyLabel(
  strategy: Stage1InputData['content_strategy'],
  locale: 'ru' | 'en'
): string {
  const t = GRAPH_TRANSLATIONS.stage1;
  switch (strategy) {
    case 'auto':
      return t?.strategyAuto?.[locale] || 'Auto';
    case 'create_from_scratch':
      return t?.strategyFromScratch?.[locale] || 'From Scratch';
    case 'expand_and_enhance':
      return t?.strategyExpand?.[locale] || 'Expand';
    default:
      return strategy;
  }
}

// ============================================================================
// FORMAT ICONS
// ============================================================================

interface FormatIconProps {
  format: 'text' | 'audio' | 'video' | 'presentation' | 'test';
  isActive: boolean;
  locale: 'ru' | 'en';
}

const FORMAT_ICONS = {
  text: FileText,
  audio: Headphones,
  video: Video,
  presentation: Presentation,
  test: ClipboardCheck,
} as const;

const FORMAT_LABELS = {
  text: { ru: 'Текст', en: 'Text' },
  audio: { ru: 'Аудио', en: 'Audio' },
  video: { ru: 'Видео', en: 'Video' },
  presentation: { ru: 'Презентация', en: 'Presentation' },
  test: { ru: 'Тест', en: 'Test' },
} as const;

function FormatIcon({ format, isActive, locale }: FormatIconProps) {
  const Icon = FORMAT_ICONS[format];
  const label = FORMAT_LABELS[format][locale];

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 transition-opacity',
        isActive ? 'opacity-100' : 'opacity-30'
      )}
      title={label}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface DescriptionWithToggleProps {
  description: string;
  locale: 'ru' | 'en';
}

function DescriptionWithToggle({ description, locale }: DescriptionWithToggleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const t = GRAPH_TRANSLATIONS.stage1;

  // Estimate ~80 chars per line, 3 lines = 240 chars threshold
  const shouldShowToggle = description.length > 240;
  const displayText =
    shouldShowToggle && !isExpanded ? description.slice(0, 240) + '...' : description;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground leading-relaxed">{displayText}</p>
      {shouldShowToggle && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none"
        >
          {isExpanded ? (
            <>
              {t?.showLess?.[locale] || 'Show less'}
              <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              {t?.showMore?.[locale] || 'Show more'}
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Stage1InputTab = memo<Stage1InputTabProps>(function Stage1InputTab({
  inputData,
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage1;

  // Parse inputData safely
  const data = inputData as Stage1InputData | undefined;

  // Memoized computed values
  const learningStyle = useMemo(
    () => (data?.style ? getLearningStyleByValue(data.style) : undefined),
    [data?.style]
  );

  const activeFormats = useMemo(
    () => new Set(data?.output_formats || []),
    [data?.output_formats]
  );

  const allFormats: Array<'text' | 'audio' | 'video' | 'presentation' | 'test'> = [
    'text',
    'audio',
    'video',
    'presentation',
    'test',
  ];

  if (!data) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {t?.notSpecified?.[locale] || 'Not specified'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      {/* Card A: Identity - Full width (spans 2 columns) */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.identity?.[locale] || 'Identity'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Topic - Large H3 typography */}
          <h3 className="text-xl font-bold leading-tight">{data.topic}</h3>

          {/* Description with show more/less */}
          {data.course_description && (
            <DescriptionWithToggle description={data.course_description} locale={locale} />
          )}

          {/* Optional fields: Prerequisites and Learning Outcomes */}
          {(data.prerequisites || data.learning_outcomes) && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
              {data.prerequisites && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t?.prerequisites?.[locale] || 'Prerequisites'}
                  </span>
                  <p className="text-sm mt-1">{data.prerequisites}</p>
                </div>
              )}
              {data.learning_outcomes && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {t?.learningOutcomes?.[locale] || 'Learning Outcomes'}
                  </span>
                  <p className="text-sm mt-1">{data.learning_outcomes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card B: Strategy & Logistics - Left column */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t?.strategyAndLogistics?.[locale] || 'Strategy & Parameters'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Strategy Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t?.strategy?.[locale] || 'Strategy'}:
            </span>
            <Badge className={cn('border', getStrategyColor(data.content_strategy))}>
              {getStrategyLabel(data.content_strategy, locale)}
            </Badge>
          </div>

          {/* Audience */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {data.target_audience || (
                <span className="italic text-muted-foreground">
                  {t?.notSpecified?.[locale] || 'Not specified'}
                </span>
              )}
            </span>
          </div>

          {/* Style */}
          {learningStyle && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t?.style?.[locale] || 'Style'}:
              </span>
              <Badge variant="outline">{learningStyle.title}</Badge>
            </div>
          )}

          {/* Lesson Count - Large number */}
          <div className="flex items-baseline gap-2 pt-2">
            <span className="text-3xl font-bold">
              {data.estimated_lessons ?? '--'}
            </span>
            <span className="text-sm text-muted-foreground">
              {t?.lessonsCount?.[locale] || 'Lessons'}
            </span>
          </div>

          {/* Output Formats */}
          <div className="pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground block mb-2">
              {t?.formats?.[locale] || 'Formats'}:
            </span>
            <div className="flex items-center gap-4">
              {allFormats.map((format) => (
                <FormatIcon
                  key={format}
                  format={format}
                  isActive={activeFormats.has(format)}
                  locale={locale}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card C: Knowledge Base - Right column */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t?.knowledgeBase?.[locale] || 'Knowledge Base'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {data.files && data.files.length > 0 ? (
            <div className="space-y-2">
              {data.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                    <Eye className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm italic text-muted-foreground">
                {t?.noFiles?.[locale] || 'No files'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage1InputTab;
