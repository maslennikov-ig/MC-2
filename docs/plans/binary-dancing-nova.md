# Fix: Callout-блоки не рендерятся в уроках + локализация заголовков

## Context

Callout-блоки (`[!TIP]`, `[!WARNING]`, `[!NOTE]`, `[!INFO]`, `[!DANGER]`) генерируются LLM в Stage 6 через секцию `<visual_toolkit>` в промптах. Компонент `Callout.tsx` для рендеринга существует (с цветами, иконками, фоном), но **парсер не распознаёт маркеры**, потому что LLM оборачивает их в кавычки: `"[!TIP] ..."`. Regex `^\[!(NOTE|TIP|WARNING|DANGER|INFO)\]` ожидает `[` первым символом, но видит `"`.

**Результат**: пользователь видит сырой текст `"[!TIP]` в обычном blockquote вместо стилизованной плашки с иконкой и цветом.

Дополнительно: заголовки callout-блоков захардкожены на английском (`Note`, `Tip`, `Warning`...), а нужно по языку курса.

## Изменения

### 1. Парсер callout-блоков — толерантный regex

**Файлы:**

- `packages/web/components/markdown/MarkdownRendererFull.tsx` — `tryParseCallout()` (строка 237)
- `packages/web/components/markdown/MarkdownRenderer.tsx` — blockquote handler (строка 244)

```typescript
// Было (строка 237 / 244):
const match = textContent.match(/^\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i);

// Стало — толерируем кавычки и whitespace перед маркером:
const match = textContent.match(/^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i);
```

Аналогично для replacement (строка 241 / 250):

```typescript
// Было:
textContent.replace(/^\[!(NOTE|TIP|WARNING|DANGER|INFO)\]\s*/i, '');

// Стало — также убираем trailing кавычки после маркера:
textContent.replace(
  /^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]["'«»\u201C\u201D]*\s*/i,
  ''
);
```

### 2. Локализация заголовков callout по языку курса

**2a. Добавить callout-лейблы в CONTENT_LABELS (single source of truth)**

**Файл:** `packages/shared-types/src/common-enums.ts`

Расширить тип и все 19 языковых записей в `CONTENT_LABELS`:

```typescript
// Добавить поля в тип:
calloutNote: string;
calloutTip: string;
calloutWarning: string;
calloutDanger: string;
calloutInfo: string;

// Пример для ru:
calloutNote: 'На заметку',
calloutTip: 'Совет',
calloutWarning: 'Внимание',
calloutDanger: 'Важно',
calloutInfo: 'Информация',

// Пример для en:
calloutNote: 'Note',
calloutTip: 'Tip',
calloutWarning: 'Warning',
calloutDanger: 'Danger',
calloutInfo: 'Info',
```

**2b. Пробросить язык курса до MarkdownRendererFull**

Цепочка пробрасывания `courseLanguage`:

| Компонент              | Файл                                                              | Изменение                                                                                                            |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `CourseViewerEnhanced` | `packages/web/components/course/course-viewer-enhanced.tsx`       | Добавить `courseLanguage={...}` в `<LessonView>` (строка 241)                                                        |
| `LessonView`           | `packages/web/components/course/viewer/components/LessonView.tsx` | Принять `courseLanguage?: string`, пробросить в `<LessonContent>` (строка 175)                                       |
| `LessonContent`        | `packages/web/components/common/lesson-content.tsx`               | Принять `courseLanguage?: string`, пробросить в `<MarkdownRendererFull language={courseLanguage}>` (строки 390, 398) |

**2c. Добавить `language` prop в markdown-систему**

**Файл:** `packages/web/components/markdown/types.ts`

- Добавить `language?: string` в `MarkdownRendererProps` (строка 46)
- Добавить `language?: string` в `CalloutProps` (строка 103)

**Файл:** `packages/web/components/markdown/MarkdownRendererFull.tsx`

- Принять `language` из props
- Передать в `tryParseCallout(children, language)` → `<Callout type={type} language={language}>`

**Файл:** `packages/web/components/markdown/MarkdownRenderer.tsx`

- Аналогично — принять `language`, передать в `<Callout>`

**2d. Использовать локализованные заголовки в Callout**

**Файл:** `packages/web/components/markdown/components/Callout.tsx`

- Импортировать `getContentLabels` из `@megacampus/shared-types`
- Принять `language?: string` prop
- Заменить хардкод `defaultTitles` на динамические из `CONTENT_LABELS`:

```typescript
const labels = language ? getContentLabels(language) : null;
const displayTitle =
  title ||
  (labels
    ? {
        note: labels.calloutNote,
        tip: labels.calloutTip,
        warning: labels.calloutWarning,
        danger: labels.calloutDanger,
        info: labels.calloutInfo,
      }[type]
    : defaultTitles[type]);
```

### 3. Промпт — явный запрет кавычек вокруг маркеров

**Файл:** `packages/course-gen-platform/src/shared/prompts/stage6-prompts.ts`

В обе секции `<visual_toolkit>`:

- `stage6_serial_generator` (~строка 120)
- `stage6_single_call_generator` (~строка 345)

Добавить после списка callout типов:

```
CRITICAL: Callout marker must start immediately after >. NEVER wrap in quotes.
WRONG: > "[!TIP] text"
CORRECT: > [!TIP]
> text here
```

## Файлы для изменения (полный список)

1. `packages/web/components/markdown/MarkdownRendererFull.tsx` — regex fix + language prop
2. `packages/web/components/markdown/MarkdownRenderer.tsx` — regex fix + language prop
3. `packages/web/components/markdown/components/Callout.tsx` — локализованные заголовки
4. `packages/web/components/markdown/types.ts` — language в props
5. `packages/web/components/common/lesson-content.tsx` — проброс language
6. `packages/web/components/course/viewer/components/LessonView.tsx` — проброс courseLanguage
7. `packages/web/components/course/course-viewer-enhanced.tsx` — передать course.language
8. `packages/shared-types/src/common-enums.ts` — callout-лейблы для 19 языков
9. `packages/course-gen-platform/src/shared/prompts/stage6-prompts.ts` — запрет кавычек в промптах

## Верификация

1. `pnpm type-check` — нет TS-ошибок
2. `pnpm --filter web build` — сборка
3. `pnpm --filter web test` — тесты callout проходят
4. `pnpm --filter shared-types build` — сборка shared-types
5. Визуальная проверка на dev.ai.megacampus.ru — callout-блоки отображаются с иконками, цветами и русскими заголовками
