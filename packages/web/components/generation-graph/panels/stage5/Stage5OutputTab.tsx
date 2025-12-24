'use client';

import React, { memo, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  BookOpen,
  Clock,
  Tag,
  GitBranch,
} from 'lucide-react';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { StructureTree } from './components/StructureTree';
import type { Stage5OutputTabProps, Stage5OutputData } from './types';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to validate Stage5OutputData
 */
function isStage5OutputData(data: unknown): data is Stage5OutputData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.courseStructure !== undefined && typeof d.courseStructure === 'object';
}

// ============================================================================
// DIFFICULTY BADGE MAPPING
// ============================================================================

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  advanced: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Stage5OutputTab Component
 *
 * "Structure Preview" - displays the generated course structure as a tree view.
 *
 * Layout (two sections):
 * 1. Top - Metadata Card: Course title, description, learning outcomes, prerequisites, difficulty, duration, tags
 * 2. Bottom - Structure Tree: StructureTree component with sections and lessons
 *
 * Color scheme: Orange theme for Stage 5 (energy, creativity, transformation)
 *
 * Features:
 * - Course metadata with visual hierarchy
 * - Learning outcomes with green checkmarks
 * - Prerequisites display with fallback message
 * - Stats row: difficulty badge, duration badge, tags
 * - Collapsible structure tree for sections and lessons
 * - Full dark mode support
 * - Bilingual (Russian/English)
 */
export const Stage5OutputTab = memo<Stage5OutputTabProps>(function Stage5OutputTab({
  outputData,
  courseId: _courseId, // Available for future use (e.g., fetching additional data)
  editable: _editable = false, // Available for future use (e.g., inline editing)
  locale = 'ru',
}) {
  const t = GRAPH_TRANSLATIONS.stage5;

  // Expanded sections state for StructureTree
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Parse output data
  const parsedData = useMemo((): Stage5OutputData | null => {
    if (isStage5OutputData(outputData)) {
      return outputData;
    }
    return null;
  }, [outputData]);

  // Handle section toggle - wrapped in useCallback for optimization
  const handleToggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  }, []);

  // Empty state - no data yet
  if (!parsedData || !parsedData.courseStructure) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitBranch className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">
          {t?.emptyOutput?.[locale] ?? 'Course structure will appear here'}
        </p>
      </div>
    );
  }

  const {
    courseTitle,
    courseDescription,
    learningOutcomes,
    prerequisites,
    difficultyLevel,
    estimatedDurationHours,
    courseTags,
    sections,
  } = parsedData.courseStructure;

  // Get difficulty badge color
  const difficultyColor = DIFFICULTY_COLORS[difficultyLevel.toLowerCase()] || DIFFICULTY_COLORS.intermediate;

  // Translate difficulty level (stage5 section uses simple keys: beginner, intermediate, advanced)
  const difficultyLower = difficultyLevel.toLowerCase() as 'beginner' | 'intermediate' | 'advanced';
  const difficultyLabel = t?.[difficultyLower]?.[locale] ?? difficultyLevel;

  return (
    <div className="space-y-4 p-1">
      {/* Metadata Card */}
      <Card
        className={cn(
          'border-l-4 border-l-orange-500',
          'bg-gradient-to-r from-orange-50/50 to-amber-50/50',
          'dark:from-orange-900/10 dark:to-amber-900/10'
        )}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">
            {courseTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course Description */}
          {courseDescription && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {courseDescription}
            </p>
          )}

          {/* Learning Outcomes */}
          {learningOutcomes && learningOutcomes.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {t?.learningOutcomes?.[locale] ?? 'Learning Outcomes'}
              </h4>
              <ul className="space-y-1.5">
                {learningOutcomes.map((outcome, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prerequisites */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              {t?.prerequisites?.[locale] ?? 'Prerequisites'}
            </h4>
            {prerequisites && prerequisites.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prerequisites.map((prereq, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="text-xs px-2 py-0.5"
                  >
                    {prereq}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t?.noPrerequisites?.[locale] ?? 'No prerequisites'}
              </p>
            )}
          </div>

          {/* Stats Row: Difficulty, Duration, Tags */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border">
            {/* Difficulty */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t?.difficulty?.[locale] ?? 'Difficulty'}:
              </span>
              <Badge className={cn('text-xs font-medium', difficultyColor)}>
                {difficultyLabel}
              </Badge>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">
                {estimatedDurationHours}{t?.hoursShort?.[locale] ?? 'h'}
              </span>
            </div>

            {/* Tags */}
            {courseTags && courseTags.length > 0 && (
              <div className="flex items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex flex-wrap gap-1.5">
                  {courseTags.slice(0, 3).map((tag, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs px-2 py-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {courseTags.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{courseTags.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Structure Tree Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-orange-500" />
            {t?.structure?.[locale] ?? 'Course Structure'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t?.structureDesc?.[locale] ?? 'Modules and lessons'}
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <StructureTree
              sections={sections}
              expandedSections={expandedSections}
              onToggleSection={handleToggleSection}
              locale={locale}
            />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
});

export default Stage5OutputTab;
