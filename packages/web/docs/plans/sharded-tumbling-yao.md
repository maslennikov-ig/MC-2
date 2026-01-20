# План: Исправление логики режимов генерации (automatic vs semi_automatic)

## Проблема

Пользователь выбирает **полуавтоматический режим** (semi_automatic), но генерация всё равно работает как **автоматическая**.

## Архитектура (текущая)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ФОРМА СОЗДАНИЯ КУРСА                              │
├─────────────────────────────────────────────────────────────────────────┤
│  GenerationModeSection.tsx                                               │
│  ├─ Switch: checked={isAutomatic}                                        │
│  └─ onCheckedChange → setValue('generationMode', 'automatic'|'semi_auto')│
│                                                                          │
│  useCreateCourseForm.ts:63                                               │
│  └─ defaultValues: { generationMode: savedPrefs?.generationMode || 'automatic' }  │
│                                          ↑                               │
│                                   ПРОБЛЕМА #1: Дефолт = automatic        │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        СОХРАНЕНИЕ В БД                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  useSubmitCourse.ts:126                                                  │
│  └─ formData.append('generation_mode', data.generationMode)              │
│                                                                          │
│  courses.ts:530                                                          │
│  └─ UPDATE courses SET generation_mode = validatedData.generation_mode   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     СТРАНИЦА ГЕНЕРАЦИИ                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  page.tsx:228-230                                                        │
│  └─ generationMode={(course.generation_mode) || null}                    │
│                                                                          │
│  GenerationProgressContainerEnhanced.tsx:847                             │
│  └─ readOnly={generationMode === 'automatic'}                            │
│                                                                          │
│  GraphView.tsx:993                                                       │
│  └─ isAutomaticMode={readOnly}                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        БЭКЕНД PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  auto-approval/index.ts:213                                              │
│  └─ const isAutomatic = course.generation_mode === 'automatic';          │
│                                                                          │
│  if (!isAutomatic) {                                                     │
│    // Semi-automatic: set to awaiting_approval                           │
│    await db.update({ generation_status: 'stage_X_awaiting_approval' })   │
│  } else {                                                                │
│    // Automatic: auto-approve and queue next stage                       │
│  }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Найденные проблемы

### Проблема #1: Неправильный дефолт в форме

**Файл:** `useCreateCourseForm.ts:63`

```typescript
generationMode: savedPrefs?.generationMode || 'automatic',  // ← Должно быть 'semi_automatic'
```

**Влияние:** Новые пользователи без сохранённых предпочтений видят тумблер ВКЛЮЧЁННЫМ (automatic). Если не переключают — курс создаётся в автоматическом режиме.

### Проблема #2: Дублирование баннеров на Stage 6

**Файл:** `GraphView.tsx:1087`

```typescript
// SelectionToolbar показывался даже в automatic режиме (УЖЕ ИСПРАВЛЕНО)
{nodes.some((n) => n.type === 'lesson') && awaitingStage !== 5 && !readOnly && (
```

### Возможная проблема #3: null из БД

Если `course.generation_mode = null` (старые курсы), то:

- `readOnly = false` (правильно — UI для semi_automatic)
- `shouldAutoStart = false` (правильно — не автостарт)
- Но бэкенд НЕ проверяет null: `isAutomatic = course.generation_mode === 'automatic'`
- При null → `isAutomatic = false` → ставит awaiting_approval (правильно)

## Решения

### Решение 1: Изменить дефолт на semi_automatic

**Файлы:**

- `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts:63`
- `packages/web/components/forms/create-course/_schemas/form-schema.ts:80`

```typescript
// useCreateCourseForm.ts:63
generationMode: savedPrefs?.generationMode || 'semi_automatic',

// form-schema.ts:80
generationMode: z.enum(['automatic', 'semi_automatic']).default('semi_automatic'),
```

### Решение 2: Добавить явный fallback для null на странице генерации

**Файл:** `page.tsx:228-230`

```typescript
generationMode={
  (course.generation_mode as 'automatic' | 'semi_automatic' | null) || 'semi_automatic'
}
```

### Решение 3 (уже применено): Скрывать SelectionToolbar в automatic режиме

**Файл:** `GraphView.tsx:1087` — добавлено `&& !readOnly`

## Критические файлы для изменения

| Файл                        | Изменение                        |
| --------------------------- | -------------------------------- |
| `useCreateCourseForm.ts:63` | Дефолт → 'semi_automatic'        |
| `form-schema.ts:80`         | .default('semi_automatic')       |
| `page.tsx:228-230`          | Fallback null → 'semi_automatic' |

## Верификация

1. **Создать курс БЕЗ переключения тумблера**
   - Ожидание: режим = semi_automatic
   - Проверить в БД: `SELECT generation_mode FROM courses WHERE id = ...`

2. **На странице генерации проверить UI**
   - Semi_automatic: баннер с кнопкой "Approve" для каждого этапа
   - Automatic: баннер с кнопками "Pause/Cancel"

3. **Проверить бэкенд логику**
   - Semi_automatic: статус должен стать `stage_X_awaiting_approval` после завершения этапа
   - Смотреть логи: `Stage awaiting approval (semi-automatic)`

## Вопрос к пользователю

Нужно уточнить симптом:

1. **При создании курса**: Тумблер по умолчанию ВКЛЮЧЁН или ВЫКЛЮЧЕН?
2. **После переключения на ВЫКЛ и создания курса**: Какой режим показывается на странице генерации?
3. **Что именно происходит**: Этапы автоматически переходят без ожидания подтверждения?
