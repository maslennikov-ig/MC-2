# План: Исправление использования полей формы в генерации курса

## Проблема

Из ~15 полей формы создания курса реально учитываются только 3:

- `title` (topic)
- `language`
- `style` (writingStyle)

Остальные поля либо не передаются в генерацию, либо не используются в промптах.

---

## Фаза 1: Исправить маппинг в lifecycle.router.ts

**Файл:** `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`
**Строки:** 726-748

### Текущий код (проблемный):

```typescript
frontend_parameters: {
  course_title: course.title,
  language: course.language ?? undefined,
  style: course.style,
  target_audience: course.target_audience ?? undefined,
  difficulty: course.difficulty ?? 'intermediate',
  desired_lessons_count: (course.settings as unknown as CourseSettings)?.desired_lessons_count,  // WRONG
  desired_modules_count: (course.settings as unknown as CourseSettings)?.desired_modules_count,  // WRONG
  lesson_duration_minutes: (course.settings as unknown as CourseSettings)?.lesson_duration_minutes,
  learning_outcomes: (course.settings as unknown as CourseSettings)?.learning_outcomes,  // WRONG
}
```

### Исправленный код:

```typescript
frontend_parameters: {
  course_title: course.title,
  language: course.language ?? undefined,
  style: course.style && isValidStyle(course.style) ? course.style : DEFAULT_COURSE_STYLE,
  target_audience: course.target_audience ?? undefined,
  difficulty: course.difficulty ?? 'intermediate',
  // NEW: Добавить description пользователя
  description: course.course_description ?? undefined,
  // NEW: Добавить размер курса
  course_size: course.course_size ?? undefined,
  // FIX: Читать из courses, не из settings
  desired_lessons_count: course.estimated_lessons ?? undefined,
  desired_modules_count: course.estimated_sections ?? undefined,
  lesson_duration_minutes: (course.settings as unknown as CourseSettings)?.lesson_duration_minutes,
  // FIX: Читать из courses и парсить если строка
  learning_outcomes: course.learning_outcomes
    ? (typeof course.learning_outcomes === 'string'
       ? course.learning_outcomes.split('\n').filter(Boolean)
       : undefined)
    : undefined,
}
```

### Также обновить select query (~строка 104):

```typescript
.select('*, course_description, course_size, estimated_lessons, estimated_sections, learning_outcomes, organization:organizations(tier)')
```

---

## Фаза 2: Добавить поля в промпт metadata-generator.ts

**Файл:** `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts`
**Строки:** 501-576 (метод buildMetadataPrompt)

### Добавить после строки 516 (после Content Style):

```typescript
// Добавить пользовательский контекст если есть
if (input.frontend_parameters.description) {
  prompt += `**User Requirements**: ${input.frontend_parameters.description}\n\n`;
}

if (input.frontend_parameters.target_audience) {
  prompt += `**Target Audience**: ${input.frontend_parameters.target_audience}\n\n`;
}

if (input.frontend_parameters.learning_outcomes?.length) {
  prompt += `**Required Learning Outcomes** (MUST be included):\n`;
  input.frontend_parameters.learning_outcomes.forEach((outcome, i) => {
    prompt += `${i + 1}. ${outcome}\n`;
  });
  prompt += '\n';
}

// Добавить guidance по размеру курса
if (input.frontend_parameters.course_size && input.frontend_parameters.course_size !== 'auto') {
  const preset = getCourseSizePreset(input.frontend_parameters.course_size as CourseSize);
  if (preset?.llmGuidance) {
    prompt += `**Course Size Guidance**: ${preset.llmGuidance}\n\n`;
  }
} else if (
  input.frontend_parameters.desired_lessons_count ||
  input.frontend_parameters.desired_modules_count
) {
  prompt += `**Structure Guidance**:\n`;
  if (input.frontend_parameters.desired_lessons_count) {
    prompt += `- Target: ~${input.frontend_parameters.desired_lessons_count} lessons\n`;
  }
  if (input.frontend_parameters.desired_modules_count) {
    prompt += `- Target: ~${input.frontend_parameters.desired_modules_count} sections\n`;
  }
  prompt += '\n';
}
```

### Добавить импорт:

```typescript
import { getCourseSizePreset, type CourseSize } from '@megacampus/shared-types/course-size';
```

---

## Фаза 3: Добавить поля в prompt-builder.ts

**Файл:** `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts`
**Строки:** 34-47

### Добавить после строки 40 (после Content Style):

```typescript
// Target audience context
if (input.frontend_parameters.target_audience) {
  prompt += `- Target Audience: ${input.frontend_parameters.target_audience}\n`;
}

// User description context
if (input.frontend_parameters.description) {
  prompt += `\n**User Requirements**: ${input.frontend_parameters.description}\n`;
}

// Course size context
if (input.frontend_parameters.course_size && input.frontend_parameters.course_size !== 'auto') {
  const preset = getCourseSizePreset(input.frontend_parameters.course_size as CourseSize);
  if (preset?.llmGuidance) {
    prompt += `\n**Course Size**: ${preset.llmGuidance}\n`;
  }
}
```

### Добавить импорт:

```typescript
import { getCourseSizePreset, type CourseSize } from '@megacampus/shared-types/course-size';
```

---

## Фаза 4: Тестирование

### 4.1 Type-check и build

```bash
pnpm type-check
pnpm build
```

### 4.2 Создать тестовый курс со всеми полями:

- Topic: "Python для начинающих"
- Description: "Фокус на практических примерах, каждый урок должен содержать задачи"
- Target Audience: "Junior разработчики с опытом 0-1 год"
- Learning Outcomes: "Писать функции\nРаботать со списками\nЧитать файлы"
- Course Size: "compact" (15-30 уроков)
- Style: "conversational"

### 4.3 Проверить результат:

- [ ] Course overview упоминает практические примеры
- [ ] Learning outcomes включают пользовательские
- [ ] Структура соответствует compact (15-30 уроков)
- [ ] Контент ориентирован на junior разработчиков

---

## Критические файлы

| Файл                                                                                              | Изменение                                    |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`                  | Маппинг frontend_parameters (строки 726-748) |
| `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts`           | Промпт метаданных (строки 501-576)           |
| `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts` | Промпт секций (строки 34-47)                 |

---

## Риски и митигация

1. **Обратная совместимость**: Все новые поля опциональны (nullish), существующие курсы продолжат работать
2. **Лимиты токенов**: Дополнительный контекст ~500-1000 токенов, в пределах лимитов
3. **Схема валидации**: FrontendParametersSchema уже содержит нужные поля

---

## Проверка успеха

После реализации: создать курс с description "Только теория, никаких практических заданий" и убедиться что сгенерированный курс НЕ содержит практических упражнений (или минимум). Это докажет что description влияет на генерацию.
