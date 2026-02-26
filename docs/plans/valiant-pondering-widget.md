# NLM Audio/Video: привязка сообщений к прогрессу + раздельные таймеры

## Context

NLM audio генерируется ~30 минут, NLM video ~60 минут. Сейчас:

1. **Таймер неверный**: оба типа используют 60 мин — для audio нужно 30
2. **Сообщения пролетают за 45 сек**: 9 сообщений x 5 сек = 45 сек, потом "Финальная обработка аудио..." висит оставшиеся 29 минут
3. **"Финальная обработка" появляется слишком рано**: должна быть на ~60-70% прогресса

**Решение**: привязать сообщения к прогрессу (а не к таймеру), разделить max duration по типам, расширить списки сообщений.

## Файлы для изменения

| Файл                                                                                | Что меняем                                                                                                          |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/web/lib/hooks/useEnrichmentGeneration.ts`                                 | Разделить `NLM_MAX_GENERATION_DURATION_MS` на 30/60 мин, экспортировать `getMaxDurationForType`                     |
| `packages/web/lib/hooks/useRotatingStatusMessage.ts`                                | Добавить `nlm_audio_generating` / `nlm_video_generating` (18-20 сообщений), экспортировать `getMessageByProgress()` |
| `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`     | Для NLM типов выбирать сообщение по прогрессу вместо таймера, обновить ключи в `getRotatingStatus()`                |
| `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`             | Заменить хардкод `60 * 60 * 1000` на `getMaxDurationForType()`                                                      |
| `packages/web/components/course/viewer/__tests__/EnrichmentGeneratingCard.test.tsx` | Обновить тесты                                                                                                      |

## Шаги реализации

### Шаг 1: Раздельные max duration

**Файл**: `useEnrichmentGeneration.ts`

```typescript
// БЫЛО
const NLM_MAX_GENERATION_DURATION_MS = 60 * 60 * 1000; // 60 minutes

// СТАЛО
const NLM_AUDIO_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const NLM_VIDEO_MAX_DURATION_MS = 60 * 60 * 1000; // 60 minutes
```

Обновить и экспортировать `getMaxDurationForType()`:

```typescript
export function getMaxDurationForType(type: OnDemandEnrichmentType): number | undefined {
  switch (type) {
    case 'nlm_audio':
      return NLM_AUDIO_MAX_DURATION_MS;
    case 'nlm_video':
      return NLM_VIDEO_MAX_DURATION_MS;
    default:
      return undefined;
  }
}
```

### Шаг 2: Убрать хардкод в EnrichmentsPanel.tsx

Заменить `60 * 60 * 1000` на импортированный `getMaxDurationForType(type)`.

### Шаг 3: Новые массивы сообщений + экспорт функции

**Файл**: `useRotatingStatusMessage.ts`

Добавить `nlm_audio_generating` (18 сообщений) и `nlm_video_generating` (18 сообщений). "Финальная обработка" — на позиции ~13/18 (≈72% прогресса, что при ease-out кривой соответствует ~65-70% визуального прогресса).

Экспортировать чистую функцию:

```typescript
export function getMessageByProgress(statusKey: string, progress: number): string {
  const messages = STATUS_MESSAGES[statusKey] || DEFAULT_MESSAGES;
  if (messages.length === 0) return '';
  if (progress <= 0) return messages[0];
  const cap = 95;
  const normalized = Math.min(progress, cap) / cap;
  const index = Math.floor(normalized * (messages.length - 1));
  return messages[Math.min(index, messages.length - 1)];
}
```

### Шаг 4: Progress-based сообщения в EnrichmentGeneratingCard

**Файл**: `EnrichmentGeneratingCard.tsx`

Обновить `getRotatingStatus()`: `nlm_audio` -> `nlm_audio_generating`, `nlm_video` -> `nlm_video_generating`.

Для NLM типов использовать progress-based выбор:

```typescript
const { message: rotatingMessage } = useRotatingStatusMessage({
  status: getRotatingStatus(),
  interval: 5000,
  enabled: !shouldUseLongRunningProgressBar, // выключить ротацию для NLM
});

const statusMessage =
  shouldUseLongRunningProgressBar && longRunningProgress !== null
    ? getMessageByProgress(getRotatingStatus(), longRunningProgress)
    : rotatingMessage;
```

Ключевой момент: `useRotatingStatusMessage` вызывается всегда (правила хуков), но `enabled: false` останавливает внутренний таймер. Для NLM сообщение берется из `getMessageByProgress`.

### Шаг 5: Обновить тесты

- NLM status keys: `audio_generating` -> `nlm_audio_generating`, `video_generating` -> `nlm_video_generating`
- nlm_audio countdown: 30 мин вместо 60
- Добавить тест: для NLM типов `enabled: false` при active progress bar

## Почему progress-based сообщения работают правильно

Прогресс использует ease-out кривую (power 2.2): быстро в начале, медленно в конце.

Для nlm_audio (30 мин):

- 0-5 мин: прогресс 0-30% → 5 сообщений сменяются (1 мин каждое)
- 5-15 мин: прогресс 30-74% → 8 сообщений (1.5 мин каждое)
- 15-30 мин: прогресс 74-95% → 5 сообщений (3 мин каждое)

"Финальная обработка аудио" появляется на ~68-74% прогресса → примерно на 13-15 минуте из 30. Не в первую минуту, и не в последнюю.

## Проверка

1. `pnpm type-check && pnpm build` — без ошибок
2. Запустить тесты EnrichmentGeneratingCard
3. Визуально проверить на dev: nlm_audio показывает 30 мин таймер, nlm_video — 60 мин
4. Убедиться что сообщения меняются плавно по мере роста прогресса
5. "Финальная обработка" появляется на ~60-70% прогресса
