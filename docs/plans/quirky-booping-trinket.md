# План: Реализация чата для корректировки курса во время генерации

## Проблема

1. **Frontend чата существует**, но backend endpoint `generation.refine` **не реализован**
2. **Общий чат** на странице генерации отсутствует полностью
3. **Модели для чата** не настроены в `llm_model_config`

## Сценарии использования

| Сценарий              | Чат               | Пример                                     |
| --------------------- | ----------------- | ------------------------------------------ |
| Корректировка деталей | NodeDetailsDrawer | "Добавь больше примеров в этот урок"       |
| Полная перегенерация  | Глобальный чат    | "Перегенерируй курс с фокусом на практику" |

## Архитектура решения

### 1. Backend: Единый endpoint `generation.chat`

**Файл:** `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`

```typescript
interface ChatRequest {
  courseId: string;
  chatType: 'node' | 'global';
  userMessage: string;
  conversationId?: string;
  nodeContext?: {
    stageId: string;
    nodeId?: string;
    blockPath?: string;
  };
  previousOutput?: string;
}
```

**Обработка:**

- `chatType: 'node'` + refinement → Синхронная обработка (быстрый feedback)
- `chatType: 'global'` + regeneration → Async через BullMQ job

### 2. Определение intent (rule-based для MVP)

```typescript
function classifyIntent(message: string): 'refine' | 'regenerate' {
  const regenerateKeywords = [
    'перегенерируй',
    'regenerate',
    'заново',
    'с нуля',
    'весь курс',
    'полностью',
  ];
  return regenerateKeywords.some(kw => message.toLowerCase().includes(kw))
    ? 'regenerate'
    : 'refine';
}
```

### 3. Что отдаём в LLM

| Сценарий          | Контекст                                               |
| ----------------- | ------------------------------------------------------ |
| Node refinement   | Course metadata + current node content + sibling nodes |
| Full regeneration | Full course structure + source documents               |

**System prompt структура:**

```
<course_context>
  Title, Language, Style, Target Audience
</course_context>
<current_content>
  JSON текущего контента
</current_content>
<instructions>
  - Respond in user's language
  - Return JSON в той же структуре
  - Preserve pedagogical structure
</instructions>
```

### 4. Модели в llm_model_config

```sql
-- Node refinement (синхронный, conversational)
INSERT INTO llm_model_config (phase_name, model_id, temperature, max_tokens, language)
VALUES ('chat_node_refinement', 'openai/gpt-4o', 0.7, 4096, 'any');

-- Global guidance
INSERT INTO llm_model_config (phase_name, model_id, temperature, max_tokens, language)
VALUES ('chat_global_guidance', 'openai/gpt-4o', 0.7, 2048, 'any');

-- Full regeneration (async, premium)
INSERT INTO llm_model_config (phase_name, model_id, temperature, max_tokens, language)
VALUES ('chat_full_regeneration', 'anthropic/claude-sonnet-4', 0.6, 16000, 'any');
```

### 5. UI: Глобальный чат

**Расположение:** Bottom panel (как терминал в VS Code)

**Компонент:** `packages/web/components/generation/GlobalCourseChat.tsx`

```tsx
- Коллапсируемая панель внизу страницы генерации
- Quick actions: "Добавить практики", "Сократить", "Перегенерировать"
- История сообщений
- Input с кнопкой отправки
```

### 6. БД: Таблица для истории чата

```sql
CREATE TABLE course_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  conversation_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  chat_type TEXT NOT NULL CHECK (chat_type IN ('node', 'global')),
  node_context JSONB,
  intent TEXT,
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## План реализации

### Phase 1: Backend Foundation

1. **Миграция БД**
   - `course_chat_messages` таблица
   - Seed моделей в `llm_model_config`

2. **Chat router**
   - Файл: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`
   - Endpoint: `generation.chat`
   - Intent classification (rule-based)
   - Context assembly (reuse from regeneration)
   - LLM call + response handling

3. **Регистрация в app-router**
   - Добавить в `generationRouter`

### Phase 2: Node Refinement Integration

4. **Update useRefinement hook**
   - Файл: `packages/web/components/generation-graph/hooks/useRefinement.ts`
   - Вызывать `generation.chat` вместо `generation.refine`
   - Добавить conversation state

5. **Update RefinementChat component**
   - Файл: `packages/web/components/generation-graph/panels/RefinementChat.tsx`
   - Показывать ответы assistant в истории
   - Multi-turn conversation support

### Phase 3: Global Chat UI

6. **GlobalCourseChat component**
   - Файл: `packages/web/components/generation/GlobalCourseChat.tsx`
   - Bottom panel layout
   - Quick actions
   - Message history

7. **Интеграция в страницу генерации**
   - Файл: `packages/web/app/[locale]/courses/generating/[slug]/page.tsx`
   - Добавить GlobalCourseChat

### Phase 4: Full Regeneration

8. **COURSE_REGENERATION job type**
   - Новый job handler в orchestrator
   - Progress tracking через realtime

## Критические файлы

| Файл                                                                       | Изменение                       |
| -------------------------------------------------------------------------- | ------------------------------- |
| `course-gen-platform/src/server/routers/generation/editing/chat.router.ts` | **Создать** - основной endpoint |
| `course-gen-platform/src/server/routers/generation/index.ts`               | Добавить chatRouter             |
| `web/components/generation-graph/hooks/useRefinement.ts`                   | Update endpoint call            |
| `web/components/generation-graph/panels/RefinementChat.tsx`                | Add assistant messages          |
| `web/components/generation/GlobalCourseChat.tsx`                           | **Создать** - UI компонент      |
| `web/app/[locale]/courses/generating/[slug]/page.tsx`                      | Integrate GlobalCourseChat      |
| `supabase/migrations/YYYYMMDD_chat_messages.sql`                           | **Создать** - БД миграция       |

## Верификация

1. **Unit tests:** chat.router.ts intent classification
2. **Integration:** Send message → see response in chat history
3. **E2E:** Full refinement flow через UI
4. **Manual:** Test quick actions, multi-turn conversation
