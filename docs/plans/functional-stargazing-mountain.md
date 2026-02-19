# Fix: Callout blocks not rendering in lesson viewer

## Phase 0: Visual Preview Page

Создать простую страницу `/test/callouts` для визуальной оценки оформления callout-блоков.
Страница покажет все 5 типов callout (note, tip, warning, danger, info) с русской локализацией,
в контексте `prose` класса, как они будут выглядеть в уроках после фикса.

**Файл**: `packages/web/app/test/callouts/page.tsx`

---

## Context

Callout-блоки (`> [!TIP]`, `> [!WARNING]`, `> [!NOTE]` и т.д.) в уроках не обнаруживаются парсером и рендерятся как обычные `<blockquote>`. Tailwind `prose` класс добавляет CSS-кавычки (`::before`/`::after` pseudo-elements) к blockquote, из-за чего текст выглядит как цитата с `"..."`. Заголовки callout не локализуются, т.к. компонент `<Callout>` (который отвечает за локализацию) не рендерится вообще.

**Связанные задачи**: mc2-kv8s (closed), mc2-wvzz (closed) — предыдущие попытки фикса, которые не решили проблему.

## Root Cause

В `react-markdown` v10.1.0 при рендеринге blockquote, `React.Children.toArray(children)` содержит whitespace text-ноды (`"\n"`) между блочными элементами. Текущий код берёт `[0]`, который оказывается `"\n"`, а не `<p>`:

```javascript
// СЕЙЧАС (сломано):
const firstChild = React.Children.toArray(children)[0]
// ↑ Получает "\n" вместо <p>

if (React.isValidElement(firstChild) && firstChild.type === 'p') {
  // Проверка ВСЕГДА false, т.к. firstChild === "\n"
```

**Подтверждение**: Данные в БД хранятся корректно, без кавычек:

```
> [!TIP]\n> **Действие:** Начните с малого...
```

Кавычки — это CSS pseudo-elements от `.prose blockquote p::before { content: open-quote; }`.

## Plan

### 1. Создать shared утилиту `callout-parser.ts`

**Файл**: `packages/web/components/markdown/utils/callout-parser.ts`

Извлечь логику парсинга callout из обоих рендереров в единую утилиту `parseCalloutFromChildren(children, language?)`:

- Использовать `.find(child => React.isValidElement(child) && child.type === 'p')` вместо `[0]` для пропуска whitespace-нод
- Обработка `pChildren`: string, array (с текстовыми и React-элементными фрагментами)
- Regex для обнаружения: `/^[\s"'«»\u201C\u201D]*\[!(NOTE|TIP|WARNING|DANGER|INFO)\]/i`
- Корректная реконструкция children: удаление маркера `[!TYPE]` из первого текстового фрагмента, сохранение inline-форматирования (`<strong>`, `<em>`) и остальных параграфов

### 2. Обновить `MarkdownRendererFull.tsx`

**Файл**: `packages/web/components/markdown/MarkdownRendererFull.tsx`

- Импортировать `parseCalloutFromChildren` из новой утилиты
- Заменить функцию `tryParseCallout` (строки 222-257) на вызов shared утилиты
- Удалить старую `tryParseCallout`

### 3. Обновить `MarkdownRenderer.tsx`

**Файл**: `packages/web/components/markdown/MarkdownRenderer.tsx`

- Импортировать `parseCalloutFromChildren` из новой утилиты
- Заменить inline-логику callout detection в `blockquote` компоненте (строки 220-268) на вызов shared утилиты

### 4. Обновить тесты

**Файл**: `packages/web/components/markdown/__tests__/callout-parsing.test.tsx`

- Добавить unit-тесты для `parseCalloutFromChildren` c симуляцией структуры children из react-markdown (whitespace nodes, mixed arrays)
- Добавить интеграционный тест через `MarkdownRendererFull` с реальным markdown
- Сохранить существующие тесты (regex, Callout component, localization)

## Edge Cases

| Случай             | Markdown                     | Обработка                                                    |
| ------------------ | ---------------------------- | ------------------------------------------------------------ |
| Стандартный        | `> [!TIP]\n> Content`        | 1 `<p>` с `"[!TIP]\nContent"`, regex match                   |
| Однострочный       | `> [!TIP] Content`           | 1 `<p>` с `"[!TIP] Content"`, regex match                    |
| С форматированием  | `> [!TIP]\n> **Bold:** text` | Array: `["[!TIP]\n", <strong>, " text"]`, first string match |
| Многоабзацный      | `> [!TIP]\n> P1\n>\n> P2`    | Несколько `<p>`, первый содержит маркер                      |
| С кавычками LLM    | `> "[!TIP] text"`            | Regex уже обрабатывает leading quotes                        |
| Обычный blockquote | `> Just a quote`             | `parseCalloutFromChildren` → null, fallback `<blockquote>`   |

## Critical Files

| Файл                                                                  | Действие        |
| --------------------------------------------------------------------- | --------------- |
| `packages/web/components/markdown/utils/callout-parser.ts`            | Создать (новый) |
| `packages/web/components/markdown/MarkdownRendererFull.tsx`           | Изменить        |
| `packages/web/components/markdown/MarkdownRenderer.tsx`               | Изменить        |
| `packages/web/components/markdown/__tests__/callout-parsing.test.tsx` | Изменить        |

**Без изменений** (переиспользуем):

- `packages/web/components/markdown/components/Callout.tsx` — компонент уже готов, локализация на 19 языков работает
- `packages/web/components/markdown/types.ts` — типы `CalloutType`, `CalloutProps` уже определены
- `packages/web/components/markdown/presets.ts` — `callouts: true` для lesson/preview пресетов
- `courseLanguage` prop — уже проброшен через всю цепочку компонентов

## Verification

1. `pnpm type-check` — проверка типов
2. `pnpm --filter web vitest run components/markdown/__tests__/callout-parsing` — тесты callout
3. `pnpm build` — сборка
4. Визуальная проверка: открыть урок "Счастье как процесс" (`lesson_id: 5031ac57-b312-4a8f-917d-f48d05a606bf`) в viewer, убедиться что [!TIP] и [!WARNING] рендерятся как стилизованные callout-блоки с иконками и локализованными заголовками на русском
