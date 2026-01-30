# План: Добавление поддержки стиля курса в Stage 7

## Проблема

`course.style` (writing style: professional, gamified, conversational и т.д.) выбирается на фронтенде и используется в Stage 5/6, но **НЕ передаётся в Stage 7** для генерации quiz, video, presentation.

## Текущее состояние

| Компонент              | `course.style` загружается? | Используется? |
| ---------------------- | --------------------------- | ------------- |
| database-service.ts    | ❌ Нет в SELECT             | —             |
| types/index.ts         | ❌ Нет в типе               | —             |
| quiz-prompt.ts         | —                           | ❌            |
| video-prompt.ts        | —                           | ❌            |
| presentation-prompt.ts | —                           | ❌            |
| audio-prompt.ts        | —                           | N/A (TTS)     |

## План изменений

### 1. Загрузка style из БД

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`

Строка ~70: добавить `style` в SELECT:

```typescript
.select('id, title, language, course_description, visual_style, settings, style')
```

### 2. Обновление типа EnrichmentWithContext

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts`

Строки 160-170: добавить поле в `course`:

```typescript
course: {
  // ... existing fields
  /** Writing style for content generation (from shared-types COURSE_STYLES) */
  style?: string | null;
};
```

### 3. Quiz Prompt

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts`

3.1. Добавить в `QuizPromptParams` (строка ~70):

```typescript
/** Course writing style prompt for tone consistency */
stylePrompt?: string;
```

3.2. Добавить `<STYLE>` секцию в `buildQuizUserMessage` (после SETTINGS):

```typescript
${params.stylePrompt ? `<STYLE>\n${sanitizeForPrompt(params.stylePrompt)}\n</STYLE>` : ''}
```

3.3. Добавить инструкции в system prompt после "Language Considerations":

```
# Style Considerations

If a <STYLE> tag is provided, adapt your quiz tone and language to match:
- Apply the specified style to question wording, explanations, and instructions
- Keep technical accuracy while adjusting formality and engagement level
- Example: "gamified" style uses quest/achievement language; "professional" uses formal business language
```

### 4. Video Prompt

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/video-prompt.ts`

4.1. Добавить в `VideoScriptParams` (строка ~57):

```typescript
/** Course writing style prompt for tone consistency */
stylePrompt?: string;
```

4.2. Добавить `<STYLE>` секцию в `buildVideoScriptUserMessage` (после SETTINGS).

4.3. Обновить system prompt: стиль курса имеет приоритет над дефолтным tone.

### 5. Presentation Prompt

**Файл:** `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/presentation-prompt.ts`

5.1. Добавить в `PresentationPromptParams` (строка ~64):

```typescript
/** Course writing style prompt for tone consistency */
stylePrompt?: string;
```

5.2. Добавить `<STYLE>` секцию в `buildPresentationDraftUserMessage` и `buildPresentationFinalUserMessage`.

5.3. Обновить system prompts с инструкциями по стилю.

### 6. Handlers - передача stylePrompt

**Quiz Handler:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts`

Строка 24 - добавить импорт:

```typescript
import { DEFAULT_MODEL_ID, getStylePrompt } from '@megacampus/shared-types';
```

Строки 185-191 - добавить stylePrompt в вызов:

```typescript
const userPrompt = buildQuizUserMessage({
  lessonTitle: enrichmentContext.lesson.title,
  lessonContent,
  lessonObjectives,
  language: (enrichmentContext.course.language || 'en') as 'en' | 'ru',
  settings: quizSettings,
  stylePrompt: getStylePrompt(enrichmentContext.course.style), // NEW
});
```

**Video Handler:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/video-handler.ts`

Аналогично quiz - добавить `getStylePrompt` в импорт и передать в `buildVideoScriptUserMessage`.

**Presentation Handler:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/presentation-handler.ts`

Аналогично - добавить `getStylePrompt` в импорт и передать в draft/final user messages.

## Файлы для изменения

1. `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`
2. `packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts`
3. `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts`
4. `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/video-prompt.ts`
5. `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/presentation-prompt.ts`
6. `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts`
7. `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/video-handler.ts`
8. `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/presentation-handler.ts`

## Верификация

1. **Type-check:** `pnpm type-check`
2. **Build:** `pnpm build`
3. **Ручной тест:**
   - Создать курс с `style: "gamified"`
   - Сгенерировать урок
   - Запустить генерацию quiz/video/presentation
   - Проверить что тон контента соответствует стилю (quest language, achievements)
