# Fix: Генерация обогащений пропадает при переключении уроков

## Context

При переключении между уроками карточка генерации NLM audio/video исчезает и появляется кнопка "Сгенерировать", хотя генерация продолжается на бэкенде. Баг воспроизводится при: Урок A (запуск генерации) -> Урок B -> обратно на Урок A. Предыдущие попытки исправления (коммиты `8b6781ad`, `d73bea67`, `0c960ac6`) не решили проблему полностью.

## Root Cause

**Причина 1 (главная)**: После `startGeneration()` API создает строку в БД, но `localEnrichments` кэш НЕ обновляется. Когда пользователь возвращается, кэшированные данные не содержат новый enrichment -> нет syncing card, нет resume.

**Причина 2**: 100ms stale guard (`Date.now() - lessonSwitchTimeRef < 100`) гонится с 150ms задержкой refetch. Guard срабатывает и поглощается при первом запуске эффекта. Когда hook reset вызывает повторный запуск — guard уже использован, но данные все еще старые.

**Причина 3**: `|| []` в LessonView (строка 334) создает НОВЫЙ пустой массив при каждом рендере, ломая любую проверку по reference identity.

## Решение (4 части)

### Часть 0: Принять `undefined` enrichments в EnrichmentsPanel

**Файлы**: `EnrichmentsPanel.tsx`, `LessonView.tsx`

- Изменить тип `enrichments: EnrichmentRow[]` -> `enrichments?: EnrichmentRow[]`
- Добавить `const safeEnrichments = enrichments ?? []` для рендеринга
- В `LessonView.tsx` строка 334: убрать `|| []` -> передавать `enrichments` напрямую
- Это позволяет `undefined` быть стабильной ссылкой для stale guard

### Часть 1: Refresh кэша после старта генерации

**Файл**: `EnrichmentsPanel.tsx`, строка 379

```typescript
// БЫЛО
void startGeneration(type, settings)

// СТАЛО
void startGeneration(type, settings).then((enrichmentId) => {
  if (enrichmentId) onRefreshEnrichments?.()
})
```

### Часть 2: Замена timing-based stale guard на reference-based

**Файл**: `EnrichmentsPanel.tsx`

Удалить: `isInitialLoadRef`, `lessonSwitchTimeRef`, проверку `< 100ms`

Заменить на:

```typescript
const staleEnrichmentsRef = useRef<EnrichmentRow[] | undefined | null>(null)
const enrichmentsLiveRef = useRef(enrichments)
enrichmentsLiveRef.current = enrichments

// На смену урока: snapshot текущих enrichments как "stale"
useEffect(() => {
  if (isFirstMountRef.current) {
    isFirstMountRef.current = false
    return
  }
  resumedTypesRef.current.clear()
  staleEnrichmentsRef.current = enrichmentsLiveRef.current
}, [lessonId])

// Resume: пропускать пока enrichments reference не изменится (свежие данные)
useEffect(() => {
  if (staleEnrichmentsRef.current !== null) {
    if (enrichments === staleEnrichmentsRef.current) return
    staleEnrichmentsRef.current = null
  }
  // ... нормальная логика resume (без изменений) ...
}, [enrichments, resumeGeneration, t])
```

**Почему работает**: При смене урока `enrichments` reference = кэш или undefined. Snapshot фиксирует это. Hook reset меняет `resumeGeneration`, но НЕ `enrichments` -> skip. Refetch завершается -> новый array reference -> flag сбрасывается -> resume.

### Часть 3: Убрать 150ms задержку refetch

**Файл**: `course-viewer-enhanced.tsx`, строки 106-116

```typescript
// БЫЛО
const timeoutId = setTimeout(() => void refreshEnrichments(), 150)

// СТАЛО
void refreshEnrichments()
```

## Edge Cases

| Сценарий                       | Результат                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Первый mount (SSR)             | `isFirstMountRef` -> skip lessonId эффект -> staleRef = null -> resume сразу |
| Переключение на урок с кэшем   | snapshot = кэш; skip до refetch; resume на свежих данных                     |
| Переключение на урок без кэша  | snapshot = undefined; skip до refetch; resume на свежих данных               |
| Возврат после старта генерации | Часть 1 обновила кэш -> syncing card показан сразу                           |
| Быстрое A->B->C переключение   | Каждый switch обнуляет resumedTypesRef; resume только для последнего урока   |
| Refetch не удался              | Flag не сбрасывается -> нет ложного resume                                   |

## Файлы для изменения

1. `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx` — Части 0, 1, 2
2. `packages/web/components/course/viewer/components/LessonView.tsx` — Часть 0 (убрать `|| []`)
3. `packages/web/components/course/course-viewer-enhanced.tsx` — Часть 3
4. `packages/web/components/course/viewer/__tests__/EnrichmentsPanel.test.tsx` — обновить тесты

## Проверка

1. `pnpm --filter web type-check` — без ошибок
2. `pnpm --filter web build` — успешно
3. Запустить тесты EnrichmentsPanel
4. Ручное тестирование: запустить NLM audio -> переключиться -> вернуться -> syncing card виден
