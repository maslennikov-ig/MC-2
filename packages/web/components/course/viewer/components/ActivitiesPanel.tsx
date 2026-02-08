import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Activity } from 'lucide-react'
import { Lesson } from '@/types/database'
import { isActivityObject } from '../types'

interface ActivitiesPanelProps {
  lesson: Lesson
  completedActivities: Record<string, Set<number>>
  onToggleActivity: (lessonId: string, index: number, total: number) => void
}

export function ActivitiesPanel({
  lesson,
  completedActivities,
  onToggleActivity,
}: ActivitiesPanelProps) {
  return (
    <div className="mx-auto max-w-4xl">
      {lesson.activities && lesson.activities.length > 0 ? (
        <Card className="border-purple-300 bg-gradient-to-br from-purple-100 to-blue-100 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-800 dark:text-white/90">Практические задания</CardTitle>
            <CardDescription className="text-gray-500 dark:text-white/60">
              Выполните эти задания для закрепления материала
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lesson.activities.map((activity, index) => {
                const isCompleted = completedActivities[lesson.id]?.has(index) || false
                const activityTitle = isActivityObject(activity)
                  ? activity.exercise_title || 'Задание'
                  : activity
                const activityDescription = isActivityObject(activity)
                  ? activity.exercise_description || ''
                  : ''
                const activityType = isActivityObject(activity) ? activity.exercise_type : null

                return (
                  <button
                    key={index}
                    onClick={() =>
                      onToggleActivity(lesson.id, index, lesson.activities?.length || 0)
                    }
                    className="group flex w-full items-start gap-3 rounded-lg bg-purple-50 p-4 text-left transition-colors hover:bg-purple-100 dark:bg-gray-800/30 dark:hover:bg-gray-800/50"
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-500" />
                    ) : (
                      <div className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-md border-2 border-purple-500 transition-colors group-hover:border-purple-600 dark:border-purple-400 dark:group-hover:border-purple-300" />
                    )}
                    <div className={`flex-1 ${isCompleted ? 'opacity-60' : ''}`}>
                      <p
                        className={`font-semibold text-gray-800 dark:text-white/90 ${isCompleted ? 'line-through' : ''}`}
                      >
                        {activityTitle}
                      </p>
                      {activityDescription && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-white/70">
                          {activityDescription}
                        </p>
                      )}
                      {activityType && (
                        <Badge
                          variant="secondary"
                          className="mt-2 bg-purple-100 text-xs text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"
                        >
                          {activityType === 'case_study' && 'Кейс'}
                          {activityType === 'hands_on' && 'Практика'}
                          {activityType === 'quiz' && 'Тест'}
                          {activityType === 'reflection' && 'Рефлексия'}
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 border-t border-purple-200 pt-6 dark:border-gray-700">
              <div className="mb-2 flex items-center justify-between text-sm text-gray-600 dark:text-white/60">
                <span>Прогресс заданий</span>
                <span>
                  {completedActivities[lesson.id]?.size || 0} из {lesson.activities.length}{' '}
                  выполнено
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-purple-100 dark:bg-gray-800">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                  style={{
                    width: `${((completedActivities[lesson.id]?.size || 0) / lesson.activities.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-purple-300 bg-gradient-to-br from-purple-100 to-blue-100 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-900">
          <CardContent className="py-12 text-center">
            <Activity className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-white/40" />
            <p className="text-gray-600 dark:text-white/60">
              Для этого урока нет практических заданий
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
