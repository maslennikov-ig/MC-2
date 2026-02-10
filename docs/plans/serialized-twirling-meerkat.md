# Fix: Empty Chat Bubble + Irrelevant Proposals in Refinement Chat

## Context

Тестер обнаружила два бага в чате уточнений (RefinementChat):

1. **Пустой пузырёк ответа AI** — при получении proposal с изменениями, в чате не отображается текстовый ответ ассистента (пустой серый пузырёк + timestamp, без текста). Proposals ниже отображаются корректно.

2. **Нерелевантные правки** — пользователь попросил "добавь урок про Apple", а AI предложил правки к description, learning_objectives, duration — вместо того чтобы сообщить, что добавление урока через refine невозможно, нужен regenerate.

## Root Cause Analysis

### Bug 1: Empty bubble

Цепочка данных: LLM → JSON `{message, updates}` → `parseProposalFromLLMResponse()` → `summary = message` → `buildChatResponseWithProposal()`: `assistantMessage = summary || llmContent`

**Проблема:** Промпт (`buildRefinementPrompt`, `buildTargetedRefinementPrompt`) просит LLM вернуть **только JSON**:

> "IMPORTANT: You MUST respond with a valid JSON object (no markdown code blocks)"

LLM возвращает чистый JSON вида:

```json
{"message": "Обновил описание...", "updates": [...]}
```

Если `message` непустой → `assistantMessage = message` — это работает.
Но если LLM вернёт пустой `message: ""` → `"" || llmContent` → `assistantMessage = llmContent` = **сырой JSON**, который `MarkdownRendererClient` рендерит некорректно (JSON-блоки как code blocks, или вообще схлопывает).

Также есть второй путь: через `chat-intent-flow.ts` → `handleLLMRequiredRoute()` → строка 196: `targetedProposal?.summary || targetedLLMResponse.content` — тот же паттерн.

**Реальная причина на скриншоте:** Скорее всего `message` поле пустое или содержит минимальный текст, и `MarkdownRendererClient preset="chat"` рендерит его как невидимый контент.

### Bug 2: Irrelevant proposals

Система поддерживает ТОЛЬКО редактирование существующих полей через whitelist. `ADD_LESSON`/`ADD_SECTION` интенты определены в `intentInstructions` (chat-helpers.ts:97-103), но:

- Парсер `parseProposalFromLLMResponse()` валидирует пути по whitelist
- Whitelist содержит только `sections[*].lesson_title`, `section_description` и т.д.
- Добавление нового урока (новый индекс в массиве) не поддерживается

LLM пытается "подогнать" запрос под доступные поля → предлагает нерелевантные правки.

---

## Plan

### Fix 1: Ensure assistantMessage is always human-readable

**File:** `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts`

В `buildChatResponseWithProposal()` (строка 393-431):

- Если `parsedProposal.summary` пустой — сгенерировать summary из описаний updates:
  ```
  const autoSummary = proposal.updates.map(u => u.description).filter(Boolean).join('; ')
  assistantMessage = summary || autoSummary || 'Предложены изменения. Проверьте детали ниже.'
  ```

**File:** `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts`

В `handleLLMRequiredRoute()` (строка 196):

- Аналогичный fallback: если `targetedProposal?.summary` пустой, собрать из описаний updates

**File:** `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts`

В промптах `buildRefinementPrompt()` и `buildTargetedRefinementPrompt()`:

- Добавить в правила: "The 'message' field MUST contain a clear Russian explanation (2-3 sentences) of what you're proposing and why. Never leave it empty."

### Fix 2: Guard against structural requests in refinement prompts

**File:** `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts`

В `buildRefinementPrompt()` и `buildTargetedRefinementPrompt()`:

- Добавить правило:
  ```
  "If the user asks to ADD a new lesson or section, return empty updates and explain in 'message' that structural changes (adding/removing lessons) require using 'Перегенерировать' mode, not 'Уточнить'."
  ```

Это инструктирует LLM не делать нерелевантные правки, а честно сообщить пользователю.

### Fix 3: Frontend fallback for empty assistant messages

**File:** `packages/web/components/generation-graph/panels/RefinementChat.tsx`

В рендеринге assistant messages (строка 279-284):

- Добавить проверку: если `msg.content` пустой или является raw JSON → показать fallback текст "Смотрите предложенные изменения ниже"

---

## Files to Modify

1. `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts` — `buildChatResponseWithProposal()`
2. `packages/course-gen-platform/src/server/routers/generation/editing/chat-intent-flow.ts` — `handleLLMRequiredRoute()`
3. `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts` — промпты + `parseProposalFromLLMResponse`
4. `packages/web/components/generation-graph/panels/RefinementChat.tsx` — frontend fallback

## Verification

1. `pnpm --filter course-gen-platform type-check` — типы
2. `pnpm --filter web type-check` — фронтенд типы
3. `npx vitest run "useRefinement"` — юнит-тесты хука (из packages/web)
4. `npx vitest run "RefinementChat"` — юнит-тесты компонента
5. `npx vitest run "chat"` — бэкенд тесты чата (из packages/course-gen-platform)
6. Ручная проверка: отправить запрос "добавь урок про X" → AI должен ответить текстом что нужен режим "Перегенерировать"
