'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Globe, Database, MessageSquare, CheckCircle2 } from 'lucide-react';
import type { LessonSpecificationV2 } from '@megacampus/shared-types';

// =============================================================================
// TYPES
// =============================================================================

interface Stage6InputTabProps {
  /** Lesson specification from Stage 5 */
  lessonSpec: LessonSpecificationV2 | null;
  /** Course style for content generation */
  style: string | null;
  /** Language code (e.g., 'en', 'ru') */
  language: string | null;
  /** Number of RAG chunks available */
  ragChunksCount: number;
  /** User refinement prompt (optional) */
  userRefinementPrompt?: string;
  /** Analysis result summary (optional) */
  analysisResultSummary?: string;
  /** Locale for translations */
  locale?: 'ru' | 'en';
}

// =============================================================================
// LOCALIZATION
// =============================================================================

const translations = {
  inputParametersTitle: { ru: 'Входные параметры', en: 'Input Parameters' },
  lessonSpecTitle: { ru: 'Спецификация урока', en: 'Lesson Specification' },
  lessonId: { ru: 'ID урока', en: 'Lesson ID' },
  lessonTitle: { ru: 'Название', en: 'Title' },
  description: { ru: 'Описание', en: 'Description' },
  learningObjectives: { ru: 'Учебные цели', en: 'Learning Objectives' },
  sections: { ru: 'Разделов', en: 'Sections' },
  exercises: { ru: 'Упражнений', en: 'Exercises' },
  estimatedDuration: { ru: 'Длительность', en: 'Duration' },
  minutes: { ru: 'мин', en: 'min' },
  difficulty: { ru: 'Сложность', en: 'Difficulty' },
  courseStyleTitle: { ru: 'Стиль курса', en: 'Course Style' },
  languageTitle: { ru: 'Язык', en: 'Language' },
  ragContextTitle: { ru: 'RAG контекст', en: 'RAG Context' },
  chunksAvailable: { ru: 'фрагментов доступно', en: 'chunks available' },
  refinementPromptTitle: { ru: 'Промпт пользователя', en: 'User Refinement Prompt' },
  analysisResultTitle: { ru: 'Результат анализа', en: 'Analysis Result' },
  noData: { ru: 'Нет данных', en: 'No data' },
  targetAudience: { ru: 'Аудитория', en: 'Target Audience' },
  tone: { ru: 'Тон', en: 'Tone' },
  contentArchetype: { ru: 'Архетип контента', en: 'Content Archetype' },
};

function t(key: keyof typeof translations, locale: 'ru' | 'en'): string {
  return translations[key][locale];
}

// Difficulty level translations
const difficultyLabels: Record<string, { ru: string; en: string }> = {
  beginner: { ru: 'Начальный', en: 'Beginner' },
  intermediate: { ru: 'Средний', en: 'Intermediate' },
  advanced: { ru: 'Продвинутый', en: 'Advanced' },
};

// Target audience translations
const audienceLabels: Record<string, { ru: string; en: string }> = {
  executive: { ru: 'Руководители', en: 'Executive' },
  practitioner: { ru: 'Практики', en: 'Practitioner' },
  novice: { ru: 'Новички', en: 'Novice' },
};

// Content tone translations
const toneLabels: Record<string, { ru: string; en: string }> = {
  formal: { ru: 'Формальный', en: 'Formal' },
  'conversational-professional': { ru: 'Разговорно-профессиональный', en: 'Conversational-Professional' },
};

// Content archetype translations
const archetypeLabels: Record<string, { ru: string; en: string }> = {
  code_tutorial: { ru: 'Туториал по коду', en: 'Code Tutorial' },
  concept_explainer: { ru: 'Объяснение концепций', en: 'Concept Explainer' },
  case_study: { ru: 'Кейс-стади', en: 'Case Study' },
  legal_warning: { ru: 'Юридическое предупреждение', en: 'Legal Warning' },
};

// =============================================================================
// LESSON SPECIFICATION CARD
// =============================================================================

interface LessonSpecCardProps {
  lessonSpec: LessonSpecificationV2;
  locale: 'ru' | 'en';
}

const LessonSpecCard = memo(function LessonSpecCard({ lessonSpec, locale }: LessonSpecCardProps) {
  const difficultyColor = {
    beginner: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    intermediate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    advanced: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('lessonSpecTitle', locale)}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Lesson ID */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600 dark:text-slate-400">{t('lessonId', locale)}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {lessonSpec.lesson_id}
          </Badge>
        </div>

        {/* Lesson Title */}
        <div className="space-y-1">
          <span className="text-xs text-slate-600 dark:text-slate-400">{t('lessonTitle', locale)}</span>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{lessonSpec.title}</p>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <span className="text-xs text-slate-600 dark:text-slate-400">{t('description', locale)}</span>
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3">
            {lessonSpec.description}
          </p>
        </div>

        {/* Learning Objectives */}
        <div className="space-y-1">
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {t('learningObjectives', locale)} ({lessonSpec.learning_objectives.length})
          </span>
          <div className="space-y-1">
            {lessonSpec.learning_objectives.slice(0, 3).map((obj) => (
              <div
                key={obj.id}
                className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{obj.objective}</span>
              </div>
            ))}
            {lessonSpec.learning_objectives.length > 3 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 pl-5">
                +{lessonSpec.learning_objectives.length - 3} more...
              </p>
            )}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          {/* Sections & Exercises */}
          <div className="space-y-1">
            <span className="text-xs text-slate-600 dark:text-slate-400">{t('sections', locale)}</span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {lessonSpec.sections.length}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-600 dark:text-slate-400">{t('exercises', locale)}</span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {lessonSpec.exercises.length}
            </p>
          </div>

          {/* Duration & Difficulty */}
          <div className="space-y-1">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {t('estimatedDuration', locale)}
            </span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {lessonSpec.estimated_duration_minutes} {t('minutes', locale)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-slate-600 dark:text-slate-400">{t('difficulty', locale)}</span>
            <Badge
              className={cn(
                'text-xs',
                difficultyColor[lessonSpec.difficulty_level] || difficultyColor.intermediate
              )}
            >
              {difficultyLabels[lessonSpec.difficulty_level]?.[locale] || lessonSpec.difficulty_level}
            </Badge>
          </div>
        </div>

        {/* Metadata: Target Audience, Tone, Archetype */}
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {t('targetAudience', locale)}
            </span>
            <Badge variant="outline" className="text-xs">
              {audienceLabels[lessonSpec.metadata.target_audience]?.[locale] ||
                lessonSpec.metadata.target_audience}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-400">{t('tone', locale)}</span>
            <Badge variant="outline" className="text-xs">
              {toneLabels[lessonSpec.metadata.tone]?.[locale] || lessonSpec.metadata.tone}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {t('contentArchetype', locale)}
            </span>
            <Badge variant="outline" className="text-xs">
              {archetypeLabels[lessonSpec.metadata.content_archetype]?.[locale] ||
                lessonSpec.metadata.content_archetype}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
LessonSpecCard.displayName = 'LessonSpecCard';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage6InputTab - Display Stage 6 input parameters
 *
 * Shows all input parameters used for lesson content generation:
 * - Lesson specification from Stage 5
 * - Course style
 * - Language
 * - RAG chunks count
 * - User refinement prompt (if any)
 * - Analysis result summary (if available)
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Lesson Specification Card                                       │
 * │ ┌─────────────────────────────────────────────────────────────┐ │
 * │ │ ID, title, description, objectives, metadata                │ │
 * │ └─────────────────────────────────────────────────────────────┘ │
 * │ Course Style | Language | RAG Context                          │
 * │ User Refinement Prompt (if any)                                │
 * │ Analysis Result Summary (if any)                               │
 * └─────────────────────────────────────────────────────────────────┘
 */
export const Stage6InputTab = memo(function Stage6InputTab({
  lessonSpec,
  style,
  language,
  ragChunksCount,
  userRefinementPrompt,
  analysisResultSummary,
  locale = 'en',
}: Stage6InputTabProps) {
  return (
    <div className="space-y-4 p-6">
      {/* Lesson Specification */}
      {lessonSpec ? (
        <LessonSpecCard lessonSpec={lessonSpec} locale={locale} />
      ) : (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="py-8">
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {t('noData', locale)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Course Style, Language, RAG Context Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Course Style */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('courseStyleTitle', locale)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {style ? (
              <p className="text-sm text-slate-800 dark:text-slate-200 line-clamp-3">{style}</p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('noData', locale)}</p>
            )}
          </CardContent>
        </Card>

        {/* Language */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('languageTitle', locale)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {language?.toUpperCase() || t('noData', locale)}
            </Badge>
          </CardContent>
        </Card>

        {/* RAG Context */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('ragContextTitle', locale)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                {ragChunksCount}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {t('chunksAvailable', locale)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Refinement Prompt (if provided) */}
      {userRefinementPrompt && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t('refinementPromptTitle', locale)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap">
              {userRefinementPrompt}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Analysis Result Summary (if available) */}
      {analysisResultSummary && (
        <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <CardTitle className="text-sm font-medium text-purple-800 dark:text-purple-300">
                {t('analysisResultTitle', locale)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-800 dark:text-purple-300 whitespace-pre-wrap">
              {analysisResultSummary}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
