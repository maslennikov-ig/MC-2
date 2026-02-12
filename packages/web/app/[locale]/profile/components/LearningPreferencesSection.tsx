'use client'

import { memo, Suspense, useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import type { UserProfile } from '../_components/profile-utils'
import type { UserPreferences } from '@/lib/user-preferences'
import { LEARNING_STYLES, getLearningStyleTitle } from '@/lib/constants/learning-styles'

// Lazy load heavy components
const Select = dynamic(
  () =>
    import('@/components/ui/select').then((mod) => ({
      default: mod.Select,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted mt-2 h-10 w-full animate-pulse rounded-md" />,
  }
)

const SelectContent = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectContent,
  }))
)
const SelectItem = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectItem,
  }))
)
const SelectTrigger = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectTrigger,
  }))
)
const SelectValue = dynamic(() =>
  import('@/components/ui/select').then((mod) => ({
    default: mod.SelectValue,
  }))
)

const Switch = dynamic(
  () =>
    import('@/components/ui/switch').then((mod) => ({
      default: mod.Switch,
    })),
  { ssr: false, loading: () => <div className="bg-muted h-6 w-11 animate-pulse rounded-full" /> }
)

const Slider = dynamic(
  () =>
    import('@/components/ui/slider').then((mod) => ({
      default: mod.Slider,
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted mt-2 h-5 w-full animate-pulse rounded-md" />,
  }
)

interface LearningPreferencesSectionProps {
  profile: UserProfile | (UserProfile & UserPreferences)
  onUpdate: (updates: Partial<UserProfile & UserPreferences>) => Promise<void>
}

const LearningPreferencesSection = memo(function LearningPreferencesSection({
  profile,
  onUpdate,
}: LearningPreferencesSectionProps) {
  const t = useTranslations('profile')
  const [localDailyGoal, setLocalDailyGoal] = useState(
    'daily_goal_minutes' in profile ? profile.daily_goal_minutes : 30
  )
  const [updateTimeout, setUpdateTimeout] = useState<NodeJS.Timeout | null>(null)

  // Debounced update function
  const debouncedUpdate = useCallback(
    (value: number) => {
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
      const timeout = setTimeout(() => {
        void onUpdate({ daily_goal_minutes: value })
      }, 500) // Wait 500ms after user stops dragging
      setUpdateTimeout(timeout)
    },
    [onUpdate, updateTimeout]
  )

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
        <h3 className="mb-4 text-lg font-semibold">{t('learningPreferences.learningTitle')}</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="difficulty">{t('learningPreferences.difficulty')}</Label>
            <Suspense
              fallback={<div className="bg-muted mt-2 h-10 w-full animate-pulse rounded-md" />}
            >
              <Select
                value={'difficulty_level' in profile ? profile.difficulty_level : 'intermediate'}
                onValueChange={(value) => void onUpdate({ difficulty_level: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">
                    {t('learningPreferences.difficultyBeginner')}
                  </SelectItem>
                  <SelectItem value="intermediate">
                    {t('learningPreferences.difficultyIntermediate')}
                  </SelectItem>
                  <SelectItem value="advanced">
                    {t('learningPreferences.difficultyAdvanced')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Suspense>
          </div>

          <div>
            <Label htmlFor="learning-style">{t('learningPreferences.learningStyle')}</Label>
            <Suspense
              fallback={<div className="bg-muted mt-2 h-10 w-full animate-pulse rounded-md" />}
            >
              <Select
                value={'learning_style' in profile ? profile.learning_style : 'conversational'}
                onValueChange={(value) => void onUpdate({ learning_style: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue>
                    {getLearningStyleTitle(
                      'learning_style' in profile ? profile.learning_style : 'conversational'
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {LEARNING_STYLES.map((style) => (
                    <SelectItem key={style.value} value={style.value} className="py-3">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">{style.title}</div>
                        <div className="text-muted-foreground text-sm">{style.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Suspense>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('learningPreferences.learningStyleDesc')}
            </p>
          </div>

          <div>
            <Label htmlFor="daily-goal">
              {t('learningPreferences.dailyGoal', { minutes: localDailyGoal })}
            </Label>
            <Suspense
              fallback={<div className="bg-muted mt-2 h-5 w-full animate-pulse rounded-md" />}
            >
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
            <div className="text-muted-foreground mt-1 flex justify-between text-xs">
              <span>{t('learningPreferences.dailyGoalMin')}</span>
              <span>{t('learningPreferences.dailyGoalMax')}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Accessibility Settings */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">
          {t('learningPreferences.accessibilityTitle')}
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="font-size">{t('learningPreferences.fontSize')}</Label>
            <Suspense
              fallback={<div className="bg-muted mt-2 h-10 w-full animate-pulse rounded-md" />}
            >
              <Select
                value={'font_size' in profile ? profile.font_size : 'medium'}
                onValueChange={(value) => void onUpdate({ font_size: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">{t('learningPreferences.fontSizeSmall')}</SelectItem>
                  <SelectItem value="medium">{t('learningPreferences.fontSizeMedium')}</SelectItem>
                  <SelectItem value="large">{t('learningPreferences.fontSizeLarge')}</SelectItem>
                  <SelectItem value="extra-large">
                    {t('learningPreferences.fontSizeExtraLarge')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Suspense>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="high-contrast">{t('learningPreferences.highContrast')}</Label>
              <p className="text-muted-foreground text-sm">
                {t('learningPreferences.highContrastDesc')}
              </p>
            </div>
            <Suspense fallback={<div className="bg-muted h-6 w-11 animate-pulse rounded-full" />}>
              <Switch
                id="high-contrast"
                checked={'high_contrast' in profile ? profile.high_contrast : false}
                onCheckedChange={(checked) => void onUpdate({ high_contrast: checked })}
              />
            </Suspense>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reduce-motion">{t('learningPreferences.reduceMotion')}</Label>
              <p className="text-muted-foreground text-sm">
                {t('learningPreferences.reduceMotionDesc')}
              </p>
            </div>
            <Suspense fallback={<div className="bg-muted h-6 w-11 animate-pulse rounded-full" />}>
              <Switch
                id="reduce-motion"
                checked={'reduce_motion' in profile ? profile.reduce_motion : false}
                onCheckedChange={(checked) => void onUpdate({ reduce_motion: checked })}
              />
            </Suspense>
          </div>
        </div>
      </Card>
    </div>
  )
})

export default LearningPreferencesSection
