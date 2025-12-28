'use client';

/**
 * QuizPreview Component
 *
 * Read-only preview component for instructors to view generated quiz questions
 * in the admin panel (Stage 7 enrichment inspector).
 *
 * Status handling:
 * - generating → Loading skeleton
 * - completed → Show quiz preview
 * - failed → Error state with retry button
 *
 * @module components/generation-graph/panels/stage7/QuizPreview
 */

import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  RotateCcw,
  AlertCircle,
  Loader2,
  Clock,
  Award,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  BarChart3,
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
import { Skeleton } from '@/components/ui/skeleton';
import { JsonViewer } from '../shared/JsonViewer';
import { EnrichmentStatusBadge } from './EnrichmentStatusBadge';
import { type EnrichmentStatus } from '@/lib/generation-graph/enrichment-config';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

/**
 * Quiz question structure
 */
interface QuizQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  bloom_level: 'remember' | 'understand' | 'apply' | 'analyze';
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options?: Array<{ id: string; text: string }>;
  correct_answer: string | boolean | number;
  explanation: string;
  points: number;
}

/**
 * QuizEnrichmentContent structure from shared-types
 */
interface QuizEnrichmentContent {
  type: 'quiz';
  quiz_title: string;
  instructions: string;
  questions: QuizQuestion[];
  passing_score: number;
  time_limit_minutes?: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  metadata: {
    total_points: number;
    estimated_minutes: number;
    bloom_coverage: Record<string, number>;
  };
}

/**
 * Props for QuizPreview component
 */
export interface QuizPreviewProps {
  /** The enrichment record with content and status */
  enrichment: {
    id: string;
    status: EnrichmentStatus;
    content: QuizEnrichmentContent | null;
    metadata: Record<string, unknown> | null;
    error_message?: string | null;
  };

  /** Called when user wants to regenerate */
  onRegenerate?: () => void;

  /** Loading state for regenerate action */
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
    quizTitle: 'Тест',
    instructions: 'Инструкции',
    passingScore: 'Проходной балл',
    timeLimit: 'Время',
    totalPoints: 'Баллов',
    minutes: 'мин',
    noTimeLimit: 'Без ограничений',

    // Question types
    typeMultipleChoice: 'Выбор',
    typeTrueFalse: 'Да/Нет',
    typeShortAnswer: 'Ответ',

    // Bloom levels
    bloomRemember: 'Запоминание',
    bloomUnderstand: 'Понимание',
    bloomApply: 'Применение',
    bloomAnalyze: 'Анализ',

    // Difficulty
    difficultyEasy: 'Легкий',
    difficultyMedium: 'Средний',
    difficultyHard: 'Сложный',

    // Question display
    question: 'Вопрос',
    correct: 'Верно',
    correctAnswer: 'Правильный ответ',
    expectedAnswer: 'Ожидаемый ответ',
    explanation: 'Объяснение',
    points: 'баллов',
    trueValue: 'Истина',
    falseValue: 'Ложь',

    // Metadata
    bloomCoverage: 'Покрытие уровней Блума',
    questionsCount: 'вопросов',
    estimatedTime: 'Расчетное время',

    // Tabs
    tabQuestions: 'Вопросы',
    tabMetadata: 'Метаданные',

    // Actions
    regenerate: 'Переделать',
    regenerating: 'Переделка...',
    retry: 'Повторить',

    // States
    generating: 'Генерация теста...',
    errorTitle: 'Ошибка генерации',
    errorDetails: 'Технические детали',
    noContent: 'Контент недоступен',
    noMetadata: 'Метаданные недоступны',
  },
  en: {
    // Header
    quizTitle: 'Quiz',
    instructions: 'Instructions',
    passingScore: 'Passing score',
    timeLimit: 'Time limit',
    totalPoints: 'Points',
    minutes: 'min',
    noTimeLimit: 'No limit',

    // Question types
    typeMultipleChoice: 'MC',
    typeTrueFalse: 'T/F',
    typeShortAnswer: 'Short',

    // Bloom levels
    bloomRemember: 'Remember',
    bloomUnderstand: 'Understand',
    bloomApply: 'Apply',
    bloomAnalyze: 'Analyze',

    // Difficulty
    difficultyEasy: 'Easy',
    difficultyMedium: 'Medium',
    difficultyHard: 'Hard',

    // Question display
    question: 'Question',
    correct: 'Correct',
    correctAnswer: 'Correct answer',
    expectedAnswer: 'Expected answer',
    explanation: 'Explanation',
    points: 'pts',
    trueValue: 'True',
    falseValue: 'False',

    // Metadata
    bloomCoverage: 'Bloom\'s Level Coverage',
    questionsCount: 'questions',
    estimatedTime: 'Estimated time',

    // Tabs
    tabQuestions: 'Questions',
    tabMetadata: 'Metadata',

    // Actions
    regenerate: 'Regenerate',
    regenerating: 'Regenerating...',
    retry: 'Retry',

    // States
    generating: 'Generating quiz...',
    errorTitle: 'Generation Error',
    errorDetails: 'Technical Details',
    noContent: 'Content unavailable',
    noMetadata: 'Metadata unavailable',
  },
};

type Translations = typeof TRANSLATIONS.ru;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if status indicates loading state
 */
function isLoadingStatus(status: EnrichmentStatus): boolean {
  return status === 'generating' || status === 'draft_generating';
}

/**
 * Check if content is QuizEnrichmentContent
 */
function isQuizContent(
  content: QuizEnrichmentContent | null
): content is QuizEnrichmentContent {
  if (!content) return false;
  return (
    'type' in content &&
    content.type === 'quiz' &&
    'questions' in content &&
    Array.isArray(content.questions)
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Badge for question type
 */
function QuestionTypeBadge({
  type,
  t,
}: {
  type: QuizQuestion['type'];
  t: Translations;
}): React.JSX.Element {
  const config = {
    multiple_choice: {
      label: t.typeMultipleChoice,
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    true_false: {
      label: t.typeTrueFalse,
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    },
    short_answer: {
      label: t.typeShortAnswer,
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
    },
  };

  const { label, className } = config[type];

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', className)}>
      {label}
    </Badge>
  );
}

/**
 * Badge for Bloom's taxonomy level
 */
function BloomLevelBadge({
  level,
  t,
}: {
  level: QuizQuestion['bloom_level'];
  t: Translations;
}): React.JSX.Element {
  const config = {
    remember: {
      label: t.bloomRemember,
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    },
    understand: {
      label: t.bloomUnderstand,
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    apply: {
      label: t.bloomApply,
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    },
    analyze: {
      label: t.bloomAnalyze,
      className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    },
  };

  const { label, className } = config[level];

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', className)}>
      {label}
    </Badge>
  );
}

/**
 * Badge for difficulty level
 */
function DifficultyBadge({
  difficulty,
  t,
}: {
  difficulty: QuizQuestion['difficulty'];
  t: Translations;
}): React.JSX.Element {
  const config = {
    easy: {
      label: t.difficultyEasy,
      className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    },
    medium: {
      label: t.difficultyMedium,
      className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    hard: {
      label: t.difficultyHard,
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    },
  };

  const { label, className } = config[difficulty];

  return (
    <Badge variant="outline" className={cn('text-xs font-medium', className)}>
      {label}
    </Badge>
  );
}

/**
 * Multiple choice question display
 */
function MultipleChoiceDisplay({
  question,
  t,
}: {
  question: QuizQuestion;
  t: Translations;
}): React.JSX.Element {
  const correctId = String(question.correct_answer);

  return (
    <div className="space-y-2">
      {question.options?.map((option) => {
        const isCorrect = option.id === correctId;
        return (
          <div
            key={option.id}
            className={cn(
              'flex items-start gap-3 p-2 rounded-md text-sm',
              isCorrect
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-slate-50 dark:bg-slate-900'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                isCorrect
                  ? 'border-green-500 bg-green-500'
                  : 'border-slate-300 dark:border-slate-600'
              )}
            >
              {isCorrect && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <span className={cn(isCorrect && 'font-medium text-green-700 dark:text-green-400')}>
                {option.text}
              </span>
              {isCorrect && (
                <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                  {t.correct}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * True/False question display
 */
function TrueFalseDisplay({
  question,
  t,
}: {
  question: QuizQuestion;
  t: Translations;
}): React.JSX.Element {
  const correctAnswer = Boolean(question.correct_answer);

  return (
    <div className="flex gap-4">
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
          correctAnswer
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-slate-50 dark:bg-slate-900'
        )}
      >
        {correctAnswer ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
        )}
        <span className={cn(correctAnswer && 'font-medium text-green-700 dark:text-green-400')}>
          {t.trueValue}
        </span>
      </div>
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
          !correctAnswer
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-slate-50 dark:bg-slate-900'
        )}
      >
        {!correctAnswer ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
        )}
        <span className={cn(!correctAnswer && 'font-medium text-green-700 dark:text-green-400')}>
          {t.falseValue}
        </span>
      </div>
    </div>
  );
}

/**
 * Short answer question display
 */
function ShortAnswerDisplay({
  question,
  t,
}: {
  question: QuizQuestion;
  t: Translations;
}): React.JSX.Element {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
      <div className="text-xs text-green-600 dark:text-green-400 mb-1">{t.expectedAnswer}</div>
      <div className="text-sm font-medium text-green-700 dark:text-green-300">
        {String(question.correct_answer)}
      </div>
    </div>
  );
}

/**
 * Question card component
 */
function QuestionCard({
  question,
  index,
  t,
}: {
  question: QuizQuestion;
  index: number;
  t: Translations;
}): React.JSX.Element {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <AccordionItem value={question.id} className="border rounded-lg px-4 mb-2">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-start gap-3 text-left flex-1">
          <span className="text-sm font-medium text-muted-foreground w-8">
            Q{index + 1}.
          </span>
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium line-clamp-2">{question.question}</div>
            <div className="flex flex-wrap gap-1.5">
              <QuestionTypeBadge type={question.type} t={t} />
              <BloomLevelBadge level={question.bloom_level} t={t} />
              <DifficultyBadge difficulty={question.difficulty} t={t} />
              <Badge variant="secondary" className="text-xs">
                {question.points} {t.points}
              </Badge>
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pt-2 pb-2">
          {/* Answer options based on question type */}
          {question.type === 'multiple_choice' && (
            <MultipleChoiceDisplay question={question} t={t} />
          )}
          {question.type === 'true_false' && <TrueFalseDisplay question={question} t={t} />}
          {question.type === 'short_answer' && <ShortAnswerDisplay question={question} t={t} />}

          {/* Explanation toggle */}
          {question.explanation && (
            <div className="border-t pt-3">
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showExplanation ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                {t.explanation}
              </button>
              {showExplanation && (
                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-md text-sm text-muted-foreground">
                  {question.explanation}
                </div>
              )}
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Bloom's coverage visualization
 */
function BloomCoverageChart({
  coverage,
  t,
}: {
  coverage: Record<string, number>;
  t: Translations;
}): React.JSX.Element {
  const levels = [
    { key: 'remember', label: t.bloomRemember, color: 'bg-blue-500' },
    { key: 'understand', label: t.bloomUnderstand, color: 'bg-green-500' },
    { key: 'apply', label: t.bloomApply, color: 'bg-orange-500' },
    { key: 'analyze', label: t.bloomAnalyze, color: 'bg-purple-500' },
  ];

  const maxCount = Math.max(...Object.values(coverage), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        {t.bloomCoverage}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {levels.map(({ key, label, color }) => {
          const count = coverage[key] || 0;
          const percentage = (count / maxCount) * 100;

          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">({count})</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', color)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * QuizPreview
 *
 * Read-only preview component for instructors to view generated quiz questions
 * in the Stage 7 enrichment inspector.
 *
 * @param props - Component props
 * @returns React element
 */
export function QuizPreview({
  enrichment,
  onRegenerate,
  isRegenerating = false,
  className,
}: QuizPreviewProps): React.JSX.Element {
  const locale = useLocale() as 'ru' | 'en';
  const t: Translations = TRANSLATIONS[locale] || TRANSLATIONS.ru;

  const [activeTab, setActiveTab] = useState<'questions' | 'metadata'>('questions');
  const [expandedQuestions, setExpandedQuestions] = useState<string[]>([]);

  // Determine mode based on status
  const isLoading = isLoadingStatus(enrichment.status);
  const isError = enrichment.status === 'failed';
  const isCompleted = enrichment.status === 'completed';

  // Get quiz content
  const quizContent = useMemo(() => {
    if (isQuizContent(enrichment.content)) {
      return enrichment.content;
    }
    return null;
  }, [enrichment.content]);

  // --------------------------------------------------------------------------
  // Render: Loading State
  // --------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
        {/* Header with status */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-green-500" />
              {t.quizTitle}
            </h3>
            <EnrichmentStatusBadge status={enrichment.status} size="sm" />
          </div>
        </div>

        {/* Loading content */}
        <div className="flex-1 p-6 space-y-6">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground mb-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t.generating}</span>
          </div>

          {/* Skeleton loaders */}
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="pt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                </div>
              ))}
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
            <h3 className="font-medium flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-green-500" />
              {t.quizTitle}
            </h3>
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
  // Render: Preview Mode (completed)
  // --------------------------------------------------------------------------
  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-slate-950', className)}>
      {/* Header with tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-green-500" />
            {quizContent?.quiz_title || t.quizTitle}
          </h3>
          <EnrichmentStatusBadge status={enrichment.status} size="sm" />
        </div>

        {/* Quiz summary chips */}
        {quizContent && (
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <Award className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t.passingScore}:</span>
              <span className="font-medium">{quizContent.passing_score}%</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t.timeLimit}:</span>
              <span className="font-medium">
                {quizContent.time_limit_minutes
                  ? `${quizContent.time_limit_minutes} ${t.minutes}`
                  : t.noTimeLimit}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{t.totalPoints}:</span>
              <span className="font-medium">{quizContent.metadata.total_points}</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {quizContent.questions.length} {t.questionsCount}
            </Badge>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'questions' | 'metadata')}>
          <TabsList>
            <TabsTrigger value="questions">{t.tabQuestions}</TabsTrigger>
            <TabsTrigger value="metadata">{t.tabMetadata}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'questions' && (
          <ScrollArea className="h-full">
            <div className="p-4">
              {quizContent ? (
                <div className="space-y-4">
                  {/* Instructions */}
                  {quizContent.instructions && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md text-sm text-muted-foreground">
                      <div className="text-xs font-medium text-foreground mb-1">{t.instructions}</div>
                      {quizContent.instructions}
                    </div>
                  )}

                  {/* Questions accordion */}
                  <Accordion
                    type="multiple"
                    value={expandedQuestions}
                    onValueChange={setExpandedQuestions}
                    className="space-y-0"
                  >
                    {quizContent.questions.map((question, index) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        index={index}
                        t={t}
                      />
                    ))}
                  </Accordion>

                  {/* Bloom's coverage chart */}
                  {quizContent.metadata.bloom_coverage && (
                    <div className="border rounded-lg p-4 mt-4">
                      <BloomCoverageChart coverage={quizContent.metadata.bloom_coverage} t={t} />
                    </div>
                  )}
                </div>
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
              ) : quizContent ? (
                <JsonViewer
                  data={quizContent.metadata}
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

export default QuizPreview;
