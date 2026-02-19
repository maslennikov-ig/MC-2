# Fix: partialGenerate не передаёт lesson_context (course_position)

## Context

После перегенерации модуля 1 через `partialGenerate`, урок 1.4 ("Эвдемония Аристотеля") имеет две проблемы:

1. **"Добро пожаловать в первую секцию нашего курса"** — модель не знает, что это урок 4 из 5
2. **Весь контент попал в intro** — 0 секций, всё в одном блоке. Модель написала без `## ` заголовков

### Корневая причина

`buildMinimalLessonSpec()` (файл `helpers.ts:114-290`) возвращает `LessonSpecificationV2` **без поля `lesson_context`**.

Цепочка:

```
partialGenerate → buildMinimalLessonSpec → spec.lesson_context = undefined
→ formatInterLessonContextXML(undefined) → '' (пустая строка)
→ LLM не получает course_position → пишет как вводный урок
→ плохая структура → парсер не находит ## → всё в intro
```

В **полном** пайплайне (Stage 5 → Stage 6) `lesson_context` строится Stage 5 и включает `course_position`, `previous_lesson`, `next_lesson`, `terms_already_defined`.

### Beads-задача с course_position

Задача `mc2-nt8m` (Course Position Awareness) уже реализована для полного пайплайна. Но `partialGenerate` обходит Stage 5 и строит спеки напрямую из `course_structure` — поэтому `lesson_context` пуст.

## Решение

Добавить построение `lesson_context` в `buildMinimalLessonSpec` или в `partialGenerate`.

### Выбор: где строить

| Подход                         | Плюсы                                       | Минусы                                             |
| ------------------------------ | ------------------------------------------- | -------------------------------------------------- |
| **В `buildMinimalLessonSpec`** | Единая точка, любой вызов получает контекст | Нужно передать `courseStructure`                   |
| В `partialGenerate`            | Не меняем сигнатуру                         | Дублирование если generate-missing тоже использует |

**Выбор: в `buildMinimalLessonSpec`** — единая точка, `generate-missing.ts` тоже использует эту функцию.

## План реализации

### Изменение 1: Расширить `buildMinimalLessonSpec` для построения `lesson_context`

**Файл**: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`

**Добавить параметр** `courseStructure` к `buildMinimalLessonSpec`:

```typescript
export function buildMinimalLessonSpec(
  lessonId: string,
  lesson: { ... },
  sectionNumber: number,
  requestId: string,
  analysisResult?: AnalysisResult | null,
  // NEW: для построения lesson_context
  courseStructure?: { sections: SectionFromStructure[] }
): LessonSpecificationV2 {
```

**Добавить построение `lesson_context`** перед `return`:

```typescript
// Build lesson_context from courseStructure if available
if (courseStructure) {
  spec.lesson_context = buildLessonContextFromStructure(lessonId, sectionNumber, courseStructure);
}
```

### Изменение 2: Новая helper-функция `buildLessonContextFromStructure`

**Файл**: `packages/course-gen-platform/src/server/routers/lesson-content/helpers.ts`

```typescript
function buildLessonContextFromStructure(
  lessonId: string, // e.g. "1.4"
  sectionNumber: number, // e.g. 1
  courseStructure: { sections: SectionFromStructure[] }
): LessonContext {
  const sections = courseStructure.sections;

  // Build flat ordered list of all lessons with their IDs
  // Mirrors v2-converter.ts:107-112 logic
  const allLessons: Array<{
    id: string;
    title: string;
    objectives: string[];
    keyTopics: string[];
    sectionTitle: string;
    sectionIndex: number;
  }> = [];
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const sNum = section.section_number ?? si + 1;
    for (let li = 0; li < section.lessons.length; li++) {
      const lesson = section.lessons[li];
      allLessons.push({
        id: `${sNum}.${li + 1}`,
        title: lesson.lesson_title,
        objectives: lesson.lesson_objectives || [],
        keyTopics: lesson.key_topics || [],
        sectionTitle: section.section_title,
        sectionIndex: sNum,
      });
    }
  }

  // Find current lesson index
  const currentIdx = allLessons.findIndex(l => l.id === lessonId);
  const current = allLessons[currentIdx];

  // Previous lesson
  const prev = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const previous_lesson = prev
    ? {
        lesson_id: prev.id,
        title: prev.title,
        key_concepts: prev.objectives.slice(0, 5),
      }
    : null;

  // Next lesson
  const next = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;
  const next_lesson = next
    ? {
        lesson_id: next.id,
        title: next.title,
        key_concepts: next.objectives.slice(0, 5),
      }
    : null;

  // Concepts already covered — unique key_topics from all previous lessons (max 20)
  // Matches v2-converter.ts logic: deduplicated, capped at 20
  const concepts_already_covered: string[] = [];
  for (let i = 0; i < currentIdx && concepts_already_covered.length < 20; i++) {
    const topics = allLessons[i].keyTopics;
    for (const topic of topics) {
      if (!concepts_already_covered.includes(topic) && concepts_already_covered.length < 20) {
        concepts_already_covered.push(topic);
      }
    }
  }

  // Terms already defined — key_topics from PREVIOUS lesson only (for recency)
  const terms_already_defined = prev ? prev.keyTopics.slice(0, 10) : [];

  // Current section info
  const currentSection = sections.find((s, i) => (s.section_number ?? i + 1) === sectionNumber);
  const lessonsInModule = currentSection?.lessons.length ?? 1;
  const lessonOrderInModule = parseInt(lessonId.split('.')[1]) || 1;

  // Course position
  const course_position = {
    lesson_index_in_module: lessonOrderInModule,
    total_lessons_in_module: lessonsInModule,
    module_index: sectionNumber,
    total_modules: sections.length,
    lesson_index_in_course: currentIdx + 1,
    total_lessons_in_course: allLessons.length,
    module_title: current?.sectionTitle || `Module ${sectionNumber}`,
  };

  return {
    previous_lesson,
    next_lesson,
    concepts_already_covered,
    terms_already_defined,
    course_position,
  };
}
```

### Изменение 3: Передать `courseStructure` в вызовы `buildMinimalLessonSpec`

**Файл**: `packages/course-gen-platform/src/server/routers/lesson-content/procedures/partial-generate.ts`

Строка ~469:

```typescript
// БЫЛО:
const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNum, requestId, analysisResult);

// СТАЛО:
const spec = buildMinimalLessonSpec(
  lessonId,
  lesson,
  sectionNum,
  requestId,
  analysisResult,
  courseStructure
);
```

**Файл**: `packages/course-gen-platform/src/server/routers/lesson-content/procedures/generate-missing.ts`

Аналогичное изменение — передать `courseStructure` (нужно проверить, есть ли доступ).

### Изменение 4: Типы `SectionFromStructure` / `LessonFromStructure`

Эти типы дублированы в `partial-generate.ts:21-34` и `generate-missing.ts:25-38`. Перенести в `helpers.ts` и экспортировать, чтобы `buildLessonContextFromStructure` мог их использовать.

```typescript
// helpers.ts — экспортируемые типы
export type LessonFromStructure = {
  lesson_number: number;
  lesson_title: string;
  lesson_objectives?: string[];
  key_topics?: string[];
  estimated_duration_minutes?: number;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
};

export type SectionFromStructure = {
  section_number?: number;
  section_title: string;
  lessons: LessonFromStructure[];
};
```

В `partial-generate.ts` и `generate-missing.ts` — заменить локальные типы на импорт:

```typescript
import {
  verifyCourseAccess,
  buildMinimalLessonSpec,
  type SectionFromStructure,
  type LessonFromStructure,
} from '../helpers';
```

### Изменение 5: Кликабельная карточка "В следующем уроке"

Карточка уже отображается, но по ней нельзя перейти в следующий урок. Нужно:

**Файл**: `packages/web/components/common/lesson-content.tsx`

1. Добавить prop `onNextLesson?: () => void` в `LessonContentProps`
2. Обернуть карточку в кликабельный `<button>` с `cursor-pointer`:

```tsx
{
  nextLesson && (
    <div className="mt-12 mb-4">
      <button
        type="button"
        onClick={onNextLesson}
        className="w-full text-left rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/50 p-6 shadow-sm transition-all hover:shadow-md hover:border-emerald-300 dark:border-emerald-800/30 dark:from-emerald-900/20 dark:to-teal-900/10 dark:hover:border-emerald-700/50 cursor-pointer group"
      >
        <div className="mb-3 flex items-center gap-2">
          <ArrowRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:translate-x-1" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">В следующем уроке</h2>
        </div>
        ...
      </button>
    </div>
  );
}
```

**Файл**: `packages/web/components/common/content-format-switcher.tsx`

- Добавить `onNextLesson` prop, прокинуть в `<LessonContent>`

**Файл**: `packages/web/components/course/viewer/components/LessonView.tsx`

- Передать `onNextLesson={onNext}` в `<ContentFormatSwitcher>` и `<LessonContent>` (focus mode)

## Файлы для изменения

### Backend (lesson_context для partialGenerate)

| #   | Файл                                                     | Что                                                                                                 |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `course-gen-platform/.../lesson-content/helpers.ts`      | Экспортировать типы, добавить `buildLessonContextFromStructure`, расширить `buildMinimalLessonSpec` |
| 2   | `course-gen-platform/.../procedures/partial-generate.ts` | Убрать локальные типы, импортировать из helpers, передать `courseStructure`                         |
| 3   | `course-gen-platform/.../procedures/generate-missing.ts` | Убрать локальные типы, импортировать из helpers, передать `courseStructure`                         |

### Frontend (кликабельная карточка)

| #   | Файл                                                     | Что                                                          |
| --- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 4   | `web/components/common/lesson-content.tsx`               | Добавить `onNextLesson` prop, обернуть карточку в `<button>` |
| 5   | `web/components/common/content-format-switcher.tsx`      | Прокинуть `onNextLesson`                                     |
| 6   | `web/components/course/viewer/components/LessonView.tsx` | Передать `onNext` как `onNextLesson`                         |

**6 файлов.**

## Проверка

1. **Type-check**: `pnpm type-check`
2. **Build**: `pnpm build`
3. **Перегенерация урока 1.4 через UI** → проверить:
   - Модель знает позицию ("урок 4 из 5 в модуле 1")
   - Нет "Добро пожаловать в первую секцию"
   - Контент разбит на секции (`sections_count > 0`)
   - Корректные `## ` заголовки
4. **SQL-проверка**:

```sql
SELECT
  lc.content->'content'->'intro' as intro,
  jsonb_array_length(lc.content->'content'->'sections') as sections_count
FROM lesson_contents lc
WHERE lc.lesson_id = '...'
ORDER BY created_at DESC LIMIT 1;
```
