# Fix: ClarifyingNode не обновляется без рефреша страницы

## Проблема

После ответа на вопрос в ClarifyingPanel счётчик "X/Y отвечено" обновляется в панели, но на ноде графа остаётся старое значение до рефреша страницы.

## История попыток (6+ коммитов, все неудачные)

| Коммит     | Попытка                        | Почему не сработало        |
| ---------- | ------------------------------ | -------------------------- |
| `3d16b156` | invalidate getProgress cache   | Shallow compare игнорирует |
| `a830f0fa` | invalidate during polling      | Shallow compare игнорирует |
| `0b644be0` | force cache invalidation       | Shallow compare игнорирует |
| `15926db0` | миграция на TanStack Query     | Shallow compare игнорирует |
| `0d8d5332` | code review fixes              | Shallow compare игнорирует |
| `213679f6` | staleTime: 0 + refetchProgress | Shallow compare игнорирует |

**Все попытки фокусировались на cache/refetch, но проблема в ДРУГОМ месте!**

## Root Cause: Shallow Compare в useGraphData.ts

**Файл**: `packages/web/components/generation-graph/hooks/useGraphData.ts:436-451`

```typescript
setNodes(currentNodes => {
  const hasChanges = newNodes.some((newNode, idx) => {
    const currentNode = currentNodes[idx];
    return (
      currentNode.id !== newNode.id ||
      currentNode.type !== newNode.type ||
      currentNode.data?.status !== newNode.data?.status ||
      currentNode.data?.currentStep !== newNode.data?.currentStep ||
      currentNode.data?.label !== newNode.data?.label ||
      currentNode.data?.isCollapsed !== newNode.data?.isCollapsed
      // ❌ НЕ ПРОВЕРЯЕТСЯ: answeredCount, questionsCount, criticalAnswered, criticalTotal
    );
  });
  return hasChanges ? newNodes : currentNodes; // ← hasChanges = false!
});
```

**Что происходит:**

1. Пользователь отвечает на вопрос
2. API возвращает новые данные (answered: 1)
3. TanStack Query обновляет кэш ✅
4. GraphView получает новый clarifyingData ✅
5. useEffect срабатывает, buildGraph создаёт ноду с answeredCount: 1 ✅
6. **setNodes сравнивает и возвращает OLD nodes**, потому что `answeredCount` не в списке проверяемых полей ❌

## Решение

### Добавить проверку clarifying-специфичных полей в shallow compare

**Файл**: `packages/web/components/generation-graph/hooks/useGraphData.ts:436-451`

```typescript
setNodes(currentNodes => {
  const hasChanges = newNodes.some((newNode, idx) => {
    const currentNode = currentNodes[idx];
    return (
      currentNode.id !== newNode.id ||
      currentNode.type !== newNode.type ||
      currentNode.parentId !== newNode.parentId ||
      currentNode.data?.status !== newNode.data?.status ||
      currentNode.data?.currentStep !== newNode.data?.currentStep ||
      currentNode.data?.label !== newNode.data?.label ||
      currentNode.data?.isCollapsed !== newNode.data?.isCollapsed ||
      // ✅ ДОБАВИТЬ: Clarifying node fields
      currentNode.data?.answeredCount !== newNode.data?.answeredCount ||
      currentNode.data?.questionsCount !== newNode.data?.questionsCount
    );
  });
  return hasChanges ? newNodes : currentNodes;
});
```

## Файлы для изменения

1. `packages/web/components/generation-graph/hooks/useGraphData.ts:436-451` — добавить проверку answeredCount и questionsCount

## Верификация

1. Открыть курс VEV-4653 на Stage 4
2. Ответить на вопрос
3. Проверить, что счётчик на ноде графа обновился **мгновенно без рефреша**
4. В React DevTools: проверить, что ClarifyingNode получает новые props
