# План: Реорганизация UI/UX создания нового курса

## Краткое описание

Реорганизация раздела "Дополнительные настройки" формы создания курса:

1. Двухколоночная компоновка (размер курса слева, остальное справа)
2. Автоматический режим генерации по умолчанию
3. Унификация цветовой гаммы иконок (purple)
4. Отображение стоимости в LLM токенах вместо долларов
5. Исправление бага с обновлением стоимости при смене размера курса

---

## Задачи

### 1. Исправить баг с обновлением стоимости при смене размера курса

**Файл:** `packages/web/components/forms/create-course/components/CourseSizeSelector.tsx`

**Проблема:** При выборе 'auto' в `handleSizeClick` не сбрасывается `estimatedLessons`, поэтому при переключении micro → auto стоимость остаётся для 3 уроков.

**Решение:** Добавить сброс `estimatedLessons` и `estimatedSections` в undefined при выборе 'auto':

```tsx
const handleSizeClick = (size: CourseSize) => {
  setValue('courseSize', size);
  if (size !== 'auto') {
    const preset = COURSE_SIZE_PRESETS[size];
    setValue('estimatedLessons', preset.targetLessons);
    setValue('estimatedSections', preset.targetSections);
  } else {
    // Сбросить при выборе auto, чтобы fallback в форме сработал
    setValue('estimatedLessons', undefined);
    setValue('estimatedSections', undefined);
  }
};
```

---

### 2. Изменить default для режима генерации на 'automatic'

**Файл:** `packages/web/components/forms/create-course/_schemas/form-schema.ts`

**Изменение:** Строка 80

```tsx
// Было:
generationMode: z.enum(['automatic', 'semi_automatic']).default('semi_automatic'),

// Стало:
generationMode: z.enum(['automatic', 'semi_automatic']).default('automatic'),
```

---

### 3. Добавить функцию оценки токенов в shared-types

**Файл:** `packages/shared-types/src/cost-preview.ts`

Добавить новый интерфейс и функцию для оценки токенов:

```tsx
export interface TokenEstimate {
  totalTokens: number;
  minTokens: number;
  maxTokens: number;
  breakdown: {
    stage2_tokens: number; // Embeddings
    stage4_tokens: number; // Analysis
    stage5_tokens: number; // Structure
    stage6_tokens: number; // Lessons
  };
}

// Токены на один урок (на основе реальных тестов: min 2000, max 10000)
const TOKENS_PER_LESSON_MIN = 2000;
const TOKENS_PER_LESSON_AVG = 6000;
const TOKENS_PER_LESSON_MAX = 10000;

export function estimateTokens(input: EstimateCostInput): TokenEstimate {
  // Расчёт токенов на основе уроков
  const stage2Tokens = input.hasDocuments ? input.documentCount * 1000 : 0;
  const stage4Tokens = input.hasDocuments ? 10000 : 5000;
  const stage5Tokens = 5000 + input.estimatedLessons * 500;
  const stage6TokensAvg = input.estimatedLessons * TOKENS_PER_LESSON_AVG;

  const totalTokens = stage2Tokens + stage4Tokens + stage5Tokens + stage6TokensAvg;

  // Min/Max на основе variance в stage6 (самая затратная часть)
  const stage6Min = input.estimatedLessons * TOKENS_PER_LESSON_MIN;
  const stage6Max = input.estimatedLessons * TOKENS_PER_LESSON_MAX;

  return {
    totalTokens,
    minTokens: stage2Tokens + stage4Tokens + stage5Tokens + stage6Min,
    maxTokens: stage2Tokens + stage4Tokens + stage5Tokens + stage6Max,
    breakdown: {
      stage2_tokens: stage2Tokens,
      stage4_tokens: stage4Tokens,
      stage5_tokens: stage5Tokens,
      stage6_tokens: stage6TokensAvg,
    },
  };
}

// Форматирование токенов для отображения (123456 → "~124K")
// Округляем в большую сторону
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `~${Math.ceil(tokens / 100000) / 10}M`;
  }
  if (tokens >= 1000) {
    return `~${Math.ceil(tokens / 1000)}K`;
  }
  return `~${Math.ceil(tokens)}`;
}
```

---

### 4. Обновить CostPreviewCard для отображения токенов

**Файл:** `packages/web/components/forms/create-course/components/CostPreviewCard.tsx`

**Изменения:**

1. Заменить DollarSign иконку на Hash или Sigma
2. Заменить заголовок "Ориентировочная стоимость" на "Ориентировочное количество токенов"
3. Использовать новую функцию `estimateTokens` и `formatTokens`
4. Отображать токены вместо долларов

---

### 5. Реорганизовать AdvancedSettingsSection в 2 колонки

**Файл:** `packages/web/components/forms/create-course/components/AdvancedSettingsSection.tsx`

**Новая структура:**

```
┌─────────────────────────────────────────────────────┐
│ Дополнительные настройки (необязательно)      [▼]  │
├─────────────────────────┬───────────────────────────┤
│                         │                           │
│   РАЗМЕР КУРСА          │   ЦЕЛЕВАЯ АУДИТОРИЯ       │
│   [auto] [micro]        │   [input field]           │
│   [mini] [compact]      │                           │
│   [standard]            │   РЕЗУЛЬТАТЫ ОБУЧЕНИЯ     │
│   [comprehensive]       │   [textarea]              │
│                         │                           │
│                         │   РЕЖИМ ГЕНЕРАЦИИ         │
│                         │   [toggle + notifications]│
│                         │                           │
└─────────────────────────┴───────────────────────────┘
```

**Изменения в коде:**

```tsx
<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
  {/* Левая колонка - Размер курса */}
  <div>
    <CourseSizeSelector />
  </div>

  {/* Правая колонка - Остальные настройки */}
  <div className="space-y-6">
    {/* Целевая аудитория */}
    {/* Результаты обучения */}
    {/* Режим генерации */}
  </div>
</div>
```

---

### 6. Унифицировать цветовую гамму иконок (purple)

**Файл:** `packages/web/components/forms/create-course/components/AdvancedSettingsSection.tsx`

**Изменения:**

| Иконка                | Было                                | Стало                                  |
| --------------------- | ----------------------------------- | -------------------------------------- |
| Zap (режим генерации) | `text-yellow-500`                   | `text-purple-500 dark:text-purple-400` |
| Bell (уведомления)    | `text-yellow-600`                   | `text-purple-500 dark:text-purple-400` |
| Фон уведомлений       | `border-yellow-200 bg-yellow-50/50` | `border-purple-200 bg-purple-50/50`    |

Иконки состояний (CheckCircle2, AlertCircle) оставить семантическими (зелёный/красный) для индикации типа уведомления.

---

## Файлы для изменения

| Файл                                                                                 | Изменения                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------- |
| `packages/shared-types/src/cost-preview.ts`                                          | Добавить `estimateTokens`, `formatTokens`   |
| `packages/shared-types/src/index.ts`                                                 | Экспортировать новые функции                |
| `packages/web/components/forms/create-course/components/CourseSizeSelector.tsx`      | Исправить сброс estimatedLessons для 'auto' |
| `packages/web/components/forms/create-course/components/CostPreviewCard.tsx`         | Переделать на токены                        |
| `packages/web/components/forms/create-course/components/AdvancedSettingsSection.tsx` | 2 колонки + унификация иконок               |
| `packages/web/components/forms/create-course/_schemas/form-schema.ts`                | default 'automatic'                         |

---

## Верификация

1. **Type-check**: `pnpm type-check`
2. **Build**: `pnpm build`
3. **Ручное тестирование:**
   - Открыть форму создания курса
   - Проверить, что режим генерации по умолчанию = automatic
   - Проверить двухколоночную компоновку
   - Выбрать micro, затем переключить на auto → стоимость должна обновиться
   - Проверить, что токены отображаются корректно
   - Проверить, что иконки имеют фиолетовую гамму

---

## Делегирование

- **Задачи 1, 2, 3**: Простые, выполню сам
- **Задача 4 (CostPreviewCard)**: Делегировать `nextjs-ui-designer`
- **Задача 5, 6 (AdvancedSettingsSection)**: Делегировать `nextjs-ui-designer`

---

## Задачи Beads (создать перед реализацией)

```bash
# 1. Баг: стоимость не обновляется при смене размера курса
bd create --title="fix: Course size change doesn't update cost estimation" \
  --type=bug \
  --priority=2 \
  --files "packages/web/components/forms/create-course/components/CourseSizeSelector.tsx" \
  --description="При переключении с micro на auto, estimatedLessons не сбрасывается, и стоимость остаётся для старого размера"

# 2. Изменить default режима генерации на automatic
bd create --title="feat: Change default generation mode to automatic" \
  --type=task \
  --priority=3 \
  --files "packages/web/components/forms/create-course/_schemas/form-schema.ts" \
  --description="Изменить default для generationMode с semi_automatic на automatic"

# 3. Добавить функцию оценки токенов
bd create --title="feat: Add token estimation for cost preview" \
  --type=feature \
  --priority=2 \
  --files "packages/shared-types/src/cost-preview.ts,packages/shared-types/src/index.ts" \
  --description="Добавить estimateTokens и formatTokens функции для отображения стоимости в LLM токенах"

# 4. Обновить CostPreviewCard для отображения токенов
bd create --title="feat: Display cost in LLM tokens instead of USD" \
  --type=feature \
  --priority=2 \
  --files "packages/web/components/forms/create-course/components/CostPreviewCard.tsx" \
  --description="Заменить отображение стоимости в USD на LLM токены (input/output)"

# 5. Реорганизовать AdvancedSettingsSection в 2 колонки
bd create --title="refactor: Two-column layout for advanced settings" \
  --type=task \
  --priority=2 \
  --files "packages/web/components/forms/create-course/components/AdvancedSettingsSection.tsx" \
  --description="Левая колонка: размер курса. Правая: целевая аудитория, результаты обучения, режим генерации"

# 6. Унифицировать цветовую гамму иконок (purple)
bd create --title="style: Unify icon colors to purple theme" \
  --type=task \
  --priority=3 \
  --files "packages/web/components/forms/create-course/components/AdvancedSettingsSection.tsx" \
  --description="Заменить желтые иконки (Zap, Bell) на фиолетовые для соответствия общему стилю"
```
