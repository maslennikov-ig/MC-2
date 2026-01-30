'use client';

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Clock, Users, BookOpen, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';

// =============================================================================
// TYPES
// =============================================================================

interface Stage6BlueprintTabProps {
  /** Lesson blueprint metadata */
  blueprint: {
    learningObjectives?: string[];
    prerequisites?: string[];
    targetAudience?: string;
    estimatedDuration?: number; // minutes
    lessonType?: 'theory' | 'practice' | 'quiz' | 'project';
  } | null;
}

// =============================================================================
// LESSON TYPE CONFIG
// =============================================================================

const LESSON_TYPE_CONFIG: Record<
  'theory' | 'practice' | 'quiz' | 'project',
  {
    translationKey: string;
    color: string;
    bgColor: string;
  }
> = {
  theory: {
    translationKey: 'lessonTypeTheory',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
  },
  practice: {
    translationKey: 'lessonTypePractice',
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800',
  },
  quiz: {
    translationKey: 'lessonTypeQuiz',
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800',
  },
  project: {
    translationKey: 'lessonTypeProject',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format duration from minutes to human-readable string
 */
function formatDuration(
  minutes: number,
  hoursLabel: string,
  minutesLabel: string
): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins} ${minutesLabel}`;
  }

  if (mins === 0) {
    return `${hours} ${hoursLabel}`;
  }

  return `${hours}${hoursLabel} ${mins}${minutesLabel}`;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Section card with icon and content
 */
interface SectionCardProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  iconColor?: string;
}

const SectionCard = memo(function SectionCard({
  icon: Icon,
  title,
  children,
  iconColor = 'text-cyan-600 dark:text-cyan-400',
}: SectionCardProps) {
  return (
    <Card className="border-cyan-200 dark:border-cyan-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
});
SectionCard.displayName = 'SectionCard';

/**
 * Empty state component
 */
const EmptyState = memo(function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <BookOpen className="h-12 w-12 text-slate-300 dark:text-slate-700 mb-4" />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {message}
      </p>
    </div>
  );
});
EmptyState.displayName = 'EmptyState';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Stage6BlueprintTab - Display structured lesson blueprint metadata
 *
 * Shows:
 * 1. Learning Objectives - list of objectives
 * 2. Prerequisites - what learners need to know
 * 3. Target Audience - who the lesson is for
 * 4. Duration - estimated lesson duration
 * 5. Lesson Type - theory/practice/quiz/project
 *
 * Design: Blue/Cyan theme consistent with Stage 6 Editorial IDE design
 */
export const Stage6BlueprintTab = memo(function Stage6BlueprintTab({
  blueprint,
}: Stage6BlueprintTabProps) {
  const t = useTranslations('generation.stage6.blueprint');

  // Empty state
  if (!blueprint) {
    return <EmptyState message={t('emptyState')} />;
  }

  const {
    learningObjectives = [],
    prerequisites = [],
    targetAudience,
    estimatedDuration,
    lessonType,
  } = blueprint;

  return (
    <div className="space-y-4 p-6">
      {/* Lesson Type Badge (if available) */}
      {lessonType && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            {t('lessonType')}
          </h3>
          <Badge
            className={`${LESSON_TYPE_CONFIG[lessonType].bgColor} ${LESSON_TYPE_CONFIG[lessonType].color} border`}
          >
            {t(LESSON_TYPE_CONFIG[lessonType].translationKey as 'lessonTypeTheory' | 'lessonTypePractice' | 'lessonTypeQuiz' | 'lessonTypeProject')}
          </Badge>
        </div>
      )}

      {/* Learning Objectives */}
      {learningObjectives.length > 0 && (
        <SectionCard icon={Target} title={t('learningObjectives')}>
          <ul className="space-y-2">
            {learningObjectives.map((objective, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">•</span>
                <span>{objective}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Prerequisites */}
      {prerequisites.length > 0 && (
        <SectionCard icon={GraduationCap} title={t('prerequisites')}>
          <ul className="space-y-2">
            {prerequisites.map((prereq, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">•</span>
                <span>{prereq}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Target Audience */}
      {targetAudience && (
        <SectionCard icon={Users} title={t('targetAudience')}>
          <p className="text-sm text-slate-700 dark:text-slate-300">{targetAudience}</p>
        </SectionCard>
      )}

      {/* Estimated Duration */}
      {estimatedDuration && estimatedDuration > 0 && (
        <SectionCard icon={Clock} title={t('estimatedDuration')}>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">
              {formatDuration(estimatedDuration, t('hours'), t('minutes'))}
            </span>
          </div>
        </SectionCard>
      )}

      {/* Empty state if no data at all */}
      {learningObjectives.length === 0 &&
        prerequisites.length === 0 &&
        !targetAudience &&
        !estimatedDuration &&
        !lessonType && <EmptyState message={t('emptyState')} />}
    </div>
  );
});
