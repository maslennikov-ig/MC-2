# План: Оптимизация чата для редактирования курса

> **Статус**: Draft
> **Приоритет**: P1
> **Оценка**: 2-3 дня
> **Research**: [Building LLM-powered document editing systems](../research/Building%20LLM-powered%20document%20editing%20systems%20in%202025.md), [User Intent Taxonomy](../research/User%20Intent%20Taxonomy%20for%20LLM-Powered%20Course%20Editing.md), [Course Editing Chat System](../research/Course%20Editing%20Chat%20System.md)

---

## 1. Проблема

При запросе в чат (например, "удали урок 2.3"):

1. Отправляется **весь** `course_structure` (~42K токенов)
2. LLM регенерирует весь JSON
3. Высокая стоимость, задержка 60+ секунд, риск truncation

**Текущий flow** (`chat.router.ts:98-133`):

```typescript
// buildRefinementPrompt отправляет ВСЁ
return `...
Current content:
${JSON.stringify(currentData, null, 2)}  // <-- 42K токенов!
...`;
```

---

## 2. Решение

### Архитектура

```
User: "удали урок 2.3"
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Intent Classification (Xiaomi, ~100-200 токенов)       │
│  Structured Output с Zod schema                         │
└─────────────────────────────────────────────────────────┘
    │
    ├─► intent: DELETE_LESSON, target: "sections[0].lessons[2]"
    │       ▼
    │   element-crud.router.deleteElement()  ← существующий код
    │   0 токенов на генерацию, ~200ms
    │
    ├─► intent: MOVE_LESSON, target: "...", destination: "..."
    │       ▼
    │   course-structure-editor.moveElement()  ← новая функция
    │   0 токенов на генерацию
    │
    └─► intent: REWRITE_CONTENT, target: "sections[0].lessons[2]"
            ▼
        LLM + Targeted Context (только этот урок, ~500 токенов)
        Вместо 42K → 500 токенов = **-98% стоимости**
```

### Ключевые изменения

| Изменение                 | Эффект               | Сложность         |
| ------------------------- | -------------------- | ----------------- |
| **Intent Classification** | Routing без full LLM | Низкая            |
| **Direct Execution**      | DELETE/MOVE без LLM  | Низкая (код есть) |
| **Targeted Context**      | -98% токенов         | Низкая            |

---

## 3. Детали реализации

### 3.1 Intent Classification Service (новый)

**Файл**: `packages/course-gen-platform/src/shared/intent/classifier.ts`

```typescript
import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';

// ============================================================================
// Intent Schema (Zod + OpenRouter Structured Output)
// ============================================================================

export const IntentSchema = z.object({
  intent: z.enum([
    'DELETE_LESSON',
    'DELETE_SECTION',
    'MOVE_ELEMENT',
    'UPDATE_FIELD',
    'REWRITE_CONTENT',
    'EXPAND_CONTENT',
    'SIMPLIFY_CONTENT',
    'ADD_LESSON',
    'ADD_SECTION',
    'GET_INFO',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  target: z
    .object({
      elementType: z.enum(['lesson', 'section', 'course', 'field']).optional(),
      path: z.string().optional(), // "sections[0].lessons[2]"
      identifier: z.string().optional(), // "урок 2.3", "секция Введение"
    })
    .optional(),
  destination: z.string().optional(), // Для MOVE_ELEMENT
  fieldName: z.string().optional(), // Для UPDATE_FIELD
  newValue: z.unknown().optional(), // Для UPDATE_FIELD
});

export type ClassifiedIntent = z.infer<typeof IntentSchema>;

// ============================================================================
// Classification Prompt
// ============================================================================

const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a course editing system.
Classify the user's message into one of these intents:

STRUCTURAL OPERATIONS (no content generation needed):
- DELETE_LESSON: Remove a specific lesson (e.g., "удали урок 2.3", "remove lesson")
- DELETE_SECTION: Remove a section with all lessons (e.g., "удали секцию", "delete section")
- MOVE_ELEMENT: Relocate lesson/section (e.g., "перенеси урок в секцию 2", "move lesson")
- UPDATE_FIELD: Change specific field value (e.g., "измени название на X", "set duration to 20")

CONTENT MODIFICATION (requires LLM generation):
- REWRITE_CONTENT: Transform content style (e.g., "перепиши проще", "rewrite clearly")
- EXPAND_CONTENT: Add detail/depth (e.g., "расширь", "add more detail")
- SIMPLIFY_CONTENT: Reduce complexity (e.g., "упрости", "make simpler")
- ADD_LESSON: Create new lesson (e.g., "добавь урок про X", "add lesson about")
- ADD_SECTION: Create new section (e.g., "добавь секцию", "create section")

QUERY:
- GET_INFO: Request information (e.g., "сколько уроков?", "what's the duration?")

- UNKNOWN: Cannot determine intent

RULES:
1. For DELETE/MOVE/UPDATE: Extract the target element path or identifier
2. For MOVE: Also extract the destination
3. For UPDATE_FIELD: Extract field name and new value
4. Set confidence 0.0-1.0 based on clarity of the request
5. If user selected a specific element (nodeContext provided), use that as target

Current context: User is viewing {nodeContext}`;

// ============================================================================
// Classifier Implementation
// ============================================================================

export async function classifyIntent(
  userMessage: string,
  nodeContext?: { stageId: string; path?: string; elementType?: string },
  client?: OpenAI
): Promise<ClassifiedIntent> {
  const openai =
    client ||
    new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });

  const contextDescription = nodeContext
    ? `${nodeContext.elementType || 'element'} at ${nodeContext.path || 'course level'}`
    : 'course overview';

  const systemPrompt = CLASSIFICATION_SYSTEM_PROMPT.replace('{nodeContext}', contextDescription);

  // Using OpenRouter Structured Output (Context7 documentation)
  const response = await openai.chat.completions.create({
    model: process.env.CHAT_FALLBACK_MODEL || 'xiaomi/mimo-v2-flash',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 200, // Classification needs few tokens
    temperature: 0.1, // Low temperature for consistent classification
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'intent_classification',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              enum: [
                'DELETE_LESSON',
                'DELETE_SECTION',
                'MOVE_ELEMENT',
                'UPDATE_FIELD',
                'REWRITE_CONTENT',
                'EXPAND_CONTENT',
                'SIMPLIFY_CONTENT',
                'ADD_LESSON',
                'ADD_SECTION',
                'GET_INFO',
                'UNKNOWN',
              ],
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            target: {
              type: 'object',
              properties: {
                elementType: { type: 'string', enum: ['lesson', 'section', 'course', 'field'] },
                path: { type: 'string' },
                identifier: { type: 'string' },
              },
              additionalProperties: false,
            },
            destination: { type: 'string' },
            fieldName: { type: 'string' },
            newValue: {},
          },
          required: ['intent', 'confidence'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { intent: 'UNKNOWN', confidence: 0 };
  }

  try {
    const parsed = JSON.parse(content);
    return IntentSchema.parse(parsed);
  } catch {
    return { intent: 'UNKNOWN', confidence: 0 };
  }
}
```

**Файл**: `packages/course-gen-platform/src/shared/intent/index.ts`

```typescript
export { classifyIntent, IntentSchema, type ClassifiedIntent } from './classifier';
```

---

### 3.2 Target Resolution (новый)

**Файл**: `packages/course-gen-platform/src/shared/intent/target-resolver.ts`

```typescript
import type { CourseStructure, Section, Lesson } from '@megacampus/shared-types';

/**
 * Resolve user's identifier (e.g., "урок 2.3", "секция Введение") to actual path
 */
export function resolveTargetPath(
  identifier: string | undefined,
  explicitPath: string | undefined,
  courseStructure: CourseStructure,
  nodeContextPath?: string
): string | null {
  // 1. If explicit path provided, use it
  if (explicitPath) {
    return explicitPath;
  }

  // 2. If nodeContext path provided (user selected element), use it
  if (nodeContextPath) {
    return nodeContextPath;
  }

  // 3. Try to resolve from identifier
  if (!identifier) {
    return null;
  }

  // Match patterns like "урок 2.3", "lesson 2.3", "урок 1.2"
  const lessonMatch = identifier.match(/(?:урок|lesson)\s*(\d+)\.(\d+)/i);
  if (lessonMatch) {
    const [, sectionNum, lessonNum] = lessonMatch;
    const sectionIndex = parseInt(sectionNum, 10) - 1;
    const lessonIndex = parseInt(lessonNum, 10) - 1;

    if (
      courseStructure.sections[sectionIndex] &&
      courseStructure.sections[sectionIndex].lessons[lessonIndex]
    ) {
      return `sections[${sectionIndex}].lessons[${lessonIndex}]`;
    }
  }

  // Match patterns like "секция 2", "section 2", "секция Введение"
  const sectionNumMatch = identifier.match(/(?:секция|section|раздел)\s*(\d+)/i);
  if (sectionNumMatch) {
    const sectionIndex = parseInt(sectionNumMatch[1], 10) - 1;
    if (courseStructure.sections[sectionIndex]) {
      return `sections[${sectionIndex}]`;
    }
  }

  // Match by section title
  const sectionTitleMatch = identifier.match(/(?:секция|section|раздел)\s+["']?(.+?)["']?$/i);
  if (sectionTitleMatch) {
    const title = sectionTitleMatch[1].toLowerCase();
    const index = courseStructure.sections.findIndex(s =>
      s.section_title.toLowerCase().includes(title)
    );
    if (index !== -1) {
      return `sections[${index}]`;
    }
  }

  return null;
}

/**
 * Get element at path from course structure
 */
export function getElementAtPath(
  courseStructure: CourseStructure,
  path: string
): Section | Lesson | null {
  try {
    const parts = path.match(/sections\[(\d+)\](?:\.lessons\[(\d+)\])?/);
    if (!parts) return null;

    const sectionIndex = parseInt(parts[1], 10);
    const section = courseStructure.sections[sectionIndex];
    if (!section) return null;

    if (parts[2] !== undefined) {
      const lessonIndex = parseInt(parts[2], 10);
      return section.lessons[lessonIndex] || null;
    }

    return section;
  } catch {
    return null;
  }
}
```

---

### 3.3 Chat Router Refactoring

**Файл**: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`

**Изменения в функции обработки сообщений:**

```typescript
import { classifyIntent, type ClassifiedIntent } from '../../../../shared/intent';
import { resolveTargetPath, getElementAtPath } from '../../../../shared/intent/target-resolver';
import {
  deleteElement as deleteStructureElement,
  moveElement as moveStructureElement, // новая функция
} from '../../../../stages/stage5-generation/utils/course-structure-editor';

// ============================================================================
// Intent Handlers
// ============================================================================

const DIRECT_EXECUTION_INTENTS = [
  'DELETE_LESSON',
  'DELETE_SECTION',
  'MOVE_ELEMENT',
  'UPDATE_FIELD',
] as const;

const LLM_REQUIRED_INTENTS = [
  'REWRITE_CONTENT',
  'EXPAND_CONTENT',
  'SIMPLIFY_CONTENT',
  'ADD_LESSON',
  'ADD_SECTION',
] as const;

/**
 * Handle direct execution intents (no LLM generation needed)
 */
async function handleDirectIntent(
  intent: ClassifiedIntent,
  courseId: string,
  courseStructure: CourseStructure,
  supabase: SupabaseClient,
  requestId: string
): Promise<ChatResponse> {
  const targetPath = resolveTargetPath(
    intent.target?.identifier,
    intent.target?.path,
    courseStructure
  );

  if (!targetPath) {
    return {
      message:
        'Не удалось определить элемент. Уточните, какой именно урок или секцию вы хотите изменить.',
      requiresClarification: true,
    };
  }

  switch (intent.intent) {
    case 'DELETE_LESSON':
    case 'DELETE_SECTION': {
      const element = getElementAtPath(courseStructure, targetPath);
      if (!element) {
        return { message: 'Элемент не найден.' };
      }

      const isSection = !targetPath.includes('.lessons[');
      const title = isSection
        ? (element as Section).section_title
        : (element as Lesson).lesson_title;

      // Return confirmation proposal (same as element-crud.router)
      return {
        message: `Удалить "${title}"?`,
        proposal: {
          type: 'direct_action',
          action: 'DELETE',
          targetPath,
          elementType: isSection ? 'section' : 'lesson',
          title,
          impactSummary: isSection
            ? `Удаление секции удалит ${(element as Section).lessons.length} уроков.`
            : 'Нумерация уроков будет пересчитана.',
        },
      };
    }

    case 'MOVE_ELEMENT': {
      if (!intent.destination) {
        return {
          message: 'Куда переместить элемент?',
          requiresClarification: true,
        };
      }

      const destinationPath = resolveTargetPath(intent.destination, undefined, courseStructure);

      if (!destinationPath) {
        return {
          message: 'Не удалось определить место назначения.',
          requiresClarification: true,
        };
      }

      return {
        message: `Переместить в ${intent.destination}?`,
        proposal: {
          type: 'direct_action',
          action: 'MOVE',
          targetPath,
          destinationPath,
        },
      };
    }

    case 'UPDATE_FIELD': {
      if (!intent.fieldName || intent.newValue === undefined) {
        return {
          message: 'Уточните, какое поле и на какое значение изменить.',
          requiresClarification: true,
        };
      }

      return {
        message: `Изменить ${intent.fieldName} на "${intent.newValue}"?`,
        proposal: {
          type: 'field_updates',
          stageId: 'stage_5',
          updates: [
            {
              path: `${targetPath}.${intent.fieldName}`,
              newValue: intent.newValue,
              description: `Изменение ${intent.fieldName}`,
            },
          ],
          summary: `Изменение ${intent.fieldName}`,
        },
      };
    }

    default:
      return { message: 'Операция не поддерживается.' };
  }
}

/**
 * Handle LLM-required intents with TARGETED context
 */
async function handleLLMIntent(
  intent: ClassifiedIntent,
  userMessage: string,
  courseId: string,
  courseStructure: CourseStructure,
  nodeContext: NodeContext | undefined,
  supabase: SupabaseClient,
  requestId: string
): Promise<ChatResponse> {
  const targetPath = resolveTargetPath(
    intent.target?.identifier,
    intent.target?.path,
    courseStructure,
    nodeContext?.path
  );

  // ============================================================================
  // TARGETED CONTEXT - ключевое изменение!
  // Вместо всего course_structure отправляем только релевантный элемент
  // ============================================================================

  let targetedContext: unknown;
  let allowedFields: readonly string[];

  if (targetPath) {
    // Отправляем только выбранный элемент (~500 токенов вместо 42K)
    targetedContext = getElementAtPath(courseStructure, targetPath);

    const isLesson = targetPath.includes('.lessons[');
    allowedFields = isLesson
      ? ['lesson_title', 'lesson_objectives', 'key_topics', 'estimated_duration_minutes']
      : ['section_title', 'section_description', 'learning_objectives'];
  } else {
    // Если нет конкретного элемента, отправляем outline (без full content)
    targetedContext = {
      course_title: courseStructure.course_title,
      course_description: courseStructure.course_description,
      sections: courseStructure.sections.map(s => ({
        section_title: s.section_title,
        lessons: s.lessons.map(l => ({
          lesson_number: l.lesson_number,
          lesson_title: l.lesson_title,
        })),
      })),
    };
    allowedFields = STAGE5_EDITABLE_FIELDS;
  }

  // Build prompt with targeted context
  const systemPrompt = buildTargetedRefinementPrompt(
    intent.intent,
    targetedContext,
    allowedFields,
    targetPath
  );

  // Call LLM with much smaller context
  const response = await llmClient.chat({
    model: CHAT_FALLBACK_CONFIG.modelId,
    maxTokens: 2048, // Достаточно для targeted response
    temperature: CHAT_FALLBACK_CONFIG.temperature,
    systemPrompt,
    userMessage,
  });

  // Parse and return proposal
  const proposal = parseProposalFromLLMResponse(
    response.content,
    'stage_5',
    allowedFields,
    requestId
  );

  return {
    message: proposal?.summary || response.content,
    proposal,
  };
}

/**
 * Build prompt with targeted context (NOT full course_structure)
 */
function buildTargetedRefinementPrompt(
  intent: string,
  targetedContext: unknown,
  allowedFields: readonly string[],
  targetPath?: string | null
): string {
  const intentInstructions: Record<string, string> = {
    REWRITE_CONTENT: 'Rewrite the content to be clearer and more engaging.',
    EXPAND_CONTENT: 'Expand the content with more detail and examples.',
    SIMPLIFY_CONTENT: 'Simplify the content for easier understanding.',
    ADD_LESSON: 'Generate a new lesson based on the user request.',
    ADD_SECTION: 'Generate a new section based on the user request.',
  };

  return `You are an instructional designer assistant.
${intentInstructions[intent] || 'Help the user modify the content.'}

${targetPath ? `Target element path: ${targetPath}` : 'Working at course level.'}

Current content (ONLY the relevant element, not the full course):
${JSON.stringify(targetedContext, null, 2)}

Editable fields:
${allowedFields.join('\n')}

Return JSON:
{
  "message": "Human-readable explanation",
  "updates": [
    { "path": "field.path", "newValue": "...", "description": "..." }
  ]
}

Rules:
1. Only modify fields listed above
2. Keep changes focused on user's request
3. Preserve existing structure`;
}

// ============================================================================
// Main Chat Handler (refactored)
// ============================================================================

// В основной функции sendMessage:
async function handleChatMessage(input: ChatRequest, ctx: Context): Promise<ChatResponse> {
  const { courseId, userMessage, nodeContext, intent: explicitIntent } = input;

  // ... существующий код получения курса ...

  // ============================================================================
  // НОВЫЙ FLOW: Intent Classification
  // ============================================================================

  // 1. Classify intent using Xiaomi (cheap, fast)
  const classifiedIntent = await classifyIntent(
    userMessage,
    nodeContext
      ? {
          stageId: nodeContext.stageId,
          path: nodeContext.blockPath,
          elementType: nodeContext.nodeId?.includes('lesson') ? 'lesson' : 'section',
        }
      : undefined
  );

  logger.info(
    {
      requestId,
      intent: classifiedIntent.intent,
      confidence: classifiedIntent.confidence,
      target: classifiedIntent.target,
    },
    'Intent classified'
  );

  // 2. Route based on intent type
  if (
    DIRECT_EXECUTION_INTENTS.includes(classifiedIntent.intent as any) &&
    classifiedIntent.confidence >= 0.7
  ) {
    // Direct execution - no LLM generation needed
    return handleDirectIntent(classifiedIntent, courseId, courseStructure, supabase, requestId);
  }

  if (
    LLM_REQUIRED_INTENTS.includes(classifiedIntent.intent as any) ||
    classifiedIntent.intent === 'UNKNOWN'
  ) {
    // LLM required - but with TARGETED context
    return handleLLMIntent(
      classifiedIntent,
      userMessage,
      courseId,
      courseStructure,
      nodeContext,
      supabase,
      requestId
    );
  }

  // GET_INFO - query without modification
  if (classifiedIntent.intent === 'GET_INFO') {
    return handleInfoQuery(userMessage, courseStructure);
  }

  // Fallback
  return {
    message: 'Не удалось понять запрос. Попробуйте переформулировать.',
  };
}
```

---

### 3.4 Move Element (новая функция)

**Файл**: `packages/course-gen-platform/src/stages/stage5-generation/utils/course-structure-editor.ts`

Добавить после `deleteElement`:

```typescript
/**
 * Move element (lesson or section) to new position
 *
 * @param structure - Current course structure
 * @param sourcePath - Path to element to move (e.g., "sections[0].lessons[2]")
 * @param destinationPath - Destination path (e.g., "sections[1].lessons[0]" or "sections[1]")
 * @returns Updated structure with recalculated values
 */
export function moveElement(
  structure: CourseStructure,
  sourcePath: string,
  destinationPath: string
): PatchResult {
  const clone = structuredClone(structure);

  const isLessonMove = sourcePath.includes('.lessons[');

  if (isLessonMove) {
    // Parse source
    const sourceMatch = sourcePath.match(/sections\[(\d+)\]\.lessons\[(\d+)\]/);
    if (!sourceMatch) throw new Error(`Invalid source path: ${sourcePath}`);

    const [, srcSectionIdx, srcLessonIdx] = sourceMatch.map(Number);

    // Parse destination
    const destMatch = destinationPath.match(/sections\[(\d+)\](?:\.lessons\[(\d+)\])?/);
    if (!destMatch) throw new Error(`Invalid destination path: ${destinationPath}`);

    const destSectionIdx = Number(destMatch[1]);
    const destLessonIdx =
      destMatch[2] !== undefined
        ? Number(destMatch[2])
        : clone.sections[destSectionIdx].lessons.length; // Append to end

    // Remove from source
    const [lesson] = clone.sections[srcSectionIdx].lessons.splice(srcLessonIdx, 1);

    // Insert at destination
    clone.sections[destSectionIdx].lessons.splice(destLessonIdx, 0, lesson);

    // Recalculate lesson numbers
    const lessonNumbers = renumberAllLessons(clone);

    // Recalculate durations
    recalculateSectionDuration(clone.sections[srcSectionIdx]);
    if (srcSectionIdx !== destSectionIdx) {
      recalculateSectionDuration(clone.sections[destSectionIdx]);
    }
    recalculateCourseDuration(clone);

    return {
      updatedStructure: clone,
      recalculated: { lessonNumbers },
    };
  } else {
    // Section move
    const sourceMatch = sourcePath.match(/sections\[(\d+)\]/);
    const destMatch = destinationPath.match(/sections\[(\d+)\]/);

    if (!sourceMatch || !destMatch) {
      throw new Error('Invalid section paths');
    }

    const srcIdx = Number(sourceMatch[1]);
    const destIdx = Number(destMatch[1]);

    const [section] = clone.sections.splice(srcIdx, 1);
    clone.sections.splice(destIdx, 0, section);

    const lessonNumbers = renumberAllLessons(clone);

    return {
      updatedStructure: clone,
      recalculated: { lessonNumbers },
    };
  }
}

/**
 * Renumber all lessons in the course
 */
function renumberAllLessons(structure: CourseStructure): Record<string, string> {
  const lessonNumbers: Record<string, string> = {};

  structure.sections.forEach((section, sectionIdx) => {
    section.lessons.forEach((lesson, lessonIdx) => {
      const newNumber = `${sectionIdx + 1}.${lessonIdx + 1}`;
      const path = `sections[${sectionIdx}].lessons[${lessonIdx}]`;
      lessonNumbers[path] = newNumber;
      lesson.lesson_number = newNumber;
    });
  });

  return lessonNumbers;
}
```

---

### 3.5 Apply Direct Action (новый endpoint)

**Файл**: `packages/course-gen-platform/src/server/routers/generation/editing/chat.router.ts`

Добавить mutation для применения direct actions:

```typescript
applyDirectAction: instructorProcedure
  .input(z.object({
    courseId: z.string().uuid(),
    action: z.enum(['DELETE', 'MOVE']),
    targetPath: z.string(),
    destinationPath: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const { courseId, action, targetPath, destinationPath } = input;
    const supabase = getSupabaseAdmin();

    // Get course structure
    const { data: course } = await supabase
      .from('courses')
      .select('course_structure')
      .eq('id', courseId)
      .single();

    if (!course?.course_structure) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
    }

    const courseStructure = course.course_structure as CourseStructure;
    let result: PatchResult;

    if (action === 'DELETE') {
      result = deleteStructureElement(courseStructure, targetPath);
    } else if (action === 'MOVE' && destinationPath) {
      result = moveStructureElement(courseStructure, targetPath, destinationPath);
    } else {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid action' });
    }

    // Save updated structure
    await supabase
      .from('courses')
      .update({
        course_structure: result.updatedStructure,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    return {
      success: true,
      recalculated: result.recalculated,
    };
  }),
```

---

## 4. Файлы для изменения

### Новые файлы

| Файл                                                                | Описание                                 |
| ------------------------------------------------------------------- | ---------------------------------------- |
| `packages/course-gen-platform/src/shared/intent/classifier.ts`      | Intent classification с Zod + OpenRouter |
| `packages/course-gen-platform/src/shared/intent/target-resolver.ts` | Резолв идентификаторов в paths           |
| `packages/course-gen-platform/src/shared/intent/index.ts`           | Экспорты                                 |

### Изменяемые файлы

| Файл                                             | Изменения                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `chat.router.ts`                                 | Интеграция classification + direct execution + targeted context + phase |
| `course-structure-editor.ts`                     | Добавить `moveElement()`, `renumberAllLessons()`                        |
| `packages/shared-types/src/chat-types.ts`        | Добавить `DirectActionProposal` type, `phase` field                     |
| `packages/web/components/.../RefinementChat.tsx` | Показывать этап в thinking indicator (P2)                               |
| `packages/web/hooks/useRefinement.ts`            | Обрабатывать `phase` из response (P2)                                   |
| `packages/web/messages/ru/generation.json`       | Добавить переводы для этапов (P2)                                       |
| `packages/web/messages/en/generation.json`       | Добавить переводы для этапов (P2)                                       |

---

## 5. Типы (shared-types)

**Файл**: `packages/shared-types/src/chat-types.ts`

```typescript
// Добавить:

export interface DirectActionProposal {
  type: 'direct_action';
  action: 'DELETE' | 'MOVE';
  targetPath: string;
  destinationPath?: string;
  elementType?: 'lesson' | 'section';
  title?: string;
  impactSummary?: string;
}

// Обновить ProposalData union:
export type ProposalData = FieldUpdatesProposal | LessonPatchProposal | DirectActionProposal;
```

---

## 6. Loading States / Typing Indicator

### Текущее состояние

В `RefinementChat.tsx` уже есть:

- `isProcessing` — блокирует ввод
- `pending` флаг на сообщениях — optimistic updates
- "Thinking" indicator с Loader2

### Улучшение: показывать этап обработки

С новой архитектурой processing состоит из этапов:

1. **Classification** (~200ms) — "Анализирую запрос..."
2. **Direct Execution** (~100ms) — "Выполняю..." / **LLM Generation** (~3-5s) — "Генерирую ответ..."

**Изменения в backend** (`chat.router.ts`):

Возвращать промежуточные статусы через Server-Sent Events или обновлять через отдельный endpoint:

```typescript
// Вариант 1: Добавить phase в response
interface ChatResponse {
  // ... existing fields
  phase?: 'classifying' | 'executing' | 'generating' | 'complete';
}

// Вариант 2: Использовать существующий pending message + system message
// После classification, перед execution:
return {
  message: '', // empty
  systemMessage: 'Понял, хотите удалить урок 2.3. Подготавливаю...',
  isIntermediate: true, // не финальный ответ
};
```

**Изменения в frontend** (`RefinementChat.tsx`):

```tsx
// Улучшенный thinking indicator с этапами
{
  isProcessing && (
    <div className="flex w-full flex-col items-start gap-1 text-sm">
      <div className="border-border rounded-lg border bg-gray-100 px-3 py-2">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs italic">
            {processingPhase === 'classifying' && t('refinementChat.analyzing')}
            {processingPhase === 'executing' && t('refinementChat.executing')}
            {processingPhase === 'generating' && t('refinementChat.generating')}
            {!processingPhase && t('refinementChat.thinking')}
          </span>
        </div>
      </div>
    </div>
  );
}
```

**i18n** (`messages/ru/generation.json`):

```json
{
  "refinementChat": {
    "thinking": "Обрабатываю...",
    "analyzing": "Анализирую запрос...",
    "executing": "Выполняю...",
    "generating": "Генерирую ответ..."
  }
}
```

### Файлы для изменения

| Файл                          | Изменения                            |
| ----------------------------- | ------------------------------------ |
| `chat.router.ts`              | Добавить `phase` в response          |
| `RefinementChat.tsx`          | Показывать этап в thinking indicator |
| `useRefinement.ts`            | Обрабатывать `phase` из response     |
| `messages/ru/generation.json` | Добавить переводы                    |
| `messages/en/generation.json` | Добавить переводы                    |

### Приоритет

**P2** — можно реализовать после основного функционала. Текущий "Thinking" indicator достаточен для MVP.

---

## 7. Тестирование

### Unit Tests

```bash
# Intent classifier tests
pnpm --filter course-gen-platform test src/shared/intent/

# Course structure editor tests (moveElement)
pnpm --filter course-gen-platform test src/stages/stage5-generation/utils/
```

### Test Cases

| Тест                   | Input                      | Expected                                                          |
| ---------------------- | -------------------------- | ----------------------------------------------------------------- |
| DELETE classification  | "удали урок 2.3"           | `{ intent: 'DELETE_LESSON', target: { identifier: 'урок 2.3' } }` |
| MOVE classification    | "перенеси урок в секцию 2" | `{ intent: 'MOVE_ELEMENT', destination: 'секцию 2' }`             |
| REWRITE classification | "перепиши проще"           | `{ intent: 'SIMPLIFY_CONTENT' }`                                  |
| Target resolution      | "урок 2.3"                 | `"sections[1].lessons[2]"`                                        |
| moveElement            | lesson [0][1] → [1][0]     | Correct renumbering                                               |

### Integration Test

```bash
pnpm dev
```

1. Открыть курс с 10+ уроками
2. Написать: "удали урок 2.3"
3. Проверить:
   - Intent classified as DELETE_LESSON
   - Confirmation prompt shown (no LLM generation)
   - После confirm: урок удалён, нумерация пересчитана
4. Написать: "упрости этот урок"
5. Проверить в логах:
   - `inputTokens < 1000` (targeted context)
   - `outputTokens < 500`

---

## 8. Метрики успеха

| Метрика         | До  | После | Улучшение  |
| --------------- | --- | ----- | ---------- |
| DELETE latency  | 60s | <1s   | **60x**    |
| DELETE tokens   | 42K | 200   | **-99.5%** |
| REWRITE tokens  | 42K | ~1K   | **-98%**   |
| REWRITE latency | 60s | ~5s   | **12x**    |

---

## 9. Rollback Plan

Если что-то пойдёт не так:

1. **Feature flag**: `ENABLE_INTENT_CLASSIFICATION=false`
2. В `chat.router.ts`:
   ```typescript
   if (process.env.ENABLE_INTENT_CLASSIFICATION !== 'true') {
     // Old flow: send full context
     return handleLegacyChat(input);
   }
   ```
3. Деплой с `ENABLE_INTENT_CLASSIFICATION=false`

---

## 10. Не делаем (отложено)

| Компонент                         | Причина                                      |
| --------------------------------- | -------------------------------------------- |
| Semantic Router (Jina embeddings) | Xiaomi classification достаточно дёшев       |
| Undo/Redo                         | Сложно, можно добавить позже                 |
| Кнопки в UI                       | Пользователи предпочитают текст              |
| Diff Preview component            | Текущий proposal UI работает                 |
| 3-stage pipeline                  | Избыточно, 1-stage classification достаточно |

---

## 11. References

- [OpenRouter Structured Output](https://openrouter.ai/docs/guides/features/structured-outputs) — `response_format: { type: 'json_schema' }`
- [OpenAI Zod Integration](https://github.com/openai/openai-node/blob/master/helpers.md) — `zodResponseFormat()`
- Research: `docs/research/*.md`
