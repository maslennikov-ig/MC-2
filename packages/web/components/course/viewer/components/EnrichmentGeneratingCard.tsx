'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { Video, Headphones, Presentation, HelpCircle, Image } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSmoothProgress } from '@/lib/hooks/useSmoothProgress'
import {
  useRotatingStatusMessage,
  getMessageByProgress,
} from '@/lib/hooks/useRotatingStatusMessage'
import { getNextMilestone } from '@megacampus/shared-types'
import { StagedProgress } from '@/components/ui/staged-progress'
import { SmoothProgress } from '@/components/ui/smooth-progress'
import { cn } from '@/lib/utils'
import { useSupabase } from '@/lib/supabase/browser-client'
import {
  TelegramLoginButton,
  type TelegramAuthData,
} from '@/components/telegram/telegram-login-button'

type EnrichmentType =
  | 'quiz'
  | 'audio'
  | 'nlm_audio'
  | 'presentation'
  | 'video'
  | 'nlm_video'
  | 'cover'
  | 'card'

const ENRICHMENT_CONFIG: Record<
  EnrichmentType,
  {
    icon: React.ElementType
    color: string
    bgColor: string
  }
> = {
  video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  nlm_audio: {
    icon: Headphones,
    color: 'text-purple-500 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  presentation: {
    icon: Presentation,
    color: 'text-orange-500 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  quiz: {
    icon: HelpCircle,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  cover: {
    icon: Image,
    color: 'text-cyan-500 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  card: {
    icon: Image,
    color: 'text-indigo-500 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  nlm_video: {
    icon: Video,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
}

const GENERATION_STAGES = [
  { id: 'prepare', label: 'Подготовка' },
  { id: 'generate', label: 'Генерация' },
  { id: 'save', label: 'Сохранение' },
]

const LONG_RUNNING_PROGRESS_CAP = 95
const LONG_RUNNING_EASING_POWER = 2.2
const EXTENSION_STEP_MS = 10 * 60 * 1000 // 10-min extensions when timer expires
const ABSOLUTE_MAX_DURATION_MS = 3 * 60 * 60 * 1000 // 3-hour hard cap

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function getDeceleratingLongRunningProgress(elapsedMs: number, maxDurationMs: number): number {
  if (maxDurationMs <= 0) return 0

  const ratio = Math.min(Math.max(elapsedMs / maxDurationMs, 0), 1)
  // Ease-out curve: faster at start, then increasingly slower near completion.
  const easedRatio = 1 - Math.pow(1 - ratio, LONG_RUNNING_EASING_POWER)

  return clampProgress(easedRatio * LONG_RUNNING_PROGRESS_CAP)
}

/**
 * Convert global generation progress (0-100) to progress within current stage (0-100).
 *
 * StagedProgress expects per-stage progress, but backend/status polling gives global progress.
 * Without this normalization, stage transitions can jump visually above 50% too early.
 */
function toStageProgress(currentStep: string, globalProgress: number): number {
  const progress = clampProgress(globalProgress)

  switch (currentStep) {
    case 'queued':
    case 'syncing':
    case 'analyzing_content':
      // Stage 0 (prepare): map global 0-50 → stage 0-100
      return clampProgress(progress * 2)
    case 'generating':
      // Stage 1 (generate): map global 50-100 → stage 0-100
      return clampProgress((progress - 50) * 2)
    case 'uploading_assets':
    case 'finalizing':
      // Stage 2 (save/finalize): map global 75-100 → stage 0-100
      return clampProgress((progress - 75) * 4)
    default:
      return progress
  }
}

/**
 * Return the upper global-progress boundary for the current UI stage.
 *
 * This keeps asymptotic crawl within the active stage so the staged progress
 * bar doesn't visually jump into the next stage before `currentStep` changes.
 */
function getStageMilestone(currentStep: string, globalProgress: number): number {
  const progress = clampProgress(globalProgress)

  switch (currentStep) {
    case 'queued':
    case 'syncing':
    case 'analyzing_content':
      return 50
    case 'generating':
      return 75
    case 'uploading_assets':
    case 'finalizing':
      return 100
    default:
      return getNextMilestone(progress)
  }
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

interface EnrichmentGeneratingCardProps {
  type: EnrichmentType
  progress: number
  currentStep: string
  startedAtMs?: number
  maxDurationMs?: number
  onCancel: () => void
}

export function EnrichmentGeneratingCard({
  type,
  progress,
  currentStep,
  startedAtMs,
  maxDurationMs,
  onCancel,
}: EnrichmentGeneratingCardProps) {
  const t = useTranslations('enrichments')
  const config = ENRICHMENT_CONFIG[type]
  const Icon = config.icon

  const { session, supabase } = useSupabase()
  const [isTelegramConnected, setIsTelegramConnected] = React.useState<boolean>(false)
  const [telegramChecked, setTelegramChecked] = React.useState(false)

  // Fetch Telegram connection status
  React.useEffect(() => {
    let isMounted = true
    async function checkTelegram() {
      if (!session?.user?.id) {
        if (isMounted) {
          setIsTelegramConnected(false)
          setTelegramChecked(true)
        }
        return
      }

      try {
        const { data } = await supabase
          .from('users')
          .select('telegram_chat_id')
          .eq('id', session.user.id)
          .single()

        if (isMounted) {
          setIsTelegramConnected(!!data?.telegram_chat_id)
        }
      } catch {
        if (isMounted) setIsTelegramConnected(false)
      } finally {
        if (isMounted) setTelegramChecked(true)
      }
    }
    void checkTelegram()

    return () => {
      isMounted = false
    }
  }, [session, supabase])

  const handleTelegramAuth = async (data: TelegramAuthData) => {
    if (!session?.access_token) return

    try {
      const response = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        setIsTelegramConnected(true)
      }
    } catch {
      // Ignore errors for now
    }
  }

  // Check if we're in syncing state (progress === -1 means resuming, waiting for first poll)
  const isSyncing = progress === -1

  // Map backend step to stage index
  const stageIndex =
    currentStep === 'queued' || currentStep === 'syncing' || currentStep === 'analyzing_content'
      ? 0
      : currentStep === 'generating'
        ? 1
        : currentStep === 'finalizing' || currentStep === 'uploading_assets'
          ? 2
          : 1

  // Smooth interpolation within stage with asymptotic crawl
  // Use 0 as target when syncing to avoid jumps
  const { progress: smoothProgress, isCrawling } = useSmoothProgress({
    targetProgress: isSyncing ? 0 : progress,
    isComplete: progress >= 100,
    enableAsymptoticCrawl: true,
    nextMilestone: getStageMilestone(currentStep, isSyncing ? 0 : progress),
    crawlDelay: 3000,
    crawlIncrement: 0.15,
  })

  const stagedProgress = toStageProgress(currentStep, isSyncing ? 0 : smoothProgress)

  // Map type to specific status for rotating messages
  const getRotatingStatus = () => {
    // Syncing state - waiting for first poll after resume
    if (currentStep === 'syncing') {
      return 'syncing'
    }
    // For generating state, use type-specific messages
    if (currentStep === 'generating') {
      switch (type) {
        case 'cover':
          return 'cover_generating'
        case 'card':
          return 'cover_generating' // Cards use same messages as covers
        case 'quiz':
          return 'quiz_generating'
        case 'audio':
          return 'audio_generating'
        case 'nlm_audio':
          return 'nlm_audio_generating'
        case 'presentation':
          return 'presentation_generating'
        case 'video':
          return 'video_generating'
        case 'nlm_video':
          return 'nlm_video_generating'
        default:
          return 'generating'
      }
    }
    // For other states (queued, finalizing, etc.) use as-is
    return currentStep
  }

  const shouldShowLongRunningCountdown =
    (type === 'nlm_audio' || type === 'nlm_video') &&
    typeof startedAtMs === 'number' &&
    Number.isFinite(startedAtMs) &&
    startedAtMs > 0 &&
    typeof maxDurationMs === 'number' &&
    Number.isFinite(maxDurationMs) &&
    maxDurationMs > 0

  const [nowMs, setNowMs] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!shouldShowLongRunningCountdown) {
      return
    }

    setNowMs(Date.now())
    const interval = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [shouldShowLongRunningCountdown])

  // Auto-extend duration in 10-min steps when timer expires (up to 3h hard cap).
  // Generation should never appear to "time out" — the UI keeps waiting.
  const effectiveMaxDuration = React.useMemo(() => {
    if (!maxDurationMs || !startedAtMs) return maxDurationMs
    const elapsedMs = Math.max(0, nowMs - startedAtMs)
    if (elapsedMs <= maxDurationMs) return maxDurationMs
    const extensions = Math.ceil((elapsedMs - maxDurationMs) / EXTENSION_STEP_MS)
    return Math.min(maxDurationMs + extensions * EXTENSION_STEP_MS, ABSOLUTE_MAX_DURATION_MS)
  }, [maxDurationMs, startedAtMs, nowMs])

  const countdownMetrics = React.useMemo(() => {
    if (!shouldShowLongRunningCountdown || !startedAtMs || !effectiveMaxDuration) {
      return null
    }

    const elapsedMs = Math.max(0, nowMs - startedAtMs)
    const clampedElapsedMs = Math.min(elapsedMs, effectiveMaxDuration)
    const remainingMs = Math.max(0, effectiveMaxDuration - elapsedMs)

    return {
      elapsedLabel: formatDuration(clampedElapsedMs / 1000),
      remainingLabel: formatDuration(remainingMs / 1000),
      totalLabel: formatDuration(effectiveMaxDuration / 1000),
    }
  }, [effectiveMaxDuration, nowMs, shouldShowLongRunningCountdown, startedAtMs])

  // For long-running NLM enrichments, progress should feel continuously alive.
  // We use an ease-out timeline: faster in the beginning, then gradually slower.
  // On real completion, UI still jumps to 100% immediately.
  const longRunningProgress = React.useMemo(() => {
    if (!shouldShowLongRunningCountdown || !startedAtMs || !effectiveMaxDuration) {
      return null
    }

    if (progress >= 100) {
      return 100
    }

    const elapsedMs = Math.max(0, nowMs - startedAtMs)
    return getDeceleratingLongRunningProgress(elapsedMs, effectiveMaxDuration)
  }, [effectiveMaxDuration, nowMs, progress, shouldShowLongRunningCountdown, startedAtMs])

  const shouldUseLongRunningProgressBar =
    shouldShowLongRunningCountdown &&
    (type === 'nlm_audio' || type === 'nlm_video') &&
    !isSyncing &&
    longRunningProgress !== null

  // Rotating status messages (time-based for non-NLM, disabled for NLM)
  const { message: rotatingMessage } = useRotatingStatusMessage({
    status: getRotatingStatus(),
    interval: 5000,
    enabled: !shouldUseLongRunningProgressBar,
  })

  // For NLM types: pick message based on progress percentage, not time
  const statusMessage =
    shouldUseLongRunningProgressBar && longRunningProgress !== null
      ? getMessageByProgress(getRotatingStatus(), longRunningProgress)
      : rotatingMessage

  const getTitle = () => {
    switch (type) {
      case 'quiz':
        return t('placeholder.quiz.title')
      case 'audio':
        return t('placeholder.audio.title')
      case 'nlm_audio':
        return t('placeholder.nlm_audio.title')
      case 'presentation':
        return t('placeholder.presentation.title')
      case 'video':
        return t('placeholder.video.title')
      case 'nlm_video':
        return t('placeholder.nlm_video.title')
      case 'cover':
        return t('images.cover.title')
      case 'card':
        return t('images.card.title')
    }
  }

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes indeterminate {
          0% {
            left: -33%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
      <Card className="overflow-hidden transition-shadow hover:shadow-md">
        <CardHeader className={`${config.bgColor} py-3`}>
          <div className="flex items-center gap-2">
            <Icon
              className={cn(
                `h-5 w-5 ${config.color}`,
                isCrawling ? 'animate-pulse' : 'animate-pulse'
              )}
            />
            <CardTitle className="text-base font-medium">
              {getTitle()} - {t('generating')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          {/* Progress bar with shimmer effect */}
          <div className="relative">
            {isSyncing ? (
              /* Indeterminate progress bar while syncing */
              <div className="bg-muted relative h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary/60 absolute h-full w-1/3 rounded-full"
                  style={{
                    animation: 'indeterminate 1.5s ease-in-out infinite',
                  }}
                />
              </div>
            ) : shouldUseLongRunningProgressBar ? (
              <SmoothProgress value={longRunningProgress} variant="gradient" showPercentage />
            ) : (
              <StagedProgress
                stages={GENERATION_STAGES}
                currentStageIndex={stageIndex}
                stageProgress={stagedProgress}
                isComplete={progress >= 100}
              />
            )}

            {/* Shimmer overlay when crawling */}
            {isCrawling && !isSyncing && (
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
                style={{ width: `${smoothProgress}%` }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    animation: 'shimmer 2s infinite',
                  }}
                />
              </div>
            )}
          </div>

          {/* Rotating status message */}
          <p className="text-muted-foreground text-sm transition-opacity duration-300">
            {statusMessage}
          </p>
          {countdownMetrics && (
            <div className="bg-muted/50 space-y-1 rounded-md border px-3 py-2">
              <p className="text-foreground text-sm font-medium">
                {t('longGeneration.remaining', {
                  remaining: countdownMetrics.remainingLabel,
                  total: countdownMetrics.totalLabel,
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('longGeneration.elapsed', {
                  elapsed: countdownMetrics.elapsedLabel,
                })}
              </p>
            </div>
          )}

          <div className="border-muted/50 mt-6 flex items-center justify-between border-t pt-4">
            {telegramChecked && !isTelegramConnected ? (
              <div className="mr-4 flex-1">
                <p className="text-muted-foreground mb-3 text-sm">
                  Не хотите ждать? Подключите Telegram, чтобы получить уведомление о готовности.
                </p>
                <div className="w-[200px]">
                  <TelegramLoginButton
                    botUsername={
                      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'ai_megacampus_bot'
                    }
                    onAuth={handleTelegramAuth}
                    size="small"
                  />
                </div>
              </div>
            ) : (
              <div className="mr-4 flex-1">
                <p className="text-muted-foreground text-xs">
                  Вы можете безопасно закрыть эту страницу. Мы пришлем уведомление в Telegram, когда
                  материал будет готов.
                </p>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              aria-label={`Cancel ${type} generation`}
            >
              {t('cancel')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
