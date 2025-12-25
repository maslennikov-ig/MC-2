'use client';

import React, { memo } from 'react';
import { BookOpen } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import type { StructureTreeProps, Section, Lesson } from '../types';

// ============================================================================
// LESSON ITEM COMPONENT
// ============================================================================

interface LessonItemProps {
  lesson: Lesson;
  index: number;
  locale: 'ru' | 'en';
}

const LessonItem = memo<LessonItemProps>(function LessonItem({ lesson, index, locale }) {
  const t = GRAPH_TRANSLATIONS.stage5!;

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-l-2 border-muted hover:bg-muted/30 transition-colors">
      {/* Lesson Icon - using BookOpen as default (no lessonType in real data) */}
      <div className="flex-shrink-0 mt-0.5 text-orange-500">
        <BookOpen className="h-4 w-4" />
      </div>

      {/* Lesson Content */}
      <div className="flex-1 min-w-0">
        {/* Lesson Title */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-muted-foreground">
            {lesson.lesson_number || index + 1}.
          </span>
          <span className="text-sm font-medium">{lesson.lesson_title}</span>
        </div>

        {/* Lesson Objectives (if present) */}
        {lesson.lesson_objectives && lesson.lesson_objectives.length > 0 && (
          <ul className="text-xs text-muted-foreground mb-2 space-y-0.5">
            {lesson.lesson_objectives.slice(0, 2).map((objective, idx) => (
              <li key={idx} className="line-clamp-1">- {objective}</li>
            ))}
            {lesson.lesson_objectives.length > 2 && (
              <li className="text-muted-foreground/70">
                +{lesson.lesson_objectives.length - 2} more
              </li>
            )}
          </ul>
        )}

        {/* Key Topics (if present) */}
        {lesson.key_topics && lesson.key_topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {lesson.key_topics.slice(0, 3).map((topic, idx) => (
              <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0">
                {topic}
              </Badge>
            ))}
            {lesson.key_topics.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{lesson.key_topics.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="flex-shrink-0 text-xs text-muted-foreground">
        {lesson.estimated_duration_minutes} {t?.minutesShort?.[locale] ?? 'm'}
      </div>
    </div>
  );
});

// ============================================================================
// SECTION ITEM COMPONENT
// ============================================================================

interface SectionItemProps {
  section: Section;
  index: number;
  locale: 'ru' | 'en';
}

const SectionItem = memo<SectionItemProps>(function SectionItem({ section, index, locale }) {
  const t = GRAPH_TRANSLATIONS.stage5!;

  // Use section_number as string for accordion value
  const sectionId = String(section.section_number || index + 1);

  return (
    <AccordionItem
      value={sectionId}
      className={cn(
        'border-b border-border',
        'data-[state=open]:border-orange-500/30 transition-colors'
      )}
    >
      <AccordionTrigger className="hover:no-underline group px-4">
        <div className="flex items-center gap-3 flex-1">
          {/* Section Number Badge */}
          <Badge
            variant="outline"
            className="bg-muted text-muted-foreground font-mono text-xs px-2"
          >
            {section.section_number || index + 1}
          </Badge>

          {/* Section Title */}
          <span className="text-sm font-semibold group-hover:text-orange-500 transition-colors">
            {section.section_title}
          </span>

          {/* Lesson Count Badge */}
          <Badge variant="secondary" className="ml-auto text-xs">
            {section.lessons.length} {t?.lessonsInSection?.[locale] ?? 'lessons'}
          </Badge>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-0 pb-0">
        {/* Section Description */}
        {section.section_description && (
          <div className="px-4 py-3 bg-muted/30 border-b border-border">
            <p className="text-sm text-muted-foreground">{section.section_description}</p>
          </div>
        )}

        {/* Learning Objectives */}
        {section.learning_objectives && section.learning_objectives.length > 0 && (
          <div className="px-4 py-3 bg-muted/20 border-b border-border">
            <ul className="list-disc list-inside space-y-1">
              {section.learning_objectives.map((objective, idx) => (
                <li key={idx} className="text-xs text-muted-foreground">
                  {objective}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lessons */}
        <div className="divide-y divide-border">
          {section.lessons.map((lesson, lessonIdx) => (
            <LessonItem
              key={lesson.lesson_number || lessonIdx}
              lesson={lesson}
              index={lessonIdx}
              locale={locale}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * StructureTree Component
 *
 * Displays the course structure as a collapsible tree with sections and lessons.
 * Uses Accordion for expandable sections.
 *
 * Features:
 * - Section headers with number badge, title, and lesson count
 * - Section description and learning objectives
 * - Lessons with BookOpen icon (uniform styling)
 * - Lesson duration and key topics
 * - Orange accent color for active states (Stage 5 theme)
 * - Full dark mode support
 * - Bilingual (Russian/English)
 *
 * @param sections - Array of sections with lessons (real data uses snake_case)
 * @param expandedSections - Array of expanded section IDs (controlled)
 * @param onToggleSection - Callback when section is toggled
 * @param locale - Language locale ('ru' | 'en')
 */
export const StructureTree = memo<StructureTreeProps>(function StructureTree({
  sections,
  expandedSections,
  onToggleSection,
  locale = 'ru',
}) {
  // Handle accordion value change
  const handleValueChange = (value: string[]) => {
    if (!onToggleSection) return;

    // Detect which section was toggled (added or removed)
    const added = value.find(id => !expandedSections?.includes(id));
    const removed = expandedSections?.find(id => !value.includes(id));

    if (added) {
      onToggleSection(added);
    } else if (removed) {
      onToggleSection(removed);
    }
  };

  return (
    <Accordion
      type="multiple"
      value={expandedSections}
      onValueChange={handleValueChange}
      className="w-full border border-border rounded-lg overflow-hidden bg-card"
    >
      {sections.map((section, index) => (
        <SectionItem
          key={section.section_number || index}
          section={section}
          index={index}
          locale={locale}
        />
      ))}
    </Accordion>
  );
});
