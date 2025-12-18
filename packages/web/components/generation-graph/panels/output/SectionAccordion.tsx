'use client';

import React, { ReactNode } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, BookOpen, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Section, Lesson } from '@megacampus/shared-types';
import { AddElementChat } from './AddElementChat';

interface SectionAccordionProps {
  sections: Section[];
  locale?: 'ru' | 'en';
  editMode?: boolean;
  courseId?: string;
  onLessonAdded?: (sectionIndex: number, newLesson: Lesson) => void;
  onSectionChange?: (sectionIndex: number, field: string, value: unknown) => void;
  sectionTimestamps?: Map<number, Date>;
  children?: (section: Section, index: number) => ReactNode;
}

interface SectionItemProps {
  section: Section;
  sectionIndex: number;
  locale?: 'ru' | 'en';
  editMode?: boolean;
  courseId?: string;
  onLessonAdded?: (newLesson: Lesson) => void;
  onSectionChange?: (field: string, value: unknown) => void;
  sectionLastModified?: Date;
  children?: ReactNode;
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
 * SectionAccordion Root Component
 *
 * Container for expandable section items following PhaseAccordion pattern.
 */
export const SectionAccordion = ({
  sections,
  locale = 'ru',
  editMode = false,
  courseId,
  onLessonAdded,
  onSectionChange,
  sectionTimestamps,
  children,
}: SectionAccordionProps) => {
  return (
    <Accordion.Root type="multiple" className="space-y-2">
      {sections.map((section, index) => (
        <SectionItem
          key={`section-${section.section_number}`}
          section={section}
          sectionIndex={index}
          locale={locale}
          editMode={editMode}
          courseId={courseId}
          onLessonAdded={(newLesson) => onLessonAdded?.(index, newLesson)}
          onSectionChange={(field, value) => onSectionChange?.(index, field, value)}
          sectionLastModified={sectionTimestamps?.get(index)}
        >
          {children?.(section, index)}
        </SectionItem>
      ))}
    </Accordion.Root>
  );
};

/**
 * SectionItem Component
 *
 * Individual expandable section with header (collapsed state) and content (expanded state).
 */
export const SectionItem = ({
  section,
  sectionIndex,
  locale = 'ru',
  editMode = false,
  courseId,
  onLessonAdded,
  onSectionChange: _onSectionChange,
  sectionLastModified: _sectionLastModified,
  children,
}: SectionItemProps) => {
  const t = translations[locale];
  const lessonCount = section.lessons.length;
  const duration = section.estimated_duration_minutes;

  // Note: _onSectionChange and _sectionLastModified are reserved for future
  // section-level editing features. They will be used to track section modifications
  // and propagate stale status to child lessons.

  return (
    <Accordion.Item
      value={`section-${section.section_number}`}
      className={cn(
        'border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800'
      )}
    >
      <Accordion.Header className="flex">
        <Accordion.Trigger
          className="flex flex-1 items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
          aria-expanded={undefined}
          aria-controls={`section-${section.section_number}-content`}
          id={`section-${section.section_number}-header`}
          aria-label={`${t.section} ${section.section_number}: ${section.section_title} - ${formatLessonCount(lessonCount, locale)}, ${formatDuration(duration, locale)}`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Section Number Badge */}
            <Badge variant="secondary" className="bg-slate-500 text-white shrink-0">
              {t.section} {section.section_number}
            </Badge>

            {/* Section Title */}
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {section.section_title}
            </span>

            {/* Lesson Count and Duration */}
            <div className="flex items-center gap-3 ml-auto shrink-0 text-xs text-slate-500 dark:text-slate-400">
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
          <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-180 ml-2 shrink-0" />
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content
        className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"
        id={`section-${section.section_number}-content`}
        role="region"
        aria-labelledby={`section-${section.section_number}-header`}
      >
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
          {/* Section Description */}
          <p className="text-sm text-slate-700 dark:text-slate-300">{section.section_description}</p>

          {/* Section Learning Objectives */}
          {section.learning_objectives.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-slate-900 dark:text-slate-100 uppercase tracking-wide">
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

          {/* Children Slot for LessonRow Components */}
          {children && (
            <div className="mt-3">
              {children}
            </div>
          )}

          {/* Add Lesson Button - Only in edit mode */}
          {editMode && courseId && (
            <AddElementChat
              courseId={courseId}
              elementType="lesson"
              parentPath={`sections[${sectionIndex}].lessons`}
              position="end"
              locale={locale}
              onSuccess={(newElement) => onLessonAdded?.(newElement as Lesson)}
            />
          )}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
};
