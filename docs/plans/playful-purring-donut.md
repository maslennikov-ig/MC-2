# План следующего спринта

**Дата**: 2026-01-22
**Статус**: Планирование

---

## Анализ открытых задач Beads

### Задачи которые можно закрыть

| Issue        | Описание          | Причина закрытия              |
| ------------ | ----------------- | ----------------------------- |
| **mc2-pkld** | SemanticDiff в UI | ⚠️ Частично реализовано в #16 |

**mc2-pkld детали:**

- ✅ `course_edits` таблица для хранения diff
- ✅ `EditHistoryPanel` для просмотра истории
- ✅ `SemanticDiffViewer` уже используется в `EditableField.tsx:418`
- ✅ Inline regeneration показывает diff

**Что осталось (новая задача):**

- ❌ Real-time уведомление о завершении async BullMQ job
- ❌ Показ diff сразу после lesson-level regeneration

**Рекомендация:** Закрыть mc2-pkld, создать mc2-async-diff-notification для оставшегося.

---

### Открытые задачи по приоритету

#### P2 (Баги - критичные)

| Issue        | Описание                       | Частота    | Сложность |
| ------------ | ------------------------------ | ---------- | --------- |
| **mc2-48o0** | Banner generation hangs at 50% | UX blocker | Medium    |
| **mc2-b6uc** | Helm/Go template whitelist     | 22/day     | Low       |
| **mc2-ndhm** | Patcher retry logic            | 62/day     | Medium    |
| **mc2-xod**  | Status transition validation   | -          | Low       |

#### P3 (Фичи и улучшения)

| Issue        | Описание                              | ROI          | Сложность |
| ------------ | ------------------------------------- | ------------ | --------- |
| **mc2-z6er** | LanguageTool integration (7 подзадач) | $89/month    | High      |
| **mc2-dopy** | Extract duplicate colors              | Code quality | Low       |
| **mc2-4nf3** | Enhance orchestrateValidation         | Code quality | Low       |
| **mc2-vs0r** | UNAUTHORIZED errors on polling        | UX           | Medium    |
| **mc2-xxj6** | Cover handler 500 char limit          | UX           | Low       |

---

## Рекомендации для спринта

### Вариант A: Фокус на багах (4-6 часов)

**Приоритет:** Быстрый импакт на production

| #   | Задача                      | Время   | Импакт               |
| --- | --------------------------- | ------- | -------------------- |
| 1   | mc2-b6uc (Helm whitelist)   | 30 min  | High (22 errors/day) |
| 2   | mc2-ndhm (Patcher retry)    | 2 hours | High (62 errors/day) |
| 3   | mc2-48o0 (Banner hangs)     | 2 hours | High (UX blocker)    |
| 4   | mc2-xod (Status validation) | 1 hour  | Medium               |

**Результат:** Устраняет ~84 ошибки/день + critical UX bug

---

### Вариант B: Фокус на LanguageTool (8-12 часов)

**Приоритет:** Долгосрочный ROI + качество

| #   | Подзадача                            | Время   |
| --- | ------------------------------------ | ------- |
| 1   | mc2-e35y: Docker service             | 1 hour  |
| 2   | mc2-rqev: TypeScript client          | 2 hours |
| 3   | mc2-03z1: Tests                      | 1 hour  |
| 4   | mc2-5coh: Deploy                     | 1 hour  |
| 5   | mc2-41t1: Phase 0 module             | 2 hours |
| 6   | mc2-jk01: Integration                | 2 hours |
| 7   | mc2-ebjd: Remove grammar from prompt | 1 hour  |

**Результат:** $89/month savings, 912 grammar rules vs current 9, ~43% token reduction

---

### Вариант C: Микс (рекомендуемый)

**День 1 - Баги (4-5 часов):**

1. ✅ mc2-b6uc - Helm whitelist (30 min)
2. ✅ mc2-ndhm - Patcher retry (2 hours)
3. ✅ mc2-48o0 - Banner hangs (2 hours)

**День 2 - LanguageTool start (4-5 часов):**

1. ✅ mc2-e35y - Docker service (1 hour)
2. ✅ mc2-rqev - TypeScript client (2 hours)
3. ✅ mc2-03z1 - Tests (1 hour)

**Результат:** Устраняет critical bugs + начинает LanguageTool

---

## Детали задач

### mc2-b6uc: Helm/Go Template Whitelist

**Проблема:** `prompt-service.ts:161-168` ловит Helm templates как unresolved.

**Решение:**

```typescript
// Перенести из placeholder-validator.ts в shared
export const TEMPLATE_WHITELIST_PATTERNS = [
  /\{\{\s*\.[\w.]+\s*\}\}/, // Helm: {{ .Values.x }}
  /\{\{[a-z]+\.[\w.-]+\}\}/, // Go: {{args.service-name}}
];

// Фильтровать в prompt-service.ts
const realUnresolved = unresolvedMatches.filter(
  m => !TEMPLATE_WHITELIST_PATTERNS.some(p => p.test(m))
);
```

**Файлы:**

- `packages/course-gen-platform/src/shared/prompts/prompt-service.ts`
- `packages/course-gen-platform/src/shared/validation/template-whitelist.ts` (new)

---

### mc2-ndhm: Patcher Retry Logic

**Проблема:** Edit count не инкрементируется при rejection → infinite loop.

**Решение:**

```typescript
// В patcher-node.ts
if (isHallucinationRejection) {
  // 1. Increment edit count
  state.editCounts[sectionId] = (state.editCounts[sectionId] || 0) + 1;

  // 2. Check max retries
  if (state.editCounts[sectionId] >= MAX_EDIT_RETRIES) {
    state.lockedSections.add(sectionId);
    return { ...state, status: 'section_locked' };
  }

  // 3. Try different model on retry
  const nextModel = getEscalationModel(state.editCounts[sectionId]);
  return { ...state, currentModel: nextModel };
}
```

**Файлы:**

- `packages/course-gen-platform/src/stages/stage6-content/nodes/patcher-node.ts`

---

### mc2-48o0: Banner Generation Hangs

**Проблема:** Job завершается `draft_ready` но Phase 2 не стартует.

**Решение:** Проверить автоматический trigger в cover-handler.ts

**Файлы:**

- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/cover-handler.ts`
- `packages/course-gen-platform/src/server/routers/enrichment.router.ts`

---

## Верификация

После каждой задачи:

```bash
pnpm type-check
pnpm build
# Test на dev.ai.megacampus.ru
```

---

## Решение: Вариант A + закрытие mc2-pkld

### Почему mc2-pkld можно закрыть

**mc2-pkld требовал:** "Show SemanticDiff in UI after regeneration"

**Что уже работает:**

1. ✅ **Inline regeneration** (кнопка "Регенерировать" в поле) → показывает `SemanticDiffViewer` сразу
   - Файл: `EditableField.tsx:416-429`
   - Пользователь видит diff и может Accept/Edit/Cancel
2. ✅ **История изменений** → `EditHistoryPanel` показывает все прошлые diff
   - Хранится в `course_edits` таблице
   - Доступно через timeline

**Что НЕ реализовано (но это отдельная фича):**

- ❌ Async lesson-level regeneration через BullMQ → нет real-time notification
- Это edge case: когда regeneration идёт долго (>30 сек) и пользователь не ждёт

**Вывод:** Основной use case (inline regeneration) покрыт. mc2-pkld можно закрыть.

---

## План спринта (Вариант A)

### Шаг 0: Закрыть mc2-pkld

```bash
bd close mc2-pkld --reason "Inline regeneration shows SemanticDiff (EditableField.tsx:416). History in EditHistoryPanel. Async notification is separate feature."
```

### Шаг 1: mc2-b6uc - Helm/Go Template Whitelist (30 min)

### Шаг 2: mc2-ndhm - Patcher Retry Logic (2 hours)

### Шаг 3: mc2-48o0 - Banner Generation Hangs (2 hours)

### Шаг 4: mc2-xod - Status Transition Validation (1 hour)

**Итого:** ~5-6 часов, устраняет 84+ ошибки/день
