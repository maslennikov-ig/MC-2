'use client'

import { useState, useEffect } from 'react'
import { usePrevious } from '@/lib/hooks/use-previous'

/**
 * Status messages for different generation phases
 *
 * Messages show sequentially to give users a sense of progress.
 * Once all messages are shown, the last one remains (no cycling).
 * Enough messages to cover typical generation time without repeating.
 */
const STATUS_MESSAGES: Record<string, string[]> = {
  // Phase 1: Creating draft/variants
  draft_generating: [
    'Анализируем контент урока...',
    'Изучаем ключевые понятия...',
    'Подбираем визуальный стиль...',
    'Определяем цветовую палитру...',
    'Генерируем варианты...',
    'Экспериментируем с композицией...',
    'Кофе-брейк для нейросети ☕',
    'Формируем описания...',
    'Уточняем детали...',
    'Добавляем креативности...',
    'Проверяем гармонию цветов...',
    'Наш ИИ вдохновляется вашим контентом...',
    'Подключаем воображение...',
    'Ищем идеальный ракурс...',
    'Смешиваем краски на цифровом холсте...',
    'Настраиваем освещение...',
    'Продолжаем творить...',
    'Добавляем последние штрихи к черновикам...',
    'Скоро покажем варианты...',
    'Финальная доработка черновиков...',
  ],

  // Phase 2: Final generation
  generating: [
    'Создаём изображение...',
    'Прорисовываем основу...',
    'Обрабатываем детали...',
    'Настраиваем контрастность...',
    'Применяем стиль...',
    'Добавляем глубину...',
    'Работаем над текстурами...',
    'ИИ-художник старается для вас 🎨',
    'Полируем пиксели...',
    'Магия машинного обучения в действии...',
    'Проверяем пропорции...',
    'Улучшаем качество...',
    'Генерация — это искусство, а искусство требует времени...',
    'Добавляем финальные акценты...',
    'Каждый пиксель на своём месте...',
    'Терпение — ключ к шедевру...',
    'Наша нейросеть в потоке творчества...',
    'Доводим до совершенства...',
    'Проверяем цветопередачу...',
    'Оптимизируем для веба...',
    'Сжимаем без потери качества...',
    'Последние улучшения...',
    'Почти готово, ещё чуть-чуть...',
    'Финальный рендеринг...',
    'Совсем скоро увидите результат...',
  ],

  // Queued state
  pending: [
    'Задание в очереди...',
    'Подготавливаем ресурсы...',
    'Резервируем вычислительную мощность...',
    'Прогреваем GPU...',
    'Скоро начнём...',
    'Очередь движется...',
    'Ваше задание важно для нас...',
    'Немного терпения...',
    'Готовимся к старту...',
    'Проверяем доступность моделей...',
    'Оптимизируем очередь...',
    'Почти ваша очередь...',
  ],
  queued: [
    'Задание в очереди...',
    'Подготавливаем ресурсы...',
    'Резервируем вычислительную мощность...',
    'Прогреваем GPU...',
    'Скоро начнём...',
    'Очередь движется...',
    'Ваше задание важно для нас...',
    'Немного терпения...',
    'Готовимся к старту...',
    'Проверяем доступность моделей...',
    'Оптимизируем очередь...',
    'Почти ваша очередь...',
  ],

  // Analyzing content
  analyzing_content: [
    'Читаем материалы урока...',
    'Погружаемся в тему...',
    'Анализируем ключевые понятия...',
    'Выделяем главное...',
    'Определяем тематику...',
    'Ищем визуальные ассоциации...',
    'Изучаем контекст...',
    'Понимаем суть материала...',
    'Готовим концепцию...',
    'Формируем видение...',
  ],

  // Finalizing
  finalizing: [
    'Финальная обработка...',
    'Проверяем качество...',
    'Последние штрихи...',
    'Всё идёт по плану...',
    'Валидируем результат...',
    'Сохраняем в лучшем качестве...',
    'Подготавливаем к показу...',
    'Осталось совсем немного...',
    'Упаковываем результат...',
    'Готово к просмотру...',
  ],

  // Syncing (resuming tracking of active generation)
  syncing: [
    'Синхронизируем прогресс...',
    'Подключаемся к генерации...',
    'Получаем статус...',
    'Загружаем данные...',
    'Восстанавливаем соединение...',
  ],

  // Uploading
  uploading_assets: [
    'Загружаем файлы...',
    'Передаём данные...',
    'Оптимизируем размер...',
    'Проверяем целостность...',
    'Синхронизируем с сервером...',
    'Почти загружено...',
    'Финальная синхронизация...',
    'Завершаем загрузку...',
  ],

  // Generic processing (for covers, enrichments, etc.)
  processing: [
    'Обрабатываем...',
    'Анализируем данные...',
    'Выполняем расчёты...',
    'Применяем алгоритмы...',
    'ИИ думает...',
    'Работаем над задачей...',
    'Хорошие вещи требуют времени...',
    'Продолжаем обработку...',
    'Всё идёт хорошо...',
    'Скоро будет готово...',
  ],

  // Cover generation specific
  cover_generating: [
    'Создаём обложку курса...',
    'Подбираем композицию...',
    'Генерируем уникальный дизайн...',
    'Обложка — лицо курса...',
    'Добавляем визуальный шарм...',
    'Работаем над первым впечатлением...',
    'Создаём что-то особенное...',
    'Художественный ИИ в деле...',
    'Смешиваем стиль и содержание...',
    'Проверяем эстетику...',
    'Настраиваем баланс элементов...',
    'Добавляем изюминку...',
    'Полируем визуал...',
    'Последние штрихи мастера...',
    'Почти готово показать результат...',
  ],

  // Banner generation
  banner_generating: [
    'Создаём баннер...',
    'Подбираем пропорции...',
    'Генерируем привлекательный дизайн...',
    'Работаем над визуальным рядом...',
    'Баннер должен цеплять взгляд...',
    'Экспериментируем с композицией...',
    'Добавляем динамики...',
    'Проверяем читаемость...',
    'Настраиваем контраст...',
    'Финализируем дизайн...',
  ],

  // Quiz generation
  quiz_generating: [
    'Генерируем вопросы...',
    'Подбираем варианты ответов...',
    'Проверяем корректность...',
    'Добавляем интерактивности...',
    'Формируем тест...',
    'Балансируем сложность...',
    'Хороший тест — полдела...',
    'Проверяем логику вопросов...',
    'Финализируем квиз...',
  ],

  // Audio/narration generation
  audio_generating: [
    'Генерируем аудио...',
    'Синтезируем голос...',
    'Настраиваем интонацию...',
    'Обрабатываем звук...',
    'Добавляем естественности...',
    'Голос должен звучать приятно...',
    'Проверяем произношение...',
    'Оптимизируем качество звука...',
    'Финальная обработка аудио...',
  ],

  // Presentation generation
  presentation_generating: [
    'Создаём презентацию...',
    'Формируем слайды...',
    'Подбираем оформление...',
    'Структурируем контент...',
    'Добавляем визуальные элементы...',
    'Презентация — ключ к пониманию...',
    'Работаем над подачей материала...',
    'Проверяем последовательность...',
    'Финализируем слайды...',
  ],

  // Video script generation
  video_generating: [
    'Создаём видеосценарий...',
    'Продумываем структуру...',
    'Прописываем ключевые моменты...',
    'Добавляем визуальные подсказки...',
    'Хороший сценарий — половина успеха...',
    'Работаем над нарративом...',
    'Определяем визуальный ряд...',
    'Проверяем хронометраж...',
    'Оптимизируем подачу...',
    'Финализируем сценарий...',
  ],
}

/**
 * Default messages when status is not in the map
 * Extended list to avoid repetition
 */
const DEFAULT_MESSAGES = [
  'Обрабатываем...',
  'Пожалуйста, подождите...',
  'Работаем над вашим запросом...',
  'Выполняем задачу...',
  'ИИ старается для вас...',
  'Процесс идёт...',
  'Всё под контролем...',
  'Немного терпения...',
  'Движемся к результату...',
  'Скоро будет готово...',
  'Продолжаем работу...',
  'Осталось совсем чуть-чуть...',
]

interface UseRotatingStatusMessageOptions {
  /** Current generation status or step */
  status: string
  /** Rotation interval in milliseconds (default: 5000) */
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
  /** Whether we've reached the last message */
  isLastMessage: boolean
}

/**
 * Hook for rotating status messages during generation
 *
 * Provides a sense of progress by showing contextual messages sequentially.
 * Once all messages are shown, stays on the last one (no cycling).
 *
 * @example
 * ```tsx
 * const { message } = useRotatingStatusMessage({
 *   status: 'generating',
 *   interval: 5000,
 * });
 *
 * return <p>{message}</p>; // Shows sequential messages, stops at last
 * ```
 */
export function useRotatingStatusMessage({
  status,
  interval = 5000,
  enabled = true,
}: UseRotatingStatusMessageOptions): UseRotatingStatusMessageResult {
  const [messageIndex, setMessageIndex] = useState(0)
  const prevStatus = usePrevious(status)

  // Get messages for current status
  const messages = STATUS_MESSAGES[status] || DEFAULT_MESSAGES

  // Reset to first message when status changes
  useEffect(() => {
    if (prevStatus !== undefined && prevStatus !== status) {
      setMessageIndex(0)
    }
  }, [status, prevStatus])

  // Advance messages on interval (stop at last, no cycling)
  useEffect(() => {
    if (!enabled || messages.length <= 1) {
      return
    }

    const timer = setInterval(() => {
      setMessageIndex((prev) => {
        // Stop at last message instead of cycling
        if (prev >= messages.length - 1) {
          return prev
        }
        return prev + 1
      })
    }, interval)

    return () => clearInterval(timer)
  }, [enabled, interval, messages.length])

  // Ensure index is valid after status change (messages array might be shorter)
  const safeIndex = Math.min(messageIndex, messages.length - 1)
  const isLastMessage = safeIndex === messages.length - 1

  return {
    message: messages[safeIndex],
    messageIndex: safeIndex,
    totalMessages: messages.length,
    isLastMessage,
  }
}

export default useRotatingStatusMessage
