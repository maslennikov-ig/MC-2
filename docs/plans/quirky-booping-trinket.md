# План: Явный выбор режима чата вместо keyword classification

## Проблема

1. **Keyword matching не масштабируется** на многоязычность (ru, en, kk, uz...)
2. **Ложные срабатывания**: "Объясни заново" → думает regenerate
3. **Пользователь не контролирует** что произойдёт
4. **Нужно показывать стоимость** в токенах для каждого режима

## Решение

Заменить автоматическую классификацию на **явный выбор режима через UI**:

- Toggle buttons: `[Уточнить (~2K)] [Перегенерировать (~45K)]`
- Intent передаётся явно с frontend на backend
- Удалить `classifyIntent()` и `REGENERATE_KEYWORDS`

## UI Design

```
┌────────────────────────────────────────────────────────────┐
│ [🪄 Уточнить (~2K)]  [🔄 Перегенерировать (~45K)]         │  ← Toggle группа
├────────────────────────────────────────────────────────────┤
│ Quick actions: [+ Практику] [✂ Упростить]                 │  ← Без regenerate
├────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Добавь больше примеров...                            │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                [Отправить] │
└────────────────────────────────────────────────────────────┘
```

**Режимы:**
| Режим | Label | Описание | Токены |
|-------|-------|----------|--------|
| `refine` | Уточнить | Точечные изменения текущего контента | ~2-5K |
| `regenerate` | Перегенерировать | Создать контент заново | ~20-100K |

## Изменения

### 1. Schema (shared-types/src/chat-types.ts)

**Добавить `intent` в ChatRequest:**

```typescript
export const chatRequestSchema = z.object({
  courseId: z.string().uuid(),
  chatType: z.enum(['node', 'global']),
  userMessage: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
  nodeContext: z.object({...}).optional(),
  previousOutput: z.string().optional(),
  intent: z.enum(['refine', 'regenerate']), // NEW: явный intent
});
```

**Удалить REGENERATE_KEYWORDS:**

```typescript
// УДАЛИТЬ ПОЛНОСТЬЮ:
export const REGENERATE_KEYWORDS = [
  'перегенерируй', 'перегенерировать', 'сгенерируй заново',
  'заново', 'с нуля', 'весь курс', 'полностью', 'переделай',
  'regenerate', 'generate again', 'from scratch', ...
] as const;
```

### 2. Backend (chat.router.ts)

**Удалить classifyIntent():**

```typescript
// УДАЛИТЬ ФУНКЦИЮ:
function classifyIntent(message: string): ChatIntent {
  const lowerMessage = message.toLowerCase();
  const isRegenerate = REGENERATE_KEYWORDS.some((keyword: string) =>
    lowerMessage.includes(keyword)
  );
  return isRegenerate ? 'regenerate' : 'refine';
}
```

**Использовать intent из request:**

```typescript
// БЫЛО:
const intent = classifyIntent(userMessage);

// СТАЛО:
const intent = input.intent;
```

**Убрать импорт REGENERATE_KEYWORDS:**

```typescript
// БЫЛО:
import { chatRequestSchema, REGENERATE_KEYWORDS, type ChatResponse, type ChatIntent }

// СТАЛО:
import { chatRequestSchema, type ChatResponse, type ChatIntent }
```

### 3. Token Estimation Endpoint (NEW)

**Файл:** `packages/course-gen-platform/src/server/routers/generation/editing/token-estimate.router.ts`

```typescript
export const tokenEstimateRouter = {
  getChatTokenEstimates: instructorProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ input }) => {
      const course = await getCourse(input.courseId);

      return {
        refine: {
          tokens: 2500, // conversation context + response
          formatted: '~2.5K',
        },
        regenerate: {
          tokens: estimateRegenerateTokens(course),
          formatted: formatTokens(tokens),
        },
      };
    }),
};
```

### 4. Frontend (GlobalCourseChat.tsx)

**Добавить state и fetch:**

```typescript
const [selectedIntent, setSelectedIntent] = useState<'refine' | 'regenerate'>('refine');
const { data: tokenEstimates } = api.generation.getChatTokenEstimates.useQuery({ courseId });
```

**Добавить Toggle UI:**

```tsx
<ToggleGroup type="single" value={selectedIntent} onValueChange={setSelectedIntent}>
  <ToggleGroupItem value="refine">
    <Wand2 className="w-4 h-4 mr-1" />
    {t('modes.refine')} ({tokenEstimates?.refine.formatted})
  </ToggleGroupItem>
  <ToggleGroupItem value="regenerate">
    <RefreshCcw className="w-4 h-4 mr-1" />
    {t('modes.regenerate')} ({tokenEstimates?.regenerate.formatted})
  </ToggleGroupItem>
</ToggleGroup>
```

**Передавать intent в запросе:**

```typescript
body: JSON.stringify({
  json: { courseId, chatType: 'global', userMessage, conversationId, intent: selectedIntent },
});
```

**Убрать regenerate из QUICK_ACTIONS:**

```typescript
// БЫЛО:
const QUICK_ACTIONS = [
  { id: 'add-practice', ... },
  { id: 'simplify', ... },
  { id: 'regenerate', label: 'Перегенерировать', prompt: '...' }, // УДАЛИТЬ
];

// СТАЛО:
const QUICK_ACTIONS = [
  { id: 'add-practice', ... },
  { id: 'simplify', ... },
];
```

### 5. i18n

**en/generation.json:**

```json
{
  "chat": {
    "modes": {
      "refine": "Refine",
      "regenerate": "Regenerate"
    }
  }
}
```

**ru/generation.json:**

```json
{
  "chat": {
    "modes": {
      "refine": "Уточнить",
      "regenerate": "Перегенерировать"
    }
  }
}
```

## Файлы для изменения

| Файл                                                        | Действие                                                |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `shared-types/src/chat-types.ts`                            | Добавить `intent`, удалить `REGENERATE_KEYWORDS`        |
| `course-gen-platform/.../chat.router.ts`                    | Удалить `classifyIntent()`, использовать `input.intent` |
| `course-gen-platform/.../token-estimate.router.ts`          | **СОЗДАТЬ** - endpoint для оценки токенов               |
| `course-gen-platform/.../editing.router.ts`                 | Добавить `tokenEstimateRouter`                          |
| `web/components/generation/GlobalCourseChat.tsx`            | Toggle UI, token estimates, передача intent             |
| `web/components/generation-graph/panels/RefinementChat.tsx` | Аналогичные изменения                                   |
| `web/messages/en/generation.json`                           | i18n для modes                                          |
| `web/messages/ru/generation.json`                           | i18n для modes                                          |

## План выполнения

### Phase 1: Schema & Backend (breaking change)

1. Добавить `intent: z.enum(['refine', 'regenerate'])` в chatRequestSchema
2. Удалить `REGENERATE_KEYWORDS` из chat-types.ts
3. Удалить `classifyIntent()` из chat.router.ts
4. Использовать `input.intent` вместо classification
5. Создать token-estimate.router.ts

### Phase 2: Frontend

6. Добавить Toggle группу в GlobalCourseChat.tsx
7. Fetch token estimates
8. Передавать intent в запросе
9. Убрать 'regenerate' из QUICK_ACTIONS
10. Аналогичные изменения в RefinementChat.tsx

### Phase 3: i18n & Cleanup

11. Добавить i18n ключи
12. Проверить все hardcoded тексты
13. Type-check и тесты

## Верификация

1. **Type-check**: `pnpm type-check` проходит
2. **Manual test**:
   - Открыть чат → видны кнопки режимов с токенами
   - Выбрать "Уточнить" → отправить сообщение → intent=refine на backend
   - Выбрать "Перегенерировать" → отправить → intent=regenerate
3. **Search**: `grep -r "REGENERATE_KEYWORDS"` → 0 результатов
4. **Search**: `grep -r "classifyIntent"` → 0 результатов

## Beads

- **Закрыть mc2-jmwe** с reason: "Заменено на explicit UI selection"
- **Создать новую задачу** для реализации
