# План: UX улучшение прогресс-бара генерации enrichments

## Проблема

Прогресс-бар застревает на 50% (`draft_ready`) для two-stage enrichments (cover, banner). Между polling-интервалами (2 сек) прогресс не меняется визуально, создавая впечатление зависания.

## Решение: "Honest Fake Progress + Activity Indicators"

Комбинированный подход:

1. **Asymptotic crawl** - прогресс медленно ползёт к milestone, но НИКОГДА не превышает следующий порог
2. **Shimmer overlay** - визуальный эффект активности на прогресс-баре
3. **Rotating status messages** - текстовые подсказки меняются каждые 4 секунды

---

## Этапы реализации

### Этап 1: Модификация `useSmoothProgress.ts`

**Файл:** `packages/web/lib/hooks/useSmoothProgress.ts`

**Изменения:**

- Добавить параметры `enableAsymptoticCrawl` и `nextMilestone`
- Реализовать детекцию "stalled" состояния (если targetProgress не менялся 3+ сек)
- При stalled: медленно увеличивать прогресс на ~0.1% каждые 500ms
- Ограничение: никогда не превышать `nextMilestone - 5%`
- Возвращать `isStalled` флаг для UI индикации

### Этап 2: Добавить shimmer эффект в `smooth-progress.tsx`

**Файл:** `packages/web/components/ui/smooth-progress.tsx`

**Изменения:**

- Добавить prop `showShimmer?: boolean`
- При `showShimmer=true` отрисовать overlay с `animate-shimmer`
- Shimmer покрывает только заполненную часть прогресс-бара

### Этап 3: Создать хук `useRotatingStatusMessage.ts`

**Новый файл:** `packages/web/lib/hooks/useRotatingStatusMessage.ts`

**Функционал:**

- Принимает текущий `currentStep` (draft_generating, draft_ready, generating)
- Возвращает текущее сообщение из массива
- Меняет сообщение каждые 4 секунды
- Сбрасывается при смене шага

### Этап 4: Обновить `EnrichmentGeneratingCard.tsx`

**Файл:** `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx`

**Изменения:**

- Вычислять `nextMilestone` из `currentStep`
- Использовать `useSmoothProgress` с asymptotic crawl
- Использовать `useRotatingStatusMessage` для текста
- Передать `showShimmer={isStalled}` в прогресс-бар
- Добавить пульсацию иконки при stalled
- Добавить индикатор "долгой генерации" (опционально, если > 30 сек)

### Этап 5: Добавить i18n сообщения

**Файлы:**

- `packages/web/messages/ru/enrichments.json`
- `packages/web/messages/en/enrichments.json`

**Добавить секцию `generationStatus`:**

```json
{
  "generationStatus": {
    "analyzing": "Анализируем контент урока...",
    "styling": "Подбираем визуальный стиль...",
    "variants": "Генерируем варианты...",
    "waiting": "Ожидание выбора варианта...",
    "variantsReady": "Варианты готовы к просмотру...",
    "creating": "Создаём изображение...",
    "processing": "Обрабатываем детали...",
    "almostDone": "Почти готово...",
    "longRunning": "Генерация занимает больше времени, чем обычно..."
  }
}
```

---

## Визуальный результат

**До:**

```
[████████████████░░░░░░░░░░░░░░] 50%
Генерация...
```

(Застывший прогресс, никакого движения)

**После:**

```
[████████████████▓▓░░░░░░░░░░░░] 53%  ← медленно ползёт
           ~~~~shimmer~~~~
Подбираем визуальный стиль... ← меняется каждые 4 сек
```

---

## Критические файлы

| #   | Файл                                                                            | Действие       |
| --- | ------------------------------------------------------------------------------- | -------------- |
| 1   | `packages/web/lib/hooks/useSmoothProgress.ts`                                   | Модифицировать |
| 2   | `packages/web/components/ui/smooth-progress.tsx`                                | Модифицировать |
| 3   | `packages/web/lib/hooks/useRotatingStatusMessage.ts`                            | Создать        |
| 4   | `packages/web/components/course/viewer/components/EnrichmentGeneratingCard.tsx` | Модифицировать |
| 5   | `packages/web/messages/ru/enrichments.json`                                     | Модифицировать |
| 6   | `packages/web/messages/en/enrichments.json`                                     | Модифицировать |

---

## Принципы

1. **Честность** - прогресс НИКОГДА не показывает больше `nextMilestone - 5%`
2. **Активность** - shimmer и rotating messages показывают что процесс идёт
3. **Информативность** - сообщения объясняют текущий этап
4. **Минимальные изменения** - используем существующие анимации из tailwind.config
