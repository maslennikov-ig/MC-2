'use client';

import React, { useMemo, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { GroupedVirtuoso, GroupedVirtuosoHandle } from 'react-virtuoso';
import { Section, Lesson } from '@megacampus/shared-types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronDown, BookOpen, Clock } from 'lucide-react';
import { LessonRow } from './LessonRow';
import { AddElementChat } from './AddElementChat';

interface VirtualizedSectionsListProps {
  sections: Section[];
  locale?: 'ru' | 'en';
  editMode?: boolean;
  courseId?: string;
  onLessonAdded?: (sectionIndex: number, newLesson: Lesson) => void;
  onSectionChange?: (sectionIndex: number, field: string, value: unknown) => void;
  sectionTimestamps?: Map<number, Date>;
  lessonTimestamps?: Map<string, Date>;
  onLessonChange?: (sectionIdx: number, lessonIdx: number, updatedLesson: Lesson) => void;
  onRangeChanged?: (visibleRange: { startIndex: number; endIndex: number; visibleSectionIndex: number }) => void;
}

/**
 * Public API for VirtualizedSectionsList component
 * Exposes scroll methods for programmatic navigation
 */
export interface VirtualizedSectionsListHandle {
  scrollToSection: (sectionIndex: number) => void;
  scrollToLesson: (sectionIndex: number, lessonIndex: number) => void;
}

const translations = {
  ru: {
    section: 'Модуль',
    lessons: 'уроков',
    lesson: 'урок',
    lessonsCount: 'урока',
    learningObjectives: 'Цели модуля',
    minutes: 'мин',
  },
  en: {
    section: 'Module',
    lessons: 'lessons',
    lesson: 'lesson',
    lessonsCount: 'lessons',
    learningObjectives: 'Module Learning Objectives',
    minutes: 'min',
  },
};

/**
 * Format lesson count with correct pluralization
 */
function formatLessonCount(count: number, locale: 'ru' | 'en'): string {
  const t = translations[locale];

  if (locale === 'ru') {
    // Russian pluralization rules
    const mod10 = count % 10;
    const mod100 = count % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return `${count} ${t.lesson}`;
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return `${count} ${t.lessonsCount}`;
    } else {
      return `${count} ${t.lessons}`;
    }
  }

  // English pluralization
  return count === 1 ? `${count} ${t.lesson}` : `${count} ${t.lessons}`;
}

/**
 * Format duration in minutes
 */
function formatDuration(minutes: number, locale: 'ru' | 'en'): string {
  const t = translations[locale];
  return `${minutes} ${t.minutes}`;
}

/**
 * Helper to determine if virtualization should be used
 * Threshold: sections > 20 OR any section has lessons > 15
 */
export function shouldUseVirtualization(sections: Section[]): boolean {
  if (sections.length > 20) {
    return true;
  }

  return sections.some((section) => section.lessons.length > 15);
}

/**
 * VirtualizedSectionsList Component
 *
 * Virtualized course structure rendering using GroupedVirtuoso with:
 * - Sticky section headers (always visible when scrolling through section)
 * - Smooth scroll-to-section/lesson navigation
 * - Efficient rendering for large courses (only visible items rendered)
 * - Full editing support (add lessons, modify content)
 */
export const VirtualizedSectionsList = forwardRef<
  VirtualizedSectionsListHandle,
  VirtualizedSectionsListProps
>(
  (
    {
      sections,
      locale = 'ru',
      editMode = false,
      courseId,
      onLessonAdded,
      onSectionChange: _onSectionChange,
      sectionTimestamps,
      lessonTimestamps,
      onLessonChange,
      onRangeChanged,
    },
    ref
  ) => {
    const t = translations[locale];
    const virtuosoRef = useRef<GroupedVirtuosoHandle>(null);

    // Track expanded sections (section indices)
    const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

    // Track current visible section for sticky header highlighting
    const [visibleSectionIndex, setVisibleSectionIndex] = useState<number>(0);

    // Calculate group counts (number of lessons per section)
    const groupCounts = useMemo(() => {
      return sections.map((section) => section.lessons.length);
    }, [sections]);

    // Toggle section expand/collapse
    const toggleSection = useCallback((sectionIndex: number) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (next.has(sectionIndex)) {
          next.delete(sectionIndex);
        } else {
          next.add(sectionIndex);
        }
        return next;
      });
    }, []);

    // Calculate which section a given item index belongs to
    const getSectionIndexFromItemIndex = useCallback(
      (itemIndex: number) => {
        let sum = 0;
        for (let i = 0; i < groupCounts.length; i++) {
          sum += groupCounts[i];
          if (itemIndex < sum) {
            return i;
          }
        }
        return groupCounts.length - 1;
      },
      [groupCounts]
    );

    // Handle range changes to track visible section
    const handleRangeChanged = useCallback(
      (range: { startIndex: number; endIndex: number }) => {
        const sectionIndex = getSectionIndexFromItemIndex(range.startIndex);
        setVisibleSectionIndex(sectionIndex);
        onRangeChanged?.({
          ...range,
          visibleSectionIndex: sectionIndex,
        });
      },
      [getSectionIndexFromItemIndex, onRangeChanged]
    );

    // Expose scroll methods via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToSection: (sectionIndex: number) => {
          // Calculate first item index for this section
          const firstItemIndex = groupCounts
            .slice(0, sectionIndex)
            .reduce((a, b) => a + b, 0);
          virtuosoRef.current?.scrollToIndex({
            index: firstItemIndex,
            align: 'start',
            behavior: 'smooth',
          });
        },
        scrollToLesson: (sectionIndex: number, lessonIndex: number) => {
          // Calculate absolute item index
          const sectionOffset = groupCounts
            .slice(0, sectionIndex)
            .reduce((a, b) => a + b, 0);
          const itemIndex = sectionOffset + lessonIndex;
          virtuosoRef.current?.scrollToIndex({
            index: itemIndex,
            align: 'start',
            behavior: 'smooth',
          });
        },
      }),
      [groupCounts]
    );

    // Group header (Section) - STICKY by default with GroupedVirtuoso
    const groupContent = useCallback(
      (sectionIndex: number) => {
        const section = sections[sectionIndex];
        if (!section) return null;

        const lessonCount = section.lessons.length;
        const duration = section.estimated_duration_minutes;
        const isExpanded = expandedSections.has(sectionIndex);
        const isVisible = visibleSectionIndex === sectionIndex;

        return (
          <div
            className={cn(
              'border border-slate-200 rounded-lg overflow-hidden bg-white mb-2',
              // Enhanced shadow when sticky header is active (section is visible)
              'transition-shadow duration-200',
              isVisible && 'shadow-md'
            )}
          >
            {/* Section Header */}
            <button
              onClick={() => toggleSection(sectionIndex)}
              className={cn(
                'flex flex-1 items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors group w-full',
                // Subtle background change when this section is visible
                isVisible && 'bg-slate-50/50'
              )}
              aria-expanded={isExpanded}
              aria-controls={`section-${section.section_number}-content`}
              id={`section-${section.section_number}-header`}
              aria-label={`${t.section} ${section.section_number}: ${section.section_title} - ${formatLessonCount(lessonCount, locale)}, ${formatDuration(duration, locale)}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Section Number Badge */}
                <Badge
                  variant="secondary"
                  className={cn(
                    'shrink-0 transition-colors',
                    isVisible ? 'bg-slate-600 text-white' : 'bg-slate-500 text-white'
                  )}
                >
                  {t.section} {section.section_number}
                </Badge>

                {/* Section Title */}
                <span className="text-sm font-medium text-slate-900 truncate">
                  {section.section_title}
                </span>

                {/* Lesson Count and Duration */}
                <div className="flex items-center gap-3 ml-auto shrink-0 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{formatLessonCount(lessonCount, locale)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDuration(duration, locale)}</span>
                  </div>
                </div>
              </div>

              {/* Chevron Icon */}
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-500 transition-transform duration-200 ml-2 shrink-0',
                  isExpanded && 'rotate-180'
                )}
              />
            </button>

            {/* Section Description and Learning Objectives (when expanded) */}
            {isExpanded && (
              <div className="px-4 py-3 border-t border-slate-100 space-y-3 bg-slate-50/30">
                {/* Section Description */}
                <p className="text-sm text-slate-700">{section.section_description}</p>

                {/* Section Learning Objectives */}
                {section.learning_objectives.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-slate-900 uppercase tracking-wide">
                      {t.learningObjectives}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {section.learning_objectives.map((objective, idx) => (
                        <Badge
                          key={`objective-${sectionIndex}-${idx}`}
                          variant="outline"
                          className="text-xs"
                        >
                          {objective}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Lesson Button - Only in edit mode and when expanded */}
                {editMode && courseId && (
                  <AddElementChat
                    courseId={courseId}
                    elementType="lesson"
                    parentPath={`sections[${sectionIndex}].lessons`}
                    position="end"
                    locale={locale}
                    onSuccess={(newElement) =>
                      onLessonAdded?.(sectionIndex, newElement as Lesson)
                    }
                  />
                )}
              </div>
            )}
          </div>
        );
      },
      [sections, expandedSections, visibleSectionIndex, locale, t, toggleSection, editMode, courseId, onLessonAdded]
    );

    // Item content (Lesson)
    const itemContent = useCallback(
      (lessonIndexWithinSection: number, sectionIndex: number) => {
        const section = sections[sectionIndex];
        if (!section) return null;

        const isExpanded = expandedSections.has(sectionIndex);
        if (!isExpanded) return null; // Don't render lessons for collapsed sections

        const lesson = section.lessons[lessonIndexWithinSection];
        if (!lesson) return null;

        return (
          <div className="border border-slate-100 rounded-md overflow-hidden mb-1 mx-4">
            <LessonRow
              key={`lesson-${section.section_number}-${lesson.lesson_number}`}
              lesson={lesson}
              sectionNumber={section.section_number}
              sectionIndex={sectionIndex}
              lessonIndex={lessonIndexWithinSection}
              locale={locale}
              editMode={editMode}
              courseId={courseId}
              onLessonChange={(updatedLesson) =>
                onLessonChange?.(sectionIndex, lessonIndexWithinSection, updatedLesson)
              }
              isFirstLesson={sectionIndex === 0 && lessonIndexWithinSection === 0}
              lessonLastModified={lessonTimestamps?.get(
                `${sectionIndex}-${lessonIndexWithinSection}`
              )}
              sectionLastModified={sectionTimestamps?.get(sectionIndex)}
            />
          </div>
        );
      },
      [
        sections,
        expandedSections,
        locale,
        editMode,
        courseId,
        onLessonChange,
        lessonTimestamps,
        sectionTimestamps,
      ]
    );

    return (
      <div style={{ height: '600px' }}>
        <GroupedVirtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          groupCounts={groupCounts}
          groupContent={groupContent}
          itemContent={itemContent}
          rangeChanged={handleRangeChanged}
        />
      </div>
    );
  }
);

VirtualizedSectionsList.displayName = 'VirtualizedSectionsList';
