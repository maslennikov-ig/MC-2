# Plan: Chat UX Fixes + Stage 4/6 Chat Changes

## Context

QGN-6607: Тестер обнаружила несколько проблем с чатом в генерации курсов:

1. **Bug**: Ответ AI показывается как быстро исчезающий toast, а не в чате
2. **Bug**: После нажатия "Принять" proposal box с деталями изменений полностью исчезает
3. **Task**: Убрать чат из Stage 4 (оставить только на Stage 5+)
4. **Task**: Добавить чат к каждому уроку на Stage 6

## Файлы для изменения

| Файл                                                                                | Изменения                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `packages/web/components/generation-graph/hooks/useRefinement.ts`                   | Баг 1+2: убрать toast, добавить `acceptedProposal` |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx`                | Баг 2: отображение applied proposal                |
| `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`             | Task 3+4: убрать Stage 4, добавить Stage 6 lessons |
| `packages/web/components/generation-graph/hooks/__tests__/useRefinement.test.ts`    | Тесты                                              |
| `packages/web/components/generation-graph/panels/__tests__/RefinementChat.test.tsx` | Тесты                                              |

---

## Изменение 1: Убрать toast, ответ только в чате

**Файл**: `useRefinement.ts`

**Проблема**: Строки 201-210 — `toast.success('Refinement Applied', { description: response.assistantMessage })` показывает полный ответ AI как исчезающий toast. Ответ также добавляется в chatHistory (строки 185-193), но пользователь видит только toast и пропускает его в чате.

**Решение**: Удалить toast для refine-ответов (строки 201-210). Ответ уже есть в chatHistory — это правильное место для него. Для regenerate можно оставить минимальный toast-уведомление.

```diff
- // Show appropriate toast based on intent
- if (response.intent === 'regenerate') {
-   toast.success('Regeneration Started', {
-     description: 'AI is regenerating the content. A new version will appear shortly.',
-   })
- } else {
-   toast.success('Refinement Applied', {
-     description: response.assistantMessage,
-   })
- }
+ // Only show toast for regenerate (long async operation)
+ if (response.intent === 'regenerate') {
+   toast.success('Regeneration Started', {
+     description: 'AI is regenerating the content. A new version will appear shortly.',
+   })
+ }
```

---

## Изменение 2: Proposal остаётся видимым после Accept

**Файл**: `useRefinement.ts`

**Проблема**: Строка 68 — `setLatestProposal(null)` скрывает proposal box при нажатии "Принять". Строка 77 — `toast.success(...)` показывает подтверждение только как toast. Детали изменений (поля, старые/новые значения) полностью теряются из UI.

**Решение**: Добавить состояние `acceptedProposal`, которое сохраняет примененный proposal для read-only отображения.

### useRefinement.ts:

- Добавить state: `const [acceptedProposal, setAcceptedProposal] = useState<Proposal | null>(null)`
- В `acceptProposal()` после успеха (после строки 77): `setAcceptedProposal(previousProposal)`
- Убрать `toast.success('Изменения применены')` (строка 77) — подтверждение уже показано в chatHistory (строки 88-95)
- В `clearConversation()`: добавить `setAcceptedProposal(null)`
- В `refine()` при получении нового proposal (строка 196-199): `setAcceptedProposal(null)`
- Экспортировать `acceptedProposal` в return

### RefinementChat.tsx:

- Добавить prop `acceptedProposal?: Proposal | null`
- После блока `{latestProposal && (...)}` (после строки 480), добавить блок для applied proposal:

```tsx
{
  !latestProposal && acceptedProposal && (
    <div className="mt-4 rounded-lg border border-green-200 bg-green-50/50 p-4 opacity-80 dark:border-green-800 dark:bg-green-900/10">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-200">
        <Check className="h-4 w-4" />
        Изменения применены
      </h4>
      {/* Reuse proposal rendering without buttons */}
      {acceptedProposal.type === 'field_updates' && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 mb-2">
              <ChevronDown className="mr-2 h-4 w-4" />
              Показать детали ({acceptedProposal.updates.length} изменений)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {/* Same ul as active proposal but without action buttons */}
          </CollapsibleContent>
        </Collapsible>
      )}
      {acceptedProposal.type === 'lesson_patch' && (
        <pre className="max-h-32 overflow-auto rounded bg-green-100 p-2 text-xs dark:bg-green-800">
          {acceptedProposal.diffSummary}
        </pre>
      )}
    </div>
  );
}
```

### NodeDetailsDrawer.tsx:

- Деструктурировать `acceptedProposal` из `useRefinement`
- Передать `acceptedProposal={acceptedProposal}` в `<RefinementChat>`

---

## Изменение 3: Убрать чат из Stage 4

**Файл**: `NodeDetailsDrawer.tsx`

**Строка 918**: Изменить `[4, 5, 6]` на `[5, 6]`:

```diff
- // Stages 4, 5, 6 use RefinementChat with Confirm-then-Apply flow
- const isAIStage = data?.stageNumber && [4, 5, 6].includes(data.stageNumber)
+ // Stages 5, 6 use RefinementChat with Confirm-then-Apply flow
+ const isAIStage = data?.stageNumber && [5, 6].includes(data.stageNumber)
```

Stage 4 tabs (Input/Process/Output/Activity) и ClarifyingPanel остаются без изменений.

---

## Изменение 4: Добавить чат к урокам Stage 6 (per-lesson)

**Файлы**: `NodeDetailsDrawer.tsx`, `useRefinement.ts`

**Проблема**: Stage 6 lesson nodes рендерят `LessonPanelWithTabs` (строки 1066-1101) в отдельной ветке conditional chain. Эта ветка не достигает блока `{isAIStage && <RefinementChat>}` (строки 1396-1416). Backend уже поддерживает `lesson_patch` proposal для Stage 6 (`applyLessonPatchProposal` в `chat-apply-helpers.ts`).

**Важно: per-lesson изоляция**. Каждый урок — отдельный разговор. Изменения касаются только конкретного урока.

### 4a. Изоляция разговоров при смене ноды

`useRefinement` хранит единый `conversationId` + `chatHistory` для всего drawer. При переключении между уроками (lesson_1_1 → lesson_1_2) нужно сбрасывать разговор.

**NodeDetailsDrawer.tsx**:

- Деструктурировать `clearConversation` из `useRefinement` (строка 233-242)
- Добавить `useEffect` для сброса при смене ноды:

```typescript
// Reset chat conversation when switching between nodes
useEffect(() => {
  clearConversation();
}, [selectedNodeId, clearConversation]);
```

Это сбрасывает `conversationId`, `chatHistory`, `latestProposal`, `acceptedProposal` при каждой смене ноды — и для Stage 5 (смена ноды = новый контекст) и для Stage 6 (урок = отдельный разговор).

### 4b. Layout: RefinementChat под LessonPanelWithTabs

**NodeDetailsDrawer.tsx** — обернуть `isStage6Lesson` ветку в flex:

```tsx
) : isStage6Lesson ? (
  <div className="flex h-full flex-col">
    <div className="min-h-0 flex-1 overflow-auto">
      <LessonPanelErrorBoundary ...>
        <LessonEditProvider ...>
          <LessonPanelWithTabs ... className="h-full" />
        </LessonEditProvider>
      </LessonPanelErrorBoundary>
    </div>
    {/* Per-lesson chat for Stage 6 refinement */}
    <div className="shrink-0 border-t">
      <RefinementChat
        courseId={courseInfo.id}
        stageId="stage_6"
        nodeId={selectedNodeId || undefined}
        attemptNumber={1}
        onRefine={(msg, intent) => void handleRefineForLesson(msg, intent)}
        history={chatHistory}
        isProcessing={isRefining}
        latestProposal={latestProposal}
        isApplying={isApplying}
        onAcceptProposal={() => void acceptProposal()}
        acceptedProposal={acceptedProposal}
        proposalError={proposalError}
        onRetryProposal={() => void retryProposal()}
        isGenerating={isGenerationActive}
        blockedMessage={t('refinementChat.generationInProgress')}
      />
    </div>
  </div>
```

### 4c. handleRefineForLesson — контекст конкретного урока

Добавить рядом с `handleRefine` (~строка 914). `previousOutput` содержит данные ТОЛЬКО этого урока — `lessonInspectorData` из `useLessonInspectorData` (строка 476), загружается по `lessonInfoForInspector.lessonId`:

```typescript
const handleRefineForLesson = async (
  message: string,
  intent: 'refine' | 'regenerate' = 'refine'
) => {
  if (!lessonInspectorData) return;
  const currentOutput = JSON.stringify({
    lessonId: lessonInfoForInspector?.lessonId,
    title: lessonInspectorData.title,
    content: lessonInspectorData.rawMarkdown || '',
  });
  await refine('stage_6', selectedNodeId || undefined, message, currentOutput, intent);
};
```

### Backend — уже готов

- `chat.router.ts`: принимает `nodeContext.stageId = 'stage_6'` + `nodeContext.nodeId`
- `chat-apply-helpers.ts:208`: `applyLessonPatchProposal()` использует `proposal.lessonId` для нахождения конкретного урока в БД, обновляет секцию через `lesson_contents` таблицу
- LLM генерирует `lesson_patch` proposal с `lessonId`, `sectionId`, `patchedContent`, `diffSummary`

---

## Порядок реализации

1. **Изменение 3** — убрать Stage 4 (1 строка)
2. **Изменение 1** — убрать toast для refine (удалить 7 строк)
3. **Изменение 2** — `acceptedProposal` state + UI (средняя сложность)
4. **Изменение 4** — Stage 6 lesson chat (зависит от 2)

## Верификация

1. `pnpm --filter web type-check` — проверка типов
2. `pnpm --filter web build` — сборка
3. Юнит-тесты: `npx vitest run useRefinement` и `npx vitest run RefinementChat`
4. Ручное тестирование:
   - **Stage 4**: открыть Stage 4 node → чата нет
   - **Stage 5 refine**: отправить сообщение → ответ ТОЛЬКО в чате (без toast)
   - **Stage 5 accept**: нажать "Принять" → proposal переходит в зелёный read-only блок, нет toast
   - **Stage 6 lesson**: открыть lesson node → чат виден снизу
   - **Stage 6 per-lesson**: открыть lesson 1.1, написать сообщение → переключить на lesson 1.2 → чат пустой (новый разговор)
   - **Stage 6 accept**: отправить сообщение → получить lesson_patch proposal → принять → контент урока обновился
