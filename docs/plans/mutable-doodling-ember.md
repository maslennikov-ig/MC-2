# Plan: Chat UX — Reject button + post-accept guidance

## Context

Продолжение QGN-6607. Тестер указала: после принятия правок из чата нет ясности — изменения применены, но нет кнопки "Отклонить" и нет подсказки что делать дальше. Два минимальных улучшения.

## Файлы для изменения

| Файл                                                                 | Изменения                                      |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/web/components/generation-graph/panels/RefinementChat.tsx` | Кнопка "Отклонить"                             |
| `packages/web/components/generation-graph/hooks/useRefinement.ts`    | `rejectProposal()` + улучшенный system message |

---

## Изменение 1: Кнопка "Отклонить" в proposal box

**Файл**: `RefinementChat.tsx`

Сейчас (строки 455-480) proposal box имеет только 2 кнопки: "Принять" + "Дополнить". Добавляем третью — "Отклонить".

**Добавить prop**: `onRejectProposal?: () => void` в `RefinementChatProps` (после `onRetryProposal`, строка 45)

**Добавить кнопку** после "Дополнить" (строка 478):

```tsx
<div className="flex gap-2">
  <Button
    onClick={handleAcceptProposal}
    disabled={isApplying}
    className="bg-blue-600 hover:bg-blue-700"
  >
    {/* ... Принять ... */}
  </Button>
  <Button variant="outline" onClick={() => textareaRef.current?.focus()} disabled={isApplying}>
    Дополнить
  </Button>
  <Button
    variant="ghost"
    onClick={onRejectProposal}
    disabled={isApplying}
    className="text-muted-foreground hover:text-destructive"
  >
    <X className="mr-2 h-4 w-4" />
    Отклонить
  </Button>
</div>
```

Нужен импорт `X` из lucide-react (уже есть в файле — проверить, если нет — добавить).

---

## Изменение 2: rejectProposal() в хуке + улучшенный system message

**Файл**: `useRefinement.ts`

### 2a. Добавить `rejectProposal()` (после `retryProposal`, ~строка 137):

```typescript
const rejectProposal = useCallback(() => {
  if (!latestProposal) return;
  setLatestProposal(null);
  setProposalError(null);
  setChatHistory(prev => [
    ...prev,
    {
      role: 'system',
      content: '❌ Изменения отклонены. Напишите уточнение или новый запрос.',
      timestamp: new Date().toISOString(),
    },
  ]);
}, [latestProposal]);
```

Экспортировать `rejectProposal` в return object.

### 2b. Улучшить system message после Accept (строки 90-97):

Сейчас: `✅ Изменения применены (N полей обновлено)`

Заменить на: `✅ Изменения применены (N полей обновлено). Проверьте обновлённую структуру во вкладке «Результат».`

Это даёт пользователю чёткий next step — посмотреть обновлённые данные.

---

## Изменение 3: Прокинуть rejectProposal через NodeDetailsDrawer

**Файл**: `NodeDetailsDrawer.tsx`

- Деструктурировать `rejectProposal` из `useRefinement`
- Передать `onRejectProposal={() => rejectProposal()}` в оба `<RefinementChat>`:
  - Основной (строка ~1407, default tab UI)
  - Stage 6 lesson (строка ~1107)

---

## Верификация

1. `pnpm --filter web type-check`
2. `pnpm --filter web build`
3. `npx vitest run useRefinement && npx vitest run RefinementChat`
4. Ручное тестирование:
   - Proposal box → 3 кнопки: Принять / Дополнить / Отклонить
   - "Отклонить" → proposal исчезает, в чате "❌ Изменения отклонены"
   - "Принять" → system message содержит подсказку про вкладку "Результат"
