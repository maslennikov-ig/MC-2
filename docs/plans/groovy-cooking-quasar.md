# Fix: Empty Chat Bubble + Blank Lesson Content

## Context

Тестер (Лилия Кустова) сообщила о двух багах на dev-окружении:

1. **EGT-1521**: Пустой пузырь ассистента в чате уточнения (Refinement Chat)
2. **GDK-6714**: Полностью белая область контента урока при открытии Stage 6 ноды

## Database Investigation Results

### LLM ответы — ВСЕ НОРМАЛЬНЫЕ

- EGT-1521: 6 сообщений в `course_chat_messages`, все с валидным JSON (модель `xiaomi/mimo-v2-flash`)
- Последнее сообщение в БД: 20:53. Скриншот тестера: 23:44 — **сообщение в 23:44 НЕ сохранилось в БД**
- GDK-6714: ответ ассистента "Я понимаю вашу просьбу о проверке дат..." — plain text, нормальный

### Контент уроков — ВСЕ ЕСТЬ В БД

- GDK-6714: 24 урока, контент 3K-65K символов, `markdownContent` присутствует у всех
- Урок "Антихрупкость как система" = 41K символов, markdown = 40K символов
- Тестер (liliya.kustova) = владелец курса → RLS не блокирует

### Вывод: проблема — на фронтенде, не в ИИ и не в данных

## Root Cause Analysis

### Bug 1: Empty Chat Bubble (EGT-1521)

Сообщение в 23:44 НЕ попало в БД. Два возможных сценария:

**Сценарий A: Ответ LLM в формате markdown code block**

- В БД видно, что 2-й ответ начинается с ` ```json\n{ ` (markdown code block)
- Фронтенд проверка: `msg.content.trimStart().startsWith('{')` → **НЕ** начинается с `{`, начинается с ` ``` `
- Контент проходит проверку → передаётся в MarkdownRendererClient
- MarkdownRendererClient через Streamdown рендерит code block с JSON — может отображаться криво или пусто

**Сценарий B: Запрос упал, persistence не сработал**

- `persistAssistantMessage()` — non-blocking (line 507-518), логирует warning при ошибке
- Если LLM вызов или parsing упал с ошибкой → TRPCError → фронтенд ловит в catch → показывает toast
- Но если ошибка произошла ПОСЛЕ persistence (в buildChatResponseWithProposal) → сообщение не сохранено, ответ не пришёл
- Фронтенд не добавляет пустой пузырь при ошибке (line 164: удаляет pending)

**Сценарий C: Frontend fallback для raw JSON не срабатывает**

- Проверка `!msg.content.trimStart().startsWith('{')` пропускает ответы, обёрнутые в ` ```json ` блоки
- MarkdownRendererClient рендерит код-блок, но Streamdown может проглотить содержимое

### Bug 2: Blank Lesson Content (GDK-6714)

Данные есть (40K markdown), но страница белая. Три гипотезы:

**Гипотеза A: Ошибка в цепочке фетчинга**

- `useLessonInspectorData` делает 4-шаговый запрос: sections → lessons → lesson_contents → generation_trace
- Если любой шаг возвращает ошибку или null → данные не загружаются
- При `contentData = null`: `rawMarkdown = null`, `content = null` → должно показать "Контент урока недоступен"
- Но скриншот показывает ПУСТУЮ страницу, а не это сообщение — значит, ошибка выше, на уровне LessonInspector

**Гипотеза B: Парсинг lessonId**

- Hook парсит `lessonId` (e.g., "1.1") → `moduleNumber=1, lessonNumber=1`
- Check: `!moduleNumber || !lessonNumber` → если 0, то `!0 = true` → early return
- DB: sections и lessons с `order_index` начиная с 1 — ОК для "1.1"
- Но если граф использует 0-based ("0.0"), то хук МОЛЧА возвращается → `data = null` → loading forever

**Гипотеза C: React rendering issue**

- `LessonInspector` при `data = null` показывает "Данные урока не найдены"
- Если `isLoading = true` застревает → бесконечный спиннер
- ErrorBoundary ловит исключения → но silent failures не ловятся

## Implementation Plan

### 1. Frontend: Robustify content checks (RefinementChat.tsx)

**File:** `packages/web/components/generation-graph/panels/RefinementChat.tsx:279-288`

```tsx
// BEFORE (line 282-284):
msg.content && !msg.content.trimStart().startsWith('{')
  ? msg.content
  : t('refinementChat.proposal.emptyResponseFallback');

// AFTER:
msg.content?.trim() && !msg.content.trimStart().startsWith('{')
  ? msg.content
  : t('refinementChat.proposal.emptyResponseFallback');
```

Добавляем `.trim()` в проверку — whitespace-only контент теперь будет falsy → используется fallback.

### 2. Frontend: Fix blank content area (Stage6InspectorContent.tsx)

**File:** `packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx:257-261`

```tsx
// BEFORE (line 257):
if (!rawMarkdown && !content) {

// AFTER:
if (!rawMarkdown?.trim() && !content) {
```

Также fix `MarkdownRendererFull` call (line 275-276):

```tsx
// BEFORE:
content={rawMarkdown || ''}

// AFTER:
content={rawMarkdown?.trim() ? rawMarkdown : ''}
```

Это обеспечит, что whitespace-only `rawMarkdown` не будет рендериться как пустая страница — вместо этого покажется "Контент урока недоступен".

### 3. MarkdownRendererClient: guard against whitespace-only (defense in depth)

**File:** `packages/web/components/markdown/MarkdownRendererClient.tsx:70-71`

```tsx
// BEFORE:
if (!content) {
  return <div className={wrapperClassName} />;
}

// AFTER:
if (!content?.trim()) {
  return <div className={wrapperClassName} />;
}
```

### 4. MarkdownRendererFull: same guard

**File:** `packages/web/components/markdown/MarkdownRendererFull.tsx:284-285`

```tsx
// BEFORE:
if (!content) {
  return <article className={wrapperClassName} />;
}

// AFTER:
if (!content?.trim()) {
  return <article className={wrapperClassName} />;
}
```

### 5. Backend: guard assistantMessage (defense in depth)

**File:** `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts:204-209`

```typescript
// BEFORE (line 204-206):
if (!targetedMessage) {
  targetedMessage = targetedLLMResponse.content;
}
if (!targetedMessage) {
  targetedMessage = 'Предложены изменения. Проверьте детали ниже.';
}

// AFTER:
if (!targetedMessage?.trim()) {
  targetedMessage = targetedLLMResponse.content;
}
if (!targetedMessage?.trim()) {
  targetedMessage = 'Предложены изменения. Проверьте детали ниже.';
}
```

**File:** `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts:422-432`

```typescript
// Same pattern — replace !assistantMessage → !assistantMessage?.trim()
let assistantMessage = parsedProposal.summary;
if (!assistantMessage?.trim()) {
  assistantMessage = parsedProposal.updates
    .map(u => u.description)
    .filter(Boolean)
    .join('; ');
}
if (!assistantMessage?.trim()) {
  assistantMessage = 'Предложены изменения. Проверьте детали ниже.';
}
```

Also in `buildChatResponseWithProposal()` at line 444 — guard the fallback to raw content:

```typescript
// BEFORE (line 444):
return { assistantMessage: llmContent, proposal: undefined };

// AFTER:
return {
  assistantMessage: llmContent?.trim() || 'Не удалось получить ответ. Попробуйте ещё раз.',
  proposal: undefined,
};
```

### 6. Zod schema: add .min(1) constraint

**File:** `packages/shared-types/src/chat-types.ts:148`

```typescript
// BEFORE:
assistantMessage: z.string(),

// AFTER:
assistantMessage: z.string().min(1),
```

Это добавит валидацию на уровне Zod — если бэкенд вернёт пустую строку, server action выбросит ошибку, которую хук обработает и покажет toast пользователю вместо пустого пузыря.

## Files to Modify

| File                                                                                          | Change                                         |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx`                          | `.trim()` в проверке content                   |
| `packages/web/components/generation-graph/panels/stage6/inspector/Stage6InspectorContent.tsx` | `.trim()` в проверке rawMarkdown               |
| `packages/web/components/markdown/MarkdownRendererClient.tsx`                                 | Guard whitespace-only content                  |
| `packages/web/components/markdown/MarkdownRendererFull.tsx`                                   | Guard whitespace-only content                  |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`      | `.trim()` в fallback chain                     |
| `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts` | `.trim()` в fallback chain + guard raw content |
| `packages/shared-types/src/chat-types.ts`                                                     | `.min(1)` для assistantMessage                 |

## Verification

1. **Type-check**: `pnpm type-check` — убедиться что `.trim()` не ломает типы
2. **Build**: `pnpm build` — проверить сборку
3. **Unit tests**: `pnpm --filter course-gen-platform test` — убедиться backend тесты проходят
4. **Manual test**: Открыть курс на dev, попробовать отправить сообщение в чат уточнения, проверить что ответ показывается
5. **Manual test**: Открыть урок Stage 6, проверить что контент отображается
6. **Edge cases**: Отправить в чат запрос на структурное изменение (добавить/удалить урок) — ответ должен содержать fallback текст, а не пустой пузырь
