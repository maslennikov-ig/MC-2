# План: P3 Code Review Fixes + COURSE_REGENERATION Job

## Резюме

**4 задачи:**

1. **P3.2** - Layout shift в token estimates (5 мин)
2. **P3.3** - Унификация i18n на next-intl (2-3 дня, 32 компонента)
3. **P3.4** - useCallback для handleQuickAction (5 мин)
4. **mc2-g0iz** - COURSE_REGENERATION через restartStage (2-4 часа)

## Context7 Validation

| Задача           | Библиотека | Benchmark | Подтверждено                            |
| ---------------- | ---------- | --------- | --------------------------------------- |
| P3.3 i18n        | next-intl  | 92.3      | ✅ useTranslations('namespace') pattern |
| P3.4 useCallback | React      | 89.9      | ✅ Dependency array required            |
| mc2-g0iz         | BullMQ     | 87.1      | ✅ queue.add() + job.remove() patterns  |

---

## Task 1: P3.2 Layout Shift Fix

**Проблема:** Кнопки меняют ширину при загрузке token estimates.

**Файл:** `packages/web/components/generation/GlobalCourseChat.tsx`

**Решение:**

```tsx
// Строки 351-357 и 365-371
<span className="inline-block min-w-[3ch] text-center">
  {isLoadingEstimates ? (
    <Loader2 className="inline h-3 w-3 animate-spin" />
  ) : (
    (tokenEstimates?.refine?.formatted ?? '~2K')
  )}
</span>
```

**Время:** 5 минут

---

## Task 2: P3.3 Унификация i18n (GRAPH_TRANSLATIONS → next-intl)

### Проблема

Две параллельные системы i18n:

- `GRAPH_TRANSLATIONS` (1375 строк в translations.ts) - 32 компонента
- `next-intl` (JSON файлы) - 50+ компонентов

100+ дублирующихся ключей: `stages`, `status`, `actions`, `drawer`, `errors`, `metrics`.

### Решение: Полная миграция на next-intl

#### Фаза 2.1: Расширение JSON файлов (1 день)

**Файлы:**

- `packages/web/messages/en/generation.json`
- `packages/web/messages/ru/generation.json`

**Действия:**

1. Перенести ВСЕ ключи из `translations.ts` в JSON:
   - `stages.*` (6 ключей)
   - `status.*` (8 ключей)
   - `actions.*` (30+ ключей)
   - `drawer.*` (5 ключей)
   - `errors.*` (5 ключей)
   - `metrics.*` (4 ключей)
   - `longRunning.*` (3 ключей)
   - `completionMessages.*` (6 ключей)
   - `analysisResult.*` (30+ ключей)
   - `courseStructure.*` (40+ ключей)
   - `refinementChat.*` (20+ ключей)
   - `stage1-7.*` (200+ ключей)
   - `enrichments.*` (20+ ключей)
   - `endNode.*`, `selectionToolbar.*`, `common.*`

2. Структура JSON:

```json
{
  "stages": {
    "stage_1": "Course Initialization",
    "stage_2": "Document Processing"
  },
  "status": {
    "pending": "Pending",
    "active": "In Progress"
  },
  "analysisResult": {
    "classification": "Course Classification",
    "topicAnalysis": "Topic Analysis"
  }
}
```

#### Фаза 2.2: Создание типизированного хука (30 мин)

**Новый файл:** `packages/web/lib/generation-graph/useGenerationTranslations.ts`

```typescript
import { useTranslations } from 'next-intl';

export type GenerationNamespace =
  | 'stages'
  | 'status'
  | 'actions'
  | 'drawer'
  | 'errors'
  | 'metrics'
  | 'analysisResult'
  | 'courseStructure'
  | 'refinementChat'
  | 'stage1'
  | 'stage2'
  | 'stage3'
  | 'stage4'
  | 'stage5'
  | 'stage6'
  | 'stage7'
  | 'enrichments'
  | 'common';

export function useGenerationTranslations(namespace: GenerationNamespace) {
  return useTranslations(`generation.${namespace}`);
}

// Для backwards compatibility во время миграции
export function useGraphTranslations() {
  return useTranslations('generation');
}
```

#### Фаза 2.3: Миграция компонентов (1.5 дня)

**32 файла для изменения:**

| Директория         | Файлы                                                                      | Изменения                                                |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `panels/`          | RefinementChat, QuickActions, InputTab, OutputTab, ProcessTab, ActivityTab | Заменить `GRAPH_TRANSLATIONS.key?.[locale]` → `t('key')` |
| `panels/output/`   | EditableField, SaveStatusIndicator, ImpactAnalysisModal, SemanticDiff      | То же                                                    |
| `panels/stage1-7/` | Все Stage*InputTab, Stage*OutputTab, Stage\*ProcessTab                     | То же                                                    |
| `nodes/`           | StageNode, EnrichmentNode, EndNode                                         | То же                                                    |
| `controls/`        | GraphControls, SelectionToolbar                                            | То же                                                    |

**Паттерн замены (Context7 validated):**

```typescript
// БЫЛО:
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
const t = GRAPH_TRANSLATIONS.stage4;
<span>{t?.topic?.[locale] ?? 'Topic'}</span>

// СТАЛО (next-intl pattern):
import { useTranslations } from 'next-intl';
const t = useTranslations('generation.stage4');
<span>{t('topic')}</span>

// Interpolation:
<span>{t('greeting', { name: user.name })}</span>

// Pluralization (ICU syntax):
<span>{t('items', { count: items.length })}</span>
// JSON: "items": "{count, plural, =0 {No items} =1 {One item} other {# items}}"

// Rich text with components:
{t.rich('description', {
  bold: (chunks) => <strong>{chunks}</strong>,
  code: (chunks) => <code>{chunks}</code>
})}
```

#### Фаза 2.4: Удаление translations.ts (30 мин)

1. Удалить `packages/web/lib/generation-graph/translations.ts`
2. Удалить `packages/web/lib/generation-graph/useTranslation.ts`
3. Удалить типы из `packages/shared-types/src/generation-graph.ts` (GraphTranslations)
4. Обновить экспорты

#### Верификация

```bash
pnpm type-check
pnpm build
# Проверить UI на всех stage panels
```

**Время:** 2-3 дня

---

## Task 3: P3.4 useCallback для handleQuickAction

**Проблема:** `handleQuickAction` создаётся заново при каждом рендере.

**Файлы:**

- `packages/web/components/generation-graph/panels/RefinementChat.tsx`
- `packages/web/components/generation/GlobalCourseChat.tsx`

**Context7 Best Practice (React docs):**

> `useCallback` returns a memoized callback function. The dependency array is **required** - without it, a new function is returned on every render.

**Решение:**

```typescript
// RefinementChat.tsx (строка ~129)
// ✅ Dependencies: [onRefine] - only prop that can change
const handleQuickAction = useCallback(
  (actionText: string, intent: ChatIntent) => {
    setSelectedIntent(intent);
    setMessage(actionText);
    // Send immediately
    setPendingMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: actionText,
        timestamp: new Date().toISOString(),
        pending: true,
      },
    ]);
    onRefine(actionText, intent);
  },
  [onRefine]
);

// GlobalCourseChat.tsx (строка ~257)
// ✅ Dependencies: [sendMessage] - already memoized with useCallback
const handleQuickAction = useCallback(
  (actionPrompt: string, intent: 'refine' | 'regenerate' = 'refine') => {
    setSelectedIntent(intent);
    void sendMessage(actionPrompt, intent);
  },
  [sendMessage]
);
```

**Почему эти dependencies:**

- `setSelectedIntent`, `setMessage`, `setPendingMessages` - стабильные (useState setters)
- `onRefine` / `sendMessage` - могут меняться, включаем в deps

**Время:** 5 минут

---

## Task 4: mc2-g0iz COURSE_REGENERATION Job

### Анализ

**Существующая инфраструктура:**

- `restartStage` endpoint уже работает
- Chat endpoint возвращает `intent: 'regenerate'`
- Progress tracking через Supabase Realtime готов
- НЕ нужен новый JobType!

**Context7 BullMQ Patterns (validated):**

```typescript
// Добавление job с custom ID (предотвращает дубликаты)
await queue.add('job-name', data, { jobId: `regen-${courseId}` });

// Удаление job
await job.remove(); // Locked jobs throw error

// Уже реализовано в проекте:
await removeJobsByCourseId(courseId); // Очистка перед restart
```

### Решение: Минимальный путь через restartStage

#### Шаг 4.1: Обновить Frontend для вызова restartStage

**Файл:** `packages/web/components/generation/GlobalCourseChat.tsx`

```typescript
// После получения ответа с intent='regenerate'
if (result.intent === 'regenerate' && onRegenerationRequest) {
  toast.info(t('regenerationTriggered'), {
    description: t('preparingRegeneration'),
  });
  onRegenerationRequest(); // Вызывает restartStage
}
```

**Файл:** Родительский компонент (где используется GlobalCourseChat)

```typescript
const handleRegenerationRequest = async () => {
  try {
    await trpc.generation.lifecycle.restartStage.mutate({
      courseId,
      stageNumber: 4, // Restart from Stage 4
    });
    toast.success('Regeneration started');
  } catch (error) {
    toast.error('Failed to start regeneration');
  }
};

<GlobalCourseChat
  courseId={courseId}
  onRegenerationRequest={handleRegenerationRequest}
/>
```

#### Шаг 4.2: Добавить конфигурацию стартового stage

**Опционально:** Позволить пользователю выбирать с какого stage начать regeneration.

```typescript
// В chat response добавить рекомендуемый stage
interface ChatResponse {
  // ...existing
  suggestedRestartStage?: 4 | 5 | 6; // AI может предложить
}

// Frontend использует suggestedRestartStage или default 4
const stageNumber = result.suggestedRestartStage ?? 4;
```

#### Шаг 4.3: Улучшить UX с confirmation dialog

**Файл:** `packages/web/components/generation/GlobalCourseChat.tsx`

```typescript
const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

// При получении intent='regenerate'
if (result.intent === 'regenerate') {
  setShowRegenerateConfirm(true);
}

// Dialog
<AlertDialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t('regenerateConfirmTitle')}</AlertDialogTitle>
      <AlertDialogDescription>
        {t('regenerateConfirmDescription')}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
      <AlertDialogAction onClick={handleRegenerationRequest}>
        {t('startRegeneration')}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### Шаг 4.4: Добавить i18n ключи

**Файл:** `packages/web/messages/{ru,en}/generation.json`

```json
{
  "globalChat": {
    "regenerateConfirmTitle": "Start Course Regeneration?",
    "regenerateConfirmDescription": "This will regenerate stages 4-6. Existing content will be replaced.",
    "startRegeneration": "Start Regeneration",
    "regenerationStarted": "Regeneration started",
    "regenerationFailed": "Failed to start regeneration"
  }
}
```

### Файлы для изменения

| Файл                          | Действие                                          |
| ----------------------------- | ------------------------------------------------- |
| `GlobalCourseChat.tsx`        | Добавить confirmation dialog и вызов restartStage |
| `messages/en/generation.json` | Добавить i18n ключи                               |
| `messages/ru/generation.json` | Добавить i18n ключи                               |
| Родительский компонент        | Передать `onRegenerationRequest` callback         |

### Верификация

1. Открыть GlobalCourseChat
2. Выбрать intent "Regenerate"
3. Отправить сообщение
4. Получить ответ с `intent='regenerate'`
5. Увидеть confirmation dialog
6. Подтвердить → restartStage вызывается
7. Progress отображается через Realtime

**Время:** 2-4 часа

---

## Порядок выполнения

| #   | Задача                | Приоритет | Время   | Зависимости |
| --- | --------------------- | --------- | ------- | ----------- |
| 1   | P3.2 Layout shift     | P3        | 5 мин   | -           |
| 2   | P3.4 useCallback      | P3        | 5 мин   | -           |
| 3   | mc2-g0iz Regeneration | P3        | 2-4 ч   | -           |
| 4   | P3.3 i18n унификация  | P3        | 2-3 дня | После 1-3   |

**Рекомендация:** Задачи 1-3 выполнить сегодня, задачу 4 (i18n) — отдельным спринтом.

---

## Верификация всех задач

```bash
# После каждой задачи
pnpm type-check
pnpm build

# После P3.3 (i18n)
# Проверить все stage panels на корректность переводов
# Проверить EN/RU локали

# После mc2-g0iz
# Протестировать полный flow: chat → regenerate intent → confirmation → restartStage → progress tracking
```
