'use client'

import { useState, useEffect, useRef } from 'react'

/**
 * Status messages for different generation phases
 *
 * Messages rotate every few seconds to give users a sense of progress
 * even when the actual backend progress doesn't change frequently.
 */
const STATUS_MESSAGES: Record<string, string[]> = {
  // Phase 1: Creating draft/variants
  draft_generating: [
    'Анализируем контент урока...',
    'Подбираем визуальный стиль...',
    'Генерируем варианты...',
    'Формируем описания...',
  ],

  // Phase 2: Final generation
  generating: [
    'Создаём изображение...',
    'Обрабатываем детали...',
    'Применяем стиль...',
    'Почти готово...',
  ],

  // Queued state
  pending: ['Задание в очереди...', 'Подготавливаем ресурсы...', 'Скоро начнём...'],
  queued: ['Задание в очереди...', 'Подготавливаем ресурсы...', 'Скоро начнём...'],

  // Analyzing content
  analyzing_content: [
    'Читаем материалы урока...',
    'Анализируем ключевые понятия...',
    'Определяем тематику...',
  ],

  // Finalizing
  finalizing: ['Финальная обработка...', 'Проверяем качество...', 'Сохраняем результат...'],

  // Uploading
  uploading_assets: ['Загружаем файлы...', 'Оптимизируем размер...', 'Завершаем...'],
}

/**
 * Default messages when status is not in the map
 */
const DEFAULT_MESSAGES = ['Обрабатываем...', 'Пожалуйста, подождите...']

interface UseRotatingStatusMessageOptions {
  /** Current generation status or step */
  status: string
  /** Rotation interval in milliseconds (default: 4000) */
  interval?: number
  /** Whether rotation is enabled (default: true) */
  enabled?: boolean
}

interface UseRotatingStatusMessageResult {
  /** Current message to display */
  message: string
  /** Current message index */
  messageIndex: number
  /** Total messages for current status */
  totalMessages: number
}

/**
 * Hook for rotating status messages during generation
 *
 * Provides a sense of progress by cycling through contextual messages
 * even when backend progress updates are infrequent.
 *
 * @example
 * ```tsx
 * const { message } = useRotatingStatusMessage({
 *   status: 'generating',
 *   interval: 4000,
 * });
 *
 * return <p>{message}</p>; // Shows rotating messages
 * ```
 */
export function useRotatingStatusMessage({
  status,
  interval = 4000,
  enabled = true,
}: UseRotatingStatusMessageOptions): UseRotatingStatusMessageResult {
  const [messageIndex, setMessageIndex] = useState(0)
  const previousStatusRef = useRef(status)

  // Get messages for current status
  const messages = STATUS_MESSAGES[status] || DEFAULT_MESSAGES

  // Reset to first message when status changes
  useEffect(() => {
    if (previousStatusRef.current !== status) {
      setMessageIndex(0)
      previousStatusRef.current = status
    }
  }, [status])

  // Rotate messages on interval
  useEffect(() => {
    if (!enabled || messages.length <= 1) {
      return
    }

    const timer = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length)
    }, interval)

    return () => clearInterval(timer)
  }, [enabled, interval, messages.length])

  // Ensure index is valid after status change (messages array might be shorter)
  const safeIndex = messageIndex % messages.length

  return {
    message: messages[safeIndex],
    messageIndex: safeIndex,
    totalMessages: messages.length,
  }
}

export default useRotatingStatusMessage
