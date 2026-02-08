'use client'

import React, { memo } from 'react'
import { BookOpen } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { StructureTreeProps, Section, Lesson } from '../types'

// ============================================================================
// LESSON ITEM COMPONENT
// ============================================================================

interface LessonItemProps {
  lesson: Lesson
  index: number
}

const LessonItem = memo<LessonItemProps>(function LessonItem({ lesson, index }) {
  const t = useTranslations('generation.stage5')

  return (
    <div className="border-muted hover:bg-muted/30 flex items-start gap-3 border-l-2 px-4 py-3 transition-colors">
      {/* Lesson Icon - using BookOpen as default (no lessonType in real data) */}
      <div className="mt-0.5 flex-shrink-0 text-orange-500">
        <BookOpen className="h-4 w-4" />
      </div>

      {/* Lesson Content */}
      <div className="min-w-0 flex-1">
        {/* Lesson Title */}
        <div className="mb-1 flex items-center gap-2">
          <span className="text-muted-foreground text-sm font-medium">
            {lesson.lesson_number || index + 1}.
          </span>
          <span className="text-sm font-medium">{lesson.lesson_title}</span>
        </div>

        {/* Lesson Objectives (if present) */}
        {lesson.lesson_objectives && lesson.lesson_objectives.length > 0 && (
          <ul className="text-muted-foreground mb-2 space-y-0.5 text-xs">
            {lesson.lesson_objectives.slice(0, 2).map((objective, idx) => (
              <li key={idx} className="line-clamp-1">
                - {objective}
              </li>
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
              <Badge key={idx} variant="outline" className="px-1.5 py-0 text-xs">
                {topic}
              </Badge>
            ))}
            {lesson.key_topics.length > 3 && (
              <span className="text-muted-foreground text-xs">+{lesson.key_topics.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="text-muted-foreground flex-shrink-0 text-xs">
        {lesson.estimated_duration_minutes} {t('minutesShort')}
      </div>
    </div>
  )
})

// ============================================================================
// SECTION ITEM COMPONENT
// ============================================================================

interface SectionItemProps {
  section: Section
  index: number
}

const SectionItem = memo<SectionItemProps>(function SectionItem({ section, index }) {
  const t = useTranslations('generation.stage5')

  // Use section_number as string for accordion value
  const sectionId = String(section.section_number || index + 1)

  return (
    <AccordionItem
      value={sectionId}
      className={cn(
        'border-border border-b',
        'transition-colors data-[state=open]:border-orange-500/30'
      )}
    >
      <AccordionTrigger className="group px-4 hover:no-underline">
        <div className="flex flex-1 items-center gap-3">
          {/* Section Number Badge */}
          <Badge
            variant="outline"
            className="bg-muted text-muted-foreground px-2 font-mono text-xs"
          >
            {section.section_number || index + 1}
          </Badge>

          {/* Section Title */}
          <span className="text-sm font-semibold transition-colors group-hover:text-orange-500">
            {section.section_title}
          </span>

          {/* Lesson Count Badge */}
          <Badge variant="secondary" className="ml-auto text-xs">
            {section.lessons.length} {t('lessonsInSection')}
          </Badge>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-0 pb-0">
        {/* Section Description */}
        {section.section_description && (
          <div className="bg-muted/30 border-border border-b px-4 py-3">
            <p className="text-muted-foreground text-sm">{section.section_description}</p>
          </div>
        )}

        {/* Learning Objectives */}
        {section.learning_objectives && section.learning_objectives.length > 0 && (
          <div className="bg-muted/20 border-border border-b px-4 py-3">
            <ul className="list-inside list-disc space-y-1">
              {section.learning_objectives.map((objective, idx) => (
                <li key={idx} className="text-muted-foreground text-xs">
                  {objective}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lessons */}
        <div className="divide-border divide-y">
          {section.lessons.map((lesson, lessonIdx) => (
            <LessonItem key={lesson.lesson_number || lessonIdx} lesson={lesson} index={lessonIdx} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
})

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
  locale: _locale = 'ru',
}) {
  // Handle accordion value change
  const handleValueChange = (value: string[]) => {
    if (!onToggleSection) return

    // Detect which section was toggled (added or removed)
    const added = value.find((id) => !expandedSections?.includes(id))
    const removed = expandedSections?.find((id) => !value.includes(id))

    if (added) {
      onToggleSection(added)
    } else if (removed) {
      onToggleSection(removed)
    }
  }

  return (
    <Accordion
      type="multiple"
      value={expandedSections}
      onValueChange={handleValueChange}
      className="border-border bg-card w-full overflow-hidden rounded-lg border"
    >
      {sections.map((section, index) => (
        <SectionItem key={section.section_number || index} section={section} index={index} />
      ))}
    </Accordion>
  )
})
