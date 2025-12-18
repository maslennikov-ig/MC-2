'use client'

import { memo, Suspense, useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { UserProfile } from '../page'
import type { UserPreferences } from '@/lib/user-preferences'
import { LEARNING_STYLES, getLearningStyleTitle } from '@/lib/constants/learning-styles'

// Lazy load heavy components
const Select = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.Select
})), { ssr: false, loading: () => <div className="h-10 w-full bg-muted animate-pulse rounded-md mt-2" /> })

const SelectContent = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectContent
})))
const SelectItem = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectItem
})))
const SelectTrigger = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectTrigger
})))
const SelectValue = dynamic(() => import('@/components/ui/select').then(mod => ({
  default: mod.SelectValue
})))

const Switch = dynamic(() => import('@/components/ui/switch').then(mod => ({
  default: mod.Switch
})), { ssr: false, loading: () => <div className="h-6 w-11 bg-muted animate-pulse rounded-full" /> })

const Slider = dynamic(() => import('@/components/ui/slider').then(mod => ({
  default: mod.Slider
})), { ssr: false, loading: () => <div className="h-5 w-full bg-muted animate-pulse rounded-md mt-2" /> })

interface LearningPreferencesSectionProps {
  profile: UserProfile | (UserProfile & UserPreferences)
  onUpdate: (updates: Partial<UserProfile & UserPreferences>) => Promise<void>
}

const LearningPreferencesSection = memo(function LearningPreferencesSection({
  profile,
  onUpdate
}: LearningPreferencesSectionProps) {
  const [localDailyGoal, setLocalDailyGoal] = useState(
    'daily_goal_minutes' in profile ? profile.daily_goal_minutes : 30
  )
  const [updateTimeout, setUpdateTimeout] = useState<NodeJS.Timeout | null>(null)

  // Debounced update function
  const debouncedUpdate = useCallback((value: number) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout)
    }
    const timeout = setTimeout(() => {
      onUpdate({ daily_goal_minutes: value })
    }, 500) // Wait 500ms after user stops dragging
    setUpdateTimeout(timeout)
  }, [onUpdate, updateTimeout])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
    }
  }, [updateTimeout])
  return (
    <div className="space-y-6">
      {/* Learning Preferences */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          Настройки обучения
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="difficulty">Уровень сложности</Label>
            <Suspense fallback={<div className="h-10 w-full bg-muted animate-pulse rounded-md mt-2" />}>
              <Select
                value={'difficulty_level' in profile ? profile.difficulty_level : 'intermediate'}
                onValueChange={(value) => onUpdate({ difficulty_level: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Начинающий</SelectItem>
                  <SelectItem value="intermediate">Средний</SelectItem>
                  <SelectItem value="advanced">Продвинутый</SelectItem>
                </SelectContent>
              </Select>
            </Suspense>
          </div>

          <div>
            <Label htmlFor="learning-style">Предпочитаемый стиль обучения</Label>
            <Suspense fallback={<div className="h-10 w-full bg-muted animate-pulse rounded-md mt-2" />}>
              <Select
                value={'learning_style' in profile ? profile.learning_style : 'conversational'}
                onValueChange={(value) => onUpdate({ learning_style: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue>
                    {getLearningStyleTitle('learning_style' in profile ? profile.learning_style : 'conversational')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {LEARNING_STYLES.map((style) => (
                    <SelectItem
                      key={style.value}
                      value={style.value}
                      className="py-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">{style.title}</div>
                        <div className="text-sm text-muted-foreground">{style.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Suspense>
            <p className="text-sm text-muted-foreground mt-2">
              Этот стиль будет использоваться по умолчанию при создании новых курсов
            </p>
          </div>

          <div>
            <Label htmlFor="daily-goal">
              Ежедневная цель: {localDailyGoal} минут
            </Label>
            <Suspense fallback={<div className="h-5 w-full bg-muted animate-pulse rounded-md mt-2" />}>
              <Slider
                id="daily-goal"
                min={5}
                max={120}
                step={5}
                value={[localDailyGoal]}
                onValueChange={([value]) => {
                  setLocalDailyGoal(value)
                  debouncedUpdate(value)
                }}
                className="mt-2"
              />
            </Suspense>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>5 мин</span>
              <span>120 мин</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Accessibility Settings */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          Специальные возможности
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="font-size">Размер шрифта</Label>
            <Suspense fallback={<div className="h-10 w-full bg-muted animate-pulse rounded-md mt-2" />}>
              <Select
                value={'font_size' in profile ? profile.font_size : 'medium'}
                onValueChange={(value) => onUpdate({ font_size: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Маленький</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="large">Большой</SelectItem>
                  <SelectItem value="extra-large">Очень большой</SelectItem>
                </SelectContent>
              </Select>
            </Suspense>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="high-contrast">Высокая контрастность</Label>
              <p className="text-sm text-muted-foreground">
                Увеличить контрастность для лучшей читаемости
              </p>
            </div>
            <Suspense fallback={<div className="h-6 w-11 bg-muted animate-pulse rounded-full" />}>
              <Switch
                id="high-contrast"
                checked={'high_contrast' in profile ? profile.high_contrast : false}
                onCheckedChange={(checked) => onUpdate({ high_contrast: checked })}
              />
            </Suspense>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reduce-motion">Уменьшить анимацию</Label>
              <p className="text-sm text-muted-foreground">
                Отключить анимацию для комфорта
              </p>
            </div>
            <Suspense fallback={<div className="h-6 w-11 bg-muted animate-pulse rounded-full" />}>
              <Switch
                id="reduce-motion"
                checked={'reduce_motion' in profile ? profile.reduce_motion : false}
                onCheckedChange={(checked) => onUpdate({ reduce_motion: checked })}
              />
            </Suspense>
          </div>
        </div>
      </Card>
    </div>
  )
})

export default LearningPreferencesSection