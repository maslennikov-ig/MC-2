# План: Исправления для карточек курсов

## Проблема 1: Badges с glassmorphism плохо читаются на светлых обложках

Badges статуса ("Готов") и сложности ("Средний") используют `bg-white/20 backdrop-blur-sm` — на светлых обложках текст сливается.

**Текущий код (строки 524-551 в course-card.tsx):**

```tsx
hasCover ? 'border-white/30 bg-white/20 text-white backdrop-blur-sm' : statusInfo.color;
```

---

## Проблема 2: target_audience отсутствует для готовых курсов

Поле `target_audience` остается NULL в таблице `courses` для готовых курсов (generation_status=completed), хотя:

- Stage 4 генерирует `target_audience` (enum) в `analysis_result.topic_analysis.target_audience`
- Stage 5 имеет опциональное поле в схеме, но оно НЕ генерируется

**Root Cause:**

1. Stage 4 НЕ сохраняет `target_audience` в колонку `courses.target_audience` (только в `analysis_result` JSONB)
2. Stage 5 пропускает генерацию `target_audience` (помечено как "REMOVED - optional")
3. Stage 5 НЕ копирует значение из `analysis_result` в `courses.target_audience`

---

## Решение Проблемы 1: Контрастные badges

### Файл: `packages/web/app/[locale]/courses/_components/course-card.tsx`

**Строки ~524-531 и ~539-545** — заменить glassmorphism на тёмный полупрозрачный фон:

```tsx
// Было:
hasCover ? 'border-white/30 bg-white/20 text-white backdrop-blur-sm' : statusInfo.color;

// Стало:
hasCover ? 'border-white/40 bg-black/50 text-white backdrop-blur-sm' : statusInfo.color;
```

Изменить в двух местах:

1. Badge статуса (строка ~527)
2. Badge сложности (строка ~542)

---

## Решение Проблемы 2: Сохранение target_audience

### Вариант A: Сохранять в Stage 4 (рекомендуется)

Добавить сохранение `courses.target_audience` в Stage 4 handler при обновлении `analysis_result`.

**Преимущества:**

- Поле заполняется раньше в пайплайне
- Минимальные изменения
- Не зависит от Stage 5

### Вариант B: Сохранять в Stage 5

Добавить сохранение `courses.target_audience` в Stage 5 handler при обновлении `course_structure`.

---

## Изменения (Вариант A)

### Файл: `packages/course-gen-platform/src/stages/stage4-analysis/handler.ts`

**Строки ~663-674** — добавить `target_audience` в update:

```typescript
// Было:
const { error: updateError } = await supabaseAdmin
  .from('courses')
  .update({
    analysis_result: analysisResult as any,
    visual_style: visualStyle as any,
    total_lessons_count: analysisResult.recommended_structure.total_lessons,
    total_sections_count: analysisResult.recommended_structure.total_sections,
    updated_at: new Date().toISOString(),
  })
  .eq('id', course_id);

// Стало:
const { error: updateError } = await supabaseAdmin
  .from('courses')
  .update({
    analysis_result: analysisResult as any,
    visual_style: visualStyle as any,
    total_lessons_count: analysisResult.recommended_structure.total_lessons,
    total_sections_count: analysisResult.recommended_structure.total_sections,
    // Сохраняем target_audience из анализа
    target_audience: analysisResult.topic_analysis?.target_audience || null,
    updated_at: new Date().toISOString(),
  })
  .eq('id', course_id);
```

**Примечание:** Значение будет enum (`beginner` | `intermediate` | `advanced` | `mixed`). Возможно, нужно преобразовать в более человекочитаемый формат.

---

## Дополнительно: Исправить существующие курсы

SQL-миграция для заполнения `target_audience` у уже сгенерированных курсов:

```sql
-- Заполнить target_audience из analysis_result для курсов где оно NULL
UPDATE courses
SET target_audience = analysis_result->'topic_analysis'->>'target_audience'
WHERE target_audience IS NULL
  AND analysis_result->'topic_analysis'->>'target_audience' IS NOT NULL;
```

---

## Верификация

### Badges (Проблема 1):

1. `pnpm type-check` в packages/web
2. Проверить карточки с обложками — badges должны быть читаемыми на светлых изображениях

### target_audience (Проблема 2):

1. `pnpm type-check` в packages/course-gen-platform
2. Запустить генерацию курса, проверить что после Stage 4 поле `target_audience` заполнено
3. Выполнить SQL для существующих курсов
4. Проверить отображение "Для кого" на карточках

---

## Ключевые файлы

| Файл                                                                 | Назначение                                    |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `packages/web/app/[locale]/courses/_components/course-card.tsx`      | Badges — изменение стилей (строки ~527, ~542) |
| `packages/course-gen-platform/src/stages/stage4-analysis/handler.ts` | Stage 4 handler — сохранение target_audience  |
| `packages/shared-types/src/analysis-schemas.ts`                      | Схема `target_audience` enum                  |
