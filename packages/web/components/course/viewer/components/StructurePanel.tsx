import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, BookOpen, Clock, Circle, Layers } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Section, Lesson } from "@/types/database"

interface StructurePanelProps {
  sections: Section[];
  lessonsBySection: Record<string, Lesson[]>;
  currentLessonId: string | null;
  currentSectionId?: string;
  completedLessons: Set<string>;
  totalLessons: number;
  completedCount: number;
  remainingTime: string;
  progressPercentage: number;
  onSelectLesson: (id: string) => void;
}

export function StructurePanel({
  sections,
  lessonsBySection,
  currentLessonId,
  currentSectionId,
  completedLessons,
  totalLessons,
  completedCount,
  remainingTime,
  progressPercentage,
  onSelectLesson
}: StructurePanelProps) {
  return (
    <div className="max-w-6xl mx-auto">
      <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 border-purple-300 dark:border-gray-700 shadow-sm">
        <CardHeader>
          <CardTitle className="text-gray-800 dark:text-white/90 flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Структура курса
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-white/60">
            Полный обзор всех модулей и уроков курса
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sections.map((section) => {
              const sectionLessons = lessonsBySection[section.id] || []
              const sectionCompleted = sectionLessons.filter(l => completedLessons.has(l.id)).length
              const isCurrentSection = currentSectionId === section.id
              
              return (
                <div 
                  key={section.id} 
                  className={`rounded-lg border ${
                    isCurrentSection 
                      ? 'border-purple-500 dark:border-purple-400 bg-purple-50/50 dark:bg-purple-500/10' 
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50'
                  } overflow-hidden transition-all duration-200`}
                >
                  <div className="px-4 py-3 bg-gradient-to-r from-purple-100/50 to-blue-100/50 dark:from-gray-800/50 dark:to-gray-800/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full ${
                          isCurrentSection 
                            ? 'bg-purple-600 dark:bg-purple-500' 
                            : 'bg-gray-400 dark:bg-gray-600'
                        } text-white flex items-center justify-center text-sm font-bold`}>
                          {section.section_number}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-800 dark:text-white/90">
                            {section.title}
                          </h3>
                          {section.description && (
                            <p className="text-sm text-gray-600 dark:text-white/60 mt-0.5">
                              {section.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-gray-600 dark:text-white/60">
                          {sectionCompleted}/{sectionLessons.length} уроков
                        </div>
                        {sectionCompleted === sectionLessons.length && sectionLessons.length > 0 && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sectionLessons.map((lesson) => {
                        const isCompleted = completedLessons.has(lesson.id)
                        const isCurrent = currentLessonId === lesson.id
                        
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => onSelectLesson(lesson.id)}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md ${
                              isCurrent
                                ? 'border-purple-500 dark:border-purple-400 bg-purple-100 dark:bg-purple-500/20 shadow-md'
                                : isCompleted
                                ? 'border-green-300 dark:border-green-600/30 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }`}
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              {isCurrent ? (
                                <div className="w-6 h-6 rounded-full bg-purple-600 dark:bg-purple-500 flex items-center justify-center">
                                  <BookOpen className="w-3 h-3 text-white" />
                                </div>
                              ) : isCompleted ? (
                                <CheckCircle2 className="w-6 h-6 text-green-500" />
                              ) : (
                                <Circle className="w-6 h-6 text-gray-400 dark:text-gray-600" />
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <div className={`font-medium text-sm ${
                                isCurrent 
                                  ? 'text-purple-700 dark:text-purple-300' 
                                  : isCompleted
                                  ? 'text-green-700 dark:text-green-400'
                                  : 'text-gray-800 dark:text-white/80'
                              }`}>
                                {lesson.lesson_number}. {lesson.title}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-white/50">
                                <Clock className="w-3 h-3" />
                                <span>{lesson.duration_minutes} мин</span>
                                {isCurrent && (
                                  <Badge variant="default" className="ml-2 bg-purple-600 text-white text-xs px-1.5 py-0">
                                    Текущий
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-600 dark:text-white/60">Общий прогресс курса</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
                  {completedCount} из {totalLessons} уроков
                </p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm font-medium text-gray-600 dark:text-white/60">Осталось времени</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {remainingTime}
                </p>
              </div>
            </div>
            <Progress value={progressPercentage} className="h-3 mt-4" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
