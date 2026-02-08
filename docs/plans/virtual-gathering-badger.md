# Plan: mc2-65fw — Consolidate Zod schemas: delete local web schemas

## Context

Задача mc2-65fw из аудита: "Delete local Zod schemas in packages/web that mirror shared-types".

**Результат исследования**: Ситуация проще, чем описано в задаче. Настоящего дублирования "зеркальных схем" почти нет. Вместо этого:

1. **`lib/validation/course.ts`** — целый файл мёртвого кода (0 импортеров)
2. **`lib/validation.ts`** — содержит полезные утилиты (sanitize, schemas), но `courseCreationSchema` мёртвый (0 импортеров кроме теста)
3. **`form-schema.ts`** — активно используется (10 файлов), но содержит хардкод `language: z.enum([...19 языков...])` вместо `languageSchema` из shared-types

## Scope

### 1. Удалить мёртвый файл `packages/web/lib/validation/course.ts`

- 0 импортеров
- Содержит: `createCourseSchema`, `fileValidationSchema`, `validateFile`, `CreateCourseInput`
- Все эти экспорты не используются нигде

### 2. Удалить мёртвую схему `courseCreationSchema` из `packages/web/lib/validation.ts`

- 0 реальных импортеров (только тесты для самой себя)
- Удалить саму схему (строки 299-313) и тип `CourseCreationInput` (строка 406)
- Оставить всё остальное: `sanitize`, `schemas`, `validateInput`, `validateFormData`, `withValidation`, `fileValidation`, `securityValidation` — это полезные утилиты

### 3. Заменить хардкод языков в `form-schema.ts`

- **Файл**: `packages/web/components/forms/create-course/_schemas/form-schema.ts`
- Строки 10-31: `z.enum(['ru', 'en', ...])` → импорт `languageSchema` из `@megacampus/shared-types`
- Списки идентичны (оба 19 языков), замена безопасна

### 4. Обновить тесты

- **Файл**: `packages/web/tests/unit/validation.test.ts`
- Удалить тесты для `courseCreationSchema` (если есть)
- Убедиться, что остальные тесты проходят

### 5. Удалить пустую директорию (если останется)

- `packages/web/lib/validation/` — если `course.ts` единственный файл

## Файлы для изменения

| Файл                                                                  | Действие                                   |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `packages/web/lib/validation/course.ts`                               | DELETE                                     |
| `packages/web/lib/validation.ts`                                      | EDIT: удалить `courseCreationSchema` + тип |
| `packages/web/components/forms/create-course/_schemas/form-schema.ts` | EDIT: `languageSchema` из shared-types     |
| `packages/web/tests/unit/validation.test.ts`                          | EDIT: убрать тесты мёртвого кода           |

## Что НЕ трогаем

- `form-schema.ts` остаётся как есть (кроме language) — это UI-специфичная схема, не дублирует shared-types
- `lib/validation.ts` — утилиты `sanitize`, `schemas`, `fileValidation`, `securityValidation` остаются
- `lib/validation-utils.ts` — UUID-валидация, активно используется (5 импортеров)

## Verification

1. `pnpm type-check` — проверить что нет сломанных импортов
2. `pnpm --filter @megacampus/web build` — проверить билд
3. `pnpm --filter @megacampus/web test` — запустить тесты
4. Проверить вручную, что форма создания курса работает (все поля language доступны)
