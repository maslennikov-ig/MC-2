# Аудит и исправление системы стилей курса

## Context

При создании курса пользователь выбирает стиль написания (professional, gamified, storytelling и т.д.). Стиль должен влиять на тон и подход в текстовых уроках. Нужно проверить: (1) качественно ли стиль инжектится в пайплайн генерации, (2) нет ли в стилях требований к созданию видео/квизов (курсы текстовые).

## Результаты аудита

### Контент стилей — OK

Все 12 стилей описывают тон/подход к НАПИСАНИЮ текста. Ни один стиль не требует создания видео, квизов или интерактивных элементов как отдельных сущностей. `interactive` — про встроенные текстовые упражнения ("Before reading further, write down..."), `gamified` — про игровые метафоры в тексте.

### Найдено 3 проблемы

---

## Fix 1 (CRITICAL): Hardcoded Stage 6 prompt не содержит `{{stylePrompt}}`

**Суть**: Миграция `20260114150000` добавила блоки `<content_style>` и `<rag_validation>` с `{{stylePrompt}}` в БД-версию промпта Stage 6. Но hardcoded fallback в `prompt-registry.ts` НЕ обновлён. Если БД недоступна — стиль **молча игнорируется** при генерации уроков.

**Файл**: `packages/course-gen-platform/src/shared/prompts/prompt-registry.ts`

**Изменения**:

1. Между `</lesson_context>` и `<visual_toolkit>` вставить блоки `<content_style>` и `<rag_validation>` из миграции
2. Удалить `<writing_tips>` (удалён в DB-версии)
3. В `<task>` обновить инструкцию #3 и добавить #6 про стиль (по образцу миграции)
4. Добавить `stylePrompt` в массив `variables`

**Эталон**: миграция `supabase/migrations/20260114150000_add_style_prompt_to_stage6_generator.sql`

---

## Fix 2 (MEDIUM): Разные дефолтные стили в разных стейджах

**Суть**: Stage 5 и 5.5 дефолтят на `'conversational'`, Stage 6 на `'professional'` (`DEFAULT_COURSE_STYLE`). Один курс может получить метаданные в conversational тоне, а уроки в professional.

**Файлы**:

1. `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts:159`
   - `|| 'conversational'` → `|| DEFAULT_COURSE_STYLE`
   - Добавить в импорт: `import { getStylePrompt, DEFAULT_COURSE_STYLE } from '@megacampus/shared-types/style-prompts';`

2. `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/prompt-builder.ts:73`
   - `|| 'conversational'` → `|| DEFAULT_COURSE_STYLE`
   - Добавить в импорт: `import { getStylePrompt, DEFAULT_COURSE_STYLE } from '@megacampus/shared-types/style-prompts';`

---

## Fix 3 (LOW): Мёртвые стили в form-schema.ts

**Суть**: Zod-схема формы содержит 19 стилей (7 лишних: `visual`, `minimalist`, `engaging`, `socratic`, `collaborative`, `microlearning`, `inspirational`). UI показывает только 12 из `COURSE_STYLES`. Лишние — мёртвый код.

**Файл**: `packages/web/components/forms/create-course/_schemas/form-schema.ts`

**Изменения**:

```typescript
// Было:
import { courseSizeSchema } from '@megacampus/shared-types'
// ...
writingStyle: z.enum(['academic', ... 19 values ...]).optional(),

// Стало:
import { courseSizeSchema, CourseStyleSchema } from '@megacampus/shared-types'
// ...
writingStyle: CourseStyleSchema.optional(),
```

---

## Verification

```bash
# Type-check all packages
pnpm type-check

# Build affected packages
pnpm --filter @megacampus/shared-types build
pnpm --filter @megacampus/course-gen-platform build
pnpm --filter web build

# Grep: no more 'conversational' defaults in pipeline stages
grep -r "'conversational'" packages/course-gen-platform/src/stages/ | grep -v test | grep -v node_modules

# Confirm stylePrompt in hardcoded prompt
grep "stylePrompt" packages/course-gen-platform/src/shared/prompts/prompt-registry.ts

# Run existing tests
pnpm --filter @megacampus/course-gen-platform test -- --run
```
