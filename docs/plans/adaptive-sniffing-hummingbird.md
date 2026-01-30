# План: Исправление трёх багов в генерации Stage 4

## Проблемы

### 1. Clarifying Questions не появляются (CRITICAL)

**Корневая причина:** При создании курса в `settings` НЕ устанавливается `clarifying_questions_enabled: true`.

Код в `packages/web/app/actions/courses.ts:569-571`:

```typescript
settings: {
  lesson_duration_minutes: validatedData.lesson_duration_minutes || 15,
  // clarifying_questions_enabled НЕ УСТАНОВЛЕН!
}
```

А в `getClarifyingConfig` (`phase-0.5-clarifying.ts:626`):

```typescript
const enabled = (settings.clarifying_questions_enabled as boolean) || false;
```

**Результат:** Clarifying всегда отключен (`false` по умолчанию).

### 2. Результаты Stage 4 не обновляются в realtime (MEDIUM)

**Корневая причина:** `StageResultsPreview` загружает данные один раз при монтировании и не реагирует на изменение статуса стейджа.

Код в `packages/web/components/generation/StageResultsPreview.tsx:30-57`:

```typescript
useEffect(() => {
  fetchResults();
}, [courseId, stage]); // Только при смене courseId или stage
```

### 3. SSR ошибка isomorphic-dompurify (LOW)

**Корневая причина:** `ClarifyingPanel` импортирует `isomorphic-dompurify` напрямую, а jsdom пытается читать CSS на сервере.

Ошибка:

```
ENOENT: no such file or directory, open '.../.next/browser/default-stylesheet.css'
```

---

## Решение

### Fix 1: Включить clarifying_questions_enabled при создании курса

**Файл:** `packages/web/app/actions/courses.ts`

**Изменение:** В функции `updateDraftAndStartGeneration` добавить `clarifying_questions_enabled` в settings.

Нода должна появляться в **обоих** режимах:

- **Semi-automatic**: ждёт ответов пользователя
- **Automatic**: AI отвечает сам через `autoAnswerAllQuestions()`, но нода видна для просмотра

```typescript
settings: {
  lesson_duration_minutes: validatedData.lesson_duration_minutes || 15,
  // Enable clarifying questions for BOTH modes
  // - semi_automatic: waits for user answers
  // - automatic: AI answers automatically, but node is still visible for review
  clarifying_questions_enabled: true,
} as unknown as Json,
```

### Fix 2: Добавить auto-refetch в StageResultsPreview

**Файл:** `packages/web/components/generation/StageResultsPreview.tsx`

**Изменение:** Добавить зависимость на статус стейджа из useGenerationStore или useGenerationRealtime:

```typescript
// Импортировать хук
import { useGenerationStore } from '@/stores/useGenerationStore';

// Внутри компонента
const stageStatus = useGenerationStore(
  state => state.stages.find(s => s.stageNumber === stage)?.status
);

// Добавить stageStatus в зависимости useEffect
useEffect(() => {
  // ... fetchResults logic
}, [courseId, stage, stageStatus]); // Перезагружать при смене статуса
```

### Fix 3: Обернуть ClarifyingPanel в dynamic() с ssr: false

**Файл:** `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

**Изменение:** Заменить прямой импорт на динамический:

```typescript
// Было:
import { ClarifyingPanel } from './clarifying/ClarifyingPanel'

// Стало:
import dynamic from 'next/dynamic'

const ClarifyingPanel = dynamic(
  () => import('./clarifying/ClarifyingPanel').then(mod => mod.ClarifyingPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600" />
      </div>
    )
  }
)
```

---

## Файлы для изменения

| Файл                                                                    | Изменение                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| `packages/web/app/actions/courses.ts`                                   | Добавить `clarifying_questions_enabled` в settings |
| `packages/web/components/generation/StageResultsPreview.tsx`            | Добавить auto-refetch при смене статуса            |
| `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx` | Dynamic import ClarifyingPanel с `ssr: false`      |

---

## Порядок выполнения

1. **Fix 1** - Clarifying questions (критично, без этого функция не работает)
2. **Fix 3** - SSR ошибка (блокирует отображение ClarifyingPanel)
3. **Fix 2** - Realtime update результатов (UX улучшение)

---

## Верификация

### Тест 1: Clarifying Questions (Semi-automatic)

1. Создать новый курс в **semi-automatic** режиме
2. Дождаться Stage 4
3. Проверить: появилась ли нода `stage_4_clarifying` в графе
4. Проверить: статус `generation_status = 'stage_4_clarifying'` в БД
5. Проверить: открывается ли ClarifyingPanel с вопросами при клике на Stage 4

### Тест 1b: Clarifying Questions (Automatic)

1. Создать новый курс в **automatic** режиме
2. Дождаться Stage 4
3. Проверить: появилась ли нода `stage_4_clarifying` в графе
4. Проверить: вопросы автоматически отвечены (статус `answered`)
5. Проверить: можно просмотреть вопросы и ответы AI при клике на ноду

### Тест 2: Realtime Results

1. Дождаться завершения Stage 4
2. Проверить: результаты появляются без рефреша страницы

### Тест 3: SSR Error

1. Открыть страницу генерации
2. Проверить в консоли: нет ошибки `ENOENT: no such file or directory`

### Команды проверки

```bash
# Type-check
pnpm type-check

# Build
pnpm build

# Dev server
pnpm dev
```
